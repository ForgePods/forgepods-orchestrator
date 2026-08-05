import type { V1ContainerStatus, V1Pod } from "@kubernetes/client-node";
import type { WorkspaceContext } from "../database/workspace-repository.js";
import { isKubernetesApiError } from "./api-error.js";
import { coreV1Api } from "./client.js";
import { getWorkspaceResourceName } from "./resources/workspace-pod.js";

const DEFAULT_READY_TIMEOUT_MS = 180_000;
const DEFAULT_DELETE_TIMEOUT_MS = 90_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

export type WorkspaceReadinessOptions = {
    timeoutMs?: number;
    pollIntervalMs?: number;
};

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

function describeContainerState(status: V1ContainerStatus): string | null {
    if (status.state?.waiting) {
        const reason = status.state.waiting.reason ?? "waiting";
        const message = status.state.waiting.message;

        return `${status.name}: ${reason}${message ? ` - ${message}` : ""}`;
    }

    if (
        status.state?.terminated &&
        status.state.terminated.exitCode !== 0
    ) {
        const reason = status.state.terminated.reason ?? "terminated";
        const message = status.state.terminated.message;

        return `${status.name}: ${reason}${message ? ` - ${message}` : ""}`;
    }

    return null;
}

function describePodState(pod: V1Pod): string {
    const containerStatuses = [
        ...(pod.status?.initContainerStatuses ?? []),
        ...(pod.status?.containerStatuses ?? []),
    ];

    for (const status of containerStatuses) {
        const description = describeContainerState(status);

        if (description) {
            return description;
        }
    }

    return pod.status?.phase ?? "Pending";
}

export function isWorkspacePodReady(pod: V1Pod): boolean {
    return (
        pod.status?.conditions?.some(
            (condition) =>
                condition.type === "Ready" && condition.status === "True",
        ) ?? false
    );
}

export async function waitForWorkspacePodReady(
    context: WorkspaceContext,
    namespace: string,
    options: WorkspaceReadinessOptions = {},
): Promise<V1Pod> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    const pollIntervalMs =
        options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    if (timeoutMs <= 0 || pollIntervalMs <= 0) {
        throw new Error("Workspace readiness timings must be positive");
    }

    const resourceName = getWorkspaceResourceName(context.forge.id);
    const deadline = Date.now() + timeoutMs;
    let lastState = "Pod not found";

    while (Date.now() < deadline) {
        try {
            const pod = await coreV1Api.readNamespacedPod({
                namespace,
                name: resourceName,
            });

            if (isWorkspacePodReady(pod)) {
                return pod;
            }

            if (pod.status?.phase === "Failed") {
                throw new Error(
                    `Workspace Pod ${resourceName} failed: ${describePodState(pod)}`,
                );
            }

            lastState = describePodState(pod);
        } catch (error) {
            if (!isKubernetesApiError(error, 404)) {
                throw error;
            }

            lastState = "Pod not found";
        }

        await wait(pollIntervalMs);
    }

    throw new Error(
        `Workspace Pod ${resourceName} was not ready within ${timeoutMs}ms. Last state: ${lastState}`,
    );
}

export async function waitForWorkspacePodDeleted(
    context: WorkspaceContext,
    namespace: string,
    options: WorkspaceReadinessOptions = {},
): Promise<void> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_DELETE_TIMEOUT_MS;
    const pollIntervalMs =
        options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    if (timeoutMs <= 0 || pollIntervalMs <= 0) {
        throw new Error("Workspace deletion timings must be positive");
    }

    const resourceName = getWorkspaceResourceName(context.forge.id);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            await coreV1Api.readNamespacedPod({
                namespace,
                name: resourceName,
            });
        } catch (error) {
            if (isKubernetesApiError(error, 404)) {
                return;
            }

            throw error;
        }

        await wait(pollIntervalMs);
    }

    throw new Error(
        `Workspace Pod ${resourceName} was not deleted within ${timeoutMs}ms`,
    );
}
