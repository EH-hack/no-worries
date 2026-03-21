import axios from "axios";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { TFL_API_KEY } from "../config";

if (!TFL_API_KEY) {
  console.warn("TFL_API_KEY not set - TfL routing will be unavailable");
}

// ─── Tool definition ──────────────────────────────────────────────────────────

export const getTflRouteDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_tfl_route",
    description:
      "Get TfL public transport journey instructions between two London locations. Use when someone asks how to get somewhere, travel directions, or public transport routes in London.",
    parameters: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: 'Origin — postcode, address, or place name in London, e.g. "Shoreditch, London" or "SW1A 1AA"',
        },
        to: {
          type: "string",
          description: 'Destination — postcode, address, or place name in London, e.g. "Canary Wharf" or "EC2A 4BH"',
        },
      },
      required: ["from", "to"],
    },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(from: string, to: string): string {
  const base = `https://api.tfl.gov.uk/Journey/JourneyResults/${encodeURIComponent(from)}/to/${encodeURIComponent(to)}`;
  return TFL_API_KEY ? `${base}?app_key=${TFL_API_KEY}` : base;
}

/**
 * Returns the shortest journey duration in minutes between two lat,lon strings.
 * Used by locationTools to score meeting spot candidates.
 * Returns null if the API is unavailable or the journey can't be found.
 */
export async function getJourneyMinutes(fromLatLon: string, toLatLon: string): Promise<number | null> {
  try {
    const res = await axios.get(buildUrl(fromLatLon, toLatLon));
    const duration = res.data?.journeys?.[0]?.duration;
    return typeof duration === "number" ? duration : null;
  } catch {
    return null;
  }
}

// ─── Tool implementation ──────────────────────────────────────────────────────

export async function getTflRoute(args: { from: string; to: string }): Promise<string> {
  if (!TFL_API_KEY) {
    return JSON.stringify({ error: "TfL routing isn't configured - TFL_API_KEY not set" });
  }

  try {
    let res = await axios.get(buildUrl(args.from, args.to));

    if (res.status === 300) {
      const fromMatch = res.data?.fromLocationDisambiguation?.disambiguationOptions?.[0]?.place;
      const toMatch = res.data?.toLocationDisambiguation?.disambiguationOptions?.[0]?.place;
      const resolvedFrom = fromMatch ? `${fromMatch.lat},${fromMatch.lon}` : args.from;
      const resolvedTo = toMatch ? `${toMatch.lat},${toMatch.lon}` : args.to;
      res = await axios.get(buildUrl(resolvedFrom, resolvedTo));
    }

    const journeys = res.data?.journeys?.slice(0, 2);
    if (!journeys?.length) return "No routes found between those locations.";

    return journeys
      .map((j: any, i: number) => {
        const legs = j.legs
          .map((l: any) => `${l.instruction.summary} (${l.mode.name}, ${l.duration} min)`)
          .join(" → ");
        return `Option ${i + 1}: ${j.duration} min total\n${legs}`;
      })
      .join("\n\n");
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : "TfL request failed" });
  }
}
