import { WebSocket } from "ws";
import {
  getBookingContext,
  updateBookingContext,
  clearBookingContext,
  getBookingAgentPrompt,
  BookingContext,
} from "./services/bookingService";
import { sendGroup } from "./luffa";

// ─── WebSocket handler for Twilio Media Streams ──────────────────────────────

export function handleBookingWebSocket(ws: WebSocket, callSid: string): void {
  console.log(`[BOOKING WS] New connection for call ${callSid}`);

  let context = getBookingContext(callSid);
  if (!context) {
    console.error(`[BOOKING WS] No context found for call ${callSid}`);
    ws.close();
    return;
  }

  // PLACEHOLDER: Track stream state
  let streamSid: string | null = null;
  let audioBuffer: Buffer[] = [];

  ws.on("message", (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.event) {
        case "start":
          console.log(`[BOOKING WS] Stream started:`, msg.start);
          streamSid = msg.start.streamSid;
          context = getBookingContext(callSid);
          if (context) {
            notifyGroup(context, "📞 Connected to restaurant, calling now...");
          }
          break;

        case "media":
          // PLACEHOLDER: Incoming audio from the phone call
          // msg.media.payload is base64-encoded mulaw audio
          // TODO: Implement real-time transcription with ElevenLabs or OpenAI Whisper
          // TODO: Process through booking agent
          // TODO: Generate response audio with ElevenLabs TTS
          // TODO: Send audio back to call via Twilio Media Stream

          // For now, just log that we received audio
          const payload = Buffer.from(msg.media.payload, "base64");
          audioBuffer.push(payload);

          // PLACEHOLDER: Every 3 seconds of audio, process it
          if (audioBuffer.length > 50) { // ~3 seconds of mulaw audio at 8kHz
            console.log(`[BOOKING WS] Processing ${audioBuffer.length} audio chunks`);
            processAudioChunk(callSid, audioBuffer, ws, streamSid);
            audioBuffer = [];
          }
          break;

        case "stop":
          console.log(`[BOOKING WS] Stream stopped`);
          context = getBookingContext(callSid);
          if (context) {
            notifyGroup(context, "📞 Call ended. Booking attempt complete!");
          }
          clearBookingContext(callSid);
          ws.close();
          break;

        default:
          console.log(`[BOOKING WS] Unknown event: ${msg.event}`);
      }
    } catch (err) {
      console.error(`[BOOKING WS] Error processing message:`, err);
    }
  });

  ws.on("close", () => {
    console.log(`[BOOKING WS] Connection closed for call ${callSid}`);
    clearBookingContext(callSid);
  });

  ws.on("error", (err) => {
    console.error(`[BOOKING WS] WebSocket error:`, err);
  });
}

// ─── Audio processing (PLACEHOLDER) ───────────────────────────────────────────

async function processAudioChunk(
  callSid: string,
  audioChunks: Buffer[],
  ws: WebSocket,
  streamSid: string | null
): Promise<void> {
  const context = getBookingContext(callSid);
  if (!context) return;

  // TODO: Implement real audio processing
  // 1. Combine audio chunks into single buffer
  // 2. Transcribe with ElevenLabs STT or OpenAI Whisper
  // 3. Feed transcript to booking agent (GPT-4 with booking context)
  // 4. Generate response with ElevenLabs TTS
  // 5. Send audio back to Twilio via WebSocket

  console.log(`[BOOKING WS] PLACEHOLDER: Would transcribe and process ${audioChunks.length} chunks here`);

  // PLACEHOLDER: Log what the agent would do
  const agentPrompt = getBookingAgentPrompt(context);
  console.log(`[BOOKING WS] Agent context:`, {
    state: context.conversationState,
    venue: context.venueName,
    party: context.partySize,
  });

  // PLACEHOLDER: Example of how to send audio back to Twilio
  // const responseAudio = await synthesizeSpeech("Hello, I'd like to make a booking");
  // const base64Audio = responseAudio.toString('base64');
  // ws.send(JSON.stringify({
  //   event: 'media',
  //   streamSid: streamSid,
  //   media: {
  //     payload: base64Audio
  //   }
  // }));

  // Update conversation state (placeholder)
  if (context.conversationState === "greeting") {
    updateBookingContext(callSid, { conversationState: "booking" });
  }
}

// ─── Notify group about booking progress ─────────────────────────────────────

async function notifyGroup(context: BookingContext, message: string): Promise<void> {
  try {
    await sendGroup(context.groupId, message);
  } catch (err) {
    console.error(`[BOOKING WS] Failed to notify group:`, err);
  }
}

// ─── Audio synthesis (PLACEHOLDER) ────────────────────────────────────────────

// TODO: Implement with ElevenLabs TTS
// async function synthesizeSpeech(text: string): Promise<Buffer> {
//   // Use ElevenLabs API to convert text to speech
//   // Return audio buffer in format Twilio expects (mulaw PCM)
//   return Buffer.from('placeholder');
// }

// ─── Audio transcription (PLACEHOLDER) ────────────────────────────────────────

// TODO: Implement with ElevenLabs STT or OpenAI Whisper
// async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
//   // Convert mulaw audio to format STT expects
//   // Call ElevenLabs or OpenAI transcription API
//   // Return transcript
//   return "placeholder transcript";
// }
