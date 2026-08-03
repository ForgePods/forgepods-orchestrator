import pool from "./connectDB.js";

export type ForgeStatus = "creating" | "active" | "deleting" | "error";
export type WorkspaceDesiredState = "stopped" | "running";
export type WorkspaceStatus = "stopped" | "starting" | "ready" | "stopping" | "error";

export type WorkspaceContext = {
    workspace: {
        id: string;
        forgeId: string;
        desiredState: WorkspaceDesiredState;
        status: WorkspaceStatus;
        lastActivityAt: Date | null;
        lastStartedAt: Date | null;
        lastStoppedAt: Date | null;
        errorMessage: string | null;
    };
    forge: {
        id: string;
        status: ForgeStatus;
    };
    template: {
        workspaceImage: string;
    };
};

type WorkspaceContextRow = {
    workspaceId: string;
    workspaceForgeId: string;
    desiredState: WorkspaceDesiredState;
    workspaceStatus: WorkspaceStatus;
    lastActivityAt: Date | null;
    lastStartedAt: Date | null;
    lastStoppedAt: Date | null;
    errorMessage: string | null;
    forgeId: string;
    forgeStatus: ForgeStatus;
    workspaceImage: string;
};

export type WorkspaceRuntimeUpdate = {
    status: WorkspaceStatus;
    errorMessage: string | null;
    lastStartedAt?: Date;
    lastStoppedAt?: Date;
};

export type WorkspaceLockResult<T> =
    | { acquired: true; value: T }
    | { acquired: false };

export async function getWorkspaceContext(
    workspaceId: string,
): Promise<WorkspaceContext | null> {
    const result = await pool.query<WorkspaceContextRow>(
        `
            SELECT
                w.id AS "workspaceId",
                w.forge_id AS "workspaceForgeId",
                w.desired_state AS "desiredState",
                w.status AS "workspaceStatus",
                w.last_activity_at AS "lastActivityAt",
                w.last_started_at AS "lastStartedAt",
                w.last_stopped_at AS "lastStoppedAt",
                w.error_message AS "errorMessage",
                f.id AS "forgeId",
                f.status AS "forgeStatus",
                t.workspace_image AS "workspaceImage"
            FROM "Workspace" w
            INNER JOIN "Forge" f ON f.id = w.forge_id
            INNER JOIN "Template" t ON t.id = f.template_id
            WHERE w.id = $1
        `,
        [workspaceId],
    );

    const row = result.rows[0];

    if (!row) {
        return null;
    }

    return {
        workspace: {
            id: row.workspaceId,
            forgeId: row.workspaceForgeId,
            desiredState: row.desiredState,
            status: row.workspaceStatus,
            lastActivityAt: row.lastActivityAt,
            lastStartedAt: row.lastStartedAt,
            lastStoppedAt: row.lastStoppedAt,
            errorMessage: row.errorMessage,
        },
        forge: {
            id: row.forgeId,
            status: row.forgeStatus,
        },
        template: {
            workspaceImage: row.workspaceImage,
        },
    };
}

export async function updateWorkspaceRuntime(
    workspaceId: string,
    update: WorkspaceRuntimeUpdate,
): Promise<boolean> {
    const values: unknown[] = [workspaceId, update.status, update.errorMessage];
    const assignments = [
        "status = $2",
        "error_message = $3",
        "updated_at = CURRENT_TIMESTAMP",
    ];

    if (update.lastStartedAt) {
        values.push(update.lastStartedAt);
        assignments.push(`last_started_at = $${values.length}`);
    }

    if (update.lastStoppedAt) {
        values.push(update.lastStoppedAt);
        assignments.push(`last_stopped_at = $${values.length}`);
    }

    const result = await pool.query(
        `
            UPDATE "Workspace"
            SET ${assignments.join(", ")}
            WHERE id = $1
        `,
        values,
    );

    return result.rowCount === 1;
}

export async function listWorkspaceIdsForReconciliation(
    afterWorkspaceId: string | null = null,
    limit = 100,
): Promise<string[]> {
    const result = await pool.query<{ id: string }>(
        `
            SELECT id
            FROM "Workspace"
            WHERE $1::uuid IS NULL OR id > $1::uuid
            ORDER BY id
            LIMIT $2
        `,
        [afterWorkspaceId, limit],
    );

    return result.rows.map((row) => row.id);
}

export async function withWorkspaceLock<T>(
    workspaceId: string,
    operation: () => Promise<T>,
): Promise<WorkspaceLockResult<T>> {
    const client = await pool.connect();
    let acquired = false;

    try {
        const result = await client.query<{ acquired: boolean }>(
            `
                SELECT pg_try_advisory_lock(
                    hashtextextended($1, 0)
                ) AS acquired
            `,
            [workspaceId],
        );

        acquired = result.rows[0]?.acquired ?? false;

        if (!acquired) {
            return { acquired: false };
        }

        return {
            acquired: true,
            value: await operation(),
        };
    } finally {
        if (acquired) {
            try {
                await client.query(
                    `
                        SELECT pg_advisory_unlock(
                            hashtextextended($1, 0)
                        )
                    `,
                    [workspaceId],
                );
            } catch (error) {
                client.release(
                    error instanceof Error
                        ? error
                        : new Error("Failed to release workspace lock"),
                );
                throw error;
            }
        }

        client.release();
    }
}
