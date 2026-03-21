import axios from "axios";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getState } from "../store";
import { ensureGroup, MemberLocation } from "../billing/types";
import { sendGroupWithLink } from "../luffa";
import { PUBLIC_URL } from "../config";

// ─── Tool definition ──────────────────────────────────────────────────────────

export const showMapDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "show_map",
    description:
      "Show a map with pins for each group member's current location. Use when someone asks where everyone is, wants to see member locations on a map, or is planning a meetup.",
    parameters: {
      type: "object",
      properties: {
        groupId: {
          type: "string",
          description: "The group chat ID",
        },
      },
      required: ["groupId"],
    },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEffectiveLocation(
  loc: MemberLocation
): { label: string; lat: number; lon: number } | null {
  if (loc.current && loc.currentLat != null && loc.currentLon != null) {
    return { label: loc.current, lat: loc.currentLat, lon: loc.currentLon };
  }
  if (loc.home && loc.homeLat != null && loc.homeLon != null) {
    return { label: loc.home, lat: loc.homeLat, lon: loc.homeLon };
  }
  return null;
}

async function shortenUrl(url: string): Promise<string> {
  try {
    const res = await axios.get(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`
    );
    return res.data;
  } catch {
    return url;
  }
}

// ─── Tool implementation ──────────────────────────────────────────────────────

export async function showMap(args: { groupId: string }): Promise<string> {
  const state = getState();
  const group = ensureGroup(state, args.groupId);

  const members: { uid: string; label: string; lat: number; lon: number }[] = [];

  for (const uid of Object.keys(group.locations)) {
    const loc = group.locations[uid];
    if (!loc) continue;
    const eff = getEffectiveLocation(loc);
    if (eff) members.push({ uid, ...eff });
  }

  if (members.length === 0) {
    return JSON.stringify({
      error: "No member locations set yet. Ask everyone to share their location first.",
    });
  }

  const mapUrl = `${PUBLIC_URL}/map?group=${encodeURIComponent(args.groupId)}`;
  const shortUrl = await shortenUrl(mapUrl);

  const memberList = members
    .map((m) => `📍 ${m.label}`)
    .join("\n");

  await sendGroupWithLink(
    args.groupId,
    `🗺️ Here's where everyone is:\n\n${memberList}\n\nTap to see on the map 👇`,
    shortUrl
  );

  return JSON.stringify({
    success: true,
    memberCount: members.length,
    mapUrl: shortUrl,
  });
}