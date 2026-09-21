import { ETP_ADILET } from "./constants.js";
import { estimateDeal, verdictLabel, type DealEstimate } from "./dealEstimate.js";
import { escapeHtml, formatCompactMoney, formatDate, formatMoney, truncate } from "./format.js";
import type { ProtocolResult, TradeDetail, TradeListItem } from "./types.js";
import { tradePublicUrl } from "./client.js";

export function formatTradeCard(item: TradeListItem): string {
  const lot = item.lots?.[0];
  const price = lot?.initialContractPrice ?? item.initialContractPrice;
  const categories = (item.procurementClassifiers ?? []).map((c) => c.title).join(", ");

  const deal = estimateDeal({ start: price, region: item.region });
  return [
    `<b>${escapeHtml(truncate(item.title, 120))}</b>`,
    `№ <code>${escapeHtml(item.registeredNumber)}</code> · id <code>${item.id}</code>`,
    `Статус: ${escapeHtml(item.processStatus?.title ?? "—")}`,
    item.region ? `Регион: ${escapeHtml(item.region)}` : null,
    categories ? `Категория: ${escapeHtml(categories)}` : null,
    `Стартовая цена: <b>${formatMoney(price)}</b>`,
    item.assuranceAmount != null ? `Гарантия: ${formatMoney(item.assuranceAmount)}` : null,
    item.bidSubmissionEndDate ? `Приём заявок до: ${formatDate(item.bidSubmissionEndDate)}` : null,
    item.tradeStartDate ? `Старт торгов: ${formatDate(item.tradeStartDate)}` : null,
    item.timeToFinish ? `Осталось: ${escapeHtml(item.timeToFinish)}` : null,
    deal ? formatDealDetail(deal) : null,
    `<a href="${tradePublicUrl(item.id)}">Открыть на ETP.Adilet</a>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatTradeDetail(detail: TradeDetail, protocol?: ProtocolResult | null): string {
  const lot = detail.lots[0];
  const start = protocol?.startPrice ?? lot?.initialPrice;
  const sale = protocol?.salePrice;
  const deal = estimateDeal({
    start,
    actualBuy: sale,
    region: `${lot?.location ?? ""} ${detail.address ?? ""}`,
  });
  let priceLines: string[] = [`Стартовая цена: <b>${formatMoney(start)}</b>`];
  if (sale != null && start) {
    const pct = ((sale / start) * 100).toFixed(1);
    priceLines = [
      `Стартовая цена: ${formatMoney(start)}`,
      `Продана за: <b>${formatMoney(sale)}</b>`,
      `К старту: <b>${pct}%</b>`,
    ];
  } else if (sale != null) {
    priceLines = [`Продана за: <b>${formatMoney(sale)}</b>`];
  }

  const lines = [
    `<b>${escapeHtml(truncate(detail.title, 160))}</b>`,
    `id <code>${detail.id}</code>`,
    detail.status ? `Статус: ${escapeHtml(detail.status)}` : null,
    detail.organizer ? `Оператор: ${escapeHtml(detail.organizer)}` : null,
    detail.courtOfficerName ? `СИ: ${escapeHtml(detail.courtOfficerName)}` : null,
    detail.courtOfficerOrg ? `Отдел: ${escapeHtml(detail.courtOfficerOrg)}` : null,
    detail.phone ? `Телефон: ${escapeHtml(detail.phone)}` : null,
    "",
    lot
      ? [
          `<b>Лот ${escapeHtml(lot.number || "1")}</b>`,
          escapeHtml(truncate(lot.title || lot.goodsDescription || "", 220)),
          lot.location ? `Место: ${escapeHtml(truncate(lot.location, 120))}` : null,
          ...priceLines,
          deal ? formatDealDetail(deal) : null,
          protocol?.winner ? `Победитель: ${escapeHtml(protocol.winner)}` : null,
          protocol?.note ? escapeHtml(protocol.note) : null,
          lot.assurancePercent != null
            ? `Гарантия: ${lot.assurancePercent}% (${formatMoney(lot.assuranceAmount)})`
            : lot.assuranceAmount != null
              ? `Гарантия: ${formatMoney(lot.assuranceAmount)}`
              : null,
          lot.status?.title ? `Статус лота: ${escapeHtml(lot.status.title)}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      : "Лоты не найдены",
    "",
    detail.bidAssuranceTerms
      ? `Реквизиты взноса:\n<code>${escapeHtml(truncate(detail.bidAssuranceTerms, 280))}</code>`
      : null,
    `<a href="${detail.url}">Карточка на ${ETP_ADILET.name}</a>`,
  ];

  return lines.filter(Boolean).join("\n");
}

