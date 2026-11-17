"use server";

// Локальная замена остановки «Быстрой прогулки» (docs/PRODUCT.md, принцип 3):
// меняется сегмент петли, а не вся прогулка. Пул и скоринг — те же, что при
// сборке (quickPipeline), движку уходит топ-8 кандидатов без заменяемой и без
// уже стоящих остановок. Остановки и ноги текущего плана приходят с клиента
// и переиспользуются как есть; полная пересборка через buildQuickWalk остаётся
// фолбэком на случай отказа замены.
//
// Ревизия 2026-11-18 «улица первична» (walk-engine.md §19.6): street-планы
// (planKind 'street') обслуживает replaceStreetGarnish — якорь-гарниш
// меняется без пересборки петли (кольцо ног из вершин розы переезжает по
// ссылке, перестраиваются только две ноги к новому кандидату). Когда якорей
// 0, кнопка «Заменить» не рендерится — сюда такие планы не доходят.
import { getCloudProvider } from '@/lib/geo/instance';
import { memoizeRoutingPort } from '@/lib/walk/memoPort';
import { replaceStopInPlan, replaceStreetGarnish, type ReplaceablePlan } from '@/lib/walk/replaceStop';
import { DEFAULT_WALKING_SPEED_KMH, type WalkGateName, type GateReport } from '@/lib/walk/types';
import {
  buildScoreReasonsMap,
  collectCandidates,
  diversifyByAzimuth,
  mergeScoreReasons,
  scoreCandidatePool,
  DEFAULT_TIMEZONE,
  MAX_BUDGET,
  MIN_BUDGET,
  REPLACE_CANDIDATE_CAP,
  type ScoredPoolEntry,
} from '@/lib/walk/quickPipeline';
import { enginePlansToUiPlans } from '@/lib/walk/uiAdapter';
import { fetchWeatherContext } from '@/lib/weather';
import { getArchetype } from '@/lib/vibes/archetypes';
import { combineContext, seasonalStayMinutes } from '@/lib/vibes/combine';
import { userLocalHour, userLocalMonth } from '@/lib/vibes/localHour';
import type { QuickVibe } from '@/actions/quickWalk';
import type { WalkPlan as UiWalkPlan, WalkScoreReasons } from '@/components/walk/types';

/** Сериализованная остановка текущего плана — ровно то, что несёт UiStop. */
export interface QuickWalkStopSnapshot {
  id: string;
  coordinates: [number, number];
  /** Движковая категория; неизвестна — вес категории 0, честная деградация. */
  category: string;
  /** Минуты на месте, как на карточке: замена не должна тихо менять стоянки. */
  stayMin: number;
  /** Причина в локали карточки — гейт якорей требует непустой у каждой. */
  reason: string;
  name?: string;
  rating?: number;
  tags?: Record<string, string>;
  openingHours?: string;
  /** Скоринговые причины с карточки: у выживших остановок они факты прошлого
   *  скоринга — возвращаются в план как есть, а не пересчитываются. */
  scoreReasons?: WalkScoreReasons;
}

export interface QuickWalkReplaceInput {
  start: [number, number];
  budgetMinutes: number;
  vibe: QuickVibe;
  timezone?: string;
  locale?: 'ru' | 'en';
  /** Остановки текущего плана в порядке обхода. */
  currentStops: QuickWalkStopSnapshot[];
  replaceStopId: string;
  /** Явные «никогда больше» от юзера — чёрный список, общий с пересборкой. */
  excludeStopIds?: string[];
  /** Ноги текущего плана (walkMin + geometry) для реиспользования геометрии. */
  currentLegs: { walkMin: number; geometry?: [number, number][] }[];
  /**
   * Тип плана (walk-engine.md §19.6): 'street' — уличная петля с якорями-
   * гарнишем, замена идёт через replaceStreetGarnish (петля не пересобирается).
   * Не передан — якорь-драйвен план, replaceStopInPlan как раньше.
   */
  planKind?: 'street';
  /** Прошёл ли текущий план гейт street_interest — факт снапа переносится. */
  streetInterestPass?: boolean;
  /**
   * Отчёты гейтов текущего плана (R5, из UiWalkPlan.gatesSummary): база
   * фолбэка замены считается из них, а не из хардкода «петля = 4».
   * Приоритетнее числа currentGatesPassed; мусор молча отбрасывается.
   */
  currentGatesSummary?: { name: string; pass: boolean; detail?: string }[];
  /** Пройдено гейтов у текущего плана — фолбэк, если отчётов нет. */
  currentGatesPassed?: number;
}

