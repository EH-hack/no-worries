import express from "express";
import multer from "multer";
import { PORT, POLL_INTERVAL_MS } from "./config";
import { fetchMessages, sendDM, sendGroup, RawMessage, GroupRawMessage } from "./luffa";
import { runAgent } from "./agent";
import { receiptUploadHTML } from "./receipt-page";
import { parseReceiptFromBase64 } from "./receipt-handler";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
      console.log("Receive item:", JSON.stringify(item));

      for (const rawStr of item.message) {
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

// ─── Express app ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ status: "ok", bot: "no-worries", uptime: process.uptime() });
});

app.get("/health", (_req, res) => {
  res.json({ healthy: true });
});

// ─── Receipt upload page ──────────────────────────────────────────────────────
app.get("/receipt", (req, res) => {
  const groupId = (req.query.group as string) ?? "";
  const paidBy = (req.query.paidBy as string) ?? "";
  const description = (req.query.desc as string) ?? "";
  res.send(receiptUploadHTML(groupId, paidBy, description));
});

// ─── Receipt upload handler ───────────────────────────────────────────────────
app.post("/receipt/upload", upload.single("receipt"), async (req, res) => {
  try {
    const file = req.file;
    const groupId = req.body?.groupId;
    const paidBy = req.body?.paidBy ?? "";

    if (!file) {
      res.status(400).json({ success: false, error: "No file uploaded" });
      return;
    }
    if (!groupId) {
      res.status(400).json({ success: false, error: "Missing groupId" });
      return;
    }

    console.log(`Receipt upload: group=${groupId} paidBy=${paidBy} size=${file.size}`);

    // Convert to base64 data URL for GPT-4o vision
    const base64 = file.buffer.toString("base64");
    const dataUrl = `data:${file.mimetype};base64,${base64}`;

    // Parse and send to group via agent
    await parseReceiptFromBase64(groupId, paidBy, dataUrl);

    res.json({ success: true });
  } catch (err) {
    console.error("Receipt upload error:", err);
    res.status(500).json({ success: false, error: "Failed to process receipt" });
  }
});

app.listen(PORT, () => {
  console.log(`Health-check server on port ${PORT}`);
  console.log(`Starting Luffa poll loop (every ${POLL_INTERVAL_MS}ms)`);
  setInterval(poll, POLL_INTERVAL_MS);
});
