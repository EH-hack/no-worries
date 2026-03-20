import express from "express";
import { PORT, POLL_INTERVAL_MS } from "./config";
import { fetchMessages, sendDM, sendGroup, RawMessage, GroupRawMessage } from "./luffa";
import { runAgent } from "./agent";
import { handleVoiceNote, formatVoiceNoteForMemory } from "./tools/voiceNoteHandler";

// ─── Dedup cache ──────────────────────────────────────────────────────────────
const seenMsgIds = new Set<string>();

// ─── Message handlers ─────────────────────────────────────────────────────────
async function handleDM(senderUid: string, text: string, urlLink: string | null): Promise<void> {
  console.log(`DM from ${senderUid}: ${text}`);

  // Check if this is a voice note
  const voiceNoteResult = await handleVoiceNote(urlLink);

  let message: string;
  if (voiceNoteResult.isVoiceNote) {
    if (voiceNoteResult.transcription) {
      message = formatVoiceNoteForMemory(senderUid, voiceNoteResult.transcription);
      console.log(`🎤 Voice note transcribed: ${voiceNoteResult.transcription}`);
    } else if (voiceNoteResult.error) {
      console.error(`❌ Voice note transcription failed: ${voiceNoteResult.error}`);
      await sendDM(senderUid, "Sorry, I couldn't transcribe your voice note. Can you try again or type it out?");
      return;
    } else {
      message = text;
    }
  } else {
    message = urlLink
      ? `${text}\n\n[Receipt image: ${urlLink}]`
      : text;
  }

  const reply = await runAgent(`dm:${senderUid}`, message);
  await sendDM(senderUid, reply);
}

async function handleGroupMessage(
  groupId: string,
  senderUid: string,
  text: string,
  urlLink: string | null
): Promise<void> {
  console.log(`Group [${groupId}] from ${senderUid}: ${text}`);

  // Check if this is a voice note
  const voiceNoteResult = await handleVoiceNote(urlLink);

  let message: string;
  if (voiceNoteResult.isVoiceNote) {
    if (voiceNoteResult.transcription) {
      message = `[${senderUid}]: ${voiceNoteResult.transcription}\n\nGroup ID for tool calls: ${groupId}`;
      console.log(`🎤 Voice note transcribed: ${voiceNoteResult.transcription}`);
    } else if (voiceNoteResult.error) {
      console.error(`❌ Voice note transcription failed: ${voiceNoteResult.error}`);
      await sendGroup(groupId, "Sorry, I couldn't transcribe that voice note. Can you try again?");
      return;
    } else {
      message = `[${senderUid}]: ${text}\n\nGroup ID for tool calls: ${groupId}`;
    }
  } else {
    message = urlLink
      ? `[${senderUid}]: ${text}\n\n[Receipt image: ${urlLink}]\n\nGroup ID for tool calls: ${groupId}`
      : `[${senderUid}]: ${text}\n\nGroup ID for tool calls: ${groupId}`;
  }

  const reply = await runAgent(`group:${groupId}`, message);
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
          console.warn("Could not parse message JSON:", rawStr);
          continue;
        }

        if (seenMsgIds.has(parsed.msgId)) continue;
        seenMsgIds.add(parsed.msgId);

        if (seenMsgIds.size > 5000) {
          const first = seenMsgIds.values().next().value;
          if (first) seenMsgIds.delete(first);
        }

        if (item.type === 0) {
          await handleDM(item.uid, parsed.text ?? "", parsed.urlLink);
        } else {
          const groupMsg = parsed as GroupRawMessage;
          await handleGroupMessage(
            item.uid,
            groupMsg.uid ?? "unknown",
            parsed.text ?? "",
            parsed.urlLink
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
