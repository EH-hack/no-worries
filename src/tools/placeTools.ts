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
  website?: string;
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await axios.get("https://api.geoapify.com/v1/geocode/reverse", {
      params: { lat, lon, apiKey: GEOAPIFY_KEY },
    });
    const props = res.data?.features?.[0]?.properties;
    if (!props) return null;
    return props.suburb ?? props.district ?? props.city ?? props.county ?? null;
  } catch {
    return null;
  }
}

export async function geocode(location: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await axios.get("https://api.geoapify.com/v1/geocode/search", {
      params: { text: location, apiKey: GEOAPIFY_KEY, limit: 1, bias: "proximity:51.5074,-0.1278" },
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
    pizza: "catering.restaurant.pizza,catering.fast_food.pizza,catering.restaurant",
    burger: "catering.fast_food.burger,catering.restaurant,catering.fast_food",
    sushi: "catering.restaurant.sushi,catering.restaurant",
    chinese: "catering.restaurant.chinese,catering.restaurant",
    indian: "catering.restaurant.indian,catering.restaurant",
    thai: "catering.restaurant.thai,catering.restaurant",
    mexican: "catering.restaurant.mexican,catering.restaurant",
    ramen: "catering.restaurant.noodle,catering.restaurant",
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

// Generic terms that map cleanly to categories — no text search needed
const GENERIC_TERMS = new Set([
  "restaurant", "restaurants", "bar", "bars", "pub", "pubs",
  "club", "clubs", "nightclub", "nightlife", "cafe", "coffee",
  "food", "karaoke", "fast food", "dessert", "drinks", "cocktail", "cocktails",
]);

// Text-search via Geoapify geocoding autocomplete (keyword-based, not category-based)
export async function textSearchPlaces(
  term: string,
  coords: { lat: number; lon: number },
  limit: number
): Promise<GeoapifyPlace[]> {
  try {
    const res = await axios.get("https://api.geoapify.com/v1/geocode/autocomplete", {
      params: {
        text: term,
        type: "amenity",
        filter: `circle:${coords.lon},${coords.lat},3000`,
        bias: `proximity:${coords.lon},${coords.lat}`,
        limit,
        format: "json",
        apiKey: GEOAPIFY_KEY,
      },
    });
    return (res.data?.results ?? []).map((r: any) => ({
      name: r.name,
      categories: r.category ? [r.category] : [],
      formatted: r.formatted,
      address_line1: r.address_line1,
      address_line2: r.address_line2,
      lat: r.lat,
      lon: r.lon,
      place_id: r.place_id ?? "",
      distance: r.distance,
    }));
  } catch (err) {
    console.error("Text search error:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function searchPlaces(term: string, location: string, limit: number): Promise<GeoapifyPlace[]> {
  try {
    const coords = await geocode(location);
    if (!coords) return [];

    const isGeneric = GENERIC_TERMS.has(term.toLowerCase());

    // For specific terms (pizza, sushi, etc.), use text search first — it's keyword-based
    if (!isGeneric) {
      const textResults = await textSearchPlaces(term, coords, limit);
      if (textResults.length > 0) return textResults;
    }

    // Fall back to category-based search for generic terms or if text search returned nothing
    const categories = termToCategories(term);
    const res = await axios.get("https://api.geoapify.com/v2/places", {
      params: {
        categories,
        filter: `circle:${coords.lon},${coords.lat},2000`,
        bias: `proximity:${coords.lon},${coords.lat}`,
        limit: limit * 3,
        conditions: "named",
        apiKey: GEOAPIFY_KEY,
      },
    });

    let places: GeoapifyPlace[] = (res.data?.features ?? []).map((f: any) => ({
      ...f.properties,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
      website: f.properties.website ?? f.properties.datasource?.raw?.website,
    }));

    // For specific terms, prefer name matches from category results
    if (!isGeneric && places.length > 0) {
      const termWords = term.toLowerCase().split(/\s+/);
      const nameMatches = places.filter((p) => {
        const name = (p.name ?? "").toLowerCase();
        const cats = (p.categories ?? []).join(" ").toLowerCase();
        return termWords.some((w) => name.includes(w) || cats.includes(w));
      });
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

function bookingLink(place: GeoapifyPlace): string {
  if (place.website) return place.website;
  const query = encodeURIComponent((place.name ?? "") + " " + (place.address_line2 ?? "")).trim();
  return `https://www.opentable.co.uk/s/?term=${query}`;
}

function formatPlaceResults(places: GeoapifyPlace[]): string {
  if (places.length === 0) return "No places found";
  return places
    .map((p, i) => {
      const name = p.name ?? "Unnamed";
      const addr = p.formatted ?? p.address_line2 ?? "";
      const dist = p.distance ? ` - ${Math.round(p.distance)}m away` : "";
      const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(name)}&near=${p.lat},${p.lon}`;
      const booking = bookingLink(p);
      return `${i + 1}. ${name}${dist}\n   ${addr}\n   Maps: ${mapsUrl}\n   Book: ${booking}`;
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
