import type { V1Pod } from "@kubernetes/client-node";
import type { WorkspaceContext } from "../../database/workspace-repository.js";

export const WORKSPACE_IDE_PORT = 8080;

export type WorkspacePodConfig = {
    namespace: string;
    s3Bucket: string;
    awsRegion: string;
    storageImage: string;
    serviceAccountName: string;
    syncIntervalSeconds?: number;
};

export function getWorkspaceResourceName(forgeId: string): string {
    return `workspace-${forgeId}`;
}

export function getWorkspaceLabels(context: WorkspaceContext) {
    return {
        "app.kubernetes.io/name": "forgepods-workspace",
        "app.kubernetes.io/managed-by": "forgepods-orchestrator",
        "forgepods.dev/workspace-id": context.workspace.id,
        "forgepods.dev/forge-id": context.forge.id,
    };
}

export function buildWorkspacePod(
    context: WorkspaceContext,
    config: WorkspacePodConfig,
): V1Pod {
    const resourceName = getWorkspaceResourceName(context.forge.id);
    const workspaceS3Uri = `s3://${config.s3Bucket}/code/${context.forge.id}/`;
    const syncIntervalSeconds = config.syncIntervalSeconds ?? 10;
    const labels = getWorkspaceLabels(context);
    const storageEnvironment = [
        {
            name: "AWS_REGION",
            value: config.awsRegion,
        },
        {
            name: "WORKSPACE_S3_URI",
            value: workspaceS3Uri,
        },
    ];

    return {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
            name: resourceName,
            namespace: config.namespace,
            labels,
        },
        spec: {
            serviceAccountName: config.serviceAccountName,
            restartPolicy: "Always",
            terminationGracePeriodSeconds: 30,
            volumes: [
                {
                    name: "workspace",
                    emptyDir: {},
                },
            ],
            initContainers: [
                {
                    name: "restore-workspace",
                    image: config.storageImage,
                    imagePullPolicy: "IfNotPresent",
                    command: ["/bin/sh", "-c"],
                    args: [
                        'aws s3 sync "$WORKSPACE_S3_URI" /workspace',
                    ],
                    env: storageEnvironment,
                    volumeMounts: [
                        {
                            name: "workspace",
                            mountPath: "/workspace",
                        },
                    ],
                },
            ],
            containers: [
                {
                    name: "code-server",
                    image: context.template.workspaceImage,
                    imagePullPolicy: "IfNotPresent",
                    ports: [
                        {
                            name: "ide",
                            containerPort: WORKSPACE_IDE_PORT,
                            protocol: "TCP",
                        },
                    ],
                    readinessProbe: {
                        tcpSocket: {
                            port: WORKSPACE_IDE_PORT,
                        },
                        initialDelaySeconds: 2,
                        periodSeconds: 2,
                        timeoutSeconds: 1,
                        failureThreshold: 30,
                    },
                    volumeMounts: [
                        {
                            name: "workspace",
                            mountPath: "/workspace",
                        },
                    ],
                },
                {
                    name: "sync-workspace",
                    image: config.storageImage,
                    imagePullPolicy: "IfNotPresent",
                    command: ["/bin/sh", "-c"],
                    args: [
                        [
                            "set -eu",
                            "sync_workspace() {",
                            '  aws s3 sync /workspace "$WORKSPACE_S3_URI" --delete --exclude "node_modules/*" --exclude "dist/*" --exclude "build/*" --exclude ".git/*"',
                            "}",
                            "trap 'sync_workspace; exit 0' TERM INT",
                            "while true; do",
                            `  sleep ${syncIntervalSeconds} &`,
                            "  wait $!",
                            "  sync_workspace",
                            "done",
                        ].join("\n"),
                    ],
                    env: storageEnvironment,
                    volumeMounts: [
                        {
                            name: "workspace",
                            mountPath: "/workspace",
                        },
                    ],
                },
            ],
        },
    };
}
