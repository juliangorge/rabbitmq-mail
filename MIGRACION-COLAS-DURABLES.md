# Migración de colas a durables

`email_queue` y `mercadopago_webhook_queue` nacieron no durables. RabbitMQ 4.x las
bloquea por defecto (`transient_nonexcl_queues`) y hoy funcionan sólo por la excepción
de `rabbitmq.conf.d/90-octopy.conf`. Además, con colas no durables y mensajes no
persistentes, un reinicio del broker pierde los mails y webhooks que estén en cola.

## Por qué se puede desplegar en cualquier orden

Todos los que declaran estas colas pasan a hacer un **declare pasivo** primero: si la
cola existe la usan tal cual (durable o no); sólo si no existe la crean **durable**.
Los productores publican además con `delivery_mode = 2` (persistente).

Mientras exista la cola vieja, el código nuevo funciona con ella. El código **viejo**,
en cambio, falla contra una cola durable (`PRECONDITION_FAILED`): por eso el paso 2
(borrar las colas viejas) va recién cuando **todo** está desplegado.

| Componente | Rama | Qué declara |
|---|---|---|
| `juliangorge/rabbitmq-sender` | `feat/durable-queues` | productor de ambas colas (nisuta.com **y qa**) |
| nisuta.com `bin/` | `feat/durable-queues` | `consume_mercadopago_webhooks.php` (servicio systemd), script de test |
| rabbitmq-mail | `feat/durable-queues` | consumidor de `email_queue` |

## 1. Desplegar (cualquier orden, sin corte)

1. **rabbitmq-sender**: mergear y pushear `feat/durable-queues`. Después, en
   `/home/nisuta.com/public_html` **y** en `/home/qa/public_html` (como el usuario
   dueño): `composer update juliangorge/rabbitmq-sender`.
2. **nisuta.com**: mergear `feat/durable-queues` y actualizar el checkout de producción.
   El servicio `mercadopago-consumer` relanza el script cada 2 s, toma el cambio solo.
3. **rabbitmq-mail**: mergear y `docker compose up -d --build mail`.

Verificar que nada siga corriendo código viejo: buscar en ambos checkouts
`queue_declare(...false, false, false, false)` sobre estas colas; no debe aparecer.

## 2. Pasar las colas a durables (corte de segundos)

Con todo desplegado, en un momento tranquilo:

```bash
X="docker exec -u rabbitmq rabbitmq-mail-rabbitmq-1 rabbitmqctl"
cd /home/mq.nisuta.com/public_html/rabbitmq-mail

# El consumidor de mails no re-declara si le borran la cola: frenarlo antes.
docker compose stop mail
$X delete_queue email_queue --if-empty           # si no está vacía, esperar y reintentar
docker compose start mail                         # la recrea durable

# mercadopago-consumer la recrea durable solo (se relanza cada 2 s).
$X delete_queue mercadopago_webhook_queue --if-empty

$X list_queues name durable consumers             # ambas deben quedar durable=true
```

Entre el borrado y la recreación, cualquier productor que publique crea la cola durable
por su cuenta, así que no se pierden mensajes.

## 3. Sacar la excepción (opcional, con un reinicio del broker)

1. Borrar `rabbitmq.conf.d/90-octopy.conf` y su línea de `volumes` en `docker-compose.yml`.
2. `docker compose --profile rabbit up -d rabbitmq` (corte de ~20 s; los clientes se reconectan).
3. `docker exec -u rabbitmq rabbitmq-mail-rabbitmq-1 rabbitmq-diagnostics check_if_any_deprecated_features_are_used`
   no debe listar `transient_nonexcl_queues`.

## Probado (2026-11-19)

Contra RabbitMQ 4.4.1 descartable:
- Cola no durable existente: productor, consumidor de mercadopago y consumidor de mails nuevos funcionan.
- Broker por defecto, sin colas: los tres la crean durable; los mensajes llegan con `delivery_mode=2`.
- Código viejo contra cola durable: `PRECONDITION_FAILED` (de ahí el orden de los pasos).
