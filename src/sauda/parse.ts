import { saudaLotInCity } from "./constants.js";
import type { SaudaLot } from "./types.js";
import type { SearchCityKey } from "../etp/constants.js";

function decodeNumeric(html: string): string {
  return html
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)));
}

function decodeNamed(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function stripTags(html: string): string {
  return decodeNamed(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

export function parseKzt(raw: string): number | null {
  const n = Number(raw.replace(/[\s\u00a0]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function parseSaudaListHtml(html: string, page = 1): { lots: SaudaLot[]; total: number; page: number } {
  const decoded = decodeNumeric(html);
  const total = Number(decoded.match(/Найдено:\s*(\d+)/)?.[1] ?? 0);
  const lots: SaudaLot[] = [];
  const seen = new Set<string>();
  const re = /href="\/ru\/list\/(\d+)"/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(decoded))) {
    const id = match[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const chunk = decoded.slice(match.index, match.index + 3800);
    const titleRaw = chunk.match(/name-trade-card[\s\S]{0,280}?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "";
    const title = stripTags(titleRaw);
    const number = chunk.match(/№(\d+)/)?.[1];
    if (!title || !number) continue;

    const text = stripTags(chunk);
    const auctionType =
      text.match(/(?:Аукцион на понижение цены|На понижение цены|Голландский аукцион)(?:\s*\([^)]+\))?/)?.[0] ??
      "";
    const auctionAt = text.match(/(\d{2}\.\d{2}\.\d{4} \d{2}:\d{2})/)?.[1] ?? "";
    const region = text.match(/\d{2}:\d{2}\s+(.+?)(?:\s+₸|\s+Прием)/)?.[1]?.trim() ?? "";
    const priceRaw = text.match(/₸\s*([\d\s\u00a0]+(?:[.,]\d{2})?)/)?.[1];

    lots.push({
      id,
      number,
      title,
      auctionType,
      region,
      start: priceRaw ? parseKzt(priceRaw) : null,
      auctionAt,
      url: `https://sauda.e-qazyna.kz/ru/list/${id}`,
      isDown: /понижен/i.test(auctionType) || /понижен/i.test(text),
    });
  }

  return { lots, total, page };
}

export function saudaMatchesCity(lot: SaudaLot, cityKey: SearchCityKey): boolean {
  return saudaLotInCity(`${lot.region} ${lot.title}`, cityKey);
}

export function saudaMatchesQuery(lot: SaudaLot, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = `${lot.title} ${lot.number} ${lot.region} ${lot.auctionType}`.toLowerCase();
  return tokens.every((token) => hay.includes(token));
}
