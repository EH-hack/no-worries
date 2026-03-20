import { sendGroup } from "./luffa";
import axios from "axios";
import FormData from "form-data";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";

/**
 * Transcribes audio buffer using ElevenLabs Speech-to-Text API
 */
async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<string> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY environment variable is not set");
  }

  console.log(`🎤 Transcribing audio with ElevenLabs (size: ${audioBuffer.length} bytes)...`);

  const formData = new FormData();
  formData.append("file", audioBuffer, {
    filename,
    contentType: getContentType(filename),
  });

  // Use the latest scribe_v2 model for best accuracy
  formData.append("model_id", "scribe_v2");

  const response = await axios.post(ELEVENLABS_STT_URL, formData, {
    headers: {
      ...formData.getHeaders(),
      "xi-api-key": ELEVENLABS_API_KEY,
    },
    timeout: 60000, // 60 second timeout for transcription
  });

  const transcription = response.data?.text ?? "";

  if (!transcription) {
    throw new Error("Empty transcription received from ElevenLabs");
  }

  console.log(`✅ Transcription complete: "${transcription.substring(0, 100)}..."`);
  return transcription;
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

    // Format message for group
    const message = `🎤 Voice note from [${userId}]:\n\n"${transcription}"`;

    // Send to group chat
    await sendGroup(groupId, message);

    console.log(`✅ Voice note processed and sent to group ${groupId}`);

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
