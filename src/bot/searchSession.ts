import { InlineKeyboard } from "grammy";
import { isAucDown, listTrades } from "../etp/client.js";
import { ACTIVE_SEARCH_REGIONS, PASSENGER_CARS_CLASSIFIER_ID } from "../etp/constants.js";
import type { TradeListItem } from "../etp/types.js";

/** Same page size as the site: skip=0, skip=20, skip=40… */
export const ETP_PAGE_SIZE = 20;

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
  page: number;
  etpTotal: number;
  pages: Array<EtpPage | undefined>;
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

const sessions = new Map<number, PagedSearch>();

export function getSearchSession(userId: number): PagedSearch | undefined {
  return sessions.get(userId);
}

export function pagerKeyboard(page: number, hasPrev: boolean, hasNext: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (hasPrev) kb.text("« Назад", "pg:p");
  kb.text(`стр. ${page + 1}`, "pg:noop");
  if (hasNext) kb.text("Далее »", "pg:n");
  return kb;
}

export function currentPage(session: PagedSearch): EtpPage {
  return session.pages[session.page] ?? { skip: session.page * ETP_PAGE_SIZE, down: [], etpCount: 0 };
}

export function pagerState(session: PagedSearch): { hasPrev: boolean; hasNext: boolean } {
  const loaded = currentPage(session);
  const hasPrev = session.page > 0;
  const hasNext = loaded.skip + loaded.etpCount < session.etpTotal;
  return { hasPrev, hasNext };
}

async function fetchEtpPage(session: PagedSearch, page: number): Promise<EtpPage> {
  const cached = session.pages[page];
  if (cached) return cached;

  const skip = page * ETP_PAGE_SIZE;
  const vehicle = looksLikeVehicleQuery(session.etpText, session.extraNeedles);
  const batch = await listTrades({
    skipped: skip,
    limit: ETP_PAGE_SIZE,
    search: {
      fullTextString: session.etpText,
      processStatuses: session.kind === "done" ? ["COMPLETED"] : ["BID_SUBMISSION"],
      destinationRegions: session.kind === "active" ? [...ACTIVE_SEARCH_REGIONS.ids] : undefined,
      procurementClassifier: vehicle ? [PASSENGER_CARS_CLASSIFIER_ID] : undefined,
    },
  });
  session.etpTotal = batch.total;
  const loaded: EtpPage = {
    skip,
    down: batch.items.filter(isAucDown).filter((item) => itemMatchesNeedles(item, session.extraNeedles)),
    etpCount: batch.items.length,
  };
  session.pages[page] = loaded;
  return loaded;
}

export async function startPagedSearch(userId: number, kind: SearchKind, query: string): Promise<PagedSearch> {
  const parsed = parseSearchQuery(query);
  const session: PagedSearch = {
    kind,
    query,
    etpText: parsed.etpText,
    extraNeedles: parsed.extraNeedles,
    page: 0,
    etpTotal: 0,
    pages: [],
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
