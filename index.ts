const amqp = require('amqplib')
const nodemailer = require('nodemailer')
const dotenv = require('dotenv')

dotenv.config()

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
})

async function consumeMessages() {
    const connection = await amqp.connect('amqp://' + process.env.RABBITMQ_USER + ':' + process.env.RABBITMQ_PASS + '@' + process.env.RABBITMQ_SERVER) // URL de conexión a tu servidor RabbitMQ

    const channel = await connection.createChannel()

    const queueName = 'email_queue'
    await channel.assertQueue(queueName, { durable: false })

    console.log(`[*] Esperando mensajes en la cola ${queueName}. Para salir, presiona CTRL+C`)

    channel.consume(queueName, async (msg) => {
        if (msg !== null) {
            const message = msg.content.toString()
            const data = JSON.parse(message)
            console.log(`[x] Recibido: ${message}`)

            const mailOptions = {
                from: data.from,
                to: data.to,
                subject: data.subject,
                text: data.rawMessage,
                html: data.message
            }

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log(`Error al enviar el correo: ${error}`)
                } else {
                    console.log(`Correo enviado: ${data.to}`)
                }
            })

            channel.ack(msg)
        }
    }, { noAck: false })

}

consumeMessages().catch(console.error)