export function formatSearchHeader(query: string, count: number, totalHint?: number): string {
  const q = query.trim();
  if (q) {
    return `Найдено по «${escapeHtml(q)}»: ${count}${totalHint != null ? ` из ${totalHint}` : ""}`;
  }
  return `Активные торги (приём заявок): показано ${count}`;
}

function formatDealCompact(deal: DealEstimate): string {
  const buy = deal.buyIsActual
    ? `Купили: <b>${formatCompactMoney(deal.buyUsed)}</b>`
    : `Купить: <b>${formatCompactMoney(deal.buyTypical)}</b>  ·  пол ${formatCompactMoney(deal.buyFloor)}`;
  const profitWord = deal.profitTypical >= 0 ? "Выгода" : "Минус";
  return [
    buy,
    `Расходы: ${formatCompactMoney(deal.extraCosts)}  ·  ремонт ${formatCompactMoney(deal.repair)}, эвакуатор ${formatCompactMoney(deal.evac)}, учёт ${formatCompactMoney(deal.registration)}`,
    `${profitWord}: <b>${formatCompactMoney(deal.profitTypical)}</b>  ·  ${verdictLabel(deal.verdict)}`,
  ].join("\n");
}

function formatDealDetail(deal: DealEstimate): string {
  const buyLine = deal.buyIsActual
    ? `Цена покупки (выписка): <b>${formatMoney(deal.buyUsed)}</b>`
    : [
        `Купить в теории (58%): <b>${formatMoney(deal.buyTypical)}</b>`,
        `Пол (50%): ${formatMoney(deal.buyFloor)}  ·  медиана (70%): ${formatMoney(deal.buyMedian)}`,
      ].join("\n");
  const profitLabel = deal.profitTypical >= 0 ? "Выгода" : "Минус";
  return [
    "<blockquote><b>Оценка сделки</b> · не цена Kolesa",
    buyLine,
    `Взнос 5%: ${formatMoney(deal.deposit)}  ·  доплата за 5 дней: ${formatMoney(deal.remainderTypical)}`,
    `Ремонт ~${formatMoney(deal.repair)}  ·  эвакуатор ${formatMoney(deal.evac)}  ·  учёт ${formatMoney(deal.registration)}`,
    `Расходы кроме цены: ${formatMoney(deal.extraCosts)}`,
    `Продажа осторожно (90% оценки): ${formatMoney(deal.resale)}`,
    `${profitLabel}: <b>${formatMoney(deal.profitTypical)}</b>  ·  ${verdictLabel(deal.verdict)}`,
    `Если взять на полу: ${formatMoney(deal.profitFloor)}</blockquote>`,
  ].join("\n");
}

function shortLotTitle(title: string): string {
  let text = title
    .replace(/\s+/g, " ")
    .replace(/^Объект:\s*/i, "")
    .replace(/^Автотранспортное\s+средство\s*/i, "")
    .replace(/^Легковые автомобили,?\s*/i, "")
    .trim();
  text = text.split(/ состоящ/i)[0] ?? text;
  text = text.split(/,\s*с кадастровым/i)[0] ?? text;
  text = text.replace(/\s*\([^)]{24,}\)[^.]*$/, "").trim();
  return truncate(text, 52);
}

