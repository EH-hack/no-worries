import { getState, saveState } from "../store";
import { ensureGroup } from "../billing/types";
import { recalculateGroupDebts } from "../billing/engine";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const getBalancesDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_balances",
    description: "Show simplified debts: who owes whom and how much.",
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "string", description: "The group chat ID" },
      },
      required: ["groupId"],
    },
  },
};

export const recordPaymentDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "record_payment",
    description: "Record a payment between two people to settle a debt.",
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "string" },
        from: { type: "string", description: "UID of person who paid" },
        to: { type: "string", description: "UID of person who was paid" },
        amountCents: { type: "number", description: "Amount paid in cents" },
      },
      required: ["groupId", "from", "to", "amountCents"],
    },
  },
};

export const getGroupSummaryDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_group_summary",
    description: "Get a full summary: all bills and current balances for the group.",
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "string" },
      },
      required: ["groupId"],
    },
  },
};

// ─── Tool implementations ─────────────────────────────────────────────────────

export async function getBalances(args: { groupId: string }): Promise<string> {
  const state = getState();
  const group = ensureGroup(state, args.groupId);

  if (group.debts.length === 0) {
    return JSON.stringify({ message: "All settled up! No outstanding debts." });
  }

  return JSON.stringify({
    debts: group.debts.map((d) => ({
      from: d.from,
      to: d.to,
      amount: `$${(d.amountCents / 100).toFixed(2)}`,
    })),
  });
}

export async function recordPayment(args: {
  groupId: string;
  from: string;
  to: string;
  amountCents: number;
}): Promise<string> {
  const state = getState();
  const group = ensureGroup(state, args.groupId);

  group.bills.push({
    id: `pay-${Date.now()}`,
    description: `Payment from ${args.from} to ${args.to}`,
    paidBy: args.from,
    items: [{ name: "Payment", priceCents: args.amountCents, quantity: 1, assignedTo: [args.to] }],
    taxCents: 0,
    tipCents: 0,
    splitStrategy: "per-item",
    splits: { [args.to]: args.amountCents },
    createdAt: new Date().toISOString(),
    finalized: true,
  });

  recalculateGroupDebts(group);
  await saveState();

  return JSON.stringify({
    recorded: true,
    from: args.from,
    to: args.to,
    amount: `$${(args.amountCents / 100).toFixed(2)}`,
    remainingDebts: group.debts.map((d) => ({
      from: d.from,
      to: d.to,
      amount: `$${(d.amountCents / 100).toFixed(2)}`,
    })),
  });
}

export async function getGroupSummary(args: { groupId: string }): Promise<string> {
  const state = getState();
  const group = ensureGroup(state, args.groupId);

  const bills = group.bills.map((b) => ({
    id: b.id,
    description: b.description,
    paidBy: b.paidBy,
    total: `$${((b.items.reduce((s, i) => s + i.priceCents * i.quantity, 0) + b.taxCents + b.tipCents) / 100).toFixed(2)}`,
    finalized: b.finalized,
    splits: Object.fromEntries(
      Object.entries(b.splits).map(([uid, cents]) => [uid, `$${(cents / 100).toFixed(2)}`])
    ),
  }));

  return JSON.stringify({
    members: group.members,
    billCount: bills.length,
    bills,
    outstandingDebts: group.debts.map((d) => ({
      from: d.from,
      to: d.to,
      amount: `$${(d.amountCents / 100).toFixed(2)}`,
    })),
  });
}
