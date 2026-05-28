import fs from "fs";
import path from "path";
import type { MotionMetrics, HolisticMonthData } from "./hubspot";

const CACHE_PATH = path.join(process.cwd(), "cache", "initiative_data.json");

export interface CacheData {
  refreshed_at: string;
  initiatives: Record<
    string,
    {
      old: MotionMetrics;
      new: MotionMetrics;
    }
  >;
  holistic: Record<string, HolisticMonthData>;
}

export function readCache(): CacheData | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = fs.readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as CacheData;
  } catch {
    return null;
  }
}

export function writeCache(data: CacheData): void {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), "utf-8");
}
