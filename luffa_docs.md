# Luffa Bot API Documentation

## Overview

Luffa is a messaging platform with a bot API. Bots are polling-based — there are no webhooks. You create a bot at [robot.luffa.im](https://robot.luffa.im), get a **SecretKey**, and use it to poll for messages and send replies.

## Base URL

```
https://apibot.luffa.im/robot
```

## Authentication

All endpoints use the same `secret` field in the request body. Get your secret from [robot.luffa.im](https://robot.luffa.im) after creating a bot.

---

## Endpoints

### Receive Messages

**`POST /robot/receive`**

Poll this every 1 second to get new messages. Also handles friend requests and group invites.

**Request:**
```json
{
  "secret": "your_secret_key"
}
```

**Response:** Returns an array directly (NOT wrapped in `{ code, data }`).

```json
[
  {
    "uid": "sender_luffa_id",
    "count": 1,
    "message": [
      "{\"atList\":[],\"text\":\"message content\",\"urlLink\":null,\"msgId\":\"unique-msg-id\"}"
    ],
    "type": 0
  }
]
```

- `type: 0` = DM — `uid` is the sender's Luffa ID
- `type: 1` = Group chat — `uid` is the group ID, and the parsed message JSON contains `uid` for the sender

**Important:** Messages are JSON strings inside the `message` array — you must `JSON.parse()` each one. Deduplicate by `msgId` as the API may return the same message more than once.

**Parsed message structure:**
```json
{
  "uid": "sender_id (only in group messages)",
  "atList": [],
  "text": "message content",
  "urlLink": null,
  "msgId": "unique-message-id"
}
```

---

### Send DM

**`POST /robot/send`**

**Request:**
```json
{
  "secret": "your_secret_key",
  "uid": "recipient_luffa_id",
  "msg": "{\"text\":\"your reply\"}"
}
```

Note: `msg` is a JSON string, not an object.

---

### Send Group Message

**`POST /robot/sendGroup`**

#### Type 1 — Plain text

```json
{
  "secret": "your_secret_key",
  "uid": "group_id",
  "msg": "{\"text\":\"your message\"}",
  "type": "1"
}
```

#### Type 2 — Text with buttons

```json
{
  "secret": "your_secret_key",
  "uid": "group_id",
  "msg": "{\"text\":\"message\",\"button\":[...],\"confirm\":[...],\"dismissType\":\"select\"}",
  "type": "2"
}
```

**Button format:**
```json
{
  "name": "Button label (supports Unicode/emoji)",
  "selector": "Text sent when button is clicked",
  "isHidden": "0 = visible to all, 1 = hidden from others"
}
```

- `confirm` buttons: dark (`"type": "Destructive"`) or light (`"type": "default"`) background
- `button` buttons: standard style
- `dismissType`: `"select"` (persist after click) or `"dismiss"` (disappear after click)
- Only one `confirm` array and one `button` array per message

**@ Mentions (atList):**
```json
{
  "did": "luffa_user_id",
  "name": "luffa_user_id",
  "length": 12,
  "location": 0,
  "userType": "0"
}
```
- `length`: character count of `@` + uid + space (12 for standard uid, +1 per extra space)
- `location`: starting index of the `@` in the text string
- You must manually include `@uid ` in the `text` field

---

## OpenClaw Integration

Luffa bots can be powered by AI agents via [OpenClaw](https://docs.openclaw.ai/). This section covers the official integration pattern.

### Architecture

```
Luffa User → Luffa Bot (native account) → Polling Bridge → OpenClaw Agent → AI Model (OpenAI / Claude / etc.)
```

- **Luffa** handles encrypted, DID-based messaging and identity
- **OpenClaw** handles prompt-driven AI agent logic, tools, memory, and reasoning
- **Polling bridge** connects the two (your bot code)

### Setup Steps

1. **Set up OpenClaw** — Create an agent, configure your model provider, define system prompts and tools. Validate the agent responds correctly in OpenClaw's test console before proceeding.

2. **Create a Luffa Bot** — At [robot.luffa.im](https://robot.luffa.im). You'll get a Bot User ID and Bot Secret.

3. **Configure Luffa credentials in OpenClaw** — Inject via plugin config or env vars:
   ```
   LUFFA_BOT_USER_ID=your_bot_user_id
   LUFFA_BOT_SECRET=your_bot_secret
   LUFFA_API_ENDPOINT=https://api.luffa.im
   ```

4. **Run the polling bridge** — Custom Luffa bot integrations do not auto-start message listeners. A polling service is required. Pseudocode:
   ```python
   while True:
       messages = luffa.fetch_new_messages(bot_id)
       for message in messages:
           response = openclaw.run_agent(
               input=message.content,
               user_id=message.sender_id
           )
           luffa.send_message(
               to=message.sender_id,
               content=response
           )
       sleep(1-3 seconds)
   ```

### Agent Behavior

All agent intelligence is defined inside OpenClaw (system prompts, tool usage, memory, reasoning). Luffa does not constrain agent logic — it acts purely as a secure communication and identity layer.

### Gateway & Permissions

Do **not** restrict model invocation, tool execution, or plugin access in gateway rules. Restrictive rules cause silent failures. Constrain agent **behavior** (via prompts), not agent **capability**.

### Validation Checklist

- Messages sent to the bot are retrieved by the polling service
- OpenClaw returns intelligent (non-echo) responses
- The bot replies correctly inside Luffa
- Multiple users are handled independently
- No permission or gateway errors in logs

### Known Limitations

- Polling must be manually run (no auto-start yet)
- Long-running services need supervision (PM2, systemd, Docker, or a platform like Railway)
- These limitations do not block production usage

### Security Notes

- Store bot credentials securely (env vars, not client-side)
- All message handling occurs server-side
- Luffa provides encrypted transport and DID-based identity

### What This Enables

- AI agents inside encrypted messaging
- DID-native agent identities
- Secure agent operation without plaintext chat logs
- Foundations for multi-agent systems, autonomous communities, and auditable/on-chain agent actions

### Versioning

- **v1.0** — Polling-based integration (current)
- Future: event-driven listeners, native agent lifecycle management, on-chain agent execution records

---

## Gotchas & Lessons Learned

1. **Response format:** The `/receive` endpoint returns a raw array, not `{ code, data: [...] }`. Access `res.data` directly.
2. **Polling delay:** Messages don't appear instantly — there can be a delay of 30-60 seconds before the API returns new messages.
3. **`msg` is a JSON string:** When sending, `msg` must be `JSON.stringify()`'d, not a raw object.
4. **Dedup is required:** The API may return the same message multiple times. Track `msgId` values.
5. **Bot must be added first:** The bot only receives messages from users who have added it as a friend or groups where it has been invited.
6. **Health check needed for hosting:** If deploying to Railway/similar, you need a listening HTTP server or the platform will kill the process — the polling loop alone isn't enough.
