import * as k8s from "@kubernetes/client-node";

const kubeConfig = new k8s.KubeConfig();
kubeConfig.loadFromDefault();

export const coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
