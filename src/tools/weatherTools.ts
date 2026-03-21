import axios from "axios";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { geocode } from "./placeTools";

export const getWeatherDef: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_weather",
    description:
      "Get the current weather at a location. Use when someone asks about the weather, what to wear, or whether to bring an umbrella. Also use automatically when a meetup location is mentioned.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: 'Location to get weather for, e.g. "Shoreditch, London"',
        },
      },
      required: ["location"],
    },
  },
};

const WEATHER_CODES: Record<number, string> = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "foggy",
  48: "icy fog",
  51: "light drizzle",
  53: "drizzle",
  55: "heavy drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  80: "light showers",
  81: "showers",
  82: "heavy showers",
  95: "thunderstorm",
  99: "thunderstorm with hail",
};

export async function getWeather(args: { location: string }): Promise<string> {
  const coords = await geocode(args.location);
  if (!coords) {
    return JSON.stringify({
      error: `Could not find location "${args.location}". Try being more specific.`,
    });
  }

  try {
    const res = await axios.get("https://api.open-meteo.com/v1/forecast", {
      params: {
        latitude: coords.lat,
        longitude: coords.lon,
        current: "temperature_2m,apparent_temperature,weathercode,windspeed_10m,precipitation",
        wind_speed_unit: "mph",
        timezone: "auto",
      },
    });

    const current = res.data.current;
    const temp = Math.round(current.temperature_2m);
    const feelsLike = Math.round(current.apparent_temperature);
    const condition = WEATHER_CODES[current.weathercode] ?? "unknown conditions";
    const wind = Math.round(current.windspeed_10m);
    const rain = current.precipitation;

    const umbrella = rain > 0 || [51,53,55,61,63,65,80,81,82,95,99].includes(current.weathercode);

    return JSON.stringify({
      location: args.location,
      temperature: `${temp}°C`,
      feelsLike: `${feelsLike}°C`,
      condition,
      wind: `${wind} mph`,
      precipitation: `${rain}mm`,
      bringUmbrella: umbrella,
      summary: `${temp}°C and ${condition} in ${args.location}. Feels like ${feelsLike}°C, wind ${wind} mph.${umbrella ? " Bring an umbrella." : ""}`,
    });
  } catch (err) {
    return JSON.stringify({
      error: `Could not fetch weather: ${err instanceof Error ? err.message : "unknown error"}`,
    });
  }
}