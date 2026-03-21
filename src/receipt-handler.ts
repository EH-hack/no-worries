import { runAgent } from "./agent";
import { sendGroup } from "./luffa";
import { parseReceipt } from "./tools/receiptTools";

export async function parseReceiptFromBase64(
  groupId: string,
  paidBy: string,
  dataUrl: string
): Promise<void> {
  // Step 1: Parse the receipt image with GPT-4o vision
  const result = await parseReceipt({ imageUrl: dataUrl });
  const parsed = JSON.parse(result);

  if (parsed.error) {
    await sendGroup(groupId, `Couldn't read that receipt - ${parsed.error}. Try a clearer photo?`);
    return;
  }

  if (!parsed.items || parsed.items.length === 0) {
    await sendGroup(groupId, "I couldn't find any items on that receipt. Try a clearer photo?");
    return;
  }

  // Step 2: Format items into a message and feed to the agent so it can
  // create the bill, add items, and offer to split
  const itemList = parsed.items
    .map((item: any) => `- ${item.name}: $${(item.priceCents / 100).toFixed(2)} x${item.quantity ?? 1}`)
    .join("\n");

  const agentMessage = paidBy
    ? `[SYSTEM]: A receipt was uploaded for this group. Paid by ${paidBy}.\n\nItems found:\n${itemList}\n\nPlease create a bill with these items and ask the group how they want to split it. Group ID for tool calls: ${groupId}`
    : `[SYSTEM]: A receipt was uploaded for this group.\n\nItems found:\n${itemList}\n\nPlease create a bill with these items. Ask who paid and how the group wants to split it. Group ID for tool calls: ${groupId}`;

  const reply = await runAgent(`group:${groupId}`, agentMessage, groupId);
  await sendGroup(groupId, reply);
}
