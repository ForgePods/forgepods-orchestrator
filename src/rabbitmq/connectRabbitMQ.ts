import amqp, { type ChannelModel } from "amqplib";
import { env } from "../config/env.js";

let connection: ChannelModel | null = null;
let closing = false;

export async function connectRabbitMQ(): Promise<ChannelModel> {
    if (connection) {
        return connection;
    }

    closing = false;
    const activeConnection = await amqp.connect(env.RABBITMQ_URL);

    activeConnection.on("error", (error) => {
        console.error("RabbitMQ connection error:", error);
    });

    activeConnection.on("close", () => {
        connection = null;

        if (!closing) {
            console.error("RabbitMQ connection closed unexpectedly");
            process.exit(1);
        }
    });

    connection = activeConnection;
    console.log("RabbitMQ connected successfully");

    return activeConnection;
}

export async function closeRabbitMQ(): Promise<void> {
    if (!connection) {
        return;
    }

    closing = true;
    const activeConnection = connection;
    connection = null;

    try {
        await activeConnection.close();
    } finally {
        closing = false;
    }
}
