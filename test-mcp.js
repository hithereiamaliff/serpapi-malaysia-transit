/**
 * Self-test for the MCP server: starts it the way an AI client would, then lists its tools.
 *
 *   npm run test:mcp                             lists the tools (no API calls, free)
 *   npm run test:mcp -- "Kek Lok Si Temple" penang   also calls the tool (uses 1 SerpApi search)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [place, area = "penang"] = process.argv.slice(2);

const client = new Client({ name: "self-test", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    // The server loads .env itself, so the keys don't need to pass through here.
    args: ["--env-file-if-exists=.env", "mcp-server.js"],
    cwd: import.meta.dirname,
  }),
);

const { tools } = await client.listTools();
console.log(`Tools: ${tools.map((tool) => tool.name).join(", ")}`);

if (place) {
  const result = await client.callTool({ name: "find_buses_near_place", arguments: { place, area } });
  console.log(`\n${result.content[0].text}`);
}

await client.close();
