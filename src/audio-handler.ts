import { sendGroup } from "./luffa";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { runAgent } from "./agent";

// Initialize ElevenLabs client - automatically picks up ELEVENLABS_API_KEY from env
const elevenlabs = new ElevenLabsClient();

/**
 * Transcribes audio buffer using ElevenLabs Speech-to-Text API
 */
async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  console.log(`🎤 Transcribing audio with ElevenLabs (size: ${audioBuffer.length} bytes)...`);

  // Convert Buffer to Blob for the SDK
  const audioBlob = new Blob([audioBuffer], { type: getContentType(filename) });

  const transcription = await elevenlabs.speechToText.convert({
    file: audioBlob,
    modelId: "scribe_v2", // Latest model for best accuracy
  });

  const text = transcription.text ?? "";

  if (!text) {
    throw new Error("Empty transcription received from ElevenLabs");
  }

  console.log(`✅ Transcription complete: "${text.substring(0, 100)}..."`);
  return text;
}

/**
 * Determines MIME type based on file extension
 */
function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() || "";
  const mimeTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    opus: "audio/opus",
    aac: "audio/aac",
    flac: "audio/flac",
    webm: "audio/webm",
    amr: "audio/amr",
  };
  return mimeTypes[ext] || "audio/mpeg";
}

/**
 * Processes uploaded audio file and sends transcription to group
 */
export async function handleAudioUpload(
  groupId: string,
  userId: string,
  audioBuffer: Buffer,
  filename: string
): Promise<string> {
  try {
    // Transcribe the audio
    const transcription = await transcribeAudio(audioBuffer, filename);

    // Process transcription through the agent (just like a regular group message)
    // This allows the bot to use tools based on the voice note content
    const groupIdHint = `\n\nSender UID: ${userId}\nGroup ID for tool calls: ${groupId}`;
    const agentMessage = `[${userId}]: ${transcription}${groupIdHint}`;

    console.log(`🤖 Processing voice note through agent: "${transcription.substring(0, 80)}..."`);

    // Run through agent - it can use tools like bill splitting, journey planning, etc.
    const agentReply = await runAgent(`group:${groupId}`, agentMessage, groupId);

    // Send agent's response to group
    await sendGroup(groupId, agentReply);

    console.log(`✅ Voice note processed and agent responded to group ${groupId}`);

    return transcription;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Audio upload error: ${errorMessage}`);

    // Send error to group
    await sendGroup(
      groupId,
      `⚠️ Failed to transcribe voice note from [${userId}]: ${errorMessage}`
    );

    throw error;
  }
}
