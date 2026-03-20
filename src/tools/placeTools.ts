import axios from "axios";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

const GEOAPIFY_KEY = process.env.GEOAPIFY_KEY ?? "";
if (!GEOAPIFY_KEY) {
  console.warn("GEOAPIFY_KEY not set - place search will be unavailable");
}

// ─── Tool definition ──────────────────────────────────────────────────────────

export const findPlacesDef: ChatCompletionTool = {
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
          description: 'What to search for, e.g. "cocktail bars", "italian restaurant", "karaoke"',
        },
        location: {
          type: "string",
          description: 'Location to search near, e.g. "Shoreditch, London", "Soho, London"',
        },
        limit: {
          type: "number",
          description: "Number of results (1-10, default 5)",
        },
      },
      required: ["term", "location"],
    },
  },
};

// ─── Geoapify helpers ─────────────────────────────────────────────────────────

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
    console.error("Geocode error:", err instanceof Error ? err.message : err);
    return null;
  }
}

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

async function searchPlaces(term: string, location: string, limit: number): Promise<GeoapifyPlace[]> {
  try {
    const category = categoryMap[term.toLowerCase()] ?? "catering";
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
    console.error("Geoapify error:", err instanceof Error ? err.message : err);
    return [];
  }
}

function formatPlaceResults(places: GeoapifyPlace[]): string {
  if (places.length === 0) return "No places found";
  return places
    .map((p, i) => {
      const name = p.name ?? "Unnamed";
      const addr = p.formatted ?? p.address_line2 ?? "";
      const dist = p.distance ? ` - ${Math.round(p.distance)}m away` : "";
      const cats = p.categories
        .filter((c) => !c.startsWith("building") && !c.startsWith("commercial"))
        .slice(0, 2)
        .join(", ");
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}&query_place_id=${encodeURIComponent(name)}`;
      return `${i + 1}. ${name}${dist}\n   ${cats}\n   ${addr}\n   ${mapsUrl}`;
    })
    .join("\n\n");
}

// ─── Tool implementation ──────────────────────────────────────────────────────

export async function findPlaces(args: { term: string; location: string; limit?: number }): Promise<string> {
  if (!GEOAPIFY_KEY) return JSON.stringify({ error: "Place search isn't configured - GEOAPIFY_KEY not set" });

  const limit = Math.min(Math.max(args.limit ?? 5, 1), 10);
  const results = await searchPlaces(args.term, args.location, limit);
  return formatPlaceResults(results);
}
