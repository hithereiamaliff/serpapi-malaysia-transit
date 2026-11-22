/**
 * Command line: find live buses near a place.
 *
 *   npm start -- "Kek Lok Si Temple" --area penang
 *
 * The area defaults to penang. Run with --help to list all areas.
 */
import { parseArgs } from "node:util";
import { AREAS, findBusesNearPlace, formatAnswer } from "./src/transit.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    area: { type: "string", default: "penang" },
    json: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

const place = positionals.join(" ").trim();

if (values.help || !place) {
  console.log('Usage: npm start -- "<place name>" [--area <area>] [--json]');
  console.log(`Areas: ${Object.keys(AREAS).join(", ")}`);
  process.exit(place || values.help ? 0 : 1);
}

if (!AREAS[values.area]) {
  console.error(`Unknown area "${values.area}". Pick one of: ${Object.keys(AREAS).join(", ")}`);
  process.exit(1);
}

try {
  const result = await findBusesNearPlace(place, values.area);
  // --json prints the raw result, handy when building on top of it.
  console.log(values.json ? JSON.stringify(result, null, 2) : formatAnswer(result));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
