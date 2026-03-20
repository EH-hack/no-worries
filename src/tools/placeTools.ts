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
          description: 'What to search for, e.g. "cocktail bars", "italian restaurant", "karaoke", "bubble tea"',
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

// Match terms to Geoapify categories — use multiple categories for broader results
function termToCategories(term: string): string {
  const t = term.toLowerCase();

  const map: Record<string, string> = {
    restaurant: "catering.restaurant",
    restaurants: "catering.restaurant",
    bar: "catering.bar,catering.pub",
    bars: "catering.bar,catering.pub",
    pub: "catering.pub,catering.bar",
    pubs: "catering.pub,catering.bar",
    club: "entertainment.club",
    clubs: "entertainment.club",
    nightclub: "entertainment.club.night",
    nightlife: "entertainment.club,catering.bar,catering.pub",
    cafe: "catering.cafe",
    coffee: "catering.cafe",
    food: "catering",
    karaoke: "entertainment",
    pizza: "catering.restaurant,catering.fast_food",
    burger: "catering.fast_food,catering.restaurant",
    "fast food": "catering.fast_food",
    dessert: "catering.cafe,catering.restaurant",
    drinks: "catering.bar,catering.pub",
    cocktail: "catering.bar",
    cocktails: "catering.bar",
  };

  // Direct match
  if (map[t]) return map[t];

  // Partial match — check if any key is contained in the term
  for (const [key, cats] of Object.entries(map)) {
    if (t.includes(key)) return cats;
  }

  // Default: search broadly across catering + entertainment
  return "catering,entertainment";
}

async function searchPlaces(term: string, location: string, limit: number): Promise<GeoapifyPlace[]> {
  try {
    const categories = termToCategories(term);
    const coords = await geocode(location);
    if (!coords) return [];

    const res = await axios.get("https://api.geoapify.com/v2/places", {
      params: {
        categories,
        filter: `circle:${coords.lon},${coords.lat},2000`,
        bias: `proximity:${coords.lon},${coords.lat}`,
        limit: limit * 3, // fetch extra so we can filter by name relevance
        apiKey: GEOAPIFY_KEY,
      },
    });

    let places: GeoapifyPlace[] = (res.data?.features ?? []).map((f: any) => ({
      ...f.properties,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
    }));

    // If the term is specific (not just "bars" or "restaurants"), try to filter by name match
    const genericTerms = new Set(Object.keys(termToCategories));
    const isSpecific = !genericTerms.has(term.toLowerCase());

    if (isSpecific && places.length > 0) {
      const termWords = term.toLowerCase().split(/\s+/);
      const nameMatches = places.filter((p) => {
        const name = (p.name ?? "").toLowerCase();
        return termWords.some((w) => name.includes(w));
      });
      // Use name matches if we found any, otherwise return all
      if (nameMatches.length > 0) {
        places = nameMatches;
      }
    }

    return places.slice(0, limit);
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
      const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(name)}&near=${p.lat},${p.lon}`;
      return `${i + 1}. ${name}${dist}\n   ${addr}\n   ${mapsUrl}`;
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
