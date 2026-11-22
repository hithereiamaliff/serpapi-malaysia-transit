# Find live buses near any place in Malaysia

Type a place name and get the nearest bus stops with live arrival times. It uses [SerpApi's Google Maps API](https://serpapi.com/google-maps-api) to find the place and the [Malaysia Transit API](https://techmavie.digital/transit-api/business) for the buses. Node.js, under 200 lines with comments, plus an MCP tool so AI assistants can use it too.

The full walkthrough is in [TUTORIAL.md](TUTORIAL.md). You can also [read it on the web](https://mynameisaliff.co.uk/serpapi-live-buses-tutorial).

## Quick start

You need Node.js 22.9 or newer.

```bash
npm install
cp .env.example .env    # then paste your two keys into .env
npm start -- "Kek Lok Si Temple" --area penang
```

| Key | Where to get it | Cost |
|---|---|---|
| `SERPAPI_API_KEY` | https://serpapi.com/manage-api-key | Free plan: 250 searches a month |
| `MALAYSIA_TRANSIT_API_KEY` | https://developers.malaysiatransit.techmavie.digital | Free |

Each lookup uses one SerpApi search and one Malaysia Transit API call. Add `--json` to see the raw result.

Example (22 Nov 2026; live times change):

```
Kek Lok Si Temple (4.4 stars, 15,511 reviews)
Kek Lok Si Temple, 86s, Jln Balik Pulau, 11500 Ayer Itam, Pulau Pinang, Malaysia

Nearest stop: Klinik Desa Paya Terubong, 442 m away
Next buses:
  - 201 (JETI - PAYA TERUBONG - JETI): 11, 30, 33 and 35 min
Other stops nearby: Ambank Paya Terubong (477 m)
```

**Areas:** `klang-valley`, `penang`, `kangar`, `alor-setar`, `kota-bharu`, `kuala-terengganu`, `melaka`, `johor`, `kuching`, `ipoh`, `seremban`, `kuantan`

## Use it from an AI assistant (MCP)

`mcp-server.js` exposes one tool, `find_buses_near_place`. Add it to your MCP client's config, for example in Claude Desktop:

```json
{
  "mcpServers": {
    "buses-near-place": {
      "command": "node",
      "args": ["/full/path/to/serpapi-malaysia-transit/mcp-server.js"],
      "env": {
        "SERPAPI_API_KEY": "your-serpapi-key",
        "MALAYSIA_TRANSIT_API_KEY": "your-malaysia-transit-key"
      }
    }
  }
}
```

Check it works with `npm run test:mcp`, which lists the tools for free. `npm run test:mcp -- "Kek Lok Si Temple" penang` also calls the tool once.

## Files

- `src/transit.js`: the two API calls and the answer formatting
- `index.js`: the command-line tool
- `mcp-server.js`: the MCP tool
- `test-mcp.js`: a self-test for the MCP tool

## License

MIT, see [LICENSE](LICENSE).
