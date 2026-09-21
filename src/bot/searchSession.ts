import { InlineKeyboard } from "grammy";
import { isAucDown, listTrades } from "../etp/client.js";
import { PASSENGER_CARS_CLASSIFIER_ID, SEARCH_CITIES, type SearchCityKey } from "../etp/constants.js";
import type { TradeListItem } from "../etp/types.js";

/** Site page size when we are not locally filtering extra tokens. */
export const ETP_PAGE_SIZE = 20;
/** Telegram rows per page when year/extra words are filtered locally. */
export const DISPLAY_PAGE_SIZE = 8;
const SCAN_PAGE_SIZE = 100;
const MAX_SCAN_BATCHES = 8;

export type SearchKind = "active" | "done";

export type EtpPage = {
  skip: number;
  down: TradeListItem[];
  etpCount: number;
};

export type PagedSearch = {
  kind: SearchKind;
  query: string;
  etpText: string;
  extraNeedles: string[];
  cityKey?: SearchCityKey;
  regionIds?: string[];
  regionLabel: string;
  page: number;
  etpTotal: number;
  pages: Array<EtpPage | undefined>;
  matched: TradeListItem[];
  scanSkip: number;
  exhausted: boolean;
};

const YEAR_TOKEN = /^(19|20)\d{2}$/;

/** ETP full-text hangs on phrases like "camry 2006". Send one token, filter the rest locally. */
export function parseSearchQuery(query: string): { etpText: string; extraNeedles: string[] } {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { etpText: "", extraNeedles: [] };
  const years = tokens.filter((t) => YEAR_TOKEN.test(t));
  const rest = tokens.filter((t) => !YEAR_TOKEN.test(t));
  if (rest.length <= 1) {
    return { etpText: rest[0] ?? tokens[0] ?? "", extraNeedles: years.map((t) => t.toLowerCase()) };
  }
  const main = rest.reduce((best, token) => (token.length > best.length ? token : best));
  return {
    etpText: main,
    extraNeedles: [...years, ...rest.filter((token) => token !== main)].map((t) => t.toLowerCase()),
  };
}

