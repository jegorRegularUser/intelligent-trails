import { readFileSync } from "node:fs";
import { join } from "node:path";

// src/app/ui/maplibre-gl-worker.mjs/route.ts
// Воркер maplibre v6 резолвится через import.meta.url бандла — после упаковки
// Next/Turbopack путь «./maplibre-gl-worker.mjs» уходит в чанки и fetch воркера
// падает: канва навсегда остаётся без тайлов. Роут отдаёт воркер установленного
// dep (версия всегда совпадает) с правильным MIME — MapCanvas зовёт
// setWorkerUrl('/ui/maplibre-gl-worker.mjs') до создания канвы.
const WORKER_PATH = join(process.cwd(), "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");

let cached: Buffer | null = null;

export function GET() {
  if (!cached) {
    cached = readFileSync(WORKER_PATH);
  }
  return new Response(new Uint8Array(cached), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
