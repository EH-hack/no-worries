import axios from "axios";
import FormData from "form-data";

/**
 * Voice Note Handler
 *
 * Detects voice notes from Luffa messages and transcribes them using ElevenLabs Speech-to-Text API.
 * Voice notes are stored in the conversation history as transcribed text.
 */

// ─── Configuration ────────────────────────────────────────────────────────────
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";

// Voice note file extensions that we'll recognize
const VOICE_NOTE_EXTENSIONS = [
  ".mp3", ".m4a", ".wav", ".ogg", ".opus",
  ".aac", ".flac", ".webm", ".amr"
];

// ─── Types ────────────────────────────────────────────────────────────────────
export interface VoiceNoteResult {
  isVoiceNote: boolean;
  transcription?: string;
  error?: string;
  audioUrl?: string;
  duration?: number;
}

// ─── Voice Note Detection ─────────────────────────────────────────────────────
/**
 * Determines if a message contains a voice note based on the urlLink field
 * @param urlLink - The URL from the Luffa message
 * @returns true if the URL appears to be a voice note
 */
export function isVoiceNote(urlLink: string | null): boolean {
  if (!urlLink) return false;

  const lowerUrl = urlLink.toLowerCase();

  // Check if URL ends with a known audio extension
  return VOICE_NOTE_EXTENSIONS.some(ext => lowerUrl.includes(ext));
}

// ─── Audio Download ───────────────────────────────────────────────────────────
/**
 * Downloads audio file from URL and returns it as a Buffer
 * @param audioUrl - URL to the audio file
 * @returns Audio data as Buffer
 */
async function downloadAudio(audioUrl: string): Promise<Buffer> {
  try {
    console.log(`🎵 Downloading audio from: ${audioUrl}`);
    const response = await axios.get(audioUrl, {
      responseType: "arraybuffer",
      timeout: 30000, // 30 second timeout
    });

    return Buffer.from(response.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to download audio: ${message}`);
  }
}

// ─── ElevenLabs Speech-to-Text ────────────────────────────────────────────────
/**
 * Transcribes audio using ElevenLabs Speech-to-Text API
 * @param audioBuffer - Audio file as Buffer
 * @param filename - Original filename (for content-type detection)
 * @returns Transcribed text
 */
async function transcribeWithElevenLabs(
  audioBuffer: Buffer,
  filename: string = "audio.mp3"
): Promise<string> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY environment variable is not set");
  }

  try {
    console.log(`🎤 Transcribing audio with ElevenLabs (size: ${audioBuffer.length} bytes)...`);

    const formData = new FormData();
    formData.append("file", audioBuffer, {
      filename,
      contentType: getContentType(filename),
    });

    // Use the latest scribe_v2 model for best accuracy
    formData.append("model_id", "scribe_v2");

    // Optional: Enable audio event tagging (e.g., [laughter], [music], etc.)
    // formData.append("tag_audio_events", "true");

    // Optional: Specify language code if known (e.g., "en", "es", "fr")
    // This can improve accuracy but defaults to auto-detection
    // formData.append("language_code", "en");

    const response = await axios.post(ELEVENLABS_STT_URL, formData, {
      headers: {
        ...formData.getHeaders(),
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      timeout: 60000, // 60 second timeout for transcription
    });

    // ElevenLabs returns: { text: string }
    const transcription = response.data?.text ?? "";

    if (!transcription) {
      throw new Error("Empty transcription received from ElevenLabs");
    }

    console.log(`✅ Transcription complete: "${transcription.substring(0, 100)}..."`);
    return transcription;

  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      throw new Error(`ElevenLabs API error (${status}): ${message}`);
    }
    throw error;
  }
}

// ─── Helper: Content Type Detection ──────────────────────────────────────────
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

// ─── Main Handler ─────────────────────────────────────────────────────────────
/**
 * Main function to handle voice note detection and transcription
 * @param urlLink - The urlLink field from Luffa message
 * @returns VoiceNoteResult with transcription if it's a voice note
 */
export async function handleVoiceNote(
  urlLink: string | null
): Promise<VoiceNoteResult> {
  // Check if it's a voice note
  if (!isVoiceNote(urlLink)) {
    return { isVoiceNote: false };
  }

  if (!urlLink) {
    return {
      isVoiceNote: false,
      error: "urlLink is null"
    };
  }

  try {
    // Download the audio file
    const audioBuffer = await downloadAudio(urlLink);

    // Extract filename from URL for content-type detection
    const filename = urlLink.split("/").pop() || "audio.mp3";

    // Transcribe with ElevenLabs
    const transcription = await transcribeWithElevenLabs(audioBuffer, filename);

    return {
      isVoiceNote: true,
      transcription,
      audioUrl: urlLink,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Voice note handling error: ${errorMessage}`);

    return {
      isVoiceNote: true,
      audioUrl: urlLink,
      error: errorMessage,
    };
  }
}

// ─── Format for Agent Memory ──────────────────────────────────────────────────
/**
 * Formats voice note transcription for storage in conversation history
 * @param senderUid - UID of the sender
 * @param transcription - Transcribed text
 * @returns Formatted message for agent memory
 */
export function formatVoiceNoteForMemory(
  senderUid: string,
  transcription: string
): string {
  return `[Voice Note from ${senderUid}]: ${transcription}`;
}
