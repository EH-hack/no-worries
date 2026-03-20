import "dotenv/config";
import express from "express";
import axios from "axios";
import OpenAI from "openai";

// ─── Config ───────────────────────────────────────────────────────────────────
const SECRET = process.env.LUFFA_SECRET ?? "";
const PORT = process.env.PORT ?? 3000;
const POLL_INTERVAL_MS = 1000;

const BASE_URL = "https://apibot.luffa.im/robot";

if (!SECRET) {
  console.error("❌  LUFFA_SECRET env var is required");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.CHATGPT_API_KEY ?? "",
});

if (!process.env.CHATGPT_API_KEY) {
  console.error("❌  CHATGPT_API_KEY env var is required");
  process.exit(1);
}

// ─── System prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are "No Worries" 🍕 — a chill, friendly AI assistant living inside a Luffa group chat.

Your main job is helping groups split bills and plan things together. You're casual, concise, and use emojis naturally (but don't overdo it).

What you can do:
- Help split bills when someone shares what people ordered or snaps a receipt
- Keep track of who owes what
- Help plan group activities (meeting spots, restaurants, etc.)

Personality:
- Relaxed and fun — like a helpful friend in the group chat, not a corporate bot
- Keep responses short and chat-friendly (no walls of text)
- Use people's names/UIDs when referring to them
- If someone asks something you can't do yet, be honest about it

When splitting bills:
- Ask clarifying questions if the info is incomplete
- Break down the split clearly
- Include tax/tip if mentioned
- Show each person's total

Remember: you're in a group chat. Keep it snappy.`;

// ─── Per-conversation message history ────────────────────────────────────────
const conversationHistory = new Map<string, OpenAI.ChatCompletionMessageParam[]>();
const MAX_HISTORY = 20;

function getHistory(conversationId: string): OpenAI.ChatCompletionMessageParam[] {
  if (!conversationHistory.has(conversationId)) {
    conversationHistory.set(conversationId, []);
  }
  return conversationHistory.get(conversationId)!;
}

function addToHistory(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): void {
  const history = getHistory(conversationId);
  history.push({ role, content });
  // Keep history bounded
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

// ─── GPT helper ──────────────────────────────────────────────────────────────
async function askGPT(conversationId: string, userMessage: string): Promise<string> {
  addToHistory(conversationId, "user", userMessage);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...getHistory(conversationId),
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply = response.choices[0]?.message?.content ?? "Hmm, I got nothing. Try again?";
    addToHistory(conversationId, "assistant", reply);
    return reply;
  } catch (err) {
    console.error("❌ GPT error:", err instanceof Error ? err.message : err);
    return "😅 My brain glitched for a sec — try again?";
  }
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

async function handleDM(senderUid: string, text: string): Promise<void> {
  console.log(`💬 DM from ${senderUid}: ${text}`);

  const reply = await askGPT(`dm:${senderUid}`, text);
  await sendDM(senderUid, reply);
}

async function handleGroupMessage(
  groupId: string,
  senderUid: string,
  text: string
): Promise<void> {
  console.log(`👥 Group [${groupId}] from ${senderUid}: ${text}`);

  const reply = await askGPT(`group:${groupId}`, `[${senderUid}]: ${text}`);
  await sendGroup(groupId, reply);
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
  res.json({ status: "ok", bot: "no-worries", uptime: process.uptime() });
});

app.get("/health", (_req, res) => {
  res.json({ healthy: true });
});

app.listen(PORT, () => {
  console.log(`🚀  Health-check server listening on port ${PORT}`);
  console.log(`🔄  Starting Luffa poll loop (every ${POLL_INTERVAL_MS}ms)…`);
  setInterval(poll, POLL_INTERVAL_MS);
});
