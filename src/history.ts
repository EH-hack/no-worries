import OpenAI from "openai";
import { MAX_HISTORY } from "./config";
import { getDbPool } from "./store";

// In-memory cache (populated from DB on first access per conversation)
const cache = new Map<string, OpenAI.ChatCompletionMessageParam[]>();
const loaded = new Set<string>();

/**
 * Load history from DB into cache if not already loaded.
 */
async function ensureLoaded(conversationId: string): Promise<void> {
  if (loaded.has(conversationId)) return;

  const pool = getDbPool();
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT role, content FROM (
           SELECT role, content, id FROM conversation_history
           WHERE conversation_id = $1
           ORDER BY id DESC
           LIMIT $2
         ) sub ORDER BY id ASC`,
        [conversationId, MAX_HISTORY]
      );
      const messages: OpenAI.ChatCompletionMessageParam[] = res.rows.map((r) => ({
        role: r.role as "user" | "assistant",
        content: r.content,
      }));
      cache.set(conversationId, messages);
    } catch (err) {
      console.error("Failed to load history from DB:", err instanceof Error ? err.message : err);
      if (!cache.has(conversationId)) cache.set(conversationId, []);
    }
  } else {
    if (!cache.has(conversationId)) cache.set(conversationId, []);
  }

  loaded.add(conversationId);
}

export async function getHistory(conversationId: string): Promise<OpenAI.ChatCompletionMessageParam[]> {
  await ensureLoaded(conversationId);
  return cache.get(conversationId)!;
}

export async function addToHistory(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await ensureLoaded(conversationId);
  const history = cache.get(conversationId)!;
  history.push({ role, content });

  // Trim in-memory cache
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  // Persist to DB
  const pool = getDbPool();
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO conversation_history (conversation_id, role, content) VALUES ($1, $2, $3)`,
        [conversationId, role, content]
      );
      // Trim old rows in DB (keep only MAX_HISTORY per conversation)
      await pool.query(
        `DELETE FROM conversation_history
         WHERE conversation_id = $1
           AND id NOT IN (
             SELECT id FROM conversation_history
             WHERE conversation_id = $1
             ORDER BY id DESC
             LIMIT $2
           )`,
        [conversationId, MAX_HISTORY]
      );
    } catch (err) {
      console.error("Failed to persist history:", err instanceof Error ? err.message : err);
    }
  }
}

export async function clearHistory(conversationId: string): Promise<void> {
  cache.delete(conversationId);
  loaded.delete(conversationId);

  const pool = getDbPool();
  if (pool) {
    try {
      await pool.query("DELETE FROM conversation_history WHERE conversation_id = $1", [conversationId]);
    } catch (err) {
      console.error("Failed to clear history from DB:", err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Clear ALL conversation history — both in-memory cache AND database.
 */
export async function clearAllHistory(): Promise<void> {
  cache.clear();
  loaded.clear();

  const pool = getDbPool();
  if (pool) {
    try {
      await pool.query("DELETE FROM conversation_history");
      console.log("Conversation history cleared from database");
    } catch (err) {
      console.error("Failed to clear conversation history from DB:", err instanceof Error ? err.message : err);
    }
  }
}
