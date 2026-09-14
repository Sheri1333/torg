import { ETP_ADILET } from "./constants.js";
import { escapeHtml, formatDate, formatMoney, truncate } from "./format.js";
import type { TradeDetail, TradeListItem } from "./types.js";
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

export function formatTradeDetail(detail: TradeDetail): string {
  const lot = detail.lots[0];
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
          `Стартовая цена: <b>${formatMoney(lot.initialPrice)}</b>`,
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
    return `Найдено по «${escapeHtml(q)}»: ${count}${totalHint != null ? ` (просмотрено до ${totalHint} из списка приёма заявок)` : ""}`;
  }
  return `Активные торги (приём заявок): показано ${count}`;
}
