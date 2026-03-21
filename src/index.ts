import express from "express";
import multer from "multer";
import expressWs from "express-ws";
import type { Request } from "express";
import type WebSocket from "ws";
import { PORT, POLL_INTERVAL_MS } from "./config";
import { fetchMessages, sendDM, sendGroup, RawMessage, GroupRawMessage, AtMention } from "./luffa";
import { runAgent } from "./agent";
import { getState, saveState, loadState } from "./store";
import { receiptUploadHTML } from "./receipt-page";
import { parseReceiptFromBase64 } from "./receipt-handler";
import { audioUploadHTML } from "./audio-page";
import { MapMember, mapPageHTML } from "./map-page";
import { handleAudioUpload } from "./audio-handler";
import { handleBookingWebSocket } from "./booking-websocket";

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
  if (reply) await sendDM(senderUid, reply);
}

async function handleGroupMessage(
  groupId: string,
  senderUid: string,
  text: string,
  urlLink: string | null,
  atList: AtMention[]
): Promise<void> {
  console.log(`Group [${groupId}] from ${senderUid}: text="${text}" urlLink="${urlLink}" atList=${JSON.stringify(atList)}`);

  // Auto-save display names from mentions to user profiles
  // Filter out the bot's own UID
  const BOT_NAME = "no worries";
  const state = getState();
  for (const m of atList) {
    if (m.did && m.name && m.name.toLowerCase() !== BOT_NAME) {
      if (!state.users[m.did]) {
        state.users[m.did] = { uid: m.did, registeredAt: new Date().toISOString() };
      }
      state.users[m.did].displayName = m.name;
    }
  }
  // Auto-enroll sender as group member (but never the group ID itself)
  const { ensureGroup } = await import("./billing/types");
  const group = ensureGroup(state, groupId);
  let needsSave = atList.length > 0;
  if (senderUid !== groupId && senderUid !== "unknown" && !group.members.includes(senderUid)) {
    group.members.push(senderUid);
    needsSave = true;
  }

  if (needsSave) await saveState();

  // Build mention mapping so GPT knows display names → UIDs
  let mentionHint = "";
  if (atList.length > 0) {
    const mappings = atList.map((m) => `@${m.name} = UID "${m.did}"`).join(", ");
    mentionHint = `\nMention mappings: ${mappings}`;
  }

  const groupIdHint = `\n\nSender UID: ${senderUid}${mentionHint}\nGroup ID for tool calls: ${groupId}`;
  const message = urlLink
    ? `[${senderUid}]: ${text || "Here's a receipt/image"}\n\n[Image URL: ${urlLink}]${groupIdHint}`
    : `[${senderUid}]: ${text}${groupIdHint}`;
  const reply = await runAgent(`group:${groupId}`, message, groupId);
  if (reply) await sendGroup(groupId, reply);
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

        // Skip system messages (join/leave notifications, type "2")
        if (parsed.type === "2" || parsed.type === 2) {
          console.log("Skipping system message:", parsed.text);
          continue;
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
            urlLink,
            parsed.atList ?? []
          );
        }
      }
    }
  } catch (err) {
    console.error("Poll error:", err instanceof Error ? err.message : err);
  }
}

// ─── Express app ──────────────────────────────────────────────────────────────
const { app } = expressWs(express());
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

// ─── Audio upload page ────────────────────────────────────────────────────────
app.get("/audio", (req, res) => {
  const groupId = (req.query.group as string) ?? "";
  const userId = (req.query.user as string) ?? "";
  res.send(audioUploadHTML(groupId, userId));
});

// ─── Audio upload handler ─────────────────────────────────────────────────────
app.post("/audio/upload", upload.single("audio"), async (req, res) => {
  try {
    const file = req.file;
    const groupId = req.body?.groupId;
    const userId = req.body?.userId ?? "unknown";

    if (!file) {
      res.status(400).json({ success: false, error: "No audio file uploaded" });
      return;
    }
    if (!groupId) {
      res.status(400).json({ success: false, error: "Missing groupId" });
      return;
    }

    console.log(`Audio upload: group=${groupId} user=${userId} size=${file.size}`);

    // Transcribe and send to group
    const transcription = await handleAudioUpload(groupId, userId, file.buffer, file.originalname);

    res.json({ success: true, transcription });
  } catch (err) {
    console.error("Audio upload error:", err);
    res.status(500).json({ success: false, error: "Failed to transcribe audio" });
  }
});

// ─── Booking TwiML endpoint ───────────────────────────────────────────────────
app.post("/booking/twiml", (req, res) => {
  const callSid = req.body?.CallSid;
  console.log(`[BOOKING] TwiML request for call ${callSid}`);

  // PLACEHOLDER: Get booking context from callSid
  // For now, just return basic TwiML
  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting to booking assistant</Say>
  <Connect>
    <Stream url="wss://${req.hostname}/booking/media/${callSid}" />
  </Connect>
</Response>`);
});

// ─── Booking WebSocket endpoint ───────────────────────────────────────────────
app.ws("/booking/media/:callSid", (ws: WebSocket, req: Request) => {
  const callSid = req.params.callSid;
  console.log(`[BOOKING] WebSocket connection for call ${callSid}`);
  handleBookingWebSocket(ws, callSid);
});

// ─── Booking status callback ──────────────────────────────────────────────────
app.post("/booking/status", (req, res) => {
  const callSid = req.body?.CallSid;
  const callStatus = req.body?.CallStatus;
  console.log(`[BOOKING] Status update for call ${callSid}: ${callStatus}`);
  res.sendStatus(200);
});

// ─── Map page ─────────────────────────────────────────────────────────────────
app.get("/map", (req, res) => {
  const groupId = (req.query.group as string) ?? "";
  const state = getState();
  const group = state.groups[groupId];
  if (!group) {
    res.status(404).send("Group not found");
    return;
  }
  const members: MapMember[] = [];
  for (const uid of Object.keys(group.locations ?? {})) {
    const loc = group.locations[uid];
    if (loc?.currentLat && loc?.currentLon) {
      members.push({ uid, label: loc.current!, lat: loc.currentLat, lon: loc.currentLon });
    } else if (loc?.homeLat && loc?.homeLon) {
      members.push({ uid, label: loc.home!, lat: loc.homeLat, lon: loc.homeLon });
    }
  }
  res.send(mapPageHTML(members));
});

app.listen(PORT, async () => {
  console.log(`Health-check server on port ${PORT}`);
  await loadState();
  console.log(`Starting Luffa poll loop (every ${POLL_INTERVAL_MS}ms)`);
  setInterval(poll, POLL_INTERVAL_MS);
});
