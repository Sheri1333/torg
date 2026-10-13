import { SAUDA } from "./constants.js";
import { escapeHtml, formatMoney, truncate } from "../etp/format.js";
import type { SaudaLot } from "./types.js";

const TELEGRAM_HTML_LIMIT = 3900;

function shortLotTitle(title: string): string {
  let text = title
    .replace(/\s+/g, " ")
    .replace(/^(Транспорт|Недвижимость|Прочее|Машины и оборудование|Акции \(АО\)|Доля \(ТОО\)):\s*/i, "")
    .trim();
  return truncate(text, 52);
}

function fitTelegramHtml(lines: string[]): string {
  const copy = [...lines];
  let text = copy.filter((line) => line !== "").join("\n").trim();
  if (text.length <= TELEGRAM_HTML_LIMIT) return text;
  const note = "…часть лотов скрыл — лимит Telegram. Жми Далее.";
  while (copy.length > 10 && text.length + note.length + 1 > TELEGRAM_HTML_LIMIT) {
    copy.pop();
    text = copy.filter((line) => line !== "").join("\n").trim();
  }
  return `${text}\n${note}`.slice(0, 4096);
}

export function formatSaudaTable(
  query: string,
  items: SaudaLot[],
  options: {
    regionNote: string;
    page: number;
    matchedCount: number;
    saudaTotal: number;
    hasNext: boolean;
  },
): string {
  const q = query.trim();
  const pageNo = options.page + 1;
  const lines = [
    q ? `<b>Sauda «${escapeHtml(q)}»</b>` : "<b>Sauda · свежие лоты</b>",
    `${escapeHtml(options.regionNote)}  ·  понижение  ·  стр. ${pageNo}`,
    `показал ${items.length}  ·  нашёл ${options.matchedCount}${options.hasNext ? "+" : ""}  ·  на площадке ${options.saudaTotal}${options.hasNext ? "  ·  есть ещё" : ""}`,
    "",
  ];

  if (items.length === 0) {
    lines.push(
      options.hasNext
        ? "На этом куске нет лотов по городу. Жми Далее — листаю дальше по Sauda."
        : "В выбранном регионе сейчас нет лотов на понижение (приём заявок).",
    );
    return lines.join("\n").trim();
  }

  items.forEach((item, i) => {
    const floor = item.start != null ? Math.round(item.start * 0.5) : null;
    const when = item.auctionAt ? `аукцион ${escapeHtml(item.auctionAt)}` : "время аукциона не указано";
    lines.push(
      `<b>${i + 1}. ${escapeHtml(shortLotTitle(item.title))}</b>`,
      item.region ? escapeHtml(item.region) : "",
      item.start != null ? `старт <b>${formatMoney(item.start)}</b>  ·  пол 50% <b>${formatMoney(floor)}</b>` : "цены нет",
      when,
      `№ ${escapeHtml(item.number)}  ·  <a href="${item.url}">открыть на ${SAUDA.name}</a>`,
      "",
    );
  });

  return fitTelegramHtml(lines);
}
