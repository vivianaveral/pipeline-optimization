import fs from "fs";
import path from "path";
import type { CacheData } from "./types";

const CACHE_PATH = path.join(process.cwd(), "cache", "data.json");

export function readCache(): CacheData | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as CacheData;
  } catch {
    return null;
  }
}

export function writeCache(data: CacheData): void {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data), "utf-8");
  console.log(`[cache] written — ${data.dealCount} deals, refreshed ${data.lastRefreshed}`);
}

export function isCacheStale(data: CacheData, maxAgeHours = 24): boolean {
  const age = Date.now() - new Date(data.lastRefreshed).getTime();
  return age > maxAgeHours * 60 * 60 * 1000;
}
