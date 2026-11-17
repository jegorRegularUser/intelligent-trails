// src/lib/walk/quickPipeline.ts
// Серверная склейка «Быстрой прогулки»: пул кандидатов Overpass + скоринг с
// причинами. Обычный серверный модуль БЕЗ "use server": его импортируют оба
// экшена (buildQuickWalk и replaceQuickStop), чтобы сборка и локальная замена
// остановки жили на одном коде и с одинаковыми аргументами скоринга.
// Не экспортируется через lib/walk/index.ts: модуль знает про vibes/geo,
// а публичный API движка остаётся чистым.

import { type GeoPlace, type GeoProvider } from '@/lib/geo';
import type { AdjustedProfile } from '@/lib/vibes/combine';
import { scorePlace, type PlaceScore } from '@/lib/vibes/ranking';
import type { WeatherContext } from '@/lib/weather';
import { evaluateOpeningHoursDetailed } from '@/lib/places/hours';
import { PLACE_CATEGORIES } from '@/constants/categories';
import type { WalkScoreReasons } from '@/components/walk/types';

/** Границы бюджета главного сценария — едины для сборки и замены. */
export const MIN_BUDGET = 15;
export const MAX_BUDGET = 240;
export const DEFAULT_TIMEZONE = 'Europe/Moscow';

/**
 * Пул кандидатов, который движок готов переварить: скоринг режет до этого.
 * 24, а не «сколько влезет»: матрица времён растёт квадратично (N+1)² —
 * 41×41 = 1681 ячеек ORS на КАЖДУЮ сборку при суточной квоте free-ключа
 * на несколько сотен ячеек; топ-24 по скору не хуже топа-40 (качество
 * набора определяют лучшие, а не хвост шорт-листа).
 */
export const ENGINE_CANDIDATE_CAP = 24;
/** Сколько лучших кандидатов уходит в локальную замену остановки. */
export const REPLACE_CANDIDATE_CAP = 12;

/**
 * Радиус поиска POI: примерно 40% бюджета времени — на радиус петли
 * (остальное — ходьба туда-обратно и стоянки). Скорость из движка (4.5 км/ч).
 */
export function searchRadiusMeters(budgetMinutes: number): number {
  const mPerMin = (4.5 * 1000) / 60;
  return Math.round(mPerMin * budgetMinutes * 0.4);
}

/** Результат поиска кандидатов: пул + честный флаг «поиск недоступен». */
export interface CandidatePool {
  places: GeoPlace[];
  /** Все запросы категорий упали — это «поиск недоступен», а не «мало мест»:
   *  текст ошибки должен отличаться, деградационная лестница тут не поможет. */
  searchFailed: boolean;
}

/** Мало мест в первой волне — второй заход с расширенным радиусом. */
const SECOND_WAVE_MULTIPLIER = 1.75;
/** Порог эскалации: меньше этого числа кандидатов — ищем шире. */
const MIN_POOL_SIZE = 3;
/** Категорий в одном батче: 9 параллельных Overpass-запросов ловят rate-окно
 *  и молча теряются (пул прилетал « park 8 + museum 12 » вместо ~60 мест). */
const OVERPASS_BATCH_SIZE = 3;
/** Пауза между батчами и перед ретраем — выходим из rate-окна Overpass. */
const OVERPASS_BATCH_PAUSE_MS = 350;
const OVERPASS_RETRY_PAUSE_MS = 900;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Поиск кандидатов по всем категориям профиля (вес > 0). Категории ходят
 * батчами с паузами, упавшие — один мгновенный ретрай: Overpass режет
 * параллельные серии по rate-лимиту, и без ретрая пул каждый раз разный.
 * Если пул слишком мал (спальный район: POI за зоной) — вторая волна
 * с радиусом ×1.75, результаты смёржены без дублей.
 */
export async function collectCandidates(
  provider: GeoProvider,
  start: [number, number],
  profile: AdjustedProfile,
  budgetMinutes: number,
): Promise<CandidatePool> {
  const radius = searchRadiusMeters(budgetMinutes);
  const categories = (Object.entries(profile.categoryWeights) as [string, number][])
    .filter(([, w]) => w > 0)
    .map(([c]) => c)
    .filter((c) => c in PLACE_CATEGORIES);

  const search = (category: string, radiusMeters: number) =>
    provider.searchPlaces(start, category, { radiusMeters, limit: 12 });

  // 1. Батчи по 3 категории с паузами.
  const settled = new Map<string, PromiseSettledResult<GeoPlace[]>>();
  for (let i = 0; i < categories.length; i += OVERPASS_BATCH_SIZE) {
    const batch = categories.slice(i, i + OVERPASS_BATCH_SIZE);
    const wave = await Promise.allSettled(batch.map((category) => search(category, radius)));
    batch.forEach((category, j) => settled.set(category, wave[j]));
    if (i + OVERPASS_BATCH_SIZE < categories.length) await pause(OVERPASS_BATCH_PAUSE_MS);
  }

  // 2. Ретрай упавших: rate-окно краткое, мгновенный повтор обычно проходит.
  const failed = categories.filter(
    (c) => settled.get(c)?.status === 'rejected',
  );
  if (failed.length > 0 && failed.length < categories.length) {
    await pause(OVERPASS_RETRY_PAUSE_MS);
    const retryWave = await Promise.allSettled(failed.map((category) => search(category, radius)));
    failed.forEach((category, j) => settled.set(category, retryWave[j]));
  }

  const first: PromiseSettledResult<GeoPlace[]>[] = categories.map(
    (c) => settled.get(c) ?? { status: 'rejected' as const, reason: new Error('skipped') },
  );
  const byKey = mergeWaves([first]);
  // Упали ВСЕ категории — сеть/сервис недоступны; частичные отказы — деградация.
  let searchFailed = first.every((outcome) => outcome.status === 'rejected');

  if (byKey.size < MIN_POOL_SIZE && categories.length > 0) {
    const second = await Promise.allSettled(
      categories.map((category) => search(category, Math.round(radius * SECOND_WAVE_MULTIPLIER))),
    );
    if (second.every((outcome) => outcome.status === 'rejected')) searchFailed = true;
    mergeWaves([second], byKey);
  }

  return { places: [...byKey.values()], searchFailed };
}

