import OpenAI from "openai";
import { CHATGPT_API_KEY } from "../config";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

const openai = new OpenAI({ apiKey: CHATGPT_API_KEY });

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
