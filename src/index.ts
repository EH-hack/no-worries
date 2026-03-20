import express from "express";
import axios from "axios";

// ─── Config ───────────────────────────────────────────────────────────────────
const SECRET = process.env.LUFFA_SECRET ?? "";
const PORT = process.env.PORT ?? 3000;
const POLL_INTERVAL_MS = 1000;

const BASE_URL = "https://apibot.luffa.im/robot";

if (!SECRET) {
  console.error("❌  LUFFA_SECRET env var is required");
  process.exit(1);
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface RawMessage {
  uid: string;
  atList: string[];
  text: string;
  urlLink: string | null;
  msgId: string;
}

interface GroupRawMessage extends RawMessage {
  uid: string; // sender UID inside the message JSON
}

interface ReceiveItem {
  uid: string;           // user UID (DM) or group ID (group chat)
  count: number;
  message: string[];     // JSON strings
  type: 0 | 1;           // 0 = DM, 1 = group
}

// API returns ReceiveItem[] directly (not wrapped in { code, data })

// ─── Dedup cache ──────────────────────────────────────────────────────────────
const seenMsgIds = new Set<string>();

// ─── API helpers ──────────────────────────────────────────────────────────────
let pollCount = 0;
async function fetchMessages(): Promise<ReceiveItem[]> {
  const res = await axios.post<ReceiveItem[]>(
    `${BASE_URL}/receive`,
    { secret: SECRET },
    { headers: { "Content-Type": "application/json" } }
  );
  const items: ReceiveItem[] = Array.isArray(res.data) ? res.data : [];
  pollCount++;
  if (pollCount % 30 === 1 || items.length > 0) {
    console.log(`🔍 Poll #${pollCount} — items: ${items.length}, raw:`, JSON.stringify(res.data));
  }
  return items;
}

async function sendDM(uid: string, text: string): Promise<void> {
  console.log(`📤 Sending DM to ${uid}: ${text}`);
  const res = await axios.post(
    `${BASE_URL}/send`,
    {
      secret: SECRET,
      uid,
      msg: JSON.stringify({ text }),
    },
    { headers: { "Content-Type": "application/json" } }
  );
  console.log(`📤 sendDM response:`, JSON.stringify(res.data));
}

async function sendGroup(groupId: string, text: string): Promise<void> {
  console.log(`📤 Sending group msg to ${groupId}: ${text}`);
  const res = await axios.post(
    `${BASE_URL}/sendGroup`,
    {
      secret: SECRET,
      uid: groupId,
      msg: JSON.stringify({ text }),
      type: "1",
    },
    { headers: { "Content-Type": "application/json" } }
  );
  console.log(`📤 sendGroup response:`, JSON.stringify(res.data));
}

// ─── Message handlers ─────────────────────────────────────────────────────────

/**
 * Called for every unique incoming message.
 * Replace / extend the logic here to build your bot behaviour.
 */
async function handleDM(senderUid: string, text: string): Promise<void> {
  console.log(`💬 DM  from ${senderUid}: ${text}`);

  await sendDM(senderUid, `🛑✋ Whoa hold up I'm in progress 🚧🔧`);
}

async function handleGroupMessage(
  groupId: string,
  senderUid: string,
  text: string
): Promise<void> {
  console.log(`👥 Group [${groupId}] from ${senderUid}: ${text}`);

  await sendGroup(groupId, `🛑✋ Whoa hold up I'm in progress 🚧🔧`);
}

// ─── Poll loop ────────────────────────────────────────────────────────────────
async function poll(): Promise<void> {
  try {
    const items = await fetchMessages();

    for (const item of items) {
      for (const rawStr of item.message) {
        let parsed: RawMessage | GroupRawMessage;

        try {
          parsed = JSON.parse(rawStr);
        } catch {
          console.warn("⚠️  Could not parse message JSON:", rawStr);
          continue;
        }

        // Dedup
        if (seenMsgIds.has(parsed.msgId)) continue;
        seenMsgIds.add(parsed.msgId);

        // Keep the cache bounded
        if (seenMsgIds.size > 5000) {
          const first = seenMsgIds.values().next().value;
          if (first) seenMsgIds.delete(first);
        }

        if (item.type === 0) {
          // DM — item.uid is the sender
          await handleDM(item.uid, parsed.text ?? "");
        } else {
          // Group — item.uid is the group ID, parsed.uid is the sender
          const groupMsg = parsed as GroupRawMessage;
          await handleGroupMessage(item.uid, groupMsg.uid ?? "unknown", parsed.text ?? "");
        }
      }
    }
  } catch (err) {
    console.error("❌  Poll error:", err instanceof Error ? err.message : err);
  }
}

// ─── Express health-check (required by Railway) ───────────────────────────────
const app = express();

app.get("/", (_req, res) => {
  res.json({ status: "ok", bot: "luffa-bot", uptime: process.uptime() });
});

app.get("/health", (_req, res) => {
  res.json({ healthy: true });
});

app.listen(PORT, () => {
  console.log(`🚀  Health-check server listening on port ${PORT}`);
  console.log(`🔄  Starting Luffa poll loop (every ${POLL_INTERVAL_MS}ms)…`);
  setInterval(poll, POLL_INTERVAL_MS);
});
