import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

export const envSchema = z.object({
    NODE_ENV: z.enum(["development","production"]).default("development"),
    DATABASE_URL: z.string(),
    RABBITMQ_URL: z.url(),
    HEALTH_PORT: z.coerce.number(),
    KUBERNETES_NAMESPACE: z.string().min(1).default("forgepods"),
    AWS_REGION: z.string().min(1),
    WORKSPACE_S3_BUCKET: z.string().min(1),
    WORKSPACE_STORAGE_IMAGE: z
        .string()
        .min(1)
        .default("amazon/aws-cli:2"),
    WORKSPACE_SERVICE_ACCOUNT_NAME: z
        .string()
        .min(1)
        .default("forgepods-workspace"),
    WORKSPACE_BASE_DOMAIN: z.string().min(1),
    KUBERNETES_INGRESS_CLASS: z.string().min(1).default("nginx"),
    WORKSPACE_TLS_SECRET_NAME: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().min(1).optional(),
    ),
    WORKSPACE_SYNC_INTERVAL_SECONDS: z.coerce
        .number()
        .int()
        .positive()
        .default(10),
    RECONCILIATION_INTERVAL_SECONDS: z.coerce
        .number()
        .int()
        .positive()
        .default(30),
});

export type EnvType = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if(!parsedEnv.success){
    throw new Error(JSON.stringify(parsedEnv.error.issues, null, 2));
};

export const env = parsedEnv.data;
