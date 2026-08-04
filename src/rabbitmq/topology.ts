import type { ChannelModel, ConfirmChannel } from "amqplib";

export const WORKSPACE_COMMAND_EXCHANGE = "workspace.commands";
export const WORKSPACE_COMMAND_QUEUE = "orchestrator.workspace.commands";
export const WORKSPACE_COMMAND_ROUTING_KEY = "workspace.command";
export const WORKSPACE_COMMAND_RETRY_EXCHANGE = "workspace.commands.retry";
export const WORKSPACE_COMMAND_RETRY_QUEUE =
    "orchestrator.workspace.commands.retry";
export const WORKSPACE_COMMAND_RETRY_ROUTING_KEY = "workspace.command.retry";
export const WORKSPACE_COMMAND_DEAD_LETTER_EXCHANGE =
    "workspace.commands.dead-letter";
export const WORKSPACE_COMMAND_DEAD_LETTER_QUEUE =
    "orchestrator.workspace.commands.dead-letter";
export const WORKSPACE_COMMAND_DEAD_LETTER_ROUTING_KEY =
    "workspace.command.dead-letter";
export const WORKSPACE_COMMAND_RETRY_DELAY_MS = 5_000;

let channel: ConfirmChannel | null = null;
let closing = false;

export async function setupRabbitMQTopology(
    connection: ChannelModel,
): Promise<ConfirmChannel> {
    if (channel) {
        return channel;
    }

    closing = false;
    const activeChannel = await connection.createConfirmChannel();

    activeChannel.on("error", (error) => {
        console.error("RabbitMQ channel error:", error);
    });

    activeChannel.on("close", () => {
        channel = null;

        if (!closing) {
            console.error("RabbitMQ channel closed unexpectedly");
            process.exit(1);
        }
    });

    await activeChannel.assertExchange(WORKSPACE_COMMAND_EXCHANGE, "direct", {
        durable: true,
    });

    await activeChannel.assertExchange(
        WORKSPACE_COMMAND_RETRY_EXCHANGE,
        "direct",
        { durable: true },
    );

    await activeChannel.assertExchange(
        WORKSPACE_COMMAND_DEAD_LETTER_EXCHANGE,
        "direct",
        { durable: true },
    );

    await activeChannel.assertQueue(WORKSPACE_COMMAND_QUEUE, {
        durable: true,
        arguments: {
            "x-queue-type": "quorum",
            "x-dead-letter-exchange": WORKSPACE_COMMAND_RETRY_EXCHANGE,
            "x-dead-letter-routing-key":
                WORKSPACE_COMMAND_RETRY_ROUTING_KEY,
        },
    });

    await activeChannel.assertQueue(WORKSPACE_COMMAND_RETRY_QUEUE, {
        durable: true,
        arguments: {
            "x-queue-type": "quorum",
            "x-message-ttl": WORKSPACE_COMMAND_RETRY_DELAY_MS,
            "x-dead-letter-exchange": WORKSPACE_COMMAND_EXCHANGE,
            "x-dead-letter-routing-key": WORKSPACE_COMMAND_ROUTING_KEY,
        },
    });

    await activeChannel.assertQueue(WORKSPACE_COMMAND_DEAD_LETTER_QUEUE, {
        durable: true,
        arguments: {
            "x-queue-type": "quorum",
        },
    });

    await activeChannel.bindQueue(
        WORKSPACE_COMMAND_QUEUE,
        WORKSPACE_COMMAND_EXCHANGE,
        WORKSPACE_COMMAND_ROUTING_KEY,
    );

    await activeChannel.bindQueue(
        WORKSPACE_COMMAND_RETRY_QUEUE,
        WORKSPACE_COMMAND_RETRY_EXCHANGE,
        WORKSPACE_COMMAND_RETRY_ROUTING_KEY,
    );

    await activeChannel.bindQueue(
        WORKSPACE_COMMAND_DEAD_LETTER_QUEUE,
        WORKSPACE_COMMAND_DEAD_LETTER_EXCHANGE,
        WORKSPACE_COMMAND_DEAD_LETTER_ROUTING_KEY,
    );

    channel = activeChannel;
    console.log("RabbitMQ topology configured successfully");

    return activeChannel;
}

export async function closeRabbitMQChannel(): Promise<void> {
    if (!channel) {
        return;
    }

    closing = true;
    const activeChannel = channel;
    channel = null;

    try {
        await activeChannel.close();
    } finally {
        closing = false;
    }
}
