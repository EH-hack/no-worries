import { Pool } from "pg";
import { AppState, newAppState } from "./billing/types";

const DATABASE_URL = process.env.DATABASE_URL ?? "";

let pool: Pool | null = null;
let state: AppState | null = null;
let initialized = false;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL });
  }
  return pool;
}

async function initDb(): Promise<void> {
  if (initialized) return;
  if (!DATABASE_URL) {
    console.warn("DATABASE_URL not set — using in-memory state (will reset on deploy)");
    initialized = true;
    return;
  }

  try {
    const p = getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Insert default row if not exists
    await p.query(`
      INSERT INTO app_state (id, data)
      VALUES (1, $1::jsonb)
      ON CONFLICT (id) DO NOTHING
    `, [JSON.stringify(newAppState())]);
    initialized = true;
    console.log("Postgres store initialized");
  } catch (err) {
    console.error("Failed to init Postgres store:", err instanceof Error ? err.message : err);
    initialized = true; // don't retry, fall back to in-memory
  }
}

export function getState(): AppState {
  if (state) return state;
  state = newAppState();
  return state;
}

export async function loadState(): Promise<void> {
  await initDb();
  if (!DATABASE_URL) {
    state = newAppState();
    return;
  }

  try {
    const p = getPool();
    const res = await p.query("SELECT data FROM app_state WHERE id = 1");
    if (res.rows.length > 0) {
      state = res.rows[0].data as AppState;
      // Ensure users field exists (migration)
      if (!state.users) state.users = {};
      console.log(`Loaded state: ${Object.keys(state.groups).length} groups, ${Object.keys(state.users).length} users`);
    } else {
      state = newAppState();
    }
  } catch (err) {
    console.error("Failed to load state from Postgres:", err instanceof Error ? err.message : err);
    state = newAppState();
  }
}

export async function saveState(): Promise<void> {
  if (!DATABASE_URL) return; // in-memory only

  try {
    const p = getPool();
    await p.query(
      "UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1",
      [JSON.stringify(getState())]
    );
  } catch (err) {
    console.error("Failed to save state to Postgres:", err instanceof Error ? err.message : err);
  }
}
