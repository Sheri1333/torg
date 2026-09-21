export function formatMoney(value: number | undefined | null, currency = "₸"): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)} ${currency}`;
}

/** Compact money for table rows: 4,8 млн or 450 тыс. */
export function formatCompactMoney(value: number | undefined | null): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) {
    const mln = abs / 1_000_000;
    const digits = mln >= 10 ? 1 : 2;
    return `${sign}${mln.toLocaleString("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: 1 })} млн`;
  }
  if (abs >= 1000) {
    return `${sign}${Math.round(abs / 1000).toLocaleString("ru-RU")} тыс.`;
  }
  return formatMoney(n);
}

export function formatDate(ms: number | undefined | null): string {
  if (!ms) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Almaty",
  }).format(new Date(ms));
}

export function truncate(text: string, max = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
