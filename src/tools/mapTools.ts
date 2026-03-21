import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getState } from "../store";
import { ensureGroup, MemberLocation } from "../billing/types";
import { sendGroupWithLink } from "../luffa";

const GEOAPIFY_KEY = process.env.GEOAPIFY_KEY ?? "";

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

// Geoapify marker colours — cycles through these for each member
const MARKER_COLORS = ["red", "blue", "green", "orange", "purple", "darkblue"];

// ─── Tool implementation ──────────────────────────────────────────────────────

export async function showMap(args: { groupId: string }): Promise<string> {
  if (!GEOAPIFY_KEY) {
    return JSON.stringify({ error: "GEOAPIFY_KEY not set — map unavailable" });
  }

  const state = getState();
  const group = ensureGroup(state, args.groupId);

  // Collect all members with known locations
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

  // Build Geoapify Static Map URL
  // Docs: https://apidocs.geoapify.com/docs/maps/static-maps/
  const markerParams = members
    .map((m, i) => {
      const color = MARKER_COLORS[i % MARKER_COLORS.length];
      const label = encodeURIComponent(m.label.split(",")[0]); // first part of address
      return `lonlat:${m.lon},${m.lat};color:${color};size:medium;text:${label}`;
    })
    .join("|");

  // Calculate a bounding box so the map fits all pins
  const lats = members.map((m) => m.lat);
  const lons = members.map((m) => m.lon);
  const minLat = Math.min(...lats) - 0.02;
  const maxLat = Math.max(...lats) + 0.02;
  const minLon = Math.min(...lons) - 0.02;
  const maxLon = Math.max(...lons) + 0.02;

  const mapUrl =
    `https://maps.geoapify.com/v1/staticmap` +
    `?style=osm-bright` +
    `&width=600&height=400` +
    `&area=rect:${minLon},${minLat},${maxLon},${maxLat}` +
    `&marker=${encodeURIComponent(markerParams)}` +
    `&apiKey=${GEOAPIFY_KEY}`;

  // Send the map link into the group chat
  const memberList = members
    .map((m, i) => {
      const color = MARKER_COLORS[i % MARKER_COLORS.length];
      return `${color} pin — ${m.label}`;
    })
    .join("\n");

  await sendGroupWithLink(
    args.groupId,
    `📍 Here's where everyone is:\n\n${memberList}\n\nTap the link to see the map 🗺️`,
    mapUrl
  );

  return JSON.stringify({
    success: true,
    memberCount: members.length,
    mapUrl,
  });
}