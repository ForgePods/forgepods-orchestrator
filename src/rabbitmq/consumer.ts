import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import {
    workspaceCommandsSchema,
    type WorkspaceCommands,
} from "../contracts/workspace-commands.js";
import {
    WORKSPACE_COMMAND_DEAD_LETTER_EXCHANGE,
    WORKSPACE_COMMAND_DEAD_LETTER_ROUTING_KEY,
    WORKSPACE_COMMAND_QUEUE,
} from "./topology.js";

const MAX_WORKSPACE_COMMAND_ATTEMPTS = 3;

export type WorkspaceCommandHandler = (
    command: WorkspaceCommands,
) => Promise<void>;

function getPreviousFailureCount(message: ConsumeMessage): number {
    const deaths = message.properties.headers?.["x-death"];

    if (!Array.isArray(deaths)) {
        return 0;
    }

    const mainQueueDeath = deaths.find(
        (death) =>
            death.queue === WORKSPACE_COMMAND_QUEUE &&
            death.reason === "rejected",
    );

    return mainQueueDeath?.count ?? 0;
}

async function moveToDeadLetterQueue(
    channel: ConfirmChannel,
    message: ConsumeMessage,
): Promise<void> {
    channel.publish(
        WORKSPACE_COMMAND_DEAD_LETTER_EXCHANGE,
        WORKSPACE_COMMAND_DEAD_LETTER_ROUTING_KEY,
        message.content,
        {
            ...message.properties,
            persistent: true,
        },
    );

    await channel.waitForConfirms();
    channel.ack(message);
}

async function processMessage(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    handler: WorkspaceCommandHandler,
): Promise<void> {
    let payload: unknown;

    try {
        payload = JSON.parse(message.content.toString("utf8"));
    } catch (error) {
        console.error("Workspace command contains invalid JSON:", error);
        await moveToDeadLetterQueue(channel, message);
        return;
    }

    const parsedCommand = workspaceCommandsSchema.safeParse(payload);

    if (!parsedCommand.success) {
        console.error(
            "Workspace command validation failed:",
            parsedCommand.error.issues,
        );
        await moveToDeadLetterQueue(channel, message);
        return;
    }

    try {
        await handler(parsedCommand.data);
        channel.ack(message);
    } catch (error) {
        const currentAttempt = getPreviousFailureCount(message) + 1;

        console.error(
            `Workspace command processing failed on attempt ${currentAttempt}:`,
            error,
        );

        if (currentAttempt >= MAX_WORKSPACE_COMMAND_ATTEMPTS) {
            await moveToDeadLetterQueue(channel, message);
            return;
        }

        channel.nack(message, false, false);
    }
}

export async function consumeWorkspaceCommands(
    channel: ConfirmChannel,
    handler: WorkspaceCommandHandler,
): Promise<void> {
    await channel.prefetch(1);

    await channel.consume(
        WORKSPACE_COMMAND_QUEUE,
        (message) => {
            if (!message) {
                return;
            }

            void processMessage(channel, message, handler).catch((error) => {
                console.error(
                    "Workspace command delivery failed unexpectedly:",
                    error,
                );
            });
        },
        { noAck: false },
    );

    console.log("Workspace command consumer started successfully");
}
