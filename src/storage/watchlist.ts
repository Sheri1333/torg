import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

export interface WatchItem {
  tradeId: number;
  title: string;
  registeredNumber?: string;
  addedAt: string;
}

interface StoreShape {
  users: Record<string, WatchItem[]>;
}

function storePath(): string {
  return path.join(fileURLToPath(config.dataDir), "watchlist.json");
}

async function ensureStore(): Promise<StoreShape> {
  const dir = fileURLToPath(config.dataDir);
  await mkdir(dir, { recursive: true });
  try {
    const raw = await readFile(storePath(), "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    const empty: StoreShape = { users: {} };
    await writeFile(storePath(), JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function saveStore(store: StoreShape): Promise<void> {
  await writeFile(storePath(), JSON.stringify(store, null, 2), "utf8");
}

export async function listWatched(userId: number): Promise<WatchItem[]> {
  const store = await ensureStore();
  return store.users[String(userId)] ?? [];
}

export async function addWatch(
  userId: number,
  item: Omit<WatchItem, "addedAt">,
): Promise<{ ok: boolean; reason?: string }> {
  const store = await ensureStore();
  const key = String(userId);
  const current = store.users[key] ?? [];
  if (current.some((x) => x.tradeId === item.tradeId)) {
    return { ok: false, reason: "already" };
  }
  store.users[key] = [
    ...current,
    { ...item, addedAt: new Date().toISOString() },
  ];
  await saveStore(store);
  return { ok: true };
}

export async function removeWatch(userId: number, tradeId: number): Promise<boolean> {
  const store = await ensureStore();
  const key = String(userId);
  const current = store.users[key] ?? [];
  const next = current.filter((x) => x.tradeId !== tradeId);
  store.users[key] = next;
  await saveStore(store);
  return next.length !== current.length;
}
