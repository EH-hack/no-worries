# Luffa Bot

A TypeScript bot for Luffa group chats, deployable to Railway.

## Setup

### 1. Create your bot
Go to [robot.luffa.im](https://robot.luffa.im), scan QR with Luffa, hit **New Bot**,
and copy the **SecretKey**.

### 2. Deploy to Railway
1. Push this repo to GitHub
2. Create a new Railway project → **Deploy from GitHub repo**
3. Add environment variable:
   ```
   LUFFA_SECRET=your_secret_key_here
   ```
4. Railway auto-detects the `nixpacks.toml` and builds/starts the service

### 3. Add the bot to your group
In Luffa, search for the bot by its UID and invite it to your group.
Once added, the bot will start receiving messages within 1 second.

## Customise

All bot logic lives in `src/index.ts` in two handler functions:

```ts
// Handles direct messages
async function handleDM(senderUid: string, text: string)

// Handles group messages
async function handleGroupMessage(groupId: string, senderUid: string, text: string)
```

Edit those functions to build your own behaviour.

## Local dev

```bash
npm install
LUFFA_SECRET=xxx npm run dev
```
