import { InlineKeyboard } from "grammy";
import { SEARCH_CITIES, type SearchCityKey } from "../etp/constants.js";
import { fetchSaudaListPage } from "../sauda/client.js";
import { saudaMatchesCity } from "../sauda/parse.js";
import type { SaudaLot } from "../sauda/types.js";

export const SAUDA_DISPLAY_PAGE_SIZE = 8;
const MAX_SCAN_BATCHES = 8;

export type SaudaSession = {
  query: string;
  cityKey: SearchCityKey;
  regionLabel: string;
  page: number;
  matched: SaudaLot[];
  scanPage: number;
  totalFound: number;
  exhausted: boolean;
};

const sessions = new Map<number, SaudaSession>();
const pending = new Map<number, string>();

export function getSaudaSession(userId: number): SaudaSession | undefined {
  return sessions.get(userId);
}

export function setPendingSaudaSearch(userId: number, query: string): void {
  pending.set(userId, query);
}

export function takePendingSaudaSearch(userId: number): string | undefined {
  const query = pending.get(userId);
  pending.delete(userId);
  return query;
}

export function saudaRegionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(SEARCH_CITIES.astana.button, "sg:astana")
    .text(SEARCH_CITIES.pavlodar.button, "sg:pavlodar")
    .row()
    .text(SEARCH_CITIES.both.button, "sg:both");
}

export function saudaPagerKeyboard(page: number, hasPrev: boolean, hasNext: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (hasPrev) kb.text("« Назад", "sg:p");
  kb.text(`стр. ${page + 1}`, "sg:noop");
  if (hasNext) kb.text("Далее »", "sg:n");
  return kb;
}

export function currentSaudaPage(session: SaudaSession): SaudaLot[] {
  const start = session.page * SAUDA_DISPLAY_PAGE_SIZE;
  return session.matched.slice(start, start + SAUDA_DISPLAY_PAGE_SIZE);
}

export function saudaPagerState(session: SaudaSession): { hasPrev: boolean; hasNext: boolean } {
  const filledThrough = (session.page + 1) * SAUDA_DISPLAY_PAGE_SIZE;
  return {
    hasPrev: session.page > 0,
    hasNext: session.matched.length > filledThrough || !session.exhausted,
  };
}

async function ensureMatched(session: SaudaSession, needCount: number): Promise<void> {
  let batches = 0;
  const seen = new Set(session.matched.map((lot) => lot.id));
  while (session.matched.length < needCount && !session.exhausted && batches < MAX_SCAN_BATCHES) {
    const nextPage = session.scanPage + 1;
    const batch = await fetchSaudaListPage({ page: nextPage, query: session.query });
    batches += 1;
    session.scanPage = nextPage;
    session.totalFound = batch.total;
    const fresh = batch.lots.filter((lot) => lot.isDown && lot.title);
    if (fresh.length === 0 || nextPage * 20 >= batch.total) {
      session.exhausted = true;
    }
    for (const lot of fresh) {
      if (seen.has(lot.id) || !saudaMatchesCity(lot, session.cityKey)) continue;
      seen.add(lot.id);
      session.matched.push(lot);
    }
  }
}

export async function startSaudaSearch(
  userId: number,
  query: string,
  cityKey: SearchCityKey,
): Promise<SaudaSession> {
  const city = SEARCH_CITIES[cityKey];
  const session: SaudaSession = {
    query: query.trim(),
    cityKey,
    regionLabel: city.label,
    page: 0,
    matched: [],
    scanPage: 0,
    totalFound: 0,
    exhausted: false,
  };
  await ensureMatched(session, SAUDA_DISPLAY_PAGE_SIZE);
  sessions.set(userId, session);
  return session;
}

export async function turnSaudaPage(userId: number, dir: -1 | 1): Promise<SaudaSession | undefined> {
  const session = sessions.get(userId);
  if (!session) return undefined;
  const next = session.page + dir;
  if (next < 0) return session;
  if (dir > 0) {
    const { hasNext } = saudaPagerState(session);
    if (!hasNext) return session;
    await ensureMatched(session, (next + 1) * SAUDA_DISPLAY_PAGE_SIZE);
  }
  session.page = next;
  return session;
}
