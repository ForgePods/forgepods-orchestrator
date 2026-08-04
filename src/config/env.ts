import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

export const envSchema = z.object({
    NODE_ENV: z.enum(["development","production"]).default("development"),
    DATABASE_URL: z.string(),
    RABBITMQ_URL: z.url(),
    HEALTH_PORT: z.coerce.number(),
    KUBERNETES_NAMESPACE: z.string().min(1).default("forgepods"),
});

export type EnvType = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if(!parsedEnv.success){
    throw new Error(JSON.stringify(parsedEnv.error.issues, null, 2));
};

export const env = parsedEnv.data;
