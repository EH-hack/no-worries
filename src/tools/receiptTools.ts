import OpenAI from "openai";
import { CHATGPT_API_KEY, PUBLIC_URL } from "../config";
import { sendGroup } from "../luffa";
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
    console.log(`parseReceipt: calling GPT-4o vision (image size: ${Math.round(args.imageUrl.length / 1024)}KB base64)`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are extracting line items from a photo of a paper receipt. The image may be crumpled, rotated, or poorly lit — do your best.

Return ONLY a valid JSON array — no markdown, no code fences, no explanation.

Each object must have:
- "name": item name (string, cleaned up — no abbreviations if you can infer the full name)
- "priceCents": unit price in cents as an integer (e.g. $12.50 = 1250). Use the per-item price, NOT the line total.
- "quantity": number of that item (integer, default 1)

Rules:
- Do NOT include subtotals, totals, balances due, or "amount due" lines — only individual items
- Do NOT include the same item twice (watch out for subtotal lines that repeat item costs)
- If you see "2x Coffee $3.00", that is quantity 2, priceCents 300 (per unit)
- If there are discounts or vouchers, include them as a line item with a negative priceCents
- Include tax and service charge as separate items named "Tax" and "Service Charge" if visible
- If a price is ambiguous, make your best guess rather than omitting the item
- IMPORTANT: If the receipt only shows a total without individual items, return a single item with name "Total" and the total amount. Never return an empty array.

Example output with items:
[{"name": "Margherita Pizza", "priceCents": 1499, "quantity": 1}, {"name": "Tax", "priceCents": 120, "quantity": 1}]

Example output with only a total:
[{"name": "Total", "priceCents": 3250, "quantity": 1}]`,
            },
            {
              type: "image_url",
              image_url: { url: args.imageUrl, detail: "high" },
            },
          ],
        },
      ],
      max_tokens: 2000,
    });

    const text = response.choices[0]?.message?.content ?? "";
    console.log(`parseReceipt: GPT-4o raw response: ${text.slice(0, 500)}`);

    if (!text) {
      return JSON.stringify({ items: [], error: "GPT-4o returned empty response" });
    }

    // Strip markdown code fences if present
    const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();

    const validate = (raw: any[]) =>
      raw.filter(
        (i) =>
          typeof i.name === "string" &&
          i.name.trim() !== "" &&
          typeof i.priceCents === "number" &&
          Math.abs(i.priceCents) < 1_000_000
      );

    // Match the first JSON array (non-greedy)
    const jsonMatch = cleaned.match(/\[[\s\S]*?\](?=\s*$|\s*[^,\]\}])/);
    if (!jsonMatch) {
      // Try parsing the whole cleaned text as JSON
      try {
        const parsed = JSON.parse(cleaned);
        const raw = Array.isArray(parsed) ? parsed : parsed.items ?? [];
        const items = validate(raw);
        console.log(`parseReceipt: parsed ${items.length} items (full-text parse)`);
        return JSON.stringify({ items });
      } catch {
        console.error(`parseReceipt: no JSON array found in response: ${cleaned.slice(0, 300)}`);
        return JSON.stringify({ items: [], error: "Could not find items in GPT response" });
      }
    }

    const items = validate(JSON.parse(jsonMatch[0]));
    console.log(`parseReceipt: parsed ${items.length} items`);
    return JSON.stringify({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`parseReceipt: error: ${msg}`);
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

  // Send the link directly to the group as a plain message
  await sendGroup(args.groupId, `📸 Upload your receipt here:\n${uploadUrl}`);

  return JSON.stringify({
    success: true,
    uploadUrl,
    message: "Upload link sent to the group. The link has already been sent — just let them know to tap it.",
  });
}
