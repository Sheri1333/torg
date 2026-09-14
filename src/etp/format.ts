export function formatMoney(value: number | undefined | null, currency = "₸"): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)} ${currency}`;
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
