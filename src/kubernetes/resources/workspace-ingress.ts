import type { V1Ingress } from "@kubernetes/client-node";
import type { WorkspaceContext } from "../../database/workspace-repository.js";
import {
    getWorkspaceLabels,
    getWorkspaceResourceName,
    WORKSPACE_IDE_PORT,
} from "./workspace-pod.js";

export type WorkspaceIngressConfig = {
    namespace: string;
    baseDomain: string;
    ingressClassName: string;
    tlsSecretName?: string;
};

export function getWorkspaceHostname(
    forgeId: string,
    baseDomain: string,
): string {
    return `${forgeId}.${baseDomain}`;
}

export function buildWorkspaceIngress(
    context: WorkspaceContext,
    config: WorkspaceIngressConfig,
): V1Ingress {
    const resourceName = getWorkspaceResourceName(context.forge.id);
    const hostname = getWorkspaceHostname(
        context.forge.id,
        config.baseDomain,
    );

    return {
        apiVersion: "networking.k8s.io/v1",
        kind: "Ingress",
        metadata: {
            name: resourceName,
            namespace: config.namespace,
            labels: getWorkspaceLabels(context),
        },
        spec: {
            ingressClassName: config.ingressClassName,
            rules: [
                {
                    host: hostname,
                    http: {
                        paths: [
                            {
                                path: "/",
                                pathType: "Prefix",
                                backend: {
                                    service: {
                                        name: resourceName,
                                        port: {
                                            number: WORKSPACE_IDE_PORT,
                                        },
                                    },
                                },
                            },
                        ],
                    },
                },
            ],
            ...(config.tlsSecretName
                ? {
                      tls: [
                          {
                              hosts: [hostname],
                              secretName: config.tlsSecretName,
                          },
                      ],
                  }
                : {}),
        },
    };
}
