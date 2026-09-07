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
  ); // Connection URL to your RabbitMQ server

  const channel = await connection.createChannel();

  const queueName = 'email_queue';
  await channel.assertQueue(queueName, { durable: true });

  console.log(
    `[*] Waiting for messages in queue ${queueName}. To exit, press CTRL+C`,
  );

  channel.consume(
    queueName,
    async (msg: ConsumeMessage | null) => {
      if (msg !== null) {
        const message = msg.content.toString();

        let data;
        try {
          data = JSON.parse(message);
        } catch (error) {
          console.log(
            `[x] Invalid message format (malformed JSON): ${message}`,
          );
          console.log(`[x] Error details: ${error}`);
          channel.nack(msg, false, false);
          return;
        }

        if (!data.to || !data.subject) {
          console.log(
            `[x] Invalid message format (missing required fields 'to'/'subject'): ${message}`,
          );
          channel.nack(msg, false, false);
          return;
        }

        console.log(`[o] Received: ${data.to} > ${data.subject}`);

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
              console.log(`[x] Error sending email: ${error}`);
            } else {
              console.log(`[o] Email sent: ${data.to} > ${data.subject}`);
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
