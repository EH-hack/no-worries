# Voice Note Handler

This tool detects and transcribes voice notes from Luffa messages using the ElevenLabs Speech-to-Text API.

## Features

- Automatically detects voice notes based on URL file extensions
- Downloads audio files from URLs
- Transcribes audio using ElevenLabs Speech-to-Text API (latest **scribe_v2** model)
- Formats transcriptions for storage in conversation history
- Handles errors gracefully with fallback messages
- Supports 9+ audio formats (MP3, M4A, WAV, OGG, OPUS, AAC, FLAC, WebM, AMR)
- Optional audio event tagging (e.g., [laughter], [music])
- Automatic language detection (or manual specification)

## Setup

### 1. Install Dependencies

```bash
npm install
```

This will install the required `form-data` package added to `package.json`.

### 2. Add ElevenLabs API Key

Add your ElevenLabs API key to your `.env` file:

```bash
ELEVENLABS_API_KEY=your_api_key_here
```

You can get an API key from [ElevenLabs](https://elevenlabs.io/).

### 3. Supported Audio Formats

The handler automatically detects the following audio file formats:
- MP3 (`.mp3`)
- M4A (`.m4a`)
- WAV (`.wav`)
- OGG (`.ogg`)
- OPUS (`.opus`)
- AAC (`.aac`)
- FLAC (`.flac`)
- WebM (`.webm`)
- AMR (`.amr`)

## Usage

The voice note handler is automatically integrated into the message processing pipeline in `src/index.ts`.

### How It Works

1. **Detection**: When a message is received from Luffa, the handler checks if the `urlLink` field contains an audio file
2. **Download**: If it's a voice note, the audio file is downloaded from the URL
3. **Transcription**: The audio is sent to ElevenLabs Speech-to-Text API
4. **Storage**: The transcription is formatted and stored in conversation history
5. **Response**: The AI agent processes the transcription just like a text message

### Example Flow

```
User sends voice note → Luffa provides URL
                      ↓
Handler detects audio extension (.mp3, .m4a, etc.)
                      ↓
Downloads audio from URL
                      ↓
Sends to ElevenLabs API for transcription
                      ↓
Receives: "Let's split the bill for dinner tonight"
                      ↓
Formats as: "[Voice Note from user_123]: Let's split the bill for dinner tonight"
                      ↓
Stores in conversation history
                      ↓
AI agent responds normally
```

## API Reference

### `handleVoiceNote(urlLink: string | null): Promise<VoiceNoteResult>`

Main function to detect and transcribe voice notes.

**Parameters:**
- `urlLink` - The URL from Luffa message's `urlLink` field

**Returns:**
```typescript
{
  isVoiceNote: boolean;
  transcription?: string;
  error?: string;
  audioUrl?: string;
}
```

### `formatVoiceNoteForMemory(senderUid: string, transcription: string): string`

Formats the transcription for storage in conversation history.

**Parameters:**
- `senderUid` - User ID of the sender
- `transcription` - Transcribed text

**Returns:**
- Formatted string: `[Voice Note from {uid}]: {transcription}`

### `isVoiceNote(urlLink: string | null): boolean`

Checks if a URL points to an audio file.

**Parameters:**
- `urlLink` - URL to check

**Returns:**
- `true` if the URL contains a recognized audio file extension

## Error Handling

If transcription fails:
- **DM**: Bot responds with "Sorry, I couldn't transcribe your voice note. Can you try again or type it out?"
- **Group**: Bot responds with "Sorry, I couldn't transcribe that voice note. Can you try again?"
- Error is logged to console for debugging

## Integration in Message Handlers

The voice note handler is integrated in both DM and group message handlers:

```typescript
// DM Handler
async function handleDM(senderUid: string, text: string, urlLink: string | null) {
  const voiceNoteResult = await handleVoiceNote(urlLink);

  if (voiceNoteResult.isVoiceNote && voiceNoteResult.transcription) {
    // Use transcription instead of text
    messageContent = formatVoiceNoteForMemory(senderUid, voiceNoteResult.transcription);
  }
  // ... continue processing
}

// Group Message Handler
async function handleGroupMessage(groupId: string, senderUid: string, text: string, urlLink: string | null) {
  const voiceNoteResult = await handleVoiceNote(urlLink);

  if (voiceNoteResult.isVoiceNote && voiceNoteResult.transcription) {
    // Use transcription instead of text
    messageContent = voiceNoteResult.transcription;
  }
  // ... continue processing
}
```

## Limitations

- Maximum file size depends on ElevenLabs API limits
- Transcription timeout is set to 60 seconds
- Download timeout is set to 30 seconds
- Only supports audio files (not video)
- Requires active ElevenLabs API key with available credits

## Future Enhancements

- Add support for different ElevenLabs models
- Cache transcriptions to avoid re-processing
- Add language detection/specification
- Store original audio URLs for reference
- Add duration tracking
- Support for video file audio extraction
