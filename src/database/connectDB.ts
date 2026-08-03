import pg from "pg";
import { env } from "../config/env.js";

const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
});

pool.on("error", (error) => {
    console.error("Unexpected database connection error:", error);
    process.exit(1);
});

export async function connectDatabase(): Promise<void> {
    await pool.query("SELECT 1");
    console.log("Database connected successfully");
}

export default pool;
