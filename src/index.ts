import express from "express";
import { PORT, POLL_INTERVAL_MS } from "./config";
import { fetchMessages, sendDM, sendGroup, RawMessage, GroupRawMessage } from "./luffa";
import { runAgent } from "./agent";

// ─── Dedup cache ──────────────────────────────────────────────────────────────
const seenMsgIds = new Set<string>();

// ─── Message handlers ─────────────────────────────────────────────────────────
async function handleDM(senderUid: string, text: string, urlLink: string | null): Promise<void> {
  console.log(`DM from ${senderUid}: text="${text}" urlLink="${urlLink}"`);
  const message = urlLink
    ? `${text || "Here's a receipt/image"}\n\n[Image URL: ${urlLink}]`
    : text;
  const reply = await runAgent(`dm:${senderUid}`, message);
  await sendDM(senderUid, reply);
}

async function handleGroupMessage(
  groupId: string,
  senderUid: string,
  text: string,
  urlLink: string | null
): Promise<void> {
  console.log(`Group [${groupId}] from ${senderUid}: text="${text}" urlLink="${urlLink}"`);
  const message = urlLink
    ? `[${senderUid}]: ${text || "Here's a receipt/image"}\n\n[Image URL: ${urlLink}]\n\nGroup ID for tool calls: ${groupId}`
    : `[${senderUid}]: ${text}\n\nGroup ID for tool calls: ${groupId}`;
  const reply = await runAgent(`group:${groupId}`, message);
  await sendGroup(groupId, reply);
}

// ─── Poll loop ────────────────────────────────────────────────────────────────
async function poll(): Promise<void> {
  try {
    const items = await fetchMessages();

    for (const item of items) {
      // Log the FULL item envelope — catches images even if message array is empty
      console.log("Receive item:", JSON.stringify(item));

      for (const rawStr of item.message) {
        // Log every raw message string before parsing
        console.log("Raw message:", rawStr);

        let parsed: RawMessage | GroupRawMessage;
        try {
          parsed = JSON.parse(rawStr);
        } catch {
          console.warn("Could not parse message JSON:", rawStr);
          continue;
        }

        if (seenMsgIds.has(parsed.msgId)) continue;
        seenMsgIds.add(parsed.msgId);

        if (seenMsgIds.size > 5000) {
          const first = seenMsgIds.values().next().value;
          if (first) seenMsgIds.delete(first);
        }

        const text = parsed.text ?? "";
        const urlLink = parsed.urlLink ?? null;

        // Skip messages with no text AND no image
        if (!text && !urlLink) {
          console.log("Skipping empty message (no text, no urlLink)");
          continue;
        }

        if (item.type === 0) {
          await handleDM(item.uid, text, urlLink);
        } else {
          const groupMsg = parsed as GroupRawMessage;
          await handleGroupMessage(
            item.uid,
            groupMsg.uid ?? "unknown",
            text,
            urlLink
          );
        }
      }
    }
  } catch (err) {
    console.error("Poll error:", err instanceof Error ? err.message : err);
  }
}

// ─── Express health-check ─────────────────────────────────────────────────────
const app = express();

app.get("/", (_req, res) => {
  res.json({ status: "ok", bot: "no-worries", uptime: process.uptime() });
});

app.get("/health", (_req, res) => {
  res.json({ healthy: true });
});

app.listen(PORT, () => {
  console.log(`Health-check server on port ${PORT}`);
  console.log(`Starting Luffa poll loop (every ${POLL_INTERVAL_MS}ms)`);
  setInterval(poll, POLL_INTERVAL_MS);
});
