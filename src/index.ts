import { env } from "./config/env.js";
import { connectDatabase } from "./database/connectDB.js";
import { startWorkspaceReconciler } from "./reconciliation/workspace-reconciler.js";
import { connectRabbitMQ } from "./rabbitmq/connectRabbitMQ.js";
import { consumeWorkspaceCommands } from "./rabbitmq/consumer.js";
import { setupRabbitMQTopology } from "./rabbitmq/topology.js";
import { createWorkspaceCommandHandler } from "./workspaces/workspace-command-handler.js";
import { workspaceCommandOperations } from "./workspaces/workspace-operations.js";

await connectDatabase();
const rabbitMQConnection = await connectRabbitMQ();
const rabbitMQChannel = await setupRabbitMQTopology(rabbitMQConnection);
const workspaceCommandHandler = createWorkspaceCommandHandler(
    workspaceCommandOperations,
);

await consumeWorkspaceCommands(rabbitMQChannel, workspaceCommandHandler);

startWorkspaceReconciler(workspaceCommandHandler, {
    namespace: env.KUBERNETES_NAMESPACE,
    intervalMs: env.RECONCILIATION_INTERVAL_SECONDS * 1_000,
});
