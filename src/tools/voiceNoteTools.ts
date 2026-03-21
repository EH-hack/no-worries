import { PUBLIC_URL } from "../config";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

// ─── request_audio_upload: send audio upload link to group ─────────────────────

export const requestAudioUploadDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "request_audio_upload",
    description: "Send an audio/voice note upload link to the group chat. Use this when someone wants to share a voice note, record audio, or transcribe a voice message. The link opens a page where they can record or upload audio.",
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "string", description: "The group chat ID" },
        userId: { type: "string", description: "UID of the user who wants to upload audio" },
      },
      required: ["groupId", "userId"],
    },
  },
};

export async function requestAudioUpload(args: {
  groupId: string;
  userId: string;
}): Promise<string> {
  const params = new URLSearchParams({
    group: args.groupId,
    user: args.userId,
  });

  const uploadUrl = `${PUBLIC_URL}/audio?${params.toString()}`;

  return JSON.stringify({
    success: true,
    uploadUrl,
    message: `Audio upload link generated. Tell the user to open this link to record or upload their voice note: ${uploadUrl}`,
  });
}
