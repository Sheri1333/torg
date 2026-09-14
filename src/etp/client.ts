import { config } from "../config.js";
import { fieldValue, findField, flattenNamedFields } from "./fields.js";
import type { TradeDetail, TradeDetailLot, TradeListItem, TradeListResponse } from "./types.js";

const DEFAULT_HEADERS = {
  Accept: "application/json",
  "User-Agent": "torg-bot/0.1 (+local; ETP.Adilet reader)",
  "X-Requested-With": "XMLHttpRequest",
};

async function getJson<T>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${config.etpBaseUrl}${path}`;
  const res = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!res.ok) {
    throw new Error(`ETP request failed ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

function absoluteUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("http")) return href;
  return `${config.etpBaseUrl}${href.startsWith("/") ? href : `/${href}`}`;
}

export async function listTrades(options?: {
  skipped?: number;
  limit?: number;
  page?: string;
}): Promise<TradeListResponse> {
  const skipped = options?.skipped ?? 0;
  const limit = options?.limit ?? 10;
  const page = options?.page ?? "sales";
  const data = await getJson<{
    $top?: { trades?: TradeListResponse };
  }>(`/trades.json?page=${encodeURIComponent(page)}&skipped=${skipped}&limit=${limit}`);

  const trades = data.$top?.trades;
  if (!trades) {
    throw new Error("Unexpected ETP list response: missing $top.trades");
  }
  return trades;
}

export async function searchTrades(query: string, options?: { limit?: number; maxPages?: number }): Promise<TradeListItem[]> {
  const needle = query.trim().toLowerCase();
  const limit = options?.limit ?? 10;
  const maxPages = options?.maxPages ?? 5;
  const pageSize = 20;
  const matched: TradeListItem[] = [];
  const seen = new Set<number>();

  for (let page = 0; page < maxPages && matched.length < limit; page += 1) {
    const batch = await listTrades({ skipped: page * pageSize, limit: pageSize });
    for (const item of batch.items) {
      if (seen.has(item.id)) continue;
      const hay = [
        item.title,
        item.registeredNumber,
        item.region,
        ...(item.lots ?? []).flatMap((l) => [l.title, l.goodsDescription]),
        ...(item.procurementClassifiers ?? []).map((c) => c.title),
      ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();

      if (!needle || hay.includes(needle)) {
        seen.add(item.id);
        matched.push(item);
      }
      if (matched.length >= limit) break;
    }
    if (batch.items.length < pageSize) break;
  }

  return matched.slice(0, limit);
}

export async function getTradeDetail(tradeId: number | string): Promise<TradeDetail> {
  const id = String(tradeId).replace(/\D/g, "");
  if (!id) throw new Error("Некорректный id торгов");

  const raw = await getJson<{
    id: number;
    document?: { fields?: Record<string, unknown> | unknown[] };
  }>(`/trades/${id}/info?page=sales`);

  const rootFields = flattenNamedFields(raw.document?.fields as never);
  const announcement = findField(rootFields, "announcement");
  const contacts = findField(rootFields, "contacts");
  const courtOfficer = findField(rootFields, "courtOfficer");
  const conditions = findField(rootFields, "conditions");
  const requirements = findField(rootFields, "requirements");
  const documents = findField(rootFields, "documents");
  const lotsField = findField(rootFields, "lots");

  const title =
    String(fieldValue(announcement?.document?.fields, "title") ?? `Торги #${raw.id}`);

  const lots: TradeDetailLot[] = (lotsField?.documents as Array<Record<string, unknown>> | undefined)?.map((doc) => {
    const fields = (doc.fields as Array<Record<string, unknown>> | undefined) ?? [];
    const info = fields.find((f) => f.name === "info") as
      | { document?: { fields?: Array<Record<string, unknown>> } }
      | undefined;
    const priceBlock = fields.find((f) => f.name === "initialContractPrice") as
      | { document?: { fields?: Array<Record<string, unknown>> } }
      | undefined;

    const infoFields = info?.document?.fields ?? [];
    const priceFields = priceBlock?.document?.fields ?? [];
    const assurance = priceFields.find((f) => f.name === "bidAssurance") as
      | { document?: { fields?: Array<Record<string, unknown>> } }
      | undefined;

    const photosRaw = fieldValue(infoFields as never, "attachments_other");
    const photos = Array.isArray(photosRaw)
      ? photosRaw
          .filter((p: { type?: string; href?: string; name?: string }) => Boolean(p?.href))
          .map((p: { name?: string; href?: string }) => ({
            name: String(p.name ?? "file"),
            href: absoluteUrl(p.href)!,
          }))
      : [];

    const lotMeta = doc.lot as { status?: { name: string; title: string } } | undefined;

    return {
      ref: String(doc.ref ?? ""),
      status: lotMeta?.status,
      number: String(fieldValue(infoFields as never, "number") ?? ""),
      title: String(fieldValue(infoFields as never, "title") ?? ""),
      goodsDescription: String(fieldValue(infoFields as never, "goodsDescription") ?? ""),
      location: String(fieldValue(infoFields as never, "purchaseTerms") ?? ""),
      initialPrice: Number(fieldValue(priceFields as never, "initialContractPrice") ?? NaN) || undefined,
      assuranceAmount: Number(fieldValue(priceFields as never, "assuranceAmount") ?? NaN) || undefined,
      assurancePercent: Number(fieldValue(assurance?.document?.fields as never, "value") ?? NaN) || undefined,
      marketPrice: Number(fieldValue(infoFields as never, "marketPrice") ?? NaN) || undefined,
      photos,
    };
  }) ?? [];

  const attachmentsRaw = fieldValue(documents?.document?.fields, "attachments_other");
  const attachments = Array.isArray(attachmentsRaw)
    ? attachmentsRaw.map((f: { name?: string; href?: string; size?: number }) => ({
        name: String(f.name ?? "document"),
        href: absoluteUrl(f.href)!,
        size: f.size,
      }))
    : [];

  return {
    id: raw.id,
    title,
    status: String(fieldValue(conditions?.document?.fields, "processStatusTitle") ?? ""),
    organizer: String(fieldValue(contacts?.document?.fields, "organizer") ?? ""),
    phone: String(fieldValue(contacts?.document?.fields, "phone") ?? ""),
    address: String(fieldValue(contacts?.document?.fields, "address") ?? ""),
    courtOfficerName: String(fieldValue(courtOfficer?.document?.fields, "name") ?? ""),
    courtOfficerOrg: String(
      fieldValue(courtOfficer?.document?.fields, "currentOrganizationData.arbitrationOrganization") ?? "",
    ),
    procurementMethod: String(fieldValue(conditions?.document?.fields, "procurementMethod") ?? ""),
    bidAssuranceTerms: String(fieldValue(requirements?.document?.fields, "bidAssuranceTerms") ?? ""),
    lots,
    attachments,
    url: `${config.etpBaseUrl}/trades/${raw.id}/info?page=sales`,
  };
}

export function tradePublicUrl(tradeId: number | string): string {
  return `${config.etpBaseUrl}/trades/${tradeId}/info?page=sales`;
}
