import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { ensureGroup, MemberLocation } from "../billing/types";
import { getState, saveState } from "../store";
import { geocode, searchPlaces } from "./placeTools";

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const setLocationDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "set_location",
    description:
      'Save a group member\'s location. Use type "home" for where they live, or "current" for a temporary location override.',
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "string", description: "The group ID" },
        uid: { type: "string", description: "The member's UID" },
        location: {
          type: "string",
          description: 'Location text, e.g. "Shoreditch, London"',
        },
        type: {
          type: "string",
          enum: ["home", "current"],
          description: '"home" for permanent location, "current" for temporary override',
        },
      },
      required: ["groupId", "uid", "location", "type"],
    },
  },
};

export const findMeetingSpotDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "find_meeting_spot",
    description:
      "Find places near the geographic midpoint of group members. Searches for venues that are fair for everyone to travel to.",
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "string", description: "The group ID" },
        term: {
          type: "string",
          description: 'What to search for, e.g. "pizza", "cocktail bars"',
        },
        members: {
          type: "array",
          items: { type: "string" },
          description:
            "UIDs of members to include (defaults to all members with locations set)",
        },
        limit: {
          type: "number",
          description: "Number of results (1-10, default 5)",
        },
      },
      required: ["groupId", "term"],
    },
  },
};

export const getLocationsDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_locations",
    description:
      "Show which group members have set their location and where they are.",
    parameters: {
      type: "object",
      properties: {
        groupId: { type: "string", description: "The group ID" },
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

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Tool implementations ─────────────────────────────────────────────────────

export async function setLocation(args: {
  groupId: string;
  uid: string;
  location: string;
  type: "home" | "current";
}): Promise<string> {
  const coords = await geocode(args.location);
  if (!coords) {
    return JSON.stringify({
      error: `Could not find location "${args.location}". Try being more specific (e.g. "Shoreditch, London").`,
    });
  }

  const state = getState();
  const group = ensureGroup(state, args.groupId);
  if (!group.locations[args.uid]) group.locations[args.uid] = {};

  const loc = group.locations[args.uid];
  if (args.type === "home") {
    loc.home = args.location;
    loc.homeLat = coords.lat;
    loc.homeLon = coords.lon;
  } else {
    loc.current = args.location;
    loc.currentLat = coords.lat;
    loc.currentLon = coords.lon;
  }

  await saveState();

  const typeLabel = args.type === "home" ? "home location" : "current location";
  return JSON.stringify({
    ok: true,
    message: `Saved ${args.uid}'s ${typeLabel} as "${args.location}"`,
  });
}

export async function findMeetingSpot(args: {
  groupId: string;
  term: string;
  members?: string[];
  limit?: number;
}): Promise<string> {
  const state = getState();
  const group = ensureGroup(state, args.groupId);

  // Resolve which members to include
  const targetUids = args.members ?? Object.keys(group.locations);
  const memberLocations: { uid: string; label: string; lat: number; lon: number }[] = [];

  for (const uid of targetUids) {
    const loc = group.locations[uid];
    if (!loc) continue;
    const eff = getEffectiveLocation(loc);
    if (eff) memberLocations.push({ uid, ...eff });
  }

  if (memberLocations.length < 2) {
    const missing = group.members.filter(
      (uid) => !memberLocations.find((m) => m.uid === uid)
    );
    return JSON.stringify({
      error: "Need at least 2 members with locations set to find a meeting spot.",
      membersWithoutLocation: missing,
    });
  }

  // Compute geographic midpoint (average lat/lon)
  const midLat =
    memberLocations.reduce((sum, m) => sum + m.lat, 0) / memberLocations.length;
  const midLon =
    memberLocations.reduce((sum, m) => sum + m.lon, 0) / memberLocations.length;

  // Search near the midpoint using the location string form
  const midpointLabel = `${midLat.toFixed(5)},${midLon.toFixed(5)}`;
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 10);
  const results = await searchPlaces(args.term, midpointLabel, limit);

  if (results.length === 0) {
    return JSON.stringify({
      error: `No "${args.term}" found near the group's midpoint.`,
      midpoint: midpointLabel,
    });
  }

  // Format results with per-member distances
  const formatted = results.map((place, i) => {
    const name = place.name ?? "Unnamed";
    const addr = place.formatted ?? place.address_line2 ?? "";
    const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(name)}&near=${place.lat},${place.lon}`;

    const distances = memberLocations
      .map((m) => {
        const km = haversineKm(m.lat, m.lon, place.lat, place.lon);
        return `${m.uid}: ${km.toFixed(1)} km`;
      })
      .join(", ");

    return `${i + 1}. ${name}\n   ${addr}\n   Distance — ${distances}\n   ${mapsUrl}`;
  });

  return (
    `Midpoint: ${midpointLabel}\n` +
    `Members: ${memberLocations.map((m) => `${m.uid} (${m.label})`).join(", ")}\n\n` +
    formatted.join("\n\n")
  );
}

export function getLocations(args: { groupId: string }): string {
  const state = getState();
  const group = ensureGroup(state, args.groupId);

  const lines: string[] = [];
  for (const uid of group.members) {
    const loc = group.locations[uid];
    if (!loc) {
      lines.push(`${uid}: not set`);
      continue;
    }
    const parts: string[] = [];
    if (loc.home) parts.push(`home: ${loc.home}`);
    if (loc.current) parts.push(`currently at: ${loc.current}`);
    lines.push(`${uid}: ${parts.length > 0 ? parts.join(" | ") : "not set"}`);
  }

  // Also show locations for UIDs not in members array (edge case)
  for (const uid of Object.keys(group.locations)) {
    if (!group.members.includes(uid)) {
      const loc = group.locations[uid];
      const parts: string[] = [];
      if (loc.home) parts.push(`home: ${loc.home}`);
      if (loc.current) parts.push(`currently at: ${loc.current}`);
      if (parts.length > 0) lines.push(`${uid}: ${parts.join(" | ")}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "No locations set for this group yet.";
}
