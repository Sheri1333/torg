import { Bot, GrammyError, HttpError } from "grammy";
import { config } from "../config.js";
import { ETP_ADILET } from "../etp/constants.js";
import { getTradeDetail, listTrades, searchTradesPage, tradePublicUrl } from "../etp/client.js";
import { formatCompletedSearchHeader, formatSearchHeader } from "../etp/messages.js";
import { escapeHtml } from "../etp/format.js";
import { sendCompletedTrade, sendTradeDetailView, sendTradePreview } from "./sendMedia.js";
import { addWatch, listWatched, removeWatch } from "../storage/watchlist.js";

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
        "/search hyundai — поиск по тексту в текущих лотах",
        "/searchdone Camry 2006 — состоявшиеся торги, фото и цена продажи из выписки",
        "/lot 113333229 — карточка торга по id или ссылке",
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
        "Команды: /search, /searchdone Camry 2006, /lot, /watch, /watching, /unwatch.",
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
    await ctx.reply(query ? `Ищу «${query}»…` : "Загружаю актуальные лоты…");

    try {
      if (query) {
        const found = await searchTradesPage(query, { limit: 8 });
        if (found.items.length === 0) {
          await ctx.reply("Ничего не нашёл в текущих лотах (приём заявок). Попробуй другое слово, /searchdone или /lot <id>.");
          return;
        }
        await ctx.reply(formatSearchHeader(query, found.items.length, found.total), { parse_mode: "HTML" });
        for (const item of found.items) {
          await sendTradePreview(ctx, item);
        }
        return;
      }

      const page = await listTrades({ skipped: 0, limit: 8 });
      await ctx.reply(formatSearchHeader("", page.items.length, page.total), { parse_mode: "HTML" });
      for (const item of page.items) {
        await sendTradePreview(ctx, item);
      }
    } catch (error) {
      console.error(error);
      await ctx.reply("Не удалось получить список с ETP.Adilet. Попробуй позже.");
    }
  });

  bot.command("searchdone", async (ctx) => {
    const query = extractArg(ctx.message?.text);
    if (!query) {
      await ctx.reply("Укажи запрос, например:\n/searchdone Camry 2006\nИщу только состоявшиеся торги, фото и цену продажи из выписки.");
      return;
    }

    await ctx.reply(`Ищу состоявшиеся торги «${query}»… Может занять до минуты.`);
    try {
      const page = await searchTradesPage(query, { limit: 5, processStatuses: ["COMPLETED"] });
      if (page.items.length === 0) {
        await ctx.reply("Среди состоявшихся торгов ничего не нашёл. Попробуй другое слово.");
        return;
      }
      await ctx.reply(formatCompletedSearchHeader(query, page.items.length, page.total), {
        parse_mode: "HTML",
      });
      for (const item of page.items) {
        try {
          await sendCompletedTrade(ctx, item);
        } catch (error) {
          console.error(error);
          await ctx.reply(`Не разобрал торг ${item.id}. Открой вручную: ${tradePublicUrl(item.id)}`);
        }
      }
      if (page.total > page.items.length) {
        await ctx.reply(`Это первые ${page.items.length} из ${page.total}. Уточни модель/год, если нужно сузить.`);
      }
    } catch (error) {
      console.error(error);
      await ctx.reply("Не удалось получить состоявшиеся торги. Попробуй позже.");
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
