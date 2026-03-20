import { Bill, Debt, GroupState } from "./types";

/**
 * Split a bill equally among all members.
 * Remainder cents go to the payer (they paid, so they absorb rounding).
 */
export function splitEqual(bill: Bill, members: string[]): Record<string, number> {
  const total = billTotal(bill);
  const perPerson = Math.floor(total / members.length);
  const remainder = total - perPerson * members.length;

  const splits: Record<string, number> = {};
  for (const uid of members) {
    splits[uid] = perPerson;
  }
  // Payer absorbs remainder (they already paid the full amount)
  splits[bill.paidBy] = (splits[bill.paidBy] ?? 0) + remainder;
  return splits;
}

/**
 * Split a bill per-item: each item split among its assignedTo list (or all members).
 * Tax + tip distributed proportionally based on each person's subtotal share.
 */
export function splitPerItem(bill: Bill, members: string[]): Record<string, number> {
  const splits: Record<string, number> = {};
  for (const uid of members) splits[uid] = 0;

  // Calculate each person's item subtotal
  let itemsTotal = 0;
  for (const item of bill.items) {
    const assignees = item.assignedTo.length > 0 ? item.assignedTo : members;
    const itemTotal = item.priceCents * item.quantity;
    itemsTotal += itemTotal;
    const perPerson = Math.floor(itemTotal / assignees.length);
    const remainder = itemTotal - perPerson * assignees.length;

    for (let i = 0; i < assignees.length; i++) {
      const uid = assignees[i];
      if (!(uid in splits)) splits[uid] = 0;
      splits[uid] += perPerson + (i === 0 ? remainder : 0);
    }
  }

  // Distribute tax + tip proportionally
  const extras = bill.taxCents + bill.tipCents;
  if (extras > 0 && itemsTotal > 0) {
    let distributed = 0;
    const uids = Object.keys(splits);
    for (let i = 0; i < uids.length; i++) {
      const uid = uids[i];
      if (i === uids.length - 1) {
        // Last person gets remainder to avoid rounding loss
        splits[uid] += extras - distributed;
      } else {
        const share = Math.floor((splits[uid] / itemsTotal) * extras);
        splits[uid] += share;
        distributed += share;
      }
    }
  }

  return splits;
}

export function billTotal(bill: Bill): number {
  const itemsTotal = bill.items.reduce(
    (sum, item) => sum + item.priceCents * item.quantity,
    0
  );
  return itemsTotal + bill.taxCents + bill.tipCents;
}

/**
 * Given a finalized bill, compute debts: everyone who didn't pay owes the payer.
 */
export function billToDebts(bill: Bill): Debt[] {
  const debts: Debt[] = [];
  for (const [uid, cents] of Object.entries(bill.splits)) {
    if (uid !== bill.paidBy && cents > 0) {
      debts.push({ from: uid, to: bill.paidBy, amountCents: cents });
    }
  }
  return debts;
}

/**
 * Simplify debts using net settlement.
 * Compute net balance per person, then greedily match largest debtor with largest creditor.
 */
export function simplifyDebts(debts: Debt[]): Debt[] {
  // Net balance: positive = owed money, negative = owes money
  const net: Record<string, number> = {};
  for (const d of debts) {
    net[d.from] = (net[d.from] ?? 0) - d.amountCents;
    net[d.to] = (net[d.to] ?? 0) + d.amountCents;
  }

  const creditors: { uid: string; amount: number }[] = [];
  const debtors: { uid: string; amount: number }[] = [];

  for (const [uid, balance] of Object.entries(net)) {
    if (balance > 0) creditors.push({ uid, amount: balance });
    else if (balance < 0) debtors.push({ uid, amount: -balance });
  }

  // Sort descending by amount
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const simplified: Debt[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const settle = Math.min(creditors[ci].amount, debtors[di].amount);
    if (settle > 0) {
      simplified.push({
        from: debtors[di].uid,
        to: creditors[ci].uid,
        amountCents: settle,
      });
    }
    creditors[ci].amount -= settle;
    debtors[di].amount -= settle;
    if (creditors[ci].amount === 0) ci++;
    if (debtors[di].amount === 0) di++;
  }

  return simplified;
}

/**
 * Recalculate all debts for a group from its finalized bills.
 */
export function recalculateGroupDebts(group: GroupState): void {
  const allDebts: Debt[] = [];
  for (const bill of group.bills) {
    if (bill.finalized) {
      allDebts.push(...billToDebts(bill));
    }
  }
  group.debts = simplifyDebts(allDebts);
}
