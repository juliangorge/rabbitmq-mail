# Rabbitmq-mail

Email sender that consumes `email_queue` on a RabbitMQ broker.

RabbitMQ runs in Docker. Other apps can share that same broker on port 5672. Only skip the broker service if one is already running elsewhere.

## RabbitMQ first deployment

### 1. Copy env

```bash
cp .env.example .env
```

Set `SMTP_*` to your default mail account. Set `RABBITMQ_USER` and `RABBITMQ_PASS` to the broker login you want. Compose creates that user on first start.

For a first deploy from this repo:

```env
RABBITMQ_SERVER=rabbitmq
RABBITMQ_PORT=5672
```

`rabbitmq` is the Compose service name on the Docker network.

### 2. Start broker and worker

```bash
docker compose --profile rabbit up -d
```

That starts:

- `rabbitmq` — RabbitMQ 4 with management UI
- `mail` — this worker, after the broker is healthy

Management UI: http://localhost:15672 (same user and password as `.env`).

AMQP for other apps on the host: `localhost:5672`. From another machine, use this server’s IP and port 5672, with the same `RABBITMQ_USER` / `RABBITMQ_PASS`.

Data is kept in the `rabbitmq_data` volume, so the user survives restarts.

### 3. Queue

The worker asserts `email_queue` on connect. Other producers should publish to that same queue on this broker.

### Already have a broker?

Leave the rabbit profile off and point `.env` at that host:

```bash
docker compose up -d mail
```

## Run the mail worker only

```bash
docker compose up -d mail
```

Or:

```bash
docker build -t rabbitmq-mail .
docker run -d --name rabbitmq-mail --network host --restart=always rabbitmq-mail
```

## Message format

```json
{
  "from": "no-reply@example.com",
  "to": "user@example.com",
  "subject": "Hello",
  "rawMessage": "Plain text",
  "message": "<p>HTML</p>",
  "smtpHost": "mail.example.com",
  "smtpUser": "other@example.com",
  "smtpPass": "..."
}
```

`smtpHost`, `smtpUser`, and `smtpPass` are optional. Omitted fields use `SMTP_*` from `.env`.
