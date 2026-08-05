import { env } from "../config/env.js";
import {
    getWorkspaceContext,
    updateWorkspaceRuntime,
    type WorkspaceContext,
    type WorkspaceRuntimeUpdate,
} from "../database/workspace-repository.js";
import {
    waitForWorkspacePodDeleted,
    waitForWorkspacePodReady,
} from "../kubernetes/workspace-readiness.js";
import {
    deleteWorkspaceResources,
    ensureWorkspaceResources,
    type WorkspaceResourcesConfig,
} from "../kubernetes/workspace-resources.js";
import type { WorkspaceCommandOperations } from "./workspace-command-handler.js";

const workspaceResourcesConfig: WorkspaceResourcesConfig = {
    namespace: env.KUBERNETES_NAMESPACE,
    s3Bucket: env.WORKSPACE_S3_BUCKET,
    awsRegion: env.AWS_REGION,
    storageImage: env.WORKSPACE_STORAGE_IMAGE,
    serviceAccountName: env.WORKSPACE_SERVICE_ACCOUNT_NAME,
    syncIntervalSeconds: env.WORKSPACE_SYNC_INTERVAL_SECONDS,
    baseDomain: env.WORKSPACE_BASE_DOMAIN,
    ingressClassName: env.KUBERNETES_INGRESS_CLASS,
    ...(env.WORKSPACE_TLS_SECRET_NAME
        ? { tlsSecretName: env.WORKSPACE_TLS_SECRET_NAME }
        : {}),
};

function getErrorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : "Unknown workspace operation error";
}

async function updateRuntime(
    context: WorkspaceContext,
    update: WorkspaceRuntimeUpdate,
): Promise<void> {
    const updated = await updateWorkspaceRuntime(context.workspace.id, update);

    if (!updated) {
        throw new Error(`Workspace ${context.workspace.id} was not found`);
    }
}

async function markWorkspaceError(
    context: WorkspaceContext,
    error: unknown,
): Promise<void> {
    await updateRuntime(context, {
        status: "error",
        errorMessage: getErrorMessage(error),
    });
}

async function removeWorkspaceResources(
    context: WorkspaceContext,
): Promise<void> {
    await deleteWorkspaceResources(context, env.KUBERNETES_NAMESPACE);
    await waitForWorkspacePodDeleted(context, env.KUBERNETES_NAMESPACE);
}

async function startWorkspace(context: WorkspaceContext): Promise<void> {
    if (context.workspace.desiredState !== "running") {
        return;
    }

    try {
        await updateRuntime(context, {
            status: "starting",
            errorMessage: null,
        });

        await ensureWorkspaceResources(context, workspaceResourcesConfig);
        await waitForWorkspacePodReady(
            context,
            env.KUBERNETES_NAMESPACE,
        );

        const latestContext = await getWorkspaceContext(context.workspace.id);

        if (
            !latestContext ||
            latestContext.workspace.desiredState !== "running"
        ) {
            if (latestContext) {
                await updateRuntime(latestContext, {
                    status: "stopping",
                    errorMessage: null,
                });
            }

            await removeWorkspaceResources(context);

            if (latestContext) {
                await updateRuntime(latestContext, {
                    status: "stopped",
                    errorMessage: null,
                    lastStoppedAt: new Date(),
                });
            }

            return;
        }

        await updateRuntime(latestContext, {
            status: "ready",
            errorMessage: null,
            lastStartedAt: new Date(),
        });
    } catch (error) {
        await markWorkspaceError(context, error);
        throw error;
    }
}

async function stopWorkspace(context: WorkspaceContext): Promise<void> {
    if (context.workspace.desiredState !== "stopped") {
        return;
    }

    try {
        await updateRuntime(context, {
            status: "stopping",
            errorMessage: null,
        });

        await removeWorkspaceResources(context);

        await updateRuntime(context, {
            status: "stopped",
            errorMessage: null,
            lastStoppedAt: new Date(),
        });
    } catch (error) {
        await markWorkspaceError(context, error);
        throw error;
    }
}

async function deleteWorkspace(context: WorkspaceContext): Promise<void> {
    try {
        await updateRuntime(context, {
            status: "stopping",
            errorMessage: null,
        });

        await removeWorkspaceResources(context);

        await updateRuntime(context, {
            status: "stopped",
            errorMessage: null,
            lastStoppedAt: new Date(),
        });
    } catch (error) {
        await markWorkspaceError(context, error);
        throw error;
    }
}

export const workspaceCommandOperations: WorkspaceCommandOperations = {
    startWorkspace,
    stopWorkspace,
    deleteWorkspace,
};
