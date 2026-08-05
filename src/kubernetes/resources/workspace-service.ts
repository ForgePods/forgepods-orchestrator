import type { V1Service } from "@kubernetes/client-node";
import type { WorkspaceContext } from "../../database/workspace-repository.js";
import {
    getWorkspaceLabels,
    getWorkspaceResourceName,
    WORKSPACE_IDE_PORT,
} from "./workspace-pod.js";

export function buildWorkspaceService(
    context: WorkspaceContext,
    namespace: string,
): V1Service {
    const labels = getWorkspaceLabels(context);

    return {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
            name: getWorkspaceResourceName(context.forge.id),
            namespace,
            labels,
        },
        spec: {
            type: "ClusterIP",
            selector: {
                "app.kubernetes.io/name": labels["app.kubernetes.io/name"],
                "forgepods.dev/workspace-id":
                    labels["forgepods.dev/workspace-id"],
            },
            ports: [
                {
                    name: "ide",
                    protocol: "TCP",
                    port: WORKSPACE_IDE_PORT,
                    targetPort: WORKSPACE_IDE_PORT,
                },
            ],
        },
    };
}
