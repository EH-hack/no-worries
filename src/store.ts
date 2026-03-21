import { Pool, PoolClient } from "pg";
import { AppState, GroupState, UserProfile, newAppState } from "./billing/types";

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

/* ------------------------------------------------------------------ */
/*  Schema creation                                                    */
/* ------------------------------------------------------------------ */

async function createTables(p: Pool): Promise<void> {
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      display_name TEXT,
      wallet_address TEXT,
      location TEXT,
      lat DOUBLE PRECISION,
      lon DOUBLE PRECISION,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Add lat/lon columns if upgrading from previous schema
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS groups (
      group_id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (group_id, user_uid)
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS conversation_history (
      id SERIAL PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_conv_history_conv_id
    ON conversation_history (conversation_id, id DESC)
  `);
}

/* ------------------------------------------------------------------ */
/*  Migration from legacy app_state table                              */
/* ------------------------------------------------------------------ */

async function migrateFromAppState(p: Pool): Promise<void> {
  // Check if old table exists
  const tableCheck = await p.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'app_state'
  `);
  if (tableCheck.rows.length === 0) return;

  // Check if it has data
  const dataCheck = await p.query("SELECT data FROM app_state WHERE id = 1");
  if (dataCheck.rows.length === 0) return;

  const old = dataCheck.rows[0].data as AppState;
  if (!old.groups && !old.users) return;

  console.log("Migrating from app_state to normalised tables…");

  const client = await p.connect();
  try {
    await client.query("BEGIN");

    // Migrate users
    if (old.users) {
      for (const [uid, u] of Object.entries(old.users)) {
        await client.query(
          `INSERT INTO users (uid, display_name, wallet_address, location, lat, lon, registered_at)
           VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
           ON CONFLICT (uid) DO NOTHING`,
          [uid, u.displayName ?? null, u.walletAddress ?? null, u.location ?? null, (u as any).lat ?? null, (u as any).lon ?? null, u.registeredAt ?? null]
        );
      }
    }

    // Migrate groups + members
    if (old.groups) {
      for (const [groupId, g] of Object.entries(old.groups)) {
        const data = { bills: g.bills ?? [], debts: g.debts ?? [], locations: g.locations ?? {} };
        await client.query(
          `INSERT INTO groups (group_id, data)
           VALUES ($1, $2::jsonb)
           ON CONFLICT (group_id) DO NOTHING`,
          [groupId, JSON.stringify(data)]
        );

        for (const uid of g.members ?? []) {
          // Ensure a bare user row exists for auto-enrolled members
          await client.query(
            `INSERT INTO users (uid) VALUES ($1) ON CONFLICT (uid) DO NOTHING`,
            [uid]
          );
          await client.query(
            `INSERT INTO group_members (group_id, user_uid)
             VALUES ($1, $2)
             ON CONFLICT (group_id, user_uid) DO NOTHING`,
            [groupId, uid]
          );
        }
      }
    }

    // Rename old table so it's preserved but no longer used
    await client.query("ALTER TABLE app_state RENAME TO app_state_migrated");

    await client.query("COMMIT");
    console.log("Migration complete — old table renamed to app_state_migrated");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed (rolled back):", err instanceof Error ? err.message : err);
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */
/*  initDb                                                             */
/* ------------------------------------------------------------------ */

async function initDb(): Promise<void> {
  if (initialized) return;
  if (!DATABASE_URL) {
    console.warn("DATABASE_URL not set — using in-memory state (will reset on deploy)");
    initialized = true;
    return;
  }

  try {
    const p = getPool();
    await createTables(p);
    await migrateFromAppState(p);
    initialized = true;
    console.log("Postgres store initialized (normalised schema)");
  } catch (err) {
    console.error("Failed to init Postgres store:", err instanceof Error ? err.message : err);
    initialized = true; // don't retry, fall back to in-memory
  }
}

/* ------------------------------------------------------------------ */
/*  getState / loadState / saveState                                   */
/* ------------------------------------------------------------------ */

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
    const s: AppState = newAppState();

    // Load users
    const usersRes = await p.query("SELECT uid, display_name, wallet_address, location, lat, lon, registered_at FROM users");
    for (const row of usersRes.rows) {
      s.users[row.uid] = {
        uid: row.uid,
        displayName: row.display_name ?? undefined,
        walletAddress: row.wallet_address ?? undefined,
        location: row.location ?? undefined,
        lat: row.lat ?? undefined,
        lon: row.lon ?? undefined,
        registeredAt: row.registered_at?.toISOString() ?? new Date().toISOString(),
      };
    }

    // Load groups (JSONB data = { bills, debts, locations })
    const groupsRes = await p.query("SELECT group_id, data FROM groups");
    for (const row of groupsRes.rows) {
      const d = row.data ?? {};
      s.groups[row.group_id] = {
        members: [],
        bills: d.bills ?? [],
        debts: d.debts ?? [],
        locations: d.locations ?? {},
      };
    }

    // Load group members and populate members arrays
    const membersRes = await p.query("SELECT group_id, user_uid FROM group_members ORDER BY joined_at");
    for (const row of membersRes.rows) {
      if (!s.groups[row.group_id]) {
        // Group row might be missing if only membership exists — create it
        s.groups[row.group_id] = { members: [], bills: [], debts: [], locations: {} };
      }
      s.groups[row.group_id].members.push(row.user_uid);
    }

    state = s;
    console.log(`Loaded state: ${Object.keys(s.groups).length} groups, ${Object.keys(s.users).length} users`);
  } catch (err) {
    console.error("Failed to load state from Postgres:", err instanceof Error ? err.message : err);
    state = newAppState();
  }
}

export async function saveState(): Promise<void> {
  if (!DATABASE_URL) return;

  const s = getState();
  const p = getPool();
  let client: PoolClient;
  try {
    client = await p.connect();
  } catch (err) {
    console.error("Failed to connect to Postgres for save:", err instanceof Error ? err.message : err);
    return;
  }

  try {
    await client.query("BEGIN");

    // Upsert users
    for (const [uid, u] of Object.entries(s.users)) {
      await client.query(
        `INSERT INTO users (uid, display_name, wallet_address, location, lat, lon, registered_at)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
         ON CONFLICT (uid) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           wallet_address = EXCLUDED.wallet_address,
           location = EXCLUDED.location,
           lat = EXCLUDED.lat,
           lon = EXCLUDED.lon`,
        [uid, u.displayName ?? null, u.walletAddress ?? null, u.location ?? null, u.lat ?? null, u.lon ?? null, u.registeredAt ?? null]
      );
    }

    // Upsert groups + sync members
    for (const [groupId, g] of Object.entries(s.groups)) {
      const data = { bills: g.bills, debts: g.debts, locations: g.locations };
      await client.query(
        `INSERT INTO groups (group_id, data)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (group_id) DO UPDATE SET data = EXCLUDED.data`,
        [groupId, JSON.stringify(data)]
      );

      // Sync members: delete all then re-insert
      await client.query("DELETE FROM group_members WHERE group_id = $1", [groupId]);

      for (const uid of g.members) {
        // Ensure bare user row exists for auto-enrolled members without profiles
        await client.query(
          `INSERT INTO users (uid) VALUES ($1) ON CONFLICT (uid) DO NOTHING`,
          [uid]
        );
        await client.query(
          `INSERT INTO group_members (group_id, user_uid) VALUES ($1, $2)`,
          [groupId, uid]
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to save state to Postgres:", err instanceof Error ? err.message : err);
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------ */
/*  Reset all state (for testing / fresh start)                        */
/* ------------------------------------------------------------------ */

export async function clearAllState(): Promise<void> {
  state = newAppState();

  if (!DATABASE_URL) return;

  // Delete each table independently so one failure doesn't prevent the rest
  const p = getPool();
  const tables = ["group_members", "groups", "users"];
  for (const table of tables) {
    try {
      await p.query(`DELETE FROM ${table}`);
      console.log(`Cleared table: ${table}`);
    } catch (err) {
      console.error(`Failed to clear ${table}:`, err instanceof Error ? err.message : err);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Expose pool for other modules (history, etc.)                      */
/* ------------------------------------------------------------------ */

export { DATABASE_URL };
export function getDbPool(): Pool | null {
  return DATABASE_URL ? getPool() : null;
}
