import { config } from "../config.js";
import { fieldValue, findField, flattenNamedFields } from "./fields.js";
import { extractDocText, isProbablyImage, isProtocolExtractName, parseProtocolText } from "./protocol.js";
import type {
  DownloadedFile,
  ProtocolResult,
  TradeDetail,
  TradeDetailLot,
  TradeListItem,
  TradeListResponse,
} from "./types.js";

const DEFAULT_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
  Referer: "https://etp.adilet.gov.kz/trades?page=sales",
};

const FILE_HEADERS = {
  "User-Agent": DEFAULT_HEADERS["User-Agent"],
  Referer: DEFAULT_HEADERS.Referer,
};

export type TradeSearchQuery = {
  fullTextString?: string;
  processStatuses?: string[];
  orderBy?: string;
  destinationRegions?: string[];
  procurementClassifier?: string[];
};

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function getJson<T>(path: string, timeoutMs = 20_000, attempts = 1): Promise<T> {
  const url = path.startsWith("http") ? path : `${config.etpBaseUrl}${path}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`ETP request failed ${res.status} for ${url}`);
      }
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      if (!isTimeoutError(error) || attempt === attempts) throw error;
    }
  }
  throw lastError;
}

export function absoluteUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("http")) return href;
  return `${config.etpBaseUrl}${href.startsWith("/") ? href : `/${href}`}`;
}

/** Same `search` JSON the site puts in /trades?page=sales&search=... */
function siteSearchPayload(search: TradeSearchQuery): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    processStatuses: search.processStatuses ?? ["BID_SUBMISSION"],
    conditions: {
      price: {},
      publishDate: {},
      tradeDate: {},
      procurementClassifier: search.procurementClassifier ?? [],
      destinationRegions: search.destinationRegions ?? [],
    },
    orderBy: search.orderBy ?? "REGISTERED_DATE_DESC",
  };
  const query = search.fullTextString?.trim();
  if (query) payload.fullTextString = query;
  return payload;
}

function mapFileList(
  raw: unknown,
): Array<{ name: string; href: string; size?: number; type?: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p: { href?: string }) => Boolean(p?.href))
    .map((p: { name?: string; href?: string; size?: number; type?: string }) => ({
      name: String(p.name ?? "file"),
      href: absoluteUrl(p.href)!,
      size: p.size,
      type: p.type,
    }));
}

function normalizeListItem(item: TradeListItem): TradeListItem {
  const images = Array.isArray(item.images)
    ? item.images
        .filter((img) => Boolean(img?.href))
        .map((img) => ({
          name: String(img.name ?? "photo"),
          href: absoluteUrl(img.href)!,
          thumbnail: absoluteUrl(img.thumbnail),
          type: img.type,
        }))
    : [];
  return { ...item, images };
}

export async function listTrades(options?: {
  skipped?: number;
  limit?: number;
  page?: string;
  search?: TradeSearchQuery;
}): Promise<TradeListResponse> {
  const skipped = options?.skipped ?? 0;
  const limit = options?.limit ?? 10;
  const page = options?.page ?? "sales";
  const params = new URLSearchParams({
    page,
    skip: String(skipped),
    skipped: String(skipped),
    limit: String(limit),
  });
  let qs = params.toString();
  if (options?.search) {
    // URLSearchParams encodes spaces as `+`. ETP full-text search hangs on that
    // (`camry+2006`) and never returns; encodeURIComponent keeps `%20`.
    qs += `&search=${encodeURIComponent(JSON.stringify(siteSearchPayload(options.search)))}`;
  }

  const hasText = Boolean(options?.search?.fullTextString?.trim());
  const data = await getJson<{
    $top?: { trades?: TradeListResponse };
  }>(`/trades.json?${qs}`, hasText ? 90_000 : 30_000, 2);

  const trades = data.$top?.trades;
  if (!trades) {
    throw new Error("Unexpected ETP list response: missing $top.trades");
  }
  return {
    ...trades,
    items: (trades.items ?? []).map(normalizeListItem),
  };
}

async function searchTradesClientScan(
  query: string,
  options?: { limit?: number; maxPages?: number },
): Promise<TradeListItem[]> {
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

export type SearchTradesOptions = {
  limit?: number;
  maxPages?: number;
  processStatuses?: string[];
  destinationRegions?: string[];
  procurementClassifier?: string[];
  onlyAucDown?: boolean;
};

export function isAucDown(item: TradeListItem): boolean {
  return (item.lots ?? []).some((lot) => lot.methodAucDown === true);
}

export async function collectAucDownLots(options: {
  query: string;
  processStatuses?: string[];
  destinationRegions?: string[];
  afterSkipped: number;
  want: number;
  maxBatches?: number;
}): Promise<{ items: TradeListItem[]; nextSkipped: number; exhausted: boolean }> {
  const pageSize = 20;
  const maxBatches = options.maxBatches ?? 25;
  const search = {
    fullTextString: options.query,
    processStatuses: options.processStatuses ?? ["BID_SUBMISSION"],
    destinationRegions: options.destinationRegions,
  };
  const items: TradeListItem[] = [];
  const seen = new Set<number>();
  let skipped = options.afterSkipped;
  let exhausted = false;
  let batches = 0;

  while (items.length < options.want && !exhausted && batches < maxBatches) {
    const batch = await listTrades({ skipped, limit: pageSize, search });
    batches += 1;
    skipped += batch.items.length;
    if (batch.items.length < pageSize) exhausted = true;
    for (const item of batch.items) {
      if (seen.has(item.id) || !isAucDown(item)) continue;
      seen.add(item.id);
      items.push(item);
      if (items.length >= options.want) break;
    }
  }

  return { items, nextSkipped: skipped, exhausted };
}

export async function searchTrades(query: string, options?: SearchTradesOptions): Promise<TradeListItem[]> {
  const page = await searchTradesPage(query, options);
  return page.items;
}

export async function searchTradesPage(query: string, options?: SearchTradesOptions): Promise<TradeListResponse> {
  const limit = options?.limit ?? 10;
  const processStatuses = options?.processStatuses ?? ["BID_SUBMISSION"];
  const search = {
    fullTextString: query,
    processStatuses,
    destinationRegions: options?.destinationRegions,
    procurementClassifier: options?.procurementClassifier,
  };

  try {
    if (!options?.onlyAucDown) {
      return await listTrades({ skipped: 0, limit, search });
    }

    const pageSize = 20;
    const maxPages = options.maxPages ?? 8;
    const matched: TradeListItem[] = [];
    const seen = new Set<number>();

    for (let page = 0; page < maxPages && matched.length < limit; page += 1) {
      const batch = await listTrades({ skipped: page * pageSize, limit: pageSize, search });
      for (const item of batch.items) {
        if (seen.has(item.id) || !isAucDown(item)) continue;
        seen.add(item.id);
        matched.push(item);
        if (matched.length >= limit) break;
      }
      if (batch.items.length < pageSize) break;
    }

    return { items: matched, skipped: 0, limit, total: matched.length };
  } catch (error) {
    console.error("ETP server search failed, falling back to local scan", error);
    const items = (await searchTradesClientScan(query, options)).filter((item) =>
      options?.onlyAucDown ? isAucDown(item) : true,
    );
    return { items: items.slice(0, limit), skipped: 0, limit, total: items.length };
  }
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
    const tradeStep = priceFields.find((f) => f.name === "tradeStep") as
      | { document?: { fields?: Array<Record<string, unknown>> } }
      | undefined;

    const photos = mapFileList(fieldValue(infoFields as never, "attachments_other")).filter((p) =>
      isProbablyImage(p.name, p.type),
    );

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
      tradeStepPercent: Number(fieldValue(tradeStep?.document?.fields as never, "value") ?? NaN) || undefined,
      photos,
    };
  }) ?? [];

  const attachments = [
    ...mapFileList(fieldValue(documents?.document?.fields, "attachments_other")),
    ...mapFileList(fieldValue(documents?.document?.fields, "attachments_completion_protocol")),
  ];

  const bidSubmissionEndDate = Number(fieldValue(conditions?.document?.fields, "bidSubmissionEndDate") ?? NaN);
  const tradeStartDate = Number(fieldValue(conditions?.document?.fields, "tradeStartDate") ?? NaN);

  return {
    id: raw.id,
    title,
    status: String(fieldValue(conditions?.document?.fields, "processStatusTitle") ?? ""),
    organizer: String(fieldValue(contacts?.document?.fields, "organizer") ?? ""),
    phone: String(fieldValue(contacts?.document?.fields, "phone") ?? ""),
    address: String(fieldValue(contacts?.document?.fields, "address") ?? ""),
    courtOfficerName: String(
      fieldValue(courtOfficer?.document?.fields, "currentOrganizationData.title") ??
        fieldValue(courtOfficer?.document?.fields, "name") ??
        "",
    ),
    courtOfficerOrg: String(
      fieldValue(courtOfficer?.document?.fields, "currentOrganizationData.arbitrationOrganization") ?? "",
    ),
    procurementMethod: String(fieldValue(conditions?.document?.fields, "procurementMethod") ?? ""),
    bidAssuranceTerms: String(fieldValue(requirements?.document?.fields, "bidAssuranceTerms") ?? ""),
    lots,
    attachments,
    bidSubmissionEndDate: Number.isFinite(bidSubmissionEndDate) ? bidSubmissionEndDate : undefined,
    tradeStartDate: Number.isFinite(tradeStartDate) ? tradeStartDate : undefined,
    url: `${config.etpBaseUrl}/trades/${raw.id}/info?page=sales`,
  };
}

export async function downloadFile(url: string, fileName = "file"): Promise<DownloadedFile> {
  const res = await fetch(url, {
    headers: FILE_HEADERS,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error(`ETP file download failed ${res.status} for ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const fromHeader = res.headers.get("content-disposition")?.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i)?.[1];
  const name = fromHeader ? decodeURIComponent(fromHeader) : fileName;
  return { buffer, name, contentType };
}

export async function loadProtocolResult(detail: TradeDetail): Promise<ProtocolResult | null> {
  const att = detail.attachments.find((a) => isProtocolExtractName(a.name));
  if (!att?.href) return null;
  const file = await downloadFile(att.href, att.name);
  const parsed = parseProtocolText(extractDocText(file.buffer));
  return { ...parsed, file };
}

export function collectTradePhotos(
  item?: Pick<TradeListItem, "images">,
  detail?: Pick<TradeDetail, "lots">,
): Array<{ name: string; href: string }> {
  const fromDetail = (detail?.lots ?? []).flatMap((lot) => lot.photos);
  const fromList = (item?.images ?? []).filter((img) => isProbablyImage(img.name, img.type));
  const source = fromDetail.length > 0 ? fromDetail : fromList;
  const seen = new Set<string>();
  const out: Array<{ name: string; href: string }> = [];
  for (const photo of source) {
    if (!photo.href || seen.has(photo.href)) continue;
    seen.add(photo.href);
    out.push({ name: photo.name, href: photo.href });
  }
  return out;
}

export function tradePublicUrl(tradeId: number | string): string {
  return `${config.etpBaseUrl}/trades/${tradeId}/info?page=sales`;
}
