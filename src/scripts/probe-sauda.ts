import fs from "node:fs";
import { startSaudaSearch } from "../bot/saudaSession.js";
import { fetchSaudaListPage } from "../sauda/client.js";
import { formatSaudaTable } from "../sauda/messages.js";
import { parseSaudaListHtml, saudaMatchesCity } from "../sauda/parse.js";

function dumpFile(path: string): void {
  const parsed = parseSaudaListHtml(fs.readFileSync(path, "utf8"));
  const ast = parsed.lots.filter((lot) => saudaMatchesCity(lot, "astana"));
  const pvl = parsed.lots.filter((lot) => saudaMatchesCity(lot, "pavlodar"));
  console.log(path, {
    total: parsed.total,
    lots: parsed.lots.length,
    down: parsed.lots.filter((lot) => lot.isDown).length,
    ast: ast.length,
    pvl: pvl.length,
    sample: parsed.lots[0],
  });
}

async function main(): Promise<void> {
  dumpFile(".tmp-sauda-down.html");
  dumpFile(".tmp-sauda-camry.html");

  const live = await fetchSaudaListPage({ query: "camry", page: 1 });
  const ast = live.lots.filter((lot) => saudaMatchesCity(lot, "astana"));
  console.log("live camry", {
    total: live.total,
    lots: live.lots.map((lot) => ({
      n: lot.number,
      region: lot.region,
      start: lot.start,
      title: lot.title.slice(0, 40),
      at: lot.auctionAt,
    })),
  });
  console.log(formatSaudaTable("camry", ast.slice(0, 8), {
    regionNote: "г. Астана",
    page: 0,
    matchedCount: ast.length,
    saudaTotal: live.total,
    hasNext: false,
  }));

  if (process.argv.includes("scan")) {
    const session = await startSaudaSearch(1, "", "both");
    console.log("scan both", {
      total: session.totalFound,
      matched: session.matched.length,
      scanPage: session.scanPage,
      exhausted: session.exhausted,
      rows: session.matched.slice(0, 8).map((lot) => `${lot.number} ${lot.region} ${lot.title.slice(0, 40)}`),
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
