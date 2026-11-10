"use server";

// Локальная замена остановки «Быстрой прогулки» (docs/PRODUCT.md, принцип 3):
// меняется сегмент петли, а не вся прогулка. Пул и скоринг — те же, что при
// сборке (quickPipeline), движку уходит топ-8 кандидатов без заменяемой и без
// уже стоящих остановок. Остановки и ноги текущего плана приходят с клиента
// и переиспользуются как есть; полная пересборка через buildQuickWalk остаётся
// фолбэком на случай отказа замены.
import { getCloudProvider } from '@/lib/geo/instance';
import { memoizeRoutingPort } from '@/lib/walk/memoPort';
import { replaceStopInPlan, type ReplaceablePlan } from '@/lib/walk/replaceStop';
import { DEFAULT_WALKING_SPEED_KMH } from '@/lib/walk/types';
import {
  buildScoreReasonsMap,
  collectCandidates,
  mergeScoreReasons,
  scoreCandidatePool,
  DEFAULT_TIMEZONE,
  MAX_BUDGET,
  MIN_BUDGET,
  REPLACE_CANDIDATE_CAP,
} from '@/lib/walk/quickPipeline';
import { enginePlansToUiPlans } from '@/lib/walk/uiAdapter';
import { fetchWeatherContext } from '@/lib/weather';
import { getArchetype } from '@/lib/vibes/archetypes';
import { combineContext } from '@/lib/vibes/combine';
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
  /** Пройдено гейтов у текущего плана (петля = 4, если gatesPass). */
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

/**
 * Текущий план в терминах движка. Ноги реиспользуются только при полной
 * длине петли (stops+1) — иначе движок честно перестроит все; дистанция
 * переиспользованных ног — оценка по скорости, UI её не показывает.
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

  return { stops, ...(legs ? { legs } : {}) };
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
  const profile = combineContext(archetype, weather, now);
  const timeZone = input.timezone ?? DEFAULT_TIMEZONE;
  const hour = now.getHours();

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
  const shortlist = scoreCandidatePool({ pool, profile, weather, hour, timezone: timeZone, now, excludeIds })
    .slice(0, REPLACE_CANDIDATE_CAP);
  if (shortlist.length === 0) {
    return { ok: false, error: 'Кандидатов на замену не нашлось — попробуйте пересобрать прогулку' };
  }

  const result = await replaceStopInPlan(
    {
      start,
      budgetMinutes: input.budgetMinutes,
      categoryWeights: profile.categoryWeights,
      // Стоянки — из архетипа, как в сборке: без них новая остановка получает
      // дефолтную таблицу (парк 25 вместо 30) и рассинхронизируется с планом.
      categoryStayMinutes: archetype.stayMinutes as Record<string, number>,
      currentPlan: buildEnginePlan(input),
      replaceIndex: input.currentStops.findIndex((stop) => stop.id === input.replaceStopId),
      candidates: shortlist.map((entry) => entry.place),
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
  const clientReasons = new Map<string, WalkScoreReasons>();
  for (const stop of input.currentStops) {
    if (isScoreReasons(stop.scoreReasons)) clientReasons.set(stop.id, stop.scoreReasons);
  }
  const reasonsMap = mergeScoreReasons(buildScoreReasonsMap(shortlist), clientReasons);

  const locale = input.locale ?? 'ru';
  const [plan] = enginePlansToUiPlans([result.plan], input.budgetMinutes, locale, reasonsMap);
  return { ok: true, plan };
}