export type QuickWalkReplaceResult =
  | { ok: true; plan: UiWalkPlan }
  | { ok: false; error: string };

function validateInput(input: QuickWalkReplaceInput): string | null {
  const [lat, lng] = input.start;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return 'Некорректные координаты старта';
  }
  if (!Number.isFinite(input.budgetMinutes) || input.budgetMinutes < MIN_BUDGET || input.budgetMinutes > MAX_BUDGET) {
    return `Бюджет должен быть от ${MIN_BUDGET} до ${MAX_BUDGET} минут`;
  }
  if (!Array.isArray(input.currentStops) || input.currentStops.length === 0) {
    return 'В текущей прогулке нет остановок — нечего заменять';
  }
  for (const stop of input.currentStops) {
    const [sLat, sLng] = stop.coordinates ?? [];
    if (
      !stop.id ||
      !Number.isFinite(sLat) ||
      !Number.isFinite(sLng) ||
      !Number.isFinite(stop.stayMin) ||
      stop.stayMin < 0 ||
      typeof stop.reason !== 'string' ||
      stop.reason.trim().length === 0
    ) {
      return 'Некорректные данные текущей прогулки';
    }
  }
  if (!input.currentStops.some((stop) => stop.id === input.replaceStopId)) {
    return 'Такой остановки нет в текущей прогулке';
  }
  return null;
}

/** Причины приезжают с клиента: мягкая проверка формы, мусор молча отбрасываем. */
function isScoreReasons(value: unknown): value is WalkScoreReasons {
  if (!value || typeof value !== 'object') return false;
  const v = value as WalkScoreReasons;
  return Array.isArray(v.ru) && Array.isArray(v.en);
}

/** Имена гейтов, которые движок знает; чужие — мусор, молча отбрасываем. */
const KNOWN_GATES: ReadonlySet<string> = new Set([
  'budget',
  'anchors',
  'long_legs',
  'walk_share',
  'loop_no_repeat_street',
  'street_interest',
]);

function gatesSummaryToReports(
  summary: { name: string; pass: boolean; detail?: string }[] | undefined,
): GateReport[] | undefined {
  if (!Array.isArray(summary)) return undefined;
  const reports: GateReport[] = [];
  for (const item of summary) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.name !== 'string' || !KNOWN_GATES.has(item.name)) continue;
    if (typeof item.pass !== 'boolean') continue;
    reports.push({
      gate: item.name as WalkGateName,
      pass: item.pass,
      detail: typeof item.detail === 'string' ? item.detail : '',
    });
  }
  return reports.length > 0 ? reports : undefined;
}

/**
 * Текущий план в терминах движка. Ноги реиспользуются только при полной
 * длине петли (stops+1) — иначе движок честно перестроит все; дистанция
 * переиспользованных ног — оценка по скорости, UI её не показывает.
 * Отчёты гейтов едут из gatesSummary (R5): база фолбэка замены — из фактов,
 * а не из хардкода «петля = 4».
 */
function buildEnginePlan(input: QuickWalkReplaceInput): ReplaceablePlan {
  const stops = input.currentStops.map((stop) => ({
    place: {
      id: stop.id,
      name: stop.name ?? '',
      category: stop.category,
      coordinates: stop.coordinates,
      ...(stop.rating !== undefined ? { rating: stop.rating } : {}),
      ...(stop.tags ? { tags: stop.tags } : {}),
    },
    stayMinutes: stop.stayMin,
    // Причина в локали карточки: гейт якорей видит непустую строку, а адаптер
    // вернёт её как есть — сохранившиеся остановки звучат по-прежнему.
    reason: stop.reason,
  }));

  const legs =
    Array.isArray(input.currentLegs) && input.currentLegs.length === input.currentStops.length + 1
      ? input.currentLegs.map((leg, i) => ({
          from: i === 0 ? input.start : input.currentStops[i - 1].coordinates,
          to: i < input.currentStops.length ? input.currentStops[i].coordinates : input.start,
          distanceMeters: Math.round((leg.walkMin * DEFAULT_WALKING_SPEED_KMH * 1000) / 60),
          durationMinutes: leg.walkMin,
          geometry: leg.geometry ?? [],
        }))
      : undefined;
  const gates = gatesSummaryToReports(input.currentGatesSummary);

  return {
    stops,
    ...(legs ? { legs } : {}),
    ...(gates ? { gates } : {}),
  };
}

