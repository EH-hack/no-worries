# No Worries 🍕

AI agent living inside your Luffa group chat that handles bill splitting and group planning.

## Quick Start (Local Dev)

### 1. Clone & install

```bash
git clone https://github.com/EH-hack/no-worries.git
cd no-worries
npm install
```

### 2. Set up environment variables

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

Then edit `.env`:

```
LUFFA_SECRET=your_secret_key_here
CHATGPT_API_KEY=your_openai_api_key_here
PORT=3000
```

- **LUFFA_SECRET** — Get this from [robot.luffa.im](https://robot.luffa.im) (ask the team if you don't have access)
- **CHATGPT_API_KEY** — OpenAI API key (ask the team)

### 3. Run

```bash
npm run dev
```

The bot will start polling Luffa for messages and responding via GPT.

### 4. Test it

Send the bot a DM in Luffa or message it in a group chat it's been added to.

## Project Structure

```
src/index.ts     ← All bot logic lives here
.env             ← Your local secrets (gitignored, never commit this)
.env.example     ← Template for env vars
luffa_docs.md    ← Luffa API documentation
```

## Key Files

- **`handleDM()`** — Processes direct messages
- **`handleGroupMessage()`** — Processes group chat messages
- **`askGPT()`** — Sends messages to GPT with conversation history
- **`SYSTEM_PROMPT`** — The bot's personality and instructions

## Deploy to Railway

The bot is already deployed on Railway. Pushes to `main` may auto-deploy depending on config. You can also deploy manually:

```bash
railway link
railway up
```

Env vars are already set in Railway — don't touch them unless you know what you're doing.

## Important Notes

- **Don't commit `.env`** — it's gitignored for a reason
- **Pull before you push** — multiple people are working on this repo
- **The bot polls every 1 second** — if you run locally AND Railway is running, both will respond to messages. Coordinate with the team.
