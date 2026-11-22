/**
 * Bonus: the same lookup as an MCP tool, so an AI assistant can answer
 * "how do I get to Kek Lok Si by bus?" with live data.
 *
 * It talks MCP over stdio. Add it to your MCP client's config (see README.md),
 * with SERPAPI_API_KEY and MALAYSIA_TRANSIT_API_KEY in that config's "env".
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AREAS, findBusesNearPlace, formatAnswer } from "./src/transit.js";

const server = new McpServer({ name: "buses-near-place", version: "1.0.0" });

server.registerTool(
  "find_buses_near_place",
  {
    title: "Find live buses near a place in Malaysia",
    description:
      "Finds a place with Google Maps (via SerpApi), then lists the nearest bus stops and the next live " +
      "arrivals there (via the Malaysia Transit API). Use it for questions like 'how do I get to X by bus?'.",
    inputSchema: {
      place: z.string().min(2).describe("A place name, e.g. 'Kek Lok Si Temple' or 'Pavilion Kuala Lumpur'"),
      area: z
        .enum(Object.keys(AREAS))
        .default("penang")
        .describe("Malaysia Transit service area the place is in"),
    },
  },
  async ({ place, area }) => {
    try {
      const result = await findBusesNearPlace(place, area);
      return { content: [{ type: "text", text: formatAnswer(result) }] };
    } catch (error) {
      // Report the problem to the assistant instead of crashing the server.
      return { content: [{ type: "text", text: `Lookup failed: ${error.message}` }], isError: true };
    }
  },
);

await server.connect(new StdioServerTransport());
