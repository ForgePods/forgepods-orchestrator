import type { WorkspaceContext } from "../database/workspace-repository.js";
import { isKubernetesApiError } from "./api-error.js";
import { coreV1Api, networkingV1Api } from "./client.js";
import {
    buildWorkspaceIngress,
    type WorkspaceIngressConfig,
} from "./resources/workspace-ingress.js";
import {
    buildWorkspacePod,
    getWorkspaceResourceName,
    type WorkspacePodConfig,
} from "./resources/workspace-pod.js";
import { buildWorkspaceService } from "./resources/workspace-service.js";

export type WorkspaceResourcesConfig = WorkspacePodConfig &
    Omit<WorkspaceIngressConfig, "namespace">;

export type WorkspaceResourceState = "created" | "existing";
export type WorkspaceResourceDeletionState = "deleted" | "missing";

export type EnsureWorkspaceResourcesResult = {
    pod: WorkspaceResourceState;
    service: WorkspaceResourceState;
    ingress: WorkspaceResourceState;
};

export type DeleteWorkspaceResourcesResult = {
    pod: WorkspaceResourceDeletionState;
    service: WorkspaceResourceDeletionState;
    ingress: WorkspaceResourceDeletionState;
};

async function createIfMissing(
    read: () => Promise<unknown>,
    create: () => Promise<unknown>,
): Promise<WorkspaceResourceState> {
    try {
        await read();
        return "existing";
    } catch (error) {
        if (!isKubernetesApiError(error, 404)) {
            throw error;
        }
    }

    try {
        await create();
        return "created";
    } catch (error) {
        if (isKubernetesApiError(error, 409)) {
            return "existing";
        }

        throw error;
    }
}

async function deleteIfPresent(
    remove: () => Promise<unknown>,
): Promise<WorkspaceResourceDeletionState> {
    try {
        await remove();
        return "deleted";
    } catch (error) {
        if (isKubernetesApiError(error, 404)) {
            return "missing";
        }

        throw error;
    }
}

export async function ensureWorkspaceResources(
    context: WorkspaceContext,
    config: WorkspaceResourcesConfig,
): Promise<EnsureWorkspaceResourcesResult> {
    const pod = buildWorkspacePod(context, config);
    const service = buildWorkspaceService(context, config.namespace);
    const ingress = buildWorkspaceIngress(context, {
        namespace: config.namespace,
        baseDomain: config.baseDomain,
        ingressClassName: config.ingressClassName,
        ...(config.tlsSecretName
            ? { tlsSecretName: config.tlsSecretName }
            : {}),
    });
    const resourceName = getWorkspaceResourceName(context.forge.id);

    const podState = await createIfMissing(
        () =>
            coreV1Api.readNamespacedPod({
                namespace: config.namespace,
                name: resourceName,
            }),
        () =>
            coreV1Api.createNamespacedPod({
                namespace: config.namespace,
                body: pod,
            }),
    );

    const serviceState = await createIfMissing(
        () =>
            coreV1Api.readNamespacedService({
                namespace: config.namespace,
                name: resourceName,
            }),
        () =>
            coreV1Api.createNamespacedService({
                namespace: config.namespace,
                body: service,
            }),
    );

    const ingressState = await createIfMissing(
        () =>
            networkingV1Api.readNamespacedIngress({
                namespace: config.namespace,
                name: resourceName,
            }),
        () =>
            networkingV1Api.createNamespacedIngress({
                namespace: config.namespace,
                body: ingress,
            }),
    );

    return {
        pod: podState,
        service: serviceState,
        ingress: ingressState,
    };
}

export async function deleteWorkspaceResources(
    context: WorkspaceContext,
    namespace: string,
): Promise<DeleteWorkspaceResourcesResult> {
    const resourceName = getWorkspaceResourceName(context.forge.id);

    const ingressState = await deleteIfPresent(() =>
        networkingV1Api.deleteNamespacedIngress({
            namespace,
            name: resourceName,
        }),
    );

    const serviceState = await deleteIfPresent(() =>
        coreV1Api.deleteNamespacedService({
            namespace,
            name: resourceName,
        }),
    );

    const podState = await deleteIfPresent(() =>
        coreV1Api.deleteNamespacedPod({
            namespace,
            name: resourceName,
        }),
    );

    return {
        pod: podState,
        service: serviceState,
        ingress: ingressState,
    };
}
