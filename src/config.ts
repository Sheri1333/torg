import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  botToken: process.env.BOT_TOKEN?.trim() ?? "",
  allowedUserIds: (process.env.ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n)),
  etpBaseUrl: "https://etp.adilet.gov.kz",
  dataDir: new URL("../.data/", import.meta.url),
};

export function assertBotToken(): string {
  return required("BOT_TOKEN");
}
