import "dotenv/config";
import express from "express";
import axios from "axios";
import OpenAI from "openai";

// ─── Config ───────────────────────────────────────────────────────────────────
const SECRET = process.env.LUFFA_SECRET ?? "";
const PORT = process.env.PORT ?? 3000;
const POLL_INTERVAL_MS = 1000;

const BASE_URL = "https://apibot.luffa.im/robot";

if (!SECRET) {
  console.error("❌  LUFFA_SECRET env var is required");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.CHATGPT_API_KEY ?? "",
});

if (!process.env.CHATGPT_API_KEY) {
  console.error("❌  CHATGPT_API_KEY env var is required");
  process.exit(1);
}

console.log("🔑 Env vars available:", Object.keys(process.env).filter(k => !k.startsWith("npm_")).join(", "));
const GEOAPIFY_KEY = process.env.GEOAPIFY_KEY ?? "";
if (!GEOAPIFY_KEY) {
  console.warn("⚠️  GEOAPIFY_KEY not set — place search will be unavailable");
}

// ─── Geoapify Places API ─────────────────────────────────────────────────────
interface GeoapifyPlace {
  name?: string;
  categories: string[];
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  lat: number;
  lon: number;
  place_id: string;
  distance?: number;
}

// First geocode a location name to lat/lon, then search for places nearby
async function geocode(location: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await axios.get("https://api.geoapify.com/v1/geocode/search", {
      params: { text: location, apiKey: GEOAPIFY_KEY, limit: 1 },
    });
    const feature = res.data?.features?.[0];
    if (!feature) return null;
    const [lon, lat] = feature.geometry.coordinates;
    return { lat, lon };
  } catch (err) {
    console.error("❌ Geocode error:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function searchPlaces(
  term: string,
  location: string,
  limit: number = 5
): Promise<GeoapifyPlace[]> {
  try {
    // Map common search terms to Geoapify categories
    const categoryMap: Record<string, string> = {
      restaurant: "catering.restaurant",
      restaurants: "catering.restaurant",
      bar: "catering.bar",
      bars: "catering.bar",
      pub: "catering.pub",
      pubs: "catering.pub",
      club: "entertainment.club",
      clubs: "entertainment.club",
      nightclub: "entertainment.club.night",
      cafe: "catering.cafe",
      coffee: "catering.cafe",
      food: "catering",
      karaoke: "entertainment.karaoke",
      pizza: "catering.restaurant",
      burger: "catering.fast_food",
      "fast food": "catering.fast_food",
    };

    const termLower = term.toLowerCase();
    const category = categoryMap[termLower] ?? "catering";

    const coords = await geocode(location);
    if (!coords) return [];

    const res = await axios.get("https://api.geoapify.com/v2/places", {
      params: {
        categories: category,
        filter: `circle:${coords.lon},${coords.lat},2000`,
        bias: `proximity:${coords.lon},${coords.lat}`,
        limit,
        apiKey: GEOAPIFY_KEY,
      },
    });

    return (res.data?.features ?? []).map((f: any) => ({
      ...f.properties,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
    }));
  } catch (err) {
    console.error("❌ Geoapify error:", err instanceof Error ? err.message : err);
    return [];
  }
}

function formatPlaceResults(places: GeoapifyPlace[]): string {
  if (places.length === 0) return "No places found 😕";
  return places
    .map((p, i) => {
      const name = p.name ?? "Unnamed";
      const addr = p.formatted ?? p.address_line2 ?? "";
      const dist = p.distance ? ` · ${Math.round(p.distance)}m away` : "";
      const cats = p.categories
        .filter((c) => !c.startsWith("building") && !c.startsWith("commercial"))
        .slice(0, 2)
        .join(", ");
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + " " + addr)}`;
      return `${i + 1}. ${name}${dist}\n   ${cats}\n   📍 ${addr}\n   🗺️ ${mapsUrl}`;
    })
    .join("\n\n");
}

// ─── GPT Tools ───────────────────────────────────────────────────────────────
const GPT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "find_places",
      description:
        "Search for restaurants, bars, clubs, cafes, or any venue near a location. Use this when someone asks for place recommendations or wants to plan where to go.",
      parameters: {
        type: "object",
        properties: {
          term: {
            type: "string",
            description:
              'What to search for, e.g. "cocktail bars", "italian restaurant", "late night food", "karaoke"',
          },
          location: {
            type: "string",
            description:
              'Location to search near, e.g. "Shoreditch, London", "Soho, London", "Camden"',
          },
          limit: {
            type: "number",
            description: "Number of results (1-10, default 5)",
          },
        },
        required: ["term", "location"],
      },
    },
  },
];

// ─── System prompt ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are "No Worries" 🍕 — a chill, friendly AI assistant living inside a Luffa group chat.

Your main job is helping groups split bills and plan things together. You're casual, concise, and use emojis naturally (but don't overdo it).

What you can do:
- Help split bills when someone shares what people ordered or snaps a receipt
- Keep track of who owes what
- Help plan group activities (meeting spots, restaurants, etc.)
- Search for nearby restaurants, bars, clubs, cafes using the find_places tool
- Give recommendations based on what the group is in the mood for

Personality:
- Relaxed and fun — like a helpful friend in the group chat, not a corporate bot
- Keep responses short and chat-friendly (no walls of text)
- Use people's names/UIDs when referring to them
- If someone asks something you can't do yet, be honest about it

When splitting bills:
- Ask clarifying questions if the info is incomplete
- Break down the split clearly
- Include tax/tip if mentioned
- Show each person's total

When recommending places:
- Use the find_places tool to search Yelp
- Present results in a clean, scannable format
- Highlight ratings, price range, and what makes each spot good
- If the group hasn't said where they are, ask for a location

Remember: you're in a group chat. Keep it snappy.`;

// ─── Per-conversation message history ────────────────────────────────────────
const conversationHistory = new Map<string, OpenAI.ChatCompletionMessageParam[]>();
const MAX_HISTORY = 20;

function getHistory(conversationId: string): OpenAI.ChatCompletionMessageParam[] {
  if (!conversationHistory.has(conversationId)) {
    conversationHistory.set(conversationId, []);
  }
  return conversationHistory.get(conversationId)!;
}

function addToHistory(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): void {
  const history = getHistory(conversationId);
  history.push({ role, content });
  // Keep history bounded
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

// ─── Tool executor ───────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  console.log(`🔧 Tool call: ${name}(${JSON.stringify(args)})`);

  if (name === "find_places") {
    const term = (args.term as string) ?? "restaurants";
    const location = (args.location as string) ?? "London";
    const limit = Math.min(Math.max((args.limit as number) ?? 5, 1), 10);

    if (!GEOAPIFY_KEY) return "Place search isn't configured yet — try again later!";

    const results = await searchPlaces(term, location, limit);
    return formatPlaceResults(results);
  }

  return `Unknown tool: ${name}`;
}

// ─── GPT helper ──────────────────────────────────────────────────────────────
async function askGPT(conversationId: string, userMessage: string): Promise<string> {
  addToHistory(conversationId, "user", userMessage);

  try {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...getHistory(conversationId),
    ];

    let response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: GPT_TOOLS,
      max_tokens: 500,
      temperature: 0.7,
    });

    let choice = response.choices[0]?.message;

    // Handle tool calls (loop in case of chained calls)
    let iterations = 0;
    while (choice?.tool_calls && choice.tool_calls.length > 0 && iterations < 3) {
      iterations++;

      // Add assistant message with tool calls to messages
      messages.push(choice);

      // Execute each tool call
      for (const toolCall of choice.tool_calls) {
        if (toolCall.type !== "function") continue;
        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeTool(toolCall.function.name, args);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Get next response
      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools: GPT_TOOLS,
        max_tokens: 500,
        temperature: 0.7,
      });

      choice = response.choices[0]?.message;
    }

    const reply = choice?.content ?? "Hmm, I got nothing. Try again?";
    addToHistory(conversationId, "assistant", reply);
    return reply;
  } catch (err) {
    console.error("❌ GPT error:", err instanceof Error ? err.message : err);
    return "😅 My brain glitched for a sec — try again?";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface RawMessage {
  uid: string;
  atList: string[];
  text: string;
  urlLink: string | null;
  msgId: string;
}

interface GroupRawMessage extends RawMessage {
  uid: string; // sender UID inside the message JSON
}

interface ReceiveItem {
  uid: string;           // user UID (DM) or group ID (group chat)
  count: number;
  message: string[];     // JSON strings
  type: 0 | 1;           // 0 = DM, 1 = group
}

// API returns ReceiveItem[] directly (not wrapped in { code, data })

// ─── Dedup cache ──────────────────────────────────────────────────────────────
const seenMsgIds = new Set<string>();

// ─── API helpers ──────────────────────────────────────────────────────────────
let pollCount = 0;
async function fetchMessages(): Promise<ReceiveItem[]> {
  const res = await axios.post<ReceiveItem[]>(
    `${BASE_URL}/receive`,
    { secret: SECRET },
    { headers: { "Content-Type": "application/json" } }
  );
  const items: ReceiveItem[] = Array.isArray(res.data) ? res.data : [];
  pollCount++;
  if (pollCount % 30 === 1 || items.length > 0) {
    console.log(`🔍 Poll #${pollCount} — items: ${items.length}, raw:`, JSON.stringify(res.data));
  }
  return items;
}

async function sendDM(uid: string, text: string): Promise<void> {
  console.log(`📤 Sending DM to ${uid}: ${text}`);
  const res = await axios.post(
    `${BASE_URL}/send`,
    {
      secret: SECRET,
      uid,
      msg: JSON.stringify({ text }),
    },
    { headers: { "Content-Type": "application/json" } }
  );
  console.log(`📤 sendDM response:`, JSON.stringify(res.data));
}

async function sendGroup(groupId: string, text: string): Promise<void> {
  console.log(`📤 Sending group msg to ${groupId}: ${text}`);
  const res = await axios.post(
    `${BASE_URL}/sendGroup`,
    {
      secret: SECRET,
      uid: groupId,
      msg: JSON.stringify({ text }),
      type: "1",
    },
    { headers: { "Content-Type": "application/json" } }
  );
  console.log(`📤 sendGroup response:`, JSON.stringify(res.data));
}

// ─── Message handlers ─────────────────────────────────────────────────────────

async function handleDM(senderUid: string, text: string): Promise<void> {
  console.log(`💬 DM from ${senderUid}: ${text}`);

  const reply = await askGPT(`dm:${senderUid}`, text);
  await sendDM(senderUid, reply);
}

async function handleGroupMessage(
  groupId: string,
  senderUid: string,
  text: string
): Promise<void> {
  console.log(`👥 Group [${groupId}] from ${senderUid}: ${text}`);

  const reply = await askGPT(`group:${groupId}`, `[${senderUid}]: ${text}`);
  await sendGroup(groupId, reply);
}

// ─── Poll loop ────────────────────────────────────────────────────────────────
async function poll(): Promise<void> {
  try {
    const items = await fetchMessages();

    for (const item of items) {
      for (const rawStr of item.message) {
        let parsed: RawMessage | GroupRawMessage;

        try {
          parsed = JSON.parse(rawStr);
        } catch {
          console.warn("⚠️  Could not parse message JSON:", rawStr);
          continue;
        }

        // Dedup
        if (seenMsgIds.has(parsed.msgId)) continue;
        seenMsgIds.add(parsed.msgId);

        // Keep the cache bounded
        if (seenMsgIds.size > 5000) {
          const first = seenMsgIds.values().next().value;
          if (first) seenMsgIds.delete(first);
        }

        if (item.type === 0) {
          // DM — item.uid is the sender
          await handleDM(item.uid, parsed.text ?? "");
        } else {
          // Group — item.uid is the group ID, parsed.uid is the sender
          const groupMsg = parsed as GroupRawMessage;
          await handleGroupMessage(item.uid, groupMsg.uid ?? "unknown", parsed.text ?? "");
        }
      }
    }
  } catch (err) {
    console.error("❌  Poll error:", err instanceof Error ? err.message : err);
  }
}

// ─── Express health-check (required by Railway) ───────────────────────────────
const app = express();

app.get("/", (_req, res) => {
  res.json({ status: "ok", bot: "no-worries", uptime: process.uptime() });
});

app.get("/health", (_req, res) => {
  res.json({ healthy: true });
});

app.listen(PORT, () => {
  console.log(`🚀  Health-check server listening on port ${PORT}`);
  console.log(`🔄  Starting Luffa poll loop (every ${POLL_INTERVAL_MS}ms)…`);
  setInterval(poll, POLL_INTERVAL_MS);
});
