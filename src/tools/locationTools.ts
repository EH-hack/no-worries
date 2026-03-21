import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { ensureGroup, MemberLocation } from "../billing/types";
import { getState, saveState } from "../store";
import { geocode, searchPlaces, reverseGeocode } from "./placeTools";
import { getJourneyMinutes } from "./tflTools";
import { TFL_API_KEY } from "../config";

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
        centralBias: {
          type: "number",
          description:
            "How much to pull the search point toward central London (Charing Cross). 0 = pure geographic midpoint, 1 = central London only. Default 0.3. Use a higher value (e.g. 0.6) if the user asks for somewhere more central.",
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

const CENTRAL_LONDON = { lat: 51.5081, lon: -0.1281 }; // Charing Cross

export async function findMeetingSpot(args: {
  groupId: string;
  term: string;
  members?: string[];
  limit?: number;
  centralBias?: number;
}): Promise<string> {
  const state = getState();
  const group = ensureGroup(state, args.groupId);

  // Resolve which members to include — check both group.locations AND users store
  const allUidsWithLocation = new Set([
    ...Object.keys(group.locations),
    ...Object.keys(state.users).filter((uid) => state.users[uid].location),
  ]);
  const targetUids = args.members ?? [...allUidsWithLocation];
  const memberLocations: { uid: string; label: string; lat: number; lon: number }[] = [];

  for (const uid of targetUids) {
    // First check group.locations
    const loc = group.locations[uid];
    if (loc) {
      const eff = getEffectiveLocation(loc);
      if (eff) {
        memberLocations.push({ uid, ...eff });
        continue;
      }
    }
    // Fall back to users store — need to geocode the location string
    const userProfile = state.users[uid];
    if (userProfile?.location) {
      const coords = await geocode(userProfile.location);
      if (coords) {
        memberLocations.push({ uid, label: userProfile.location, ...coords });
      }
    }
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
  const rawMidLat = memberLocations.reduce((sum, m) => sum + m.lat, 0) / memberLocations.length;
  const rawMidLon = memberLocations.reduce((sum, m) => sum + m.lon, 0) / memberLocations.length;

  // Blend toward central London
  const bias = Math.min(Math.max(args.centralBias ?? 0.3, 0), 1);
  const midLat = rawMidLat * (1 - bias) + CENTRAL_LONDON.lat * bias;
  const midLon = rawMidLon * (1 - bias) + CENTRAL_LONDON.lon * bias;

  // Search near the midpoint using the location string form
  const midpointCoords = `${midLat.toFixed(5)},${midLon.toFixed(5)}`;
  const midpointBorough = await reverseGeocode(midLat, midLon);
  const midpointLabel = midpointBorough ?? midpointCoords;
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 10);
  const results = await searchPlaces(args.term, midpointCoords, limit);

  if (results.length === 0) {
    return JSON.stringify({
      error: `No "${args.term}" found near the group's midpoint.`,
      midpoint: midpointLabel,
    });
  }

  // Score each venue — use TfL journey times if key is configured, else straight-line distance
  const scored = await Promise.all(
    results.map(async (place) => {
      const toLatLon = `${place.lat},${place.lon}`;
      const memberTimes = await Promise.all(
        memberLocations.map(async (m) => ({
          uid: m.uid,
          lat: m.lat,
          lon: m.lon,
          minutes: TFL_API_KEY
            ? await getJourneyMinutes(`${m.lat},${m.lon}`, toLatLon)
            : null,
        }))
      );
      const validMinutes = memberTimes.filter((t) => t.minutes !== null).map((t) => t.minutes as number);
      const totalMinutes = validMinutes.length === memberTimes.length ? validMinutes.reduce((a, b) => a + b, 0) : null;
      return { place, memberTimes, totalMinutes };
    })
  );

  // Sort by total journey time if TfL data is available
  if (TFL_API_KEY) {
    scored.sort((a, b) => {
      if (a.totalMinutes !== null && b.totalMinutes !== null) return a.totalMinutes - b.totalMinutes;
      if (a.totalMinutes !== null) return -1;
      if (b.totalMinutes !== null) return 1;
      return 0;
    });
  }

  const formatted = scored.map((item, i) => {
    const { place, memberTimes, totalMinutes } = item;
    const name = place.name ?? "Unnamed";
    const addr = place.formatted ?? place.address_line2 ?? "";
    const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(name)}&near=${place.lat},${place.lon}`;

    let travelInfo: string;
    if (totalMinutes !== null) {
      const times = memberTimes.map((t) => {
        const displayName = state.users[t.uid]?.displayName ?? t.uid;
        return `${displayName}: ${t.minutes} min`;
      }).join(", ");
      travelInfo = `Journey times — ${times} (total: ${totalMinutes} min)`;
    } else {
      const distances = memberLocations
        .map((m) => {
          const km = haversineKm(m.lat, m.lon, place.lat, place.lon);
          const displayName = state.users[m.uid]?.displayName ?? m.uid;
          return `${displayName}: ${km.toFixed(1)} km`;
        })
        .join(", ");
      travelInfo = `Distance — ${distances}`;
    }

    return `${i + 1}. ${name}\n   ${addr}\n   ${travelInfo}\n   ${mapsUrl}`;
  });

  return (
    `Midpoint: ${midpointLabel}\n` +
    `Members: ${memberLocations.map((m) => `${m.uid} (${m.label})`).join(", ")}\n` +
    (TFL_API_KEY ? `Ranked by shortest total TfL journey time\n` : "") +
    `\n` +
    formatted.join("\n\n")
  );
}

export function getLocations(args: { groupId: string }): string {
  const state = getState();
  const group = ensureGroup(state, args.groupId);

  const lines: string[] = [];
  const seen = new Set<string>();

  // Check group.locations (set via set_location)
  for (const uid of Object.keys(group.locations)) {
    seen.add(uid);
    const loc = group.locations[uid];
    const parts: string[] = [];
    if (loc.home) parts.push(`home: ${loc.home}`);
    if (loc.current) parts.push(`currently at: ${loc.current}`);
    const displayName = state.users[uid]?.displayName ?? uid;
    if (parts.length > 0) lines.push(`${displayName} (${uid}): ${parts.join(" | ")}`);
  }

  // Also check users store (set via register_user)
  for (const [uid, profile] of Object.entries(state.users)) {
    if (seen.has(uid)) continue;
    if (profile.location) {
      const displayName = profile.displayName ?? uid;
      lines.push(`${displayName} (${uid}): ${profile.location}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "No locations set for this group yet.";
}
