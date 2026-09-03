import type { ConsumeMessage } from 'amqplib';
import type { SentMessageInfo } from 'nodemailer';

const amqp = require('amqplib');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const defaultSmtp = {
  host: process.env.SMTP_HOST,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
};

function createTransporter(smtp: { host: string; user: string; pass: string }) {
  return nodemailer.createTransport({
    host: smtp.host,
    secure: true,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

async function consumeMessages() {
  const connection = await amqp.connect(
    'amqp://' +
      process.env.RABBITMQ_USER +
      ':' +
      process.env.RABBITMQ_PASS +
      '@' +
      process.env.RABBITMQ_SERVER +
      ':' +
      process.env.RABBITMQ_PORT,
  ); // URL de conexión a tu servidor RabbitMQ

  const channel = await connection.createChannel();

  const queueName = 'email_queue';
  await channel.assertQueue(queueName, { durable: true });

  console.log(
    `[*] Esperando mensajes en la cola ${queueName}. Para salir, presiona CTRL+C`,
  );

  channel.consume(
    queueName,
    async (msg: ConsumeMessage | null) => {
      if (msg !== null) {
        const message = msg.content.toString();
        const data = JSON.parse(message);
        console.log(`[o] Recibido: ${data.to} > ${data.subject}`);

        const smtp = {
          host: data.smtpHost || defaultSmtp.host,
          user: data.smtpUser || defaultSmtp.user,
          pass: data.smtpPass || defaultSmtp.pass,
        };

        const mailOptions = {
          from: data.from,
          to: data.to,
          subject: data.subject,
          text: data.rawMessage,
          html: data.message,
        };

        createTransporter(smtp).sendMail(
          mailOptions,
          (error: Error | null, info: SentMessageInfo) => {
            if (error) {
              console.log(`[x] Error al enviar el correo: ${error}`);
            } else {
              console.log(`[o] Correo enviado: ${data.to} > ${data.subject}`);
            }
          },
        );

        channel.ack(msg);
      }
    },
    { noAck: false },
  );
}

consumeMessages().catch(console.error);