function itemMatchesNeedles(item: TradeListItem, needles: string[]): boolean {
  if (needles.length === 0) return true;
  const hay = [
    item.title,
    item.registeredNumber,
    item.region,
    ...(item.lots ?? []).flatMap((lot) => [lot.title, lot.goodsDescription]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return needles.every((needle) => hay.includes(needle));
}

function looksLikeVehicleQuery(etpText: string, extraNeedles: string[]): boolean {
  return extraNeedles.some((n) => YEAR_TOKEN.test(n)) && /^[a-z0-9-]+$/i.test(etpText.trim());
}

function usesLocalFilter(session: PagedSearch): boolean {
  return session.extraNeedles.length > 0;
}

const sessions = new Map<number, PagedSearch>();
const pendingActiveSearch = new Map<number, string>();

export function getSearchSession(userId: number): PagedSearch | undefined {
  return sessions.get(userId);
}

export function setPendingActiveSearch(userId: number, query: string): void {
  pendingActiveSearch.set(userId, query);
}

export function takePendingActiveSearch(userId: number): string | undefined {
  const query = pendingActiveSearch.get(userId);
  pendingActiveSearch.delete(userId);
  return query;
}

export function regionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(SEARCH_CITIES.astana.button, "rg:astana")
    .text(SEARCH_CITIES.pavlodar.button, "rg:pavlodar")
    .row()
    .text(SEARCH_CITIES.both.button, "rg:both");
}

export function pagerKeyboard(page: number, hasPrev: boolean, hasNext: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (hasPrev) kb.text("« Назад", "pg:p");
  kb.text(`стр. ${page + 1}`, "pg:noop");
  if (hasNext) kb.text("Далее »", "pg:n");
  return kb;
}

export function currentPage(session: PagedSearch): EtpPage {
  if (usesLocalFilter(session)) {
    const start = session.page * DISPLAY_PAGE_SIZE;
    const down = session.matched.slice(start, start + DISPLAY_PAGE_SIZE);
    return { skip: start, down, etpCount: down.length };
  }
  return session.pages[session.page] ?? { skip: session.page * ETP_PAGE_SIZE, down: [], etpCount: 0 };
}

export function pagerState(session: PagedSearch): { hasPrev: boolean; hasNext: boolean } {
  const hasPrev = session.page > 0;
  if (!usesLocalFilter(session)) {
    const loaded = currentPage(session);
    return { hasPrev, hasNext: loaded.skip + loaded.etpCount < session.etpTotal };
  }
  const filledThrough = (session.page + 1) * DISPLAY_PAGE_SIZE;
  return { hasPrev, hasNext: session.matched.length > filledThrough || !session.exhausted };
}

function searchPayload(session: PagedSearch) {
  const vehicle = looksLikeVehicleQuery(session.etpText, session.extraNeedles);
  return {
    fullTextString: session.etpText,
    processStatuses: session.kind === "done" ? (["COMPLETED"] as string[]) : (["BID_SUBMISSION"] as string[]),
    destinationRegions: session.kind === "active" ? session.regionIds : undefined,
    procurementClassifier: vehicle ? [PASSENGER_CARS_CLASSIFIER_ID] : undefined,
  };
}

async function ensureMatched(session: PagedSearch, needCount: number): Promise<void> {
  let batches = 0;
  while (session.matched.length < needCount && !session.exhausted && batches < MAX_SCAN_BATCHES) {
    const batch = await listTrades({
      skipped: session.scanSkip,
      limit: SCAN_PAGE_SIZE,
      search: searchPayload(session),
    });
    batches += 1;
    session.etpTotal = batch.total;
    session.scanSkip += batch.items.length;
    if (batch.items.length < SCAN_PAGE_SIZE) session.exhausted = true;
    for (const item of batch.items) {
      if (!isAucDown(item) || !itemMatchesNeedles(item, session.extraNeedles)) continue;
      session.matched.push(item);
    }
  }
}

async function fetchEtpPage(session: PagedSearch, page: number): Promise<EtpPage> {
  const cached = session.pages[page];
  if (cached) return cached;

  if (!usesLocalFilter(session)) {
    const skip = page * ETP_PAGE_SIZE;
    const batch = await listTrades({
      skipped: skip,
      limit: ETP_PAGE_SIZE,
      search: searchPayload(session),
    });
    session.etpTotal = batch.total;
    const loaded: EtpPage = {
      skip,
      down: batch.items.filter(isAucDown),
      etpCount: batch.items.length,
    };
    session.pages[page] = loaded;
    return loaded;
  }

  const start = page * DISPLAY_PAGE_SIZE;
  await ensureMatched(session, start + DISPLAY_PAGE_SIZE);
  return currentPage({ ...session, page });
}

export async function startPagedSearch(
  userId: number,
  kind: SearchKind,
  query: string,
  cityKey?: SearchCityKey,
): Promise<PagedSearch> {
  const parsed = parseSearchQuery(query);
  const city = kind === "active" ? SEARCH_CITIES[cityKey ?? "both"] : undefined;
  const session: PagedSearch = {
    kind,
    query,
    etpText: parsed.etpText,
    extraNeedles: parsed.extraNeedles,
    cityKey: kind === "active" ? (cityKey ?? "both") : undefined,
    regionIds: city ? [...city.ids] : undefined,
    regionLabel: city?.label ?? "все регионы",
    page: 0,
    etpTotal: 0,
    pages: [],
    matched: [],
    scanSkip: 0,
    exhausted: false,
  };
  await fetchEtpPage(session, 0);
  sessions.set(userId, session);
  return session;
}

export async function turnSearchPage(userId: number, dir: -1 | 1): Promise<PagedSearch | undefined> {
  const session = sessions.get(userId);
  if (!session) return undefined;
  const next = session.page + dir;
  if (next < 0) return session;
  if (dir > 0) {
    const { hasNext } = pagerState(session);
    if (!hasNext) return session;
  }
  await fetchEtpPage(session, next);
  session.page = next;
  return session;
}
