import type { WorkspaceCommands } from "../contracts/workspace-commands.js";
import {
    getWorkspaceContext,
    listWorkspaceIdsForReconciliation,
    type WorkspaceContext,
} from "../database/workspace-repository.js";
import { getWorkspaceResourcesState } from "../kubernetes/workspace-resources.js";

const DEFAULT_BATCH_SIZE = 100;

type WorkspaceCommandHandler = (
    command: WorkspaceCommands,
) => Promise<void>;

export type WorkspaceReconcilerOptions = {
    namespace: string;
    intervalMs: number;
    batchSize?: number;
};

export type WorkspaceReconciler = {
    stop: () => void;
};

function createCommand(
    context: WorkspaceContext,
    type: WorkspaceCommands["type"],
): WorkspaceCommands {
    return {
        type,
        workspaceId: context.workspace.id,
    };
}

async function getReconciliationCommand(
    context: WorkspaceContext,
    namespace: string,
): Promise<WorkspaceCommands | null> {
    if (
        context.workspace.desiredState === "running" &&
        context.workspace.status !== "ready"
    ) {
        return createCommand(context, "START_WORKSPACE");
    }

    if (
        context.workspace.desiredState === "stopped" &&
        context.workspace.status !== "stopped"
    ) {
        return createCommand(context, "STOP_WORKSPACE");
    }

    const resources = await getWorkspaceResourcesState(context, namespace);

    if (context.workspace.desiredState === "running") {
        const workspaceIsHealthy =
            resources.podExists &&
            resources.podReady &&
            resources.serviceExists &&
            resources.ingressExists;

        return workspaceIsHealthy
            ? null
            : createCommand(context, "START_WORKSPACE");
    }

    const workspaceResourcesExist =
        resources.podExists ||
        resources.serviceExists ||
        resources.ingressExists;

    return workspaceResourcesExist
        ? createCommand(context, "STOP_WORKSPACE")
        : null;
}

async function reconcileWorkspace(
    workspaceId: string,
    namespace: string,
    handleCommand: WorkspaceCommandHandler,
): Promise<void> {
    const context = await getWorkspaceContext(workspaceId);

    if (!context) {
        return;
    }

    const command = await getReconciliationCommand(context, namespace);

    if (!command) {
        return;
    }

    console.log(
        `Reconciling workspace ${workspaceId} with ${command.type}`,
    );
    await handleCommand(command);
}

async function runReconciliationPass(
    namespace: string,
    batchSize: number,
    handleCommand: WorkspaceCommandHandler,
): Promise<void> {
    let afterWorkspaceId: string | null = null;

    while (true) {
        const workspaceIds = await listWorkspaceIdsForReconciliation(
            afterWorkspaceId,
            batchSize,
        );

        for (const workspaceId of workspaceIds) {
            try {
                await reconcileWorkspace(
                    workspaceId,
                    namespace,
                    handleCommand,
                );
            } catch (error) {
                console.error(
                    `Failed to reconcile workspace ${workspaceId}`,
                    error,
                );
            }
        }

        if (workspaceIds.length < batchSize) {
            return;
        }

        afterWorkspaceId = workspaceIds[workspaceIds.length - 1] ?? null;
    }
}

export function startWorkspaceReconciler(
    handleCommand: WorkspaceCommandHandler,
    options: WorkspaceReconcilerOptions,
): WorkspaceReconciler {
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

    if (options.intervalMs <= 0 || batchSize <= 0) {
        throw new Error("Reconciliation timings and batch size must be positive");
    }

    let stopped = false;
    let timer: NodeJS.Timeout | undefined;

    const run = async () => {
        try {
            await runReconciliationPass(
                options.namespace,
                batchSize,
                handleCommand,
            );
        } catch (error) {
            console.error("Workspace reconciliation pass failed", error);
        } finally {
            if (!stopped) {
                timer = setTimeout(run, options.intervalMs);
            }
        }
    };

    console.log("Workspace reconciler started successfully");
    void run();

    return {
        stop: () => {
            stopped = true;

            if (timer) {
                clearTimeout(timer);
            }
        },
    };
}
