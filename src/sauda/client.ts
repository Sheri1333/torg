import { config } from "../config.js";
import { SAUDA_DOWN_TYPE } from "./constants.js";
import { parseSaudaListHtml } from "./parse.js";
import type { SaudaListPage } from "./types.js";

const SAUDA_HEADERS = {
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Referer: "https://sauda.e-qazyna.kz/ru/list",
};

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export async function fetchSaudaListPage(options: {
  page?: number;
  query?: string;
}): Promise<SaudaListPage> {
  const page = Math.max(1, options.page ?? 1);
  const params = [
    "searchStatus=ApplicationsAccept",
    `auctionType=${encodeURIComponent(SAUDA_DOWN_TYPE)}`,
    `p=${page}`,
  ];
  const query = options.query?.trim();
  if (query) params.push(`textRu=${encodeURIComponent(query)}`);

  const url = `${config.saudaBaseUrl}/ru/list?${params.join("&")}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: SAUDA_HEADERS,
        signal: AbortSignal.timeout(25_000),
        redirect: "follow",
      });
      if (!res.ok) {
        throw new Error(`Sauda request failed ${res.status} for ${url}`);
      }
      const html = await res.text();
      if (/Location=Database/i.test(html) || /access denied/i.test(html.slice(0, 2000))) {
        throw new Error("Sauda returned an error page");
      }
      return parseSaudaListHtml(html, page);
    } catch (error) {
      lastError = error;
      if (!isTimeoutError(error) || attempt === 2) throw error;
    }
  }
  throw lastError;
}
