import { Bot, GrammyError, HttpError } from "grammy";
import type { Context } from "grammy";
import { config } from "../config.js";
import { ETP_ADILET, ACTIVE_SEARCH_REGIONS } from "../etp/constants.js";
import { getTradeDetail, loadProtocolResult, tradePublicUrl } from "../etp/client.js";
import { formatCompletedTable, formatSearchTable, type CompletedTableRow } from "../etp/messages.js";
import { escapeHtml } from "../etp/format.js";
import { sendTradeDetailView } from "./sendMedia.js";
import {
  getSearchSession,
  pageSlice,
  pagerKeyboard,
  pagerState,
  SEARCH_PAGE_SIZE,
  startPagedSearch,
  turnSearchPage,
  type PagedSearch,
} from "./searchSession.js";
import { addWatch, listWatched, removeWatch } from "../storage/watchlist.js";
import type { TradeListItem } from "../etp/types.js";

function extractArg(text: string | undefined): string {
  if (!text) return "";
  const parts = text.trim().split(/\s+/);
  return parts.slice(1).join(" ").trim();
}

function parseTradeId(input: string): string | null {
  const fromUrl = input.match(/trades\/(\d+)/);
  if (fromUrl?.[1]) return fromUrl[1];
  const digits = input.replace(/\D/g, "");
  return digits || null;
}

const htmlOpts = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

async function enrichCompleted(items: TradeListItem[]): Promise<CompletedTableRow[]> {
  const rows: CompletedTableRow[] = [];
  for (const item of items) {
    try {
      const detail = await getTradeDetail(item.id);
      const protocol = await loadProtocolResult(detail);
      const start = protocol?.startPrice ?? item.lots?.[0]?.initialContractPrice ?? item.initialContractPrice;
      const sale = protocol?.salePrice ?? null;
      const pct = sale != null && start ? Math.round((sale / start) * 1000) / 10 : null;
      rows.push({ item, start, sale, pct });
    } catch (error) {
      console.error(error);
      rows.push({ item, start: item.initialContractPrice, sale: null, pct: null });
    }
  }
  return rows;
}

async function renderPagedSearch(ctx: Context, session: PagedSearch, edit: boolean): Promise<void> {
  const slice = pageSlice(session);
  const { hasPrev, hasNext } = pagerState(session);
  const keyboard = pagerKeyboard(session.page, hasPrev, hasNext);
  const offset = session.page * SEARCH_PAGE_SIZE;
  const html =
    session.kind === "active"
      ? formatSearchTable(session.query, slice, {
          regionNote: ACTIVE_SEARCH_REGIONS.label,
          page: session.page,
          offset,
          hasNext,
        })
      : formatCompletedTable(session.query, await enrichCompleted(slice), {
          page: session.page,
          offset,
          hasNext,
        });
  const extra = { ...htmlOpts, reply_markup: keyboard };
  if (edit) {
    try {
      await ctx.editMessageText(html, extra);
    } catch (error) {
      if (!(error instanceof GrammyError && /not modified/i.test(error.description))) {
        throw error;
      }
    }
    return;
  }
  await ctx.reply(html, extra);
}

