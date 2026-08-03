import { z } from "zod";

export const workspaceCommandsSchema = z.object({
    type: z.enum(["START_WORKSPACE", "STOP_WORKSPACE", "DELETE_WORKSPACE"]),
    workspaceId: z.uuid(),
}).strict();

export type WorkspaceCommands = z.infer<typeof workspaceCommandsSchema>;
