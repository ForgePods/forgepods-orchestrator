import * as k8s from "@kubernetes/client-node";

const kubeConfig = new k8s.KubeConfig();

if (process.env.KUBERNETES_SERVICE_HOST) {
    kubeConfig.loadFromCluster();
} else {
    kubeConfig.loadFromDefault();
}

export const coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
export const networkingV1Api = kubeConfig.makeApiClient(k8s.NetworkingV1Api);
