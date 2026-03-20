export interface LineItem {
  name: string;
  priceCents: number;
  quantity: number;
  assignedTo: string[]; // UIDs — empty means split among all
}

export interface Bill {
  id: string;
  description: string;
  paidBy: string; // UID of person who paid
  items: LineItem[];
  taxCents: number;
  tipCents: number;
  splitStrategy: "equal" | "per-item";
  splits: Record<string, number>; // uid -> cents owed
  createdAt: string;
  finalized: boolean;
}

export interface Debt {
  from: string; // uid who owes
  to: string;   // uid who is owed
  amountCents: number;
}

export interface GroupState {
  members: string[]; // UIDs
  bills: Bill[];
  debts: Debt[];
}

export interface AppState {
  groups: Record<string, GroupState>;
}

export function newAppState(): AppState {
  return { groups: {} };
}

export function ensureGroup(state: AppState, groupId: string): GroupState {
  if (!state.groups[groupId]) {
    state.groups[groupId] = { members: [], bills: [], debts: [] };
  }
  return state.groups[groupId];
}