export function createBot(token: string): Bot {
  const bot = new Bot(token);

  bot.use(async (ctx, next) => {
    if (config.allowedUserIds.length === 0) return next();
    const uid = ctx.from?.id;
    if (!uid || !config.allowedUserIds.includes(uid)) {
      await ctx.reply("Доступ ограничен. Добавь свой Telegram id в ALLOWED_USER_IDS.");
      return;
    }
    return next();
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      [
        `Привет! Это бот по торгам <b>${ETP_ADILET.name}</b>.`,
        "",
        `${ETP_ADILET.purpose}.`,
        `Площадка: ${ETP_ADILET.url}`,
        "",
        "Сейчас подключена только ETP.Adilet (арестантское имущество).",
        "",
        "Команды:",
        "/search — свежие лоты (приём заявок)",
        "/search hyundai — таблица: Астана и Павлодар, только на понижение",
        "/searchdone Camry 2006 — состоявшиеся, все регионы, только на понижение",
        "/lot 113333229 — фото, выписка и карточка одного торга",
        "/watch 113333229 — добавить в избранное",
        "/watching — список избранного",
        "/unwatch 113333229 — убрать из избранного",
        "/help — справка",
      ].join("\n"),
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        `<b>${ETP_ADILET.name}</b>`,
        `Оператор: ${ETP_ADILET.operator}`,
        `Гарантийный взнос: ${ETP_ADILET.guaranteeTypical}`,
        ETP_ADILET.commission,
        `Доступ: ${ETP_ADILET.needs}`,
        "",
        "Команды: /search hyundai, /searchdone Camry 2006, /lot, /watch.",
        "/search — Астана и Павлодар, только на понижение, таблица с кнопкой Далее.",
        "/searchdone — состоявшиеся, все регионы, только на понижение, тоже с пагинацией.",
        "/lot — фото и выписка по одному лоту.",
        "",
        "Важно: бот читает публичные данные площадки. Подача заявок и ЭЦП — только на сайте.",
        "",
        `Каталог: ${ETP_ADILET.tradesUrl}`,
      ].join("\n"),
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    );
  });

  bot.command("search", async (ctx) => {
    const query = extractArg(ctx.message?.text);
    const uid = ctx.from?.id;
    if (!uid) return;
    await ctx.reply(query ? `Ищу «${query}» в Астане и Павлодаре…` : "Загружаю лоты по Астане и Павлодару…");

    try {
      const session = await startPagedSearch(uid, "active", query);
      if (session.items.length === 0) {
        await ctx.reply(
          query
            ? `В Астане и Павлодаре по «${query}» нет лотов на понижение (приём заявок).`
            : "В Астане и Павлодаре сейчас нет лотов на понижение (приём заявок).",
        );
        return;
      }
      await renderPagedSearch(ctx, session, false);
    } catch (error) {
      console.error(error);
      await ctx.reply("Не удалось получить список с ETP.Adilet. Попробуй позже.");
    }
  });

  bot.command("searchdone", async (ctx) => {
    const query = extractArg(ctx.message?.text);
    const uid = ctx.from?.id;
    if (!uid) return;
    if (!query) {
      await ctx.reply("Укажи запрос, например:\n/searchdone Hyundai\nСостоявшиеся торги по всем регионам, листать кнопкой Далее.");
      return;
    }

    await ctx.reply(`Ищу состоявшиеся «${query}» по всем регионам…`);
    try {
      const session = await startPagedSearch(uid, "done", query);
      if (session.items.length === 0) {
        await ctx.reply("Среди состоявшихся торгов ничего не нашёл. Попробуй другое слово.");
        return;
      }
      await renderPagedSearch(ctx, session, false);
    } catch (error) {
      console.error(error);
      await ctx.reply("Не удалось получить состоявшиеся торги. Попробуй позже.");
    }
  });

  bot.callbackQuery("pg:noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^pg:(p|n)$/, async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    if (!getSearchSession(uid)) {
      await ctx.answerCallbackQuery({ text: "Запусти поиск заново: /search", show_alert: true });
      return;
    }
    const dir = ctx.callbackQuery.data === "pg:n" ? 1 : -1;
    await ctx.answerCallbackQuery({ text: dir > 0 ? "Следующая страница…" : "Назад" });
    try {
      const session = await turnSearchPage(uid, dir);
      if (!session) {
        await ctx.reply("Запусти поиск заново: /search");
        return;
      }
      await renderPagedSearch(ctx, session, true);
    } catch (error) {
      console.error(error);
      await ctx.reply("Не удалось открыть страницу. Попробуй /search ещё раз.");
    }
  });

  bot.command("lot", async (ctx) => {
    const raw = extractArg(ctx.message?.text);
    const id = parseTradeId(raw);
    if (!id) {
      await ctx.reply("Укажи id или ссылку, например:\n/lot 113333229\n/lot https://etp.adilet.gov.kz/trades/113333229/info?page=sales");
      return;
    }

    await ctx.reply(`Открываю торг ${id}…`);
    try {
      const detail = await getTradeDetail(id);
      await sendTradeDetailView(ctx, detail);
    } catch (error) {
      console.error(error);
      await ctx.reply(`Не нашёл торг ${id}. Проверь id или открой вручную: ${tradePublicUrl(id)}`);
    }
  });

  bot.command("watch", async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const id = parseTradeId(extractArg(ctx.message?.text));
    if (!id) {
      await ctx.reply("Пример: /watch 113333229");
      return;
    }
    try {
      const detail = await getTradeDetail(id);
      const result = await addWatch(uid, {
        tradeId: detail.id,
        title: detail.title,
      });
      if (!result.ok && result.reason === "already") {
        await ctx.reply("Уже в избранном.");
        return;
      }
      await ctx.reply(
        `Добавил в избранное:\n<b>${escapeHtml(detail.title)}</b>\n${detail.url}`,
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } },
      );
    } catch (error) {
      console.error(error);
      await ctx.reply("Не удалось добавить. Проверь id торга.");
    }
  });

  bot.command("unwatch", async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const id = parseTradeId(extractArg(ctx.message?.text));
    if (!id) {
      await ctx.reply("Пример: /unwatch 113333229");
      return;
    }
    const removed = await removeWatch(uid, Number(id));
    await ctx.reply(removed ? `Убрал ${id} из избранного.` : "Такого id в избранном нет.");
  });

  bot.command("watching", async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) return;
    const items = await listWatched(uid);
    if (items.length === 0) {
      await ctx.reply("Избранное пусто. Добавь через /watch <id>.");
      return;
    }
    const lines = items.map(
      (item, idx) =>
        `${idx + 1}. <b>${escapeHtml(item.title)}</b>\nid <code>${item.tradeId}</code>\n${tradePublicUrl(item.tradeId)}`,
    );
    await ctx.reply(lines.join("\n\n"), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    const e = err.error;
    if (e instanceof GrammyError) {
      console.error("Grammy error:", e.description);
    } else if (e instanceof HttpError) {
      console.error("Telegram HTTP error:", e);
    } else {
      console.error("Unknown error:", e);
    }
  });

  return bot;
}
