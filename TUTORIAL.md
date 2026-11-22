# Find live buses near any place in Malaysia with SerpApi's Google Maps API and Node.js

Google Maps knows where every place is. Malaysia Transit knows where every bus is. Put the two together and you can answer the question every visitor asks: *which bus gets me there, and when is it coming?*

In this tutorial we'll build a small Node.js tool that takes a place name, like "Kek Lok Si Temple", and replies with the nearest bus stop and the next live buses. Then we'll turn it into an MCP tool, so an AI assistant can answer the same question.

## How it works

```
"Kek Lok Si Temple"
   │
   ▼  SerpApi Google Maps API: place name → coordinates, address, rating
(5.3996, 100.2736)
   │
   ▼  Malaysia Transit API: coordinates → nearest stops and live arrivals
"Nearest stop: 442 m away. Route 201 in 11 min."
```

Two API calls, under 200 lines of code with comments.

## What you need

- **Node.js 22.9 or newer**
- **A SerpApi key.** Sign up at serpapi.com; the free plan gives you 250 searches a month, plenty for this.
- **A Malaysia Transit API key.** It's free from the [developer portal](https://developers.malaysiatransit.techmavie.digital).

## Step 1: Set up the project

```bash
mkdir serpapi-malaysia-transit && cd serpapi-malaysia-transit
npm init -y
npm pkg set type=module
npm install serpapi
```

Keep your keys out of the code. Put them in a `.env` file, and add `.env` to `.gitignore`:

```bash
SERPAPI_API_KEY=your-serpapi-key
MALAYSIA_TRANSIT_API_KEY=your-malaysia-transit-key
```

Node 22 can load this file for you with `node --env-file-if-exists=.env`, so you don't need an extra package.

## Step 2: Find the place with SerpApi

SerpApi's Google Maps API returns the same results you'd see on Google Maps, as clean JSON. Set `engine` to `google_maps` and `type` to `search`.

One catch: lots of places share a name. To make sure "Komtar" means the one in Penang, add the area to the query and pass `ll`, a GPS position and zoom level that centres the search:

```js
import { getJson } from "serpapi";

const json = await getJson({
  engine: "google_maps",
  type: "search",
  q: "Kek Lok Si Temple, Penang",
  ll: "@5.4141,100.3288,11z", // centre the search on George Town
  hl: "en",
  api_key: process.env.SERPAPI_API_KEY,
});

// A precise search returns one place; a broad one returns a list.
const place = json.place_results ?? json.local_results?.[0];
const { latitude, longitude } = place.gps_coordinates;
```

Note the two shapes. When Google Maps is sure which place you mean, SerpApi returns a single `place_results` object. When it isn't, you get a `local_results` list. Handling both keeps the tool from failing on precise names.

You also get `title`, `address`, `rating` and `reviews` for free, which makes the final answer friendlier.

## Step 3: Ask Malaysia Transit for live buses

The Malaysia Transit API covers buses, trains and ferries across 13 areas of Malaysia. The `stops/nearby/arrivals` endpoint takes coordinates and returns the nearest stops, plus live arrivals at the closest one. The key goes in the `X-API-Key` header:

```js
const url = new URL("https://malaysiatransit.techmavie.digital/api/stops/nearby/arrivals");
url.search = new URLSearchParams({
  lat: latitude,
  lon: longitude,
  area: "penang",
  radius: 0.5, // kilometres
});

const response = await fetch(url, {
  headers: { "X-API-Key": process.env.MALAYSIA_TRANSIT_API_KEY },
});
const { stops, nearestStop, arrivals } = await response.json();
```

The response has three parts:

- `stops`: up to three nearby stops, with names and coordinates
- `nearestStop`: the one the arrivals are for
- `arrivals`: up to ten buses, soonest first, each with `routeShortName`, `destination` and `etaMinutes`

## Step 4: Put it together

The finished `src/transit.js` wraps both calls in one function, `findBusesNearPlace(place, area)`. It works out how far each stop is from the place, in a straight line, and `formatAnswer()` turns the result into plain text. A small `index.js` makes it a command:

```bash
npm start -- "Kek Lok Si Temple" --area penang
```

Here's what it printed on 22 November 2026. Live times will be different when you run it:

```
Kek Lok Si Temple (4.4 stars, 15,511 reviews)
Kek Lok Si Temple, 86s, Jln Balik Pulau, 11500 Ayer Itam, Pulau Pinang, Malaysia

Nearest stop: Klinik Desa Paya Terubong, 442 m away
Next buses:
  - 201 (JETI - PAYA TERUBONG - JETI): 11, 30, 33 and 35 min
Other stops nearby: Ambank Paya Terubong (477 m)
```

Real data needed three small fixes in `formatAnswer()`:

- **The same stop twice.** Stops on opposite sides of a road can share a name, sometimes with a trailing dot. The tool keeps one entry per name, the closest.
- **A busy route.** Six arrivals on route 201 read better as one line with a list of times.
- **Missing destinations.** When a trip has no headsign, the API says "Unknown", so the tool falls back to the route's full name.

Add `--json` to see the raw data, if you want to build something on top of it.

## Bonus: make it an MCP tool

The Model Context Protocol (MCP) lets AI assistants call tools like this one. With the official SDK, it's one `registerTool` call:

```js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { findBusesNearPlace, formatAnswer } from "./src/transit.js";

const server = new McpServer({ name: "buses-near-place", version: "1.0.0" });

server.registerTool(
  "find_buses_near_place",
  {
    title: "Find live buses near a place in Malaysia",
    description: "Finds a place with Google Maps (via SerpApi), then lists the nearest bus stops and live arrivals.",
    inputSchema: { place: z.string(), area: z.string().default("penang") },
  },
  async ({ place, area }) => ({
    content: [{ type: "text", text: formatAnswer(await findBusesNearPlace(place, area)) }],
  }),
);

await server.connect(new StdioServerTransport());
```

Add it to your assistant's MCP config, with your two keys in its `env`. Now "how do I get to Kek Lok Si by bus?" gets a real, live answer instead of a guess.

Here's the tool answering for Pavilion Kuala Lumpur:

```
Pavilion Kuala Lumpur (4.6 stars, 64,059 reviews)
168, Jln Bukit Bintang, Bukit Bintang, 55100 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur, Malaysia

Nearest stop: KL86 MRT BUKIT BINTANG/HSBC, 277 m away
Next buses:
  - 400 (Damai Perdana ~ Hab Pasar Seni via Bukit Bintang): 42 min
Other stops nearby: RAJA CHULAN (340 m), BUKIT BINTANG (363 m)
```

## Where to take it next

- **Opening hours:** SerpApi returns them too, so you could warn people when a place is about to close.
- **Other areas:** swap `penang` for `klang-valley`, `johor` or any of the 13 areas.
- **The whole journey:** the Malaysia Transit API also has a journey planner and fare calculator.

## Your turn

That's it: two API calls between a place name and the next bus. **Grab a free SerpApi key** (250 searches a month), point it at your favourite makan spot, and find out which bus gets you there.

Building something with Malaysian public transport data? **[Get a free Malaysia Transit API key](https://developers.malaysiatransit.techmavie.digital)** and start with the [API docs](https://techmavie.digital/transit-api/business).

The full code is in this repository.
