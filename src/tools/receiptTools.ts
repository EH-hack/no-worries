import OpenAI from "openai";
import { CHATGPT_API_KEY, PUBLIC_URL } from "../config";
import { sendGroupWithButton } from "../luffa";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

const openai = new OpenAI({ apiKey: CHATGPT_API_KEY });

// ─── parse_receipt: GPT-4o vision on a URL ────────────────────────────────────

export const parseReceiptDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "parse_receipt",
    description: "Parse a receipt image using GPT-4o vision. Returns structured line items with prices in cents.",
    parameters: {
      type: "object",
      properties: {
        imageUrl: { type: "string", description: "URL of the receipt image" },
      },
      required: ["imageUrl"],
    },
  },
};

export async function parseReceipt(args: { imageUrl: string }): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract all line items from this receipt. Return ONLY a JSON array of objects with these fields:
- name: item name (string)
- priceCents: price in cents as an integer (e.g. $12.50 = 1250)
- quantity: number of that item (default 1)

Also include tax and tip as separate items if visible (name them "Tax" and "Tip").

Example: [{"name": "Margherita Pizza", "priceCents": 1499, "quantity": 1}]

Return ONLY the JSON array, no other text.`,
            },
            {
              type: "image_url",
              image_url: { url: args.imageUrl },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });

    const text = response.choices[0]?.message?.content ?? "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const items = JSON.parse(jsonMatch[0]);
      return JSON.stringify({ items });
    }
    return JSON.stringify({ items: [], error: "Could not parse receipt" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: `Failed to parse receipt: ${msg}` });
  }
}

// ─── request_receipt_upload: send upload link to group ─────────────────────────

export const requestReceiptUploadDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "request_receipt_upload",
    description: "Send a receipt upload link to the group chat. Use this when someone wants to split a receipt, scan a bill, upload a photo of a receipt, etc. The link opens a page where they can take a photo or upload an image.",
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "string", description: "The group chat ID" },
        paidBy: { type: "string", description: "UID of the person who paid (if known)" },
        description: { type: "string", description: "What the bill is for, e.g. 'dinner at Nandos'" },
      },
      required: ["groupId"],
    },
  },
};

export async function requestReceiptUpload(args: {
  groupId: string;
  paidBy?: string;
  description?: string;
}): Promise<string> {
  const params = new URLSearchParams({ group: args.groupId });
  if (args.paidBy) params.set("paidBy", args.paidBy);
  if (args.description) params.set("desc", args.description);

  const uploadUrl = `${PUBLIC_URL}/receipt?${params.toString()}`;

  // Send a clickable button directly to the group so users can tap to upload
  await sendGroupWithButton(
    args.groupId,
    "📸 Tap below to upload your receipt!",
    [{ name: "Upload Receipt", selector: uploadUrl }]
  );

  return JSON.stringify({
    success: true,
    uploadUrl,
    message: "Upload link sent to the group as a clickable button. Tell the group to tap it to upload their receipt photo.",
  });
}
