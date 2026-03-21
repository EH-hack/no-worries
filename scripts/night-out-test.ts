/**
 * Night Out End-to-End Test
 *
 * Simulates 4 friends going out: sharing locations, planning,
 * buying dinner/drinks/club entry, then settling up via No Worries bot.
 */

import axios from "axios";

const GROUP_ID = "QoBv2fbkycV";
const API = "https://apibot.luffa.im/robot";

const bots = {
  TJFLAL: { uid: "HxPJXfzRvva", secret: "699a9ea8b46142a38be6abf15daf0a83" },
  WRTIMK: { uid: "9dGXBogDaRx", secret: "16914ad8f1a74f0fbf560acc3c885bf1" },
  WBJZJE: { uid: "FnAf67FzgQx", secret: "041cd5e6398148a4899bc6098d7e8249" },
  KUZOBO: { uid: "HyXfTMn6Jtz", secret: "6b0c97f6ae794ee4a5e35ef4b5d95f0c" },
} as const;

type BotName = keyof typeof bots;

async function sendGroup(botName: BotName, text: string): Promise<void> {
  const bot = bots[botName];
  console.log(`[${botName}] → ${text}`);
  await axios.post(
    `${API}/sendGroup`,
    { secret: bot.secret, uid: GROUP_ID, msg: JSON.stringify({ text }), type: "1" },
    { headers: { "Content-Type": "application/json" } }
  );
}

async function poll(botName: BotName): Promise<any[]> {
  const bot = bots[botName];
  const res = await axios.post(
    `${API}/receive`,
    { secret: bot.secret },
    { headers: { "Content-Type": "application/json" } }
  );
  return Array.isArray(res.data) ? res.data : [];
}

