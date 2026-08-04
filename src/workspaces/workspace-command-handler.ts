import type { WorkspaceCommands } from "../contracts/workspace-commands.js";
import {
    getWorkspaceContext,
    withWorkspaceLock,
    type WorkspaceContext,
} from "../database/workspace-repository.js";

export type WorkspaceCommandOperations = {
    startWorkspace: (context: WorkspaceContext) => Promise<void>;
    stopWorkspace: (context: WorkspaceContext) => Promise<void>;
    deleteWorkspace: (context: WorkspaceContext) => Promise<void>;
};

async function runWorkspaceCommand(
    command: WorkspaceCommands,
    operations: WorkspaceCommandOperations,
): Promise<void> {
    const context = await getWorkspaceContext(command.workspaceId);

    if (!context) {
        console.warn(`Workspace ${command.workspaceId} was not found`);
        return;
    }

    switch (command.type) {
        case "START_WORKSPACE":
            await operations.startWorkspace(context);
            return;
        case "STOP_WORKSPACE":
            await operations.stopWorkspace(context);
            return;
        case "DELETE_WORKSPACE":
            await operations.deleteWorkspace(context);
            return;
    }
}

export function createWorkspaceCommandHandler(
    operations: WorkspaceCommandOperations,
): (command: WorkspaceCommands) => Promise<void> {
    return async (command) => {
        const result = await withWorkspaceLock(command.workspaceId, () =>
            runWorkspaceCommand(command, operations),
        );

        if (!result.acquired) {
            throw new Error(
                `Workspace ${command.workspaceId} is already being processed`,
            );
        }
    };
}