function formatResultCard(options: {
  index: number;
  title: string;
  region?: string;
  registeredNumber: string;
  id: number;
  start?: number;
  saleNote?: string;
  deal: DealEstimate | null;
}): string[] {
  const money = options.deal ? formatDealCompact(options.deal) : "нет стартовой цены — оценку не посчитал";
  return [
    `<b>${options.index}. ${escapeHtml(shortLotTitle(options.title))}</b>`,
    [
      options.region ? escapeHtml(options.region) : null,
      options.start != null ? `старт <b>${formatMoney(options.start)}</b>` : null,
      options.saleNote,
    ]
      .filter(Boolean)
      .join("  ·  "),
    `<blockquote>${money}</blockquote>`,
    `№ ${escapeHtml(options.registeredNumber)}  ·  /lot ${options.id}  ·  <a href="${tradePublicUrl(options.id)}">ETP</a>`,
    "",
  ];
}

const TELEGRAM_HTML_LIMIT = 3900;

function fitTelegramHtml(lines: string[]): string {
  const copy = [...lines];
  let text = copy.filter((line) => line !== "").join("\n").trim();
  if (text.length <= TELEGRAM_HTML_LIMIT) return text;
  const note = "…часть лотов скрыл — лимит Telegram. Жми Далее или /lot.";
  while (copy.length > 10 && text.length + note.length + 1 > TELEGRAM_HTML_LIMIT) {
    copy.pop();
    text = copy.filter((line) => line !== "").join("\n").trim();
  }
  return `${text}\n${note}`.slice(0, 4096);
}

export function formatSearchTable(
  query: string,
  items: TradeListItem[],
  options: {
    regionNote: string;
    page: number;
    skip: number;
    etpCount: number;
    etpTotal: number;
    hasNext: boolean;
  },
): string {
  const q = query.trim();
  const pageNo = options.page + 1;
  const lines = [
    q ? `<b>Поиск «${escapeHtml(q)}»</b>` : "<b>Свежие лоты</b>",
    `${escapeHtml(options.regionNote)}  ·  понижение  ·  стр. ${pageNo}`,
    `на понижение ${items.length} из ${options.etpCount}  ·  всего ${options.etpTotal}${options.hasNext ? "  ·  есть ещё" : ""}`,
    "<i>Купить ≈ 58% старта, пол 50%. Выгода = 90% оценки − покупка − ремонт/эвакуатор/учёт. Не Kolesa.</i>",
    "",
  ];

  if (items.length === 0) {
    lines.push("На этой странице нет лотов на понижение. Нажми Далее.");
    return lines.join("\n").trim();
  }

  items.forEach((item, i) => {
    const price = item.lots?.[0]?.initialContractPrice ?? item.initialContractPrice;
    lines.push(
      ...formatResultCard({
        index: i + 1,
        title: item.title,
        region: item.region,
        registeredNumber: item.registeredNumber,
        id: item.id,
        start: price,
        deal: estimateDeal({ start: price, region: item.region }),
      }),
    );
  });

  return fitTelegramHtml(lines);
}

export type CompletedTableRow = {
  item: TradeListItem;
  start?: number;
  sale?: number | null;
  pct?: number | null;
  pending?: boolean;
};

export function formatCompletedTable(
  query: string,
  rows: CompletedTableRow[],
  options: {
    page: number;
    skip: number;
    etpCount: number;
    etpTotal: number;
    hasNext: boolean;
    matchedCount?: number;
    filtered?: boolean;
  },
): string {
  const pageNo = options.page + 1;
  const stats = options.filtered
    ? `стр. ${pageNo}  ·  ${rows.length} лотов  ·  нашёл ${options.matchedCount ?? rows.length}${options.hasNext ? "+" : ""}`
    : `стр. ${pageNo}  ·  на понижение ${rows.length} из ${options.etpCount}  ·  всего ${options.etpTotal}${options.hasNext ? "  ·  есть ещё" : ""}`;
  const lines = [
    `<b>Состоявшиеся «${escapeHtml(query)}»</b>`,
    `все регионы  ·  понижение  ·  ${stats}`,
    "<i>Выгода = 90% оценки − цена из выписки − ремонт/эвакуатор/учёт.</i>",
    "",
  ];

  if (rows.length === 0) {
    lines.push(
      options.hasNext
        ? "На этом куске выдачи нет совпадений на понижение. Нажми Далее."
        : "Совпадений на понижение не осталось.",
    );
    return lines.join("\n").trim();
  }

  rows.forEach((row, i) => {
    const { item, start, sale, pct } = row;
    const startPrice = start ?? item.initialContractPrice;
    const saleNote =
      sale != null && pct != null
        ? `ушла <b>${formatCompactMoney(sale)}</b> (${pct}%)`
        : sale != null
          ? `ушла <b>${formatCompactMoney(sale)}</b>`
          : row.pending
            ? "читаю выписку…"
            : "цену в выписке не разобрал";
    lines.push(
      ...formatResultCard({
        index: i + 1,
        title: item.title,
        region: item.region,
        registeredNumber: item.registeredNumber,
        id: item.id,
        start: startPrice,
        saleNote,
        deal: estimateDeal({ start: startPrice, actualBuy: sale, region: item.region }),
      }),
    );
  });

  return fitTelegramHtml(lines);
}