// Drain any pending messages from all bots
async function drainAll(): Promise<void> {
  for (const name of Object.keys(bots) as BotName[]) {
    await poll(name);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForBotReply(seconds: number = 15): Promise<void> {
  console.log(`  ⏳ Waiting ${seconds}s for No Worries bot to respond...\n`);
  await sleep(seconds * 1000);
  // Drain replies so they don't stack up
  await drainAll();
}

async function main() {
  console.log("🎉 Night Out E2E Test\n");
  console.log("Group ID:", GROUP_ID);
  console.log("Bots:", Object.entries(bots).map(([n, b]) => `${n} (${b.uid})`).join(", "));
  console.log("\n--- Draining pending messages ---\n");
  await drainAll();
  await sleep(2000);

  // ── Step 1: Location sharing ──────────────────────────────────
  console.log("═══ STEP 1: Location Sharing ═══\n");

  await sendGroup("TJFLAL", "Hey everyone! I'm in Shoreditch, near Boxpark. Where are you lot?");
  await sleep(3000);

  await sendGroup("WRTIMK", "I'm at Liverpool Street station, just got off the train!");
  await sleep(3000);

  await sendGroup("WBJZJE", "I'm in Hackney, about 10 min away from Shoreditch");
  await sleep(3000);

  await sendGroup("KUZOBO", "Just leaving Bethnal Green, be there in 15!");
  await waitForBotReply(20);

  // ── Step 2: Planning ──────────────────────────────────────────
  console.log("═══ STEP 2: Night Out Planning ═══\n");

  await sendGroup("TJFLAL",
    "Hey @NoWorries, plan us a night out in Shoreditch! " +
    "I love cocktails, WBJZJE is vegan so we need a vegan-friendly restaurant, " +
    "KUZOBO wants to go dancing, and WRTIMK is up for anything. " +
    "We want dinner first then drinks then a club. Budget around £50 each."
  );
  await waitForBotReply(30); // planning takes longer

  // ── Step 3: Dinner — TJFLAL pays $120 ─────────────────────────
  console.log("═══ STEP 3: Dinner — TJFLAL pays ═══\n");

  await sendGroup("TJFLAL",
    "Alright dinner's done! I paid the bill. It was $120 total for all 4 of us. " +
    "The food was $100, tax was $10, and I left a $10 tip. " +
    "Split it equally between me (HxPJXfzRvva), WRTIMK (9dGXBogDaRx), " +
    "WBJZJE (FnAf67FzgQx), and KUZOBO (HyXfTMn6Jtz)."
  );
  await waitForBotReply(25);

  // ── Step 4: Drinks round 1 — WRTIMK pays $40 ─────────────────
  console.log("═══ STEP 4: Drinks Round 1 — WRTIMK pays ═══\n");

  await sendGroup("WRTIMK",
    "First round's on me! Just got 4 cocktails, came to $40 total. " +
    "Split equally between all of us please. I paid (9dGXBogDaRx)."
  );
  await waitForBotReply(25);

  // ── Step 5: Drinks round 2 — WBJZJE pays $36 ─────────────────
  console.log("═══ STEP 5: Drinks Round 2 — WBJZJE pays ═══\n");

  await sendGroup("WBJZJE",
    "My round! 4 beers, $36 total. I paid (FnAf67FzgQx). " +
    "Split equally between everyone."
  );
  await waitForBotReply(25);

  // ── Step 6: Club entry — KUZOBO pays for TJFLAL's entry $15 ──
  console.log("═══ STEP 6: Club Entry — KUZOBO pays for TJFLAL ═══\n");

  await sendGroup("KUZOBO",
    "I just paid for TJFLAL's club entry since he forgot his wallet in the cab! " +
    "$15 entry fee. I paid (HyXfTMn6Jtz) and it's just for TJFLAL (HxPJXfzRvva). " +
    "So TJFLAL owes me $15."
  );
  await waitForBotReply(25);

  // ── Step 7: Drinks round 3 — TJFLAL pays $44 ─────────────────
  console.log("═══ STEP 7: Drinks Round 3 — TJFLAL pays ═══\n");

  await sendGroup("TJFLAL",
    "Last round on me! Got us all fancy cocktails, $44 total. " +
    "I paid (HxPJXfzRvva), split equally between all 4."
  );
  await waitForBotReply(25);

  // ── Step 8: Settlement ────────────────────────────────────────
  console.log("═══ STEP 8: Settlement — Who owes who? ═══\n");

  await sendGroup("WRTIMK",
    "Ok great night! Can we settle up? Who owes who what?"
  );
  await waitForBotReply(30);

  console.log("\n🏁 Test complete! Check the group chat for the full conversation.\n");

  // ── Expected math ─────────────────────────────────────────────
  console.log("═══ EXPECTED SETTLEMENT (manual calc) ═══\n");
  console.log("Dinner:  TJFLAL paid $120, each owes $30 → TJFLAL is owed $90");
  console.log("Round 1: WRTIMK paid $40,  each owes $10 → WRTIMK is owed $30");
  console.log("Round 2: WBJZJE paid $36,  each owes $9  → WBJZJE is owed $27");
  console.log("Club:    KUZOBO paid $15 for TJFLAL       → KUZOBO is owed $15");
  console.log("Round 3: TJFLAL paid $44,  each owes $11 → TJFLAL is owed $33");
  console.log("");
  console.log("Net balances:");
  console.log("  TJFLAL: paid $164, owes $49 to others → net +$100 (owed $100... wait let me recalc)");
  console.log("  -- TJFLAL spent: $120 + $44 = $164 paid out");
  console.log("  -- TJFLAL owes: $10 (round1) + $9 (round2) + $15 (club) + $0 = $34");
  console.log("  -- TJFLAL owed: $90 (dinner) + $33 (round3) = $123 back");
  console.log("  -- Net TJFLAL: +$123 - $34 = +$89 (is owed $89)");
  console.log("");
  console.log("  WRTIMK spent: $40 paid out");
  console.log("  WRTIMK owes: $30 (dinner) + $9 (round2) + $11 (round3) = $50");
  console.log("  WRTIMK owed: $30 (round1) back");
  console.log("  Net WRTIMK: +$30 - $50 = -$20 (owes $20)");
  console.log("");
  console.log("  WBJZJE spent: $36 paid out");
  console.log("  WBJZJE owes: $30 (dinner) + $10 (round1) + $11 (round3) = $51");
  console.log("  WBJZJE owed: $27 (round2) back");
  console.log("  Net WBJZJE: +$27 - $51 = -$24 (owes $24)");
  console.log("");
  console.log("  KUZOBO spent: $15 paid out");
  console.log("  KUZOBO owes: $30 (dinner) + $10 (round1) + $9 (round2) + $11 (round3) = $60");
  console.log("  KUZOBO owed: $15 (club) back");
  console.log("  Net KUZOBO: +$15 - $60 = -$45 (owes $45)");
  console.log("");
  console.log("Simplified: WRTIMK → TJFLAL $20, WBJZJE → TJFLAL $24, KUZOBO → TJFLAL $45");
  console.log("Total owed to TJFLAL: $89 ✓");
}

main().catch((err) => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
