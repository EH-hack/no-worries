# Voice Note & Audio Upload System

This system handles voice note transcription via an external upload portal, since Luffa doesn't recognize audio files in chat.

## Architecture

Instead of trying to handle audio files directly in Luffa (which doesn't support them), we use an **external upload portal** hosted on Railway:

1. User asks in Luffa: "Can you transcribe this voice note?"
2. Bot replies with a link: `https://your-app.railway.app/audio?group=GROUP_ID&user=USER_ID`
3. User opens link → uploads audio file via web interface
4. Server transcribes with ElevenLabs → sends result to Luffa group chat
5. User returns to Luffa to see the transcription

## Features

- Web-based audio upload portal with drag & drop
- Transcribes audio using ElevenLabs Speech-to-Text API (latest **scribe_v2** model)
- Supports 9+ audio formats (MP3, M4A, WAV, OGG, OPUS, AAC, FLAC, WebM, AMR)
- Automatic language detection
- Shows transcription preview before sending to group
- Similar architecture to receipt upload system

## Endpoints

### GET `/audio`
Serves the audio upload page

**Query Parameters:**
- `group` - Group ID from Luffa
- `user` - User ID from Luffa

**Example:**
```
https://your-app.railway.app/audio?group=group_123&user=user_456
```

### POST `/audio/upload`
Handles audio file upload and transcription

**Form Data:**
- `audio` - Audio file (multipart/form-data)
- `groupId` - Group ID
- `userId` - User ID

**Response:**
```json
{
  "success": true,
  "transcription": "This is what the user said in the voice note..."
}
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

This will install the required `form-data` and `multer` packages.

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

### How It Works

Since Luffa doesn't support audio files in chat, the bot provides a link to an external upload portal:

```
User: "Can you transcribe my voice note?"
                      ↓
Bot: "Upload your audio here: https://app.railway.app/audio?group=xyz&user=abc"
                      ↓
User clicks link → Opens upload page
                      ↓
User uploads audio file (drag & drop or file picker)
                      ↓
Server receives file → Sends to ElevenLabs API
                      ↓
ElevenLabs returns transcription
                      ↓
Server sends to Luffa group: "🎤 Voice note from [user_123]: 'Let's split the bill!'"
                      ↓
User sees transcription in group chat
```

### Generating Upload Links

The bot should generate upload links dynamically when users request transcription. The link format is:

```
https://your-railway-url/audio?group=GROUP_ID&user=USER_ID
```

You can use Luffa's button feature (`sendGroupWithButton`) to make this even easier:

```typescript
await sendGroupWithButton(groupId, "Upload your voice note:", [
  {
    name: "Upload Audio",
    selector: `https://your-app.railway.app/audio?group=${groupId}&user=${userId}`
  }
]);
```

## API Reference

### `handleAudioUpload(groupId, userId, audioBuffer, filename): Promise<string>`

Main function that processes uploaded audio and sends transcription to group.

**Parameters:**
- `groupId` - Luffa group ID
- `userId` - User ID who uploaded the audio
- `audioBuffer` - Audio file buffer from multer
- `filename` - Original filename

**Returns:**
- Promise resolving to the transcription text

**Throws:**
- Error if transcription fails or API key is missing

### `audioUploadHTML(groupId, userId): string`

Generates the audio upload page HTML.

**Parameters:**
- `groupId` - Group ID to send transcription to
- `userId` - User ID for attribution

**Returns:**
- HTML string for the upload page

## Error Handling

If transcription fails:
- Server returns HTTP 500 with error message
- Upload page shows error to user: "Error: [message] - try again?"
- Bot sends error notification to group: "⚠️ Failed to transcribe voice note from [user]: [error]"
- Error is logged to console for debugging

## File Upload Route

The audio upload is handled by a dedicated route in `src/index.ts`:

```typescript
app.post("/audio/upload", upload.single("audio"), async (req, res) => {
  const file = req.file;
  const groupId = req.body?.groupId;
  const userId = req.body?.userId;

  // Validate inputs
  if (!file || !groupId) {
    res.status(400).json({ success: false, error: "Missing required fields" });
    return;
  }

  // Transcribe and send to group
  const transcription = await handleAudioUpload(
    groupId,
    userId,
    file.buffer,
    file.originalname
  );

  res.json({ success: true, transcription });
});
```

## Limitations

- Maximum file size: 10MB (configurable in multer setup)
- Transcription timeout: 60 seconds
- Requires users to leave Luffa temporarily to upload files
- Only supports audio files (not video)
- Requires active ElevenLabs API key with available credits
- No authentication on upload portal (anyone with link can upload)

## Future Enhancements

- Add authentication/session tokens to upload links
- Support for different ElevenLabs models (selectable in UI)
- Real-time transcription progress indicator
- Cache transcriptions to avoid re-processing identical files
- Language selection dropdown (currently auto-detects)
- Support for video file audio extraction
- Store uploaded audio files for playback in group
- Batch upload support (multiple files at once)
- Voice note recording directly in the web portal (no file upload needed)
