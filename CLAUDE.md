# No Worries - Luffa Group Chat AI Agent

## Project Overview
**Type**: Hackathon project (Encode Club)
**Purpose**: AI agent for bill splitting, balance tracking, and group planning in Luffa group chats
**Hosting**: Railway
**Stack**: TypeScript, Express, OpenAI GPT-4o-mini, Luffa Bot API

## Architecture

```
Luffa Group Chat
    │ polling (1s interval)
    ▼
src/index.ts          ← Express health-check + poll loop + message routing
src/config.ts         ← Env vars (LUFFA_SECRET, CHATGPT_API_KEY, GEOAPIFY_KEY)
src/luffa.ts          ← Luffa API: fetchMessages, sendDM, sendGroup
src/agent.ts          ← Agentic GPT loop (tool calls → execute → feed back, up to 10 rounds)
src/prompt.ts         ← System prompt with tool usage instructions
src/history.ts        ← Per-conversation message history (in-memory, bounded to 20)
src/store.ts          ← JSON file persistence (data/state.json, atomic writes)
src/billing/
  types.ts            ← Bill, LineItem, Debt, GroupState, AppState interfaces
  engine.ts           ← Split algorithms (equal, per-item) + debt simplification
src/tools/
  index.ts            ← Tool definitions + dispatch switch
  billTools.ts        ← create_bill, add_items, set_tax_and_tip, split_bill
  balanceTools.ts     ← get_balances, record_payment, get_group_summary
  receiptTools.ts     ← parse_receipt (GPT-4o vision)
  placeTools.ts       ← find_places (Geoapify geocode + places API)
```

## Data Model

- **All money in cents** (integers) to avoid float precision
- `LineItem`: name, priceCents, quantity, assignedTo (UIDs — empty = all members)
- `Bill`: items, tax, tip, splitStrategy, splits (uid → cents), finalized flag
- `GroupState`: members, bills, simplified debts
- `AppState`: groups map → persisted to `data/state.json`

## Agentic Loop

Manual tool-calling loop in `agent.ts`:
1. Send messages + tool definitions to GPT-4o-mini
2. If GPT returns tool_calls, execute them via `executeTool()` dispatch
3. Feed tool results back as `role: "tool"` messages
4. Repeat until GPT returns a text response (max 10 rounds)

## Split Algorithms

- **Equal**: total / N, remainder to payer
- **Per-item**: each item split among its assignedTo list; tax+tip distributed proportionally
- **Debt simplification**: net settlement — compute net balance per person, greedily match largest debtor with largest creditor (at most N-1 transactions)

## Luffa Integration

- **Polling**: POST to `https://apibot.luffa.im/robot/receive` every 1s
- **Send DM**: POST to `/robot/send` with `{ secret, uid, msg }`
- **Send Group**: POST to `/robot/sendGroup` with `{ secret, uid, msg, type: "1" }`
- Messages are JSON strings inside `ReceiveItem.message[]` array
- Each message has `msgId` for dedup, `uid`, `text`, `urlLink`, `atList`
- Group messages: `item.uid` = group ID, `parsed.uid` = sender UID
- `urlLink` (receipt images) passed through to agent for `parse_receipt` tool

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `LUFFA_SECRET` | Yes | Bot authentication with Luffa API |
| `CHATGPT_API_KEY` | Yes | OpenAI API key for GPT-4o-mini + GPT-4o vision |
| `GEOAPIFY_KEY` | No | Place search (find_places tool) |
| `PORT` | No | Express port (default 3000) |

## Commands

```bash
npm run dev    # Run with ts-node
npm run build  # Compile TypeScript to dist/
npm start      # Run compiled JS (production)
```

## Key Design Decisions

- Group ID is injected into user messages so GPT can pass it to tool calls
- Conversation history is in-memory (lost on restart) but bill state persists to JSON
- Payments are modelled as reverse bills to reuse the debt simplification logic
- No zod — plain JSON schemas for tool definitions (simpler with OpenAI SDK v6)

---

**Last Updated**: 2026-03-20