export async function replaceQuickStop(input: QuickWalkReplaceInput): Promise<QuickWalkReplaceResult> {
  const invalid = validateInput(input);
  if (invalid) return { ok: false, error: invalid };

  // Тот же синглтон-провайдер и те же аргументы скоринга, что у buildQuickWalk:
  // замена ищется в том же пуле, что собрала текущую прогулку.
  const provider = getCloudProvider();
  const start = input.start;
  const now = new Date();

  const weather = await fetchWeatherContext(start[0], start[1]).catch(() => null);
  const archetype = getArchetype(input.vibe === 'rain' ? 'rainy' : input.vibe);
  // Час и месяц юзера, не сервера — те же аргументы скоринга, что у buildQuickWalk.
  const timeZone = input.timezone ?? DEFAULT_TIMEZONE;
  const hour = userLocalHour(now, input.timezone);
  const month = userLocalMonth(now, input.timezone);
  const profile = combineContext(archetype, weather, now, { hour, month });

  const excludeIds = new Set<string>([
    ...(input.excludeStopIds ?? []),
    input.replaceStopId,
    ...input.currentStops.map((stop) => stop.id),
  ]);
  const { places: pool, searchFailed } = await collectCandidates(provider, start, profile, input.budgetMinutes);
  if (pool.length === 0) {
    return {
      ok: false,
      error: searchFailed
        ? 'Сервис поиска мест недоступен — попробуйте ещё раз через минуту'
        : 'Рядом не нашлось интересных мест — попробуйте пересобрать прогулку',
    };
  }
  // Воронка R2: пул замены диверсифицируется по азимуту так же, как шорт-лист
  // сборки — «другое такое же» не должно лежать в одном секторе с текущим.
  const shortlist = diversifyByAzimuth(
    scoreCandidatePool({ pool, profile, weather, hour, timezone: timeZone, now, excludeIds }).map(
      (entry) => ({ entry, coordinates: entry.place.coordinates }),
    ),
    start,
    REPLACE_CANDIDATE_CAP,
  ).map((item) => item.entry);
  if (shortlist.length === 0) {
    return { ok: false, error: 'Кандидатов на замену не нашлось — попробуйте пересобрать прогулку' };
  }
  // «Заменить» означает «дай другое такое же»: кандидаты той же категории,
  // что и заменяемая, идут первыми (стабильная сортировка — скор-порядок
  // внутри групп сохраняется), остальные типы — вторым эшелоном.
  const replaceCategory = input.currentStops.find((stop) => stop.id === input.replaceStopId)?.category;
  const orderedShortlist = replaceCategory
    ? [...shortlist].sort(
        (a, b) =>
          Number(a.place.category !== replaceCategory) - Number(b.place.category !== replaceCategory),
      )
    : shortlist;

  // Уличный план (§19.6): замена гарниша без пересборки петли. Ноги приходят
  // с клиента с геометриями — кольцо розы выводится из их концов; без
  // геометрий честно отказываем (перестройка старт→якорь→старт уничтожила бы
  // петлю), полная пересборка через «Заменить»-тост остаётся фолбэком.
  if (input.planKind === 'street') {
    const clientLegs = Array.isArray(input.currentLegs) ? input.currentLegs : [];
    const legsIncomplete =
      clientLegs.length < 2 ||
      clientLegs.some((leg) => !Array.isArray(leg.geometry) || leg.geometry.length < 2);
    if (legsIncomplete) {
      return {
        ok: false,
        error: 'Замена для этой прогулки недоступна — пересоберите её с теми же параметрами',
      };
    }
    const streetResult = await replaceStreetGarnish(
      {
        start,
        budgetMinutes: input.budgetMinutes,
        categoryWeights: profile.categoryWeights,
        // Стоянки — из архетипа с сезонной поправкой, как в сборке: без них
        // новый якорь получает дефолтную таблицу и рассинхронизируется.
        categoryStayMinutes: seasonalStayMinutes(
          archetype.stayMinutes,
          month,
          weather ? weather.tempC : null,
        ) as Record<string, number>,
        currentPlan: {
          stops: input.currentStops.map((stop) => ({
            place: {
              id: stop.id,
              name: stop.name ?? '',
              category: stop.category,
              coordinates: stop.coordinates,
              ...(stop.rating !== undefined ? { rating: stop.rating } : {}),
              ...(stop.tags ? { tags: stop.tags } : {}),
            },
            stayMinutes: stop.stayMin,
            reason: stop.reason,
          })),
          legs: clientLegs.map((leg) => ({
            // Кольцо из фактов ног: конец геометрии — вершина кольца.
            from: leg.geometry![0],
            to: leg.geometry![leg.geometry!.length - 1],
            distanceMeters: Math.round((leg.walkMin * DEFAULT_WALKING_SPEED_KMH * 1000) / 60),
            durationMinutes: leg.walkMin,
            geometry: leg.geometry!,
          })),
        },
        replaceIndex: input.currentStops.findIndex((stop) => stop.id === input.replaceStopId),
        candidates: orderedShortlist.map((entry) => entry.place),
        ...(input.currentGatesPassed !== undefined
          ? { currentGatesPassed: input.currentGatesPassed }
          : {}),
        // Факт снапа не меняется (петля не трогается) — перенос как есть.
        ...(input.streetInterestPass ? { streetInterestReport: STREET_INTEREST_REPORT } : {}),
      },
      memoizeRoutingPort(provider),
    );
    if (!streetResult.ok) {
      const messages: Record<string, string> = {
        NO_CANDIDATES: 'Достойной замены рядом не нашлось — попробуйте пересобрать прогулку',
        NO_ROUTE: 'Не удалось построить пешеходный маршрут — попробуйте ещё раз',
        INVALID_INPUT: 'Замена для этой прогулки недоступна — пересоберите её',
      };
      return {
        ok: false,
        error: messages[streetResult.failure.code] ?? 'Не удалось заменить остановку',
      };
    }
    const streetLocale = input.locale ?? 'ru';
    const reasons = mergeReasonsForPlan(input, shortlist);
    const [streetPlan] = enginePlansToUiPlans([streetResult.plan], input.budgetMinutes, streetLocale, reasons);
    return { ok: true, plan: streetPlan };
  }

  const result = await replaceStopInPlan(
    {
      start,
      budgetMinutes: input.budgetMinutes,
      categoryWeights: profile.categoryWeights,
      // Стоянки — из архетипа с сезонной поправкой (холод: улица короче), как
      // в сборке: без них новая остановка получает дефолтную таблицу
      // (парк 25 вместо 30) и рассинхронизируется с планом.
      categoryStayMinutes: seasonalStayMinutes(
        archetype.stayMinutes,
        month,
        weather ? weather.tempC : null,
      ) as Record<string, number>,
      currentPlan: buildEnginePlan(input),
      replaceIndex: input.currentStops.findIndex((stop) => stop.id === input.replaceStopId),
      candidates: orderedShortlist.map((entry) => entry.place),
      ...(input.currentGatesPassed !== undefined
        ? { currentGatesPassed: input.currentGatesPassed }
        : {}),
    },
    memoizeRoutingPort(provider),
  );

  if (!result.ok) {
    // replaceStopInPlan возвращает только эти три кода; карта без мёртвых веток.
    const messages: Record<string, string> = {
      NO_CANDIDATES: 'Достойной замены рядом не нашлось — попробуйте пересобрать прогулку',
      NO_ROUTE: 'Не удалось построить пешеходный маршрут — попробуйте ещё раз',
      INVALID_INPUT: 'Некорректные параметры прогулки',
    };
    return { ok: false, error: messages[result.failure.code] ?? 'Не удалось заменить остановку' };
  }

  // Причины выживших остановок — с клиента (факты прошлого скоринга тех же
  // мест); карта шорт-листа покрывает только новую остановку и её конкурентов.
  const locale = input.locale ?? 'ru';
  const reasonsMap = mergeReasonsForPlan(input, shortlist);
  const [plan] = enginePlansToUiPlans([result.plan], input.budgetMinutes, locale, reasonsMap);
  return { ok: true, plan };
}

/** Отчёт гейта интереса для переноса в заменённый street-план (факт снапа). */
const STREET_INTEREST_REPORT: GateReport = {
  gate: 'street_interest',
  pass: true,
  detail: 'петля притянута к характерным секторам (сохранено при замене)',
};

/** Карта причин: скоринг шорт-листа + причины выживших с клиента как есть. */
function mergeReasonsForPlan(
  input: QuickWalkReplaceInput,
  shortlist: ScoredPoolEntry[],
): Map<string, WalkScoreReasons> {
  const clientReasons = new Map<string, WalkScoreReasons>();
  for (const stop of input.currentStops) {
    if (isScoreReasons(stop.scoreReasons)) clientReasons.set(stop.id, stop.scoreReasons);
  }
  return mergeScoreReasons(buildScoreReasonsMap(shortlist), clientReasons);
}
