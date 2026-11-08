// src/lib/weather/index.ts
// Погодный контекст от Open-Meteo (без ключа) + маппинг в подсказки скоринга.
// Любая ошибка → null: прогулка строится без погоды (docs/PRODUCT.md,
// «Честная деградация»; docs/vibes.md §6).

export interface WeatherContext {
  /** Температура, °C. */
  tempC: number;
  /** Идёт дождь сейчас (порог 0.1 мм/ч — ниже морось). */
  isRaining: boolean;
  /** Дождь в ближайшие 2 часа (порог 0.2 мм/ч). */
  precipNext2h: boolean;
  /** Темно (is_day = 0 от API). */
  isDark: boolean;
}

export interface WeatherHints {
  preferIndoor: boolean;
  preferShade: boolean;
  preferLighted: boolean;
}

/** Пороги (docs/vibes.md §6) — экспорт для синхронизации док↔тесты. */
export const RAIN_MM_H = 0.1;
export const RAIN_FORECAST_MM_H = 0.2;
export const HEAT_TEMP_C = 27;

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const REQUEST_TIMEOUT_MS = 5000;
/** TTL кэша: успех 30 мин, отказ 2 мин (docs/vibes.md §6). */
const SUCCESS_TTL_MS = 30 * 60 * 1000;
const FAILURE_TTL_MS = 2 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  value: WeatherContext | null;
}

const cache = new Map<string, CacheEntry>();

/** Сброс кэша — для тестов. */
export function resetWeatherCache(): void {
  cache.clear();
}

/** Ключ кэша: координаты до 0.1° (~11 км — внутри ячейки погода однородна). */
function cacheKey(lat: number, lng: number): string {
  return `${Math.round(lat * 10) / 10},${Math.round(lng * 10) / 10}`;
}

export interface FetchWeatherOptions {
  /** Инъекция fetch для тестов. */
  fetchImpl?: typeof fetch;
  /** Инъекция часов для тестов TTL. */
  now?: () => number;
}

interface OpenMeteoResponse {
  utc_offset_seconds?: number;
  current?: {
    temperature_2m?: number;
    precipitation?: number;
    is_day?: number;
  };
  hourly?: {
    time?: string[];
    precipitation?: number[];
  };
}

/**
 * Текущая погода + прогноз на 2 часа. Ошибки (сеть, не-2xx, кривой JSON,
 * пустые поля) → null, функция не бросает. Успех кэшируется на 30 мин,
 * отказ — на 2 мин.
 */
export async function fetchWeatherContext(
  lat: number,
  lng: number,
  opts: FetchWeatherOptions = {},
): Promise<WeatherContext | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const now = opts.now ?? Date.now;
  const key = cacheKey(lat, lng);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now()) return cached.value;

  const url = `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lng}`
    + '&current=temperature_2m,precipitation,weather_code,is_day'
    + '&hourly=temperature_2m,precipitation,weather_code,is_day'
    + '&forecast_days=2&timezone=auto';

  let value: WeatherContext | null = null;
  try {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (res.ok) {
      const json = (await res.json()) as OpenMeteoResponse;
      value = parseWeatherContext(json);
    }
  } catch {
    value = null;
  }

  cache.set(key, { expiresAt: now() + (value ? SUCCESS_TTL_MS : FAILURE_TTL_MS), value });
  return value;
}

/** Строгий разбор ответа: пустые/кривые поля → null (честное «не знаем»). */
function parseWeatherContext(json: OpenMeteoResponse): WeatherContext | null {
  const cur = json.current;
  if (!cur
    || typeof cur.temperature_2m !== 'number'
    || typeof cur.precipitation !== 'number'
    || typeof cur.is_day !== 'number') {
    return null;
  }

  const times = json.hourly?.time ?? [];
  const precip = json.hourly?.precipitation ?? [];
  const utcOffsetSec = typeof json.utc_offset_seconds === 'number' ? json.utc_offset_seconds : 0;
  // times — местное «настенное» время точки; приводим «сейчас» к той же шкале.
  const nowLocalMs = Date.now() + utcOffsetSec * 1000;
  let idx = times.findIndex((t) => Date.parse(`${t}:00Z`) >= nowLocalMs - 30 * 60 * 1000);
  if (idx < 0) idx = 0;
  const nextTwo = [precip[idx], precip[idx + 1]];

  return {
    tempC: cur.temperature_2m,
    isRaining: cur.precipitation >= RAIN_MM_H,
    precipNext2h: nextTwo.some((p) => typeof p === 'number' && p >= RAIN_FORECAST_MM_H),
    isDark: cur.is_day === 0,
  };
}

/**
 * Погодный контекст → подсказки скоринга:
 *  - preferIndoor: дождь идёт или вот-вот начнётся;
 *  - preferShade: жара >27 °C при ясной погоде (ночью и под дождём тень не нужна);
 *  - preferLighted: темно — нужны освещённые и живые места.
 */
export function mapToHints(ctx: WeatherContext): WeatherHints {
  return {
    preferIndoor: ctx.isRaining || ctx.precipNext2h,
    preferShade: !ctx.isRaining && !ctx.isDark && ctx.tempC > HEAT_TEMP_C,
    preferLighted: ctx.isDark,
  };
}
