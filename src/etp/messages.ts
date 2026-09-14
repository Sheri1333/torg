import { ETP_ADILET } from "./constants.js";
import { escapeHtml, formatDate, formatMoney, truncate } from "./format.js";
import type { ProtocolResult, TradeDetail, TradeListItem } from "./types.js";
import { tradePublicUrl } from "./client.js";

export function formatTradeCard(item: TradeListItem): string {
  const lot = item.lots?.[0];
  const price = lot?.initialContractPrice ?? item.initialContractPrice;
  const categories = (item.procurementClassifiers ?? []).map((c) => c.title).join(", ");

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
    `<a href="${tradePublicUrl(item.id)}">Открыть на ETP.Adilet</a>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatTradeDetail(detail: TradeDetail, protocol?: ProtocolResult | null): string {
  const lot = detail.lots[0];
  const start = protocol?.startPrice ?? lot?.initialPrice;
  const sale = protocol?.salePrice;
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
