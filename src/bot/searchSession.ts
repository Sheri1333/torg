import { InlineKeyboard } from "grammy";
import { collectAucDownLots } from "../etp/client.js";
import { ACTIVE_SEARCH_REGIONS } from "../etp/constants.js";
import type { TradeListItem } from "../etp/types.js";

export const SEARCH_PAGE_SIZE = 8;

export type SearchKind = "active" | "done";

export type PagedSearch = {
  kind: SearchKind;
  query: string;
  page: number;
  items: TradeListItem[];
  etpSkipped: number;
  exhausted: boolean;
};

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

export function pageSlice(session: PagedSearch): TradeListItem[] {
  const start = session.page * SEARCH_PAGE_SIZE;
  return session.items.slice(start, start + SEARCH_PAGE_SIZE);
}

export function pagerState(session: PagedSearch): { hasPrev: boolean; hasNext: boolean } {
  const start = session.page * SEARCH_PAGE_SIZE;
  const hasPrev = session.page > 0;
  const hasNext = session.items.length > start + SEARCH_PAGE_SIZE || !session.exhausted;
  return { hasPrev, hasNext };
}

async function ensureItems(session: PagedSearch, need: number): Promise<void> {
  while (session.items.length < need && !session.exhausted) {
    const want = need - session.items.length;
    const got = await collectAucDownLots({
      query: session.query,
      processStatuses: session.kind === "done" ? ["COMPLETED"] : ["BID_SUBMISSION"],
      destinationRegions: session.kind === "active" ? [...ACTIVE_SEARCH_REGIONS.ids] : undefined,
      afterSkipped: session.etpSkipped,
      want,
      maxBatches: 25,
    });
    session.etpSkipped = got.nextSkipped;
    session.exhausted = got.exhausted;
    const known = new Set(session.items.map((item) => item.id));
    for (const item of got.items) {
      if (known.has(item.id)) continue;
      known.add(item.id);
      session.items.push(item);
    }
    if (got.items.length === 0) break;
  }
}

export async function startPagedSearch(userId: number, kind: SearchKind, query: string): Promise<PagedSearch> {
  const session: PagedSearch = {
    kind,
    query,
    page: 0,
    items: [],
    etpSkipped: 0,
    exhausted: false,
  };
  await ensureItems(session, SEARCH_PAGE_SIZE);
  sessions.set(userId, session);
  return session;
}

export async function turnSearchPage(userId: number, dir: -1 | 1): Promise<PagedSearch | undefined> {
  const session = sessions.get(userId);
  if (!session) return undefined;
  const next = session.page + dir;
  if (next < 0) return session;
  if (dir > 0) {
    await ensureItems(session, (next + 1) * SEARCH_PAGE_SIZE);
    if (next * SEARCH_PAGE_SIZE >= session.items.length) return session;
  }
  session.page = next;
  return session;
}