/** Смёржить волны поиска в Map по ключу id|координаты (порядок волн сохраняется). */
function mergeWaves(
  waves: PromiseSettledResult<GeoPlace[]>[][],
  into: Map<string, GeoPlace> = new Map(),
): Map<string, GeoPlace> {
  for (const wave of waves) {
    for (const outcome of wave) {
      if (outcome.status !== 'fulfilled') continue; // категория упала — деградация, не падение всего
      for (const place of outcome.value) {
        const key = `${place.id}|${place.coordinates[0].toFixed(5)},${place.coordinates[1].toFixed(5)}`;
        if (!into.has(key)) into.set(key, place);
      }
    }
  }
  return into;
}

/** Место + полный PlaceScore: причины едут в карточку вместе со скором. */
export interface ScoredPoolEntry {
  place: GeoPlace;
  score: PlaceScore;
  /** Часы на момент скоринга: 'closed' отсеивается, пока живых хватает. */
  hoursState: 'open' | 'closed' | 'unknown';
}

export interface ScorePoolParams {
  pool: GeoPlace[];
  profile: AdjustedProfile;
  weather: WeatherContext | null;
  /** Час 0..23 — включает аффинность часа архетипа; нет — множитель 1. */
  hour?: number;
  timezone: string;
  now: Date;
  /** id мест, которые не возвращаем: исключения юзера + уже стоящие в плане. */
  excludeIds?: ReadonlySet<string>;
}

/**
 * Скоринг-пул: scorePlace с контекстом «сейчас» (архетип + погода + час +
 * часы работы), сортировка по убыванию скора — она же приоритет перебора
 * при замене остановки. Порядок устойчив для равных скоров.
 *
 * Гейт «работает сейчас» (PRODUCT.md, метрика №5): закрытые не едут дальше,
 * пока живых кандидатов хватает. Мало живых — честная деградация, пул как есть.
 */
export function scoreCandidatePool(params: ScorePoolParams): ScoredPoolEntry[] {
  const { pool, profile, weather, hour, timezone, now, excludeIds } = params;
  const scored = pool
    .filter((place) => !excludeIds?.has(`${place.id}`))
    .map((place) => {
      const hours = evaluateOpeningHoursDetailed(place.tags?.opening_hours, now, timezone);
      return {
        place,
        hoursState: hours.state,
        score: scorePlace(place, {
          archetype: profile,
          weather,
          hour,
          hoursState: hours.state,
          closesInMinutes: hours.minutesUntilClose,
        }),
      };
    })
    .sort((a, b) => b.score.score - a.score.score);

  const alive = scored.filter((entry) => entry.hoursState !== 'closed');
  return alive.length >= MIN_ALIVE_FOR_FILTER ? alive : scored;
}

/** Живых кандидатов меньше этого порога — закрытые остаются в пуле (деградация). */
const MIN_ALIVE_FOR_FILTER = 12;

/**
 * Карта скоринговых причин для карточки по id места. Негативные причины
 * («сейчас закрыто», жара, тьма) попадают в данные только когда позитивных
 * нет вовсе: они объясняют хвост шорт-листа и показываются приглушённо.
 */
export function buildScoreReasonsMap(scored: ScoredPoolEntry[]): Map<string, WalkScoreReasons> {
  const map = new Map<string, WalkScoreReasons>();
  for (const { place, score } of scored) {
    map.set(`${place.id}`, cardReasons(score));
  }
  return map;
}

/** Позитивные первыми; без позитива — негатив (его показ и есть объяснение). */
function cardReasons(score: PlaceScore): WalkScoreReasons {
  const positive = { ru: [] as string[], en: [] as string[] };
  const negative = { ru: [] as string[], en: [] as string[] };
  score.reasonsRu.forEach((ru, i) => {
    const bucket = score.negative[i] ? negative : positive;
    bucket.ru.push(ru);
    bucket.en.push(score.reasonsEn[i] ?? ru);
  });
  return positive.ru.length > 0 ? positive : negative;
}

/**
 * Мерж карты причин с клиентскими оверрайдами. Причины выживших при замене
 * остановок — факты прошлого скоринга тех же мест: перекрываем их как есть
 * и НЕ пересчитываем (контекст к моменту замены мог измениться, а пул
 * кандидатов текущие остановки и не содержит).
 */
export function mergeScoreReasons(
  base: ReadonlyMap<string, WalkScoreReasons>,
  overrides: ReadonlyMap<string, WalkScoreReasons>,
): Map<string, WalkScoreReasons> {
  const merged = new Map(base);
  for (const [id, reasons] of overrides) merged.set(id, reasons);
  return merged;
}
