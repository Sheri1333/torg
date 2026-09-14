import { getTradeDetail, listTrades, searchTrades } from "../etp/client.js";

async function main() {
  console.log("== list ==");
  const list = await listTrades({ skipped: 0, limit: 3 });
  console.log({ total: list.total, sample: list.items.map((i) => ({ id: i.id, num: i.registeredNumber, status: i.processStatus.title })) });

  const id = process.argv[2] ?? "113333229";
  console.log("== detail", id, "==");
  const detail = await getTradeDetail(id);
  console.log({
    id: detail.id,
    title: detail.title,
    status: detail.status,
    lots: detail.lots.map((l) => ({
      number: l.number,
      price: l.initialPrice,
      assurance: l.assuranceAmount,
      photos: l.photos.length,
    })),
    url: detail.url,
  });

  console.log("== search hyundai ==");
  const found = await searchTrades("hyundai", { limit: 3, maxPages: 3 });
  console.log(found.map((i) => ({ id: i.id, title: i.title.slice(0, 80) })));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