export function formatCompletedSearchHeader(query: string, shown: number, total: number): string {
  return [
    `Состоявшиеся торги по «${escapeHtml(query)}»: показано ${shown} из ${total}.`,
    "В карточке — стартовая цена и <b>за сколько ушла</b> по выписке из протокола.",
  ].join("\n");
}

export function formatCompletedCard(
  item: TradeListItem,
  detail: TradeDetail,
  protocol?: ProtocolResult | null,
): string {
  const lot = item.lots?.[0];
  const detailLot = detail.lots[0];
  const start = protocol?.startPrice ?? lot?.initialContractPrice ?? item.initialContractPrice ?? detailLot?.initialPrice;
  const sale = protocol?.salePrice;
  const down = lot?.methodAucDown;
  const deal = estimateDeal({ start, actualBuy: sale, region: item.region });

  let saleBlock: string;
  if (sale != null && start) {
    const pct = ((sale / start) * 100).toFixed(1);
    const delta = sale - start;
    const deltaPct = ((delta / start) * 100).toFixed(1);
    const sign = Number(deltaPct) > 0 ? "+" : "";
    saleBlock = [
      `Стартовая цена: ${formatMoney(start)}`,
      `Продана за: <b>${formatMoney(sale)}</b>`,
      `К старту: <b>${pct}%</b> (${sign}${deltaPct}%, ${formatMoney(delta)})`,
    ].join("\n");
  } else if (sale != null) {
    saleBlock = `Продана за: <b>${formatMoney(sale)}</b>`;
  } else {
    saleBlock = [
      start != null ? `Стартовая цена: ${formatMoney(start)}` : null,
      "Цену продажи в выписке не разобрал — открой документ ниже.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const categories = (item.procurementClassifiers ?? []).map((c) => c.title).join(", ");

  return [
    `<b>${escapeHtml(truncate(item.title || detail.title, 140))}</b>`,
    `№ <code>${escapeHtml(item.registeredNumber)}</code> · id <code>${item.id}</code>`,
    `Статус: ${escapeHtml(item.processStatus?.title ?? detail.status ?? "Состоявшиеся торги")}`,
    item.region ? `Регион: ${escapeHtml(item.region)}` : null,
    categories ? `Категория: ${escapeHtml(categories)}` : null,
    down != null ? `Ход: ${down ? "аукцион на понижение" : "аукцион на повышение"}` : null,
    detailLot?.goodsDescription ? escapeHtml(truncate(detailLot.goodsDescription, 220)) : null,
    "",
    saleBlock,
    deal ? formatDealDetail(deal) : null,
    protocol?.winner ? `Победитель: ${escapeHtml(protocol.winner)}` : null,
    protocol?.soldAt ? `Дата в выписке: ${escapeHtml(protocol.soldAt)}` : null,
    protocol?.note ? escapeHtml(protocol.note) : null,
    item.assuranceAmount != null ? `Гарантия: ${formatMoney(item.assuranceAmount)}` : null,
    item.tradeStartDate ? `Дата торгов: ${formatDate(item.tradeStartDate)}` : null,
    "",
    `<a href="${tradePublicUrl(item.id)}">Карточка на ${ETP_ADILET.name}</a>`,
  ]
    .filter((line) => line != null)
    .join("\n");
}
