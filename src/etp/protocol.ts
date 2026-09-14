export interface ProtocolParse {
  salePrice?: number;
  startPrice?: number;
  winner?: string;
  soldAt?: string;
  note?: string;
}

export function isProtocolExtractName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("выписк") || (n.includes("протокол") && n.includes("итог"));
}

export function isProbablyImage(name: string, type?: string): boolean {
  if (type?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
}

/** OLE .doc stores body text as UTF-16LE. Generated ETP extracts follow that template. */
export function extractDocText(buffer: Buffer): string {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "";
  }

  const chunks: string[] = [];
  let current = "";
  for (let i = 0; i + 1 < buffer.length; i += 2) {
    const code = buffer[i]! | (buffer[i + 1]! << 8);
    if (code >= 32 && code !== 0xfeff && code < 0xd800) {
      current += String.fromCharCode(code);
    } else if (current.length) {
      chunks.push(current);
      current = "";
    }
  }
  if (current) chunks.push(current);

  return chunks
    .map((s) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 2 && /[А-Яа-яA-Za-z0-9]/.test(s))
    .join("\n");
}

export function parseKzMoney(raw: string): number | undefined {
  const cleaned = raw.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

export function parseProtocolText(text: string): ProtocolParse {
  const sale =
    text.match(/продан[аоы]?\s+по\s+цене\s+([\d\s\u00a0\u202f]+(?:[.,]\d{1,2})?)/i) ??
    text.match(/покупн\w*\s+стоимост\w*\s+([\d\s\u00a0\u202f]+(?:[.,]\d{1,2})?)/i);
  const start = text.match(/стартовая\s+цена\s+([\d\s\u00a0\u202f]+(?:[.,]\d{1,2})?)/i);
  const winner =
    text.match(/победитель электронного аукциона\s+([^\n(,]+?)\s*\(\s*ЭЦП\s*\)/i) ??
    text.match(/победитель электронного аукциона(?!,)\s+([^\n(]+)/i);
  const soldAt = text.match(/«\d{1,2}»\s+\S+\s+\d{4}(?:\s+\d{2}:\d{2}(?:\s*\([^)]+\))?)?/);
  const cheapNote = /ниже\s+от\s+стартовой/i.test(text);

  return {
    salePrice: sale?.[1] ? parseKzMoney(sale[1]) : undefined,
    startPrice: start?.[1] ? parseKzMoney(start[1]) : undefined,
    winner: winner?.[1]?.replace(/\s+/g, " ").trim() || undefined,
    soldAt: soldAt?.[0]?.replace(/\s+/g, " ").trim(),
    note: cheapNote
      ? "Имущество ушло минимум на 20% ниже стартовой цены."
      : undefined,
  };
}
