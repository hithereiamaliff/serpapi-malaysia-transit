/**
 * Find live buses near any place in Malaysia, in two calls:
 *
 *   1. SerpApi's Google Maps API turns a place name ("Kek Lok Si Temple") into
 *      coordinates, plus its address and rating.
 *   2. The Malaysia Transit API returns the nearest bus stops to those
 *      coordinates, with live arrival times.
 *
 * Both keys come from environment variables (see .env.example), never from code.
 */
import { getJson } from "serpapi";

const TRANSIT_API = "https://malaysiatransit.techmavie.digital/api";

/**
 * Malaysia Transit's service areas. The rough city centre biases the Google Maps
 * search so "Komtar" finds the one in Penang, not one somewhere else.
 */
export const AREAS = {
  "klang-valley": { name: "Kuala Lumpur", ll: "@3.1390,101.6869,11z" },
  penang: { name: "Penang", ll: "@5.4141,100.3288,11z" },
  kangar: { name: "Kangar", ll: "@6.4414,100.1986,12z" },
  "alor-setar": { name: "Alor Setar", ll: "@6.1248,100.3678,12z" },
  "kota-bharu": { name: "Kota Bharu", ll: "@6.1254,102.2381,12z" },
  "kuala-terengganu": { name: "Kuala Terengganu", ll: "@5.3302,103.1408,12z" },
  melaka: { name: "Melaka", ll: "@2.1896,102.2501,12z" },
  johor: { name: "Johor Bahru", ll: "@1.4927,103.7414,12z" },
  kuching: { name: "Kuching", ll: "@1.5535,110.3593,12z" },
  ipoh: { name: "Ipoh", ll: "@4.5975,101.0901,12z" },
  seremban: { name: "Seremban", ll: "@2.7258,101.9424,12z" },
  kuantan: { name: "Kuantan", ll: "@3.8077,103.3260,12z" },
};

/** Reads a required environment variable, with a clear message if it's missing. */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and add your key.`);
  }
  return value;
}

/**
 * Step 1: find the place with SerpApi's Google Maps API.
 * Returns null when Google Maps finds nothing with coordinates.
 */
export async function findPlace(query, areaId) {
  const area = AREAS[areaId];
  const params = {
    engine: "google_maps",
    type: "search",
    q: area ? `${query}, ${area.name}` : query,
    hl: "en",
    api_key: requireEnv("SERPAPI_API_KEY"),
  };
  if (area) params.ll = area.ll;

  const json = await getJson(params);

  // A precise search returns one place (place_results); a broad one returns a list (local_results).
  const place = json.place_results ?? json.local_results?.[0];
  if (!place?.gps_coordinates) return null;

  return {
    name: place.title,
    address: place.address ?? null,
    rating: place.rating ?? null,
    reviews: place.reviews ?? null,
    lat: place.gps_coordinates.latitude,
    lon: place.gps_coordinates.longitude,
  };
}

/**
 * Step 2: ask the Malaysia Transit API for the nearest stops and live arrivals.
 * radiusKm is in kilometres; 0.5 (500 m) is the API's default.
 */
export async function nearbyArrivals(lat, lon, areaId, radiusKm = 0.5) {
  const url = new URL(`${TRANSIT_API}/stops/nearby/arrivals`);
  url.search = new URLSearchParams({ lat, lon, area: areaId, radius: radiusKm });

  const response = await fetch(url, {
    headers: { "X-API-Key": requireEnv("MALAYSIA_TRANSIT_API_KEY") },
  });
  if (!response.ok) {
    throw new Error(`Malaysia Transit API returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

/** Walking-scale distance in metres between two points (haversine formula). */
export function metresBetween(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

/** Both steps together: place name in, nearest stops and next buses out. */
export async function findBusesNearPlace(query, areaId = "penang") {
  const place = await findPlace(query, areaId);
  if (!place) return { query, areaId, place: null, stops: [], arrivals: [] };

  const transit = await nearbyArrivals(place.lat, place.lon, areaId);
  const stops = (transit.stops ?? []).map((stop) => ({
    name: stop.stop_name,
    metres: Math.round(metresBetween(place, { lat: Number(stop.stop_lat), lon: Number(stop.stop_lon) })),
  }));

  return { query, areaId, place, nearestStop: transit.nearestStop?.stop_name ?? null, stops, arrivals: transit.arrivals ?? [] };
}

/** Turns a result into a short answer a person (or an AI assistant) can read. */
export function formatAnswer(result) {
  if (!result.place) {
    return `Google Maps couldn't find "${result.query}" in ${AREAS[result.areaId]?.name ?? result.areaId}. Try a more specific name.`;
  }

  const { place, arrivals, nearestStop } = result;
  const stops = uniqueStops(result.stops);
  const lines = [];
  const rating = place.rating ? ` (${place.rating} stars${place.reviews ? `, ${place.reviews.toLocaleString("en")} reviews` : ""})` : "";
  lines.push(`${place.name}${rating}`);
  if (place.address) lines.push(place.address);

  if (stops.length === 0) {
    lines.push("", "No bus stops within 500 m of this place.");
    return lines.join("\n");
  }

  const nearest = stops[0];
  lines.push("", `Nearest stop: ${cleanName(nearestStop ?? nearest.name)}, ${nearest.metres} m away`);

  if (arrivals.length === 0) {
    lines.push("No live buses due there in the next hour.");
  } else {
    lines.push("Next buses:");
    for (const group of groupByRoute(arrivals).slice(0, 4)) {
      const label = group.destination ? `${group.route} (${group.destination})` : group.route;
      lines.push(`  - ${label}: ${listMinutes(group.minutes.slice(0, 4))}`);
    }
  }

  const others = stops.slice(1).map((stop) => `${stop.name} (${stop.metres} m)`);
  if (others.length > 0) lines.push(`Other stops nearby: ${others.join(", ")}`);

  return lines.join("\n");
}

/** Stop names sometimes differ only by a trailing dot (often the stop across the road). */
function cleanName(name) {
  return String(name).trim().replace(/[.\s]+$/, "");
}

/** One entry per stop name, keeping the closest. Stops arrive sorted by distance. */
function uniqueStops(stops) {
  const seen = new Set();
  return stops
    .map((stop) => ({ ...stop, name: cleanName(stop.name) }))
    .filter((stop) => !seen.has(stop.name.toLowerCase()) && seen.add(stop.name.toLowerCase()));
}

/** Groups arrivals by route and destination, so a busy route reads as one line. */
function groupByRoute(arrivals) {
  const groups = new Map();
  for (const bus of arrivals) {
    const destination = destinationOf(bus);
    const key = `${bus.routeShortName}|${destination}`;
    if (!groups.has(key)) groups.set(key, { route: bus.routeShortName, destination, minutes: [] });
    groups.get(key).minutes.push(bus.etaMinutes);
  }
  return [...groups.values()];
}

/** The API says "Unknown" when a trip has no headsign; fall back to the route's long name. */
function destinationOf(bus) {
  const known = (value) => value && value !== "Unknown";
  if (known(bus.destination)) return bus.destination;
  if (known(bus.routeLongName)) return bus.routeLongName;
  return null;
}

/** [11, 30, 33] → "11, 30 and 33 min" */
function listMinutes(minutes) {
  const text = minutes.length > 1 ? `${minutes.slice(0, -1).join(", ")} and ${minutes.at(-1)}` : `${minutes[0]}`;
  return `${text} min`;
}
