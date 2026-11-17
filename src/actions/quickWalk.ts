"use server";

// Серверный экшен главного сценария «Прогуляться сейчас» (docs/PRODUCT.md, вход №1).
// Конвейер: CloudProvider → погода → архетип+контекст → скоринг → движок → UI-планы.
// Экшен тонкий: склейка пула и скоринга живёт в quickPipeline (её же ест
// локальная замена остановки), логика — в чистых модулях (geo/vibes/walk).
import { getCloudProvider } from '@/lib/geo/instance';
import { memoizeRoutingPort } from '@/lib/walk/memoPort';
import { fetchWeatherContext } from '@/lib/weather';
import { getArchetype } from '@/lib/vibes/archetypes';
import { combineContext, seasonalStayMinutes } from '@/lib/vibes/combine';
import { userLocalHour, userLocalMonth } from '@/lib/vibes/localHour';
import {
  createWalkPlan,
  buildWalkWithFallback,
  isUnderfloor,
  minimalLoopZoneMeters,
} from '@/lib/walk';
import { enginePlansToUiPlans } from '@/lib/walk/uiAdapter';
import {
  buildScoreReasonsMap,
  collectCandidates,
  scoreCandidatePool,
  diversifyByAzimuth,
  DEFAULT_TIMEZONE,
  ENGINE_CANDIDATE_CAP,
  MAX_BUDGET,
  MIN_BUDGET,
  SECOND_WAVE_MULTIPLIER,
} from '@/lib/walk/quickPipeline';
import { haversineMeters } from '@/lib/walk/internal/geo';
import type { VibeId } from '@/components/walk/logic';
import type { WalkPlan as UiWalkPlan } from '@/components/walk/types';
import type { WalkPlan as EnginePlan } from '@/lib/walk/types';
import type { GeoPlace } from '@/lib/geo';

/**
 * Вайб приходит с главного экрана в словаре UI (logic.ts VIBE_IDS);
 * 'sightseeing' — архетип входа «Новый город» (PRODUCT.md, сценарий №2),
 * кнопки вайба у него нет.
 */
export type QuickVibe = VibeId | 'sightseeing';

export interface QuickWalkInput {
  /** [lat, lng] — точка старта (геолокация или адрес). */
  start: [number, number];
  budgetMinutes: number;
  vibe: QuickVibe;
  /** Идентификаторы остановок, которые не показывать (фолбэк-пересборка «Заменить»). */
  excludeStopIds?: string[];
  /** IANA-таймзона браузера — для «работает ли сейчас». */
  timezone?: string;
  /** Локаль карточки — выбирает словарь причин якорей. */
  locale?: 'ru' | 'en';
}

/** Погодный контекст, который показываем человеку, а не прячем в логи. */
export interface WalkContextInfo {
  isRaining: boolean;
  tempC: number | null;
  isDark: boolean;
  /** Какие корректировки применил combineContext: 'rain-indoor' | 'heat-shade' | 'dark-evening'. */
  adjustments: string[];
}

export type QuickWalkResult =
  | { ok: true; plans: UiWalkPlan[]; fastMode: boolean; context: WalkContextInfo }
  | { ok: false; error: string };

function validateInput(input: QuickWalkInput): string | null {
  const [lat, lng] = input.start;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return 'Некорректные координаты старта';
  }
  if (!Number.isFinite(input.budgetMinutes) || input.budgetMinutes < MIN_BUDGET || input.budgetMinutes > MAX_BUDGET) {
    return `Бюджет должен быть от ${MIN_BUDGET} до ${MAX_BUDGET} минут`;
  }
  return null;
}

export async function buildQuickWalk(input: QuickWalkInput): Promise<QuickWalkResult> {
  const invalid = validateInput(input);
  if (invalid) return { ok: false, error: invalid };

  // Контракт geo-слоя: провайдер собирается на сервере, ключи клиенту не уходят.
  // Синглтон — TTL/LRU-кэши адаптеров переживают вызовы экшена.
  const provider = getCloudProvider();
  const start = input.start;
  const now = new Date();

  // Погода и профиль контекста — обе деградируют честно (null/без модификаторов).
  const weather = await fetchWeatherContext(start[0], start[1]).catch(() => null);
  // Словарь UI говорит 'rain', архетип в vibes — 'rainy'
  const archetype = getArchetype(input.vibe === 'rain' ? 'rainy' : input.vibe);
  // Час и месяц юзера, не сервера: hourAffinity, fallback тьмы и сезон живут
  // в его поясе (docs/vibes.md §8).
  const timeZone = input.timezone ?? DEFAULT_TIMEZONE;
  const hour = userLocalHour(now, input.timezone);
  const month = userLocalMonth(now, input.timezone);
  const profile = combineContext(archetype, weather, now, { hour, month });

  const context: WalkContextInfo = {
    isRaining: weather?.isRaining ?? false,
    tempC: weather?.tempC ?? null,
    isDark: weather ? weather.isDark : false,
    adjustments: profile.adjustments,
  };

  const excluded = new Set(input.excludeStopIds ?? []);

  // Порт маршрутизации: структурная совместимость GeoProvider ↔ WalkRoutingPort.
  // Мемо-слой гасит дубли route-запросов между вариантами и зеркалом кольца;
  // общий на обе волны — второй заход по тому же району почти бесплатен.
  const routingPort = memoizeRoutingPort(provider);
  // Стоянки — из архетипа с сезонной поправкой (холод: улица короче); без них
  // таблица живёт на дефолтах (парк 25 вместо 30).
  const categoryStayMinutes = seasonalStayMinutes(
    archetype.stayMinutes,
    month,
    weather ? weather.tempC : null,
  ) as Record<string, number>;
  const engineInputBase = {
    start,
    budgetMinutes: input.budgetMinutes,
    categoryWeights: profile.categoryWeights,
    categoryStayMinutes,
    // Категориальные потолки архетипа (зелёная: один магазин) — движок
    // берёт их как есть, погодный контекст лимиты не меняет.
    ...(archetype.categoryLimits
      ? { categoryLimits: archetype.categoryLimits as Record<string, number> }
      : {}),
    isLoop: true,
  };

  const assemble = async (
    pool: GeoPlace[],
    poolSearchFailed: boolean,
  ): Promise<{ ok: true; uiPlans: UiWalkPlan[]; enginePlans: EnginePlan[] } | { ok: false; error: string }> => {
    if (pool.length === 0) {
      // Все категории упали — это «поиск недоступен», а не «мало мест».
      return {
        ok: false,
        error: poolSearchFailed
          ? 'Сервис поиска мест недоступен — попробуйте ещё раз через минуту'
          : 'Рядом не нашлось интересных мест — попробуйте увеличить бюджет или сменить вайб',
      };
    }
    const scored = scoreCandidatePool({ pool, profile, weather, hour, timezone: timeZone, now, excludeIds: excluded });
    if (scored.length === 0) {
      return { ok: false, error: 'Все найденные места вы исключили — попробуйте пересобрать прогулку' };
    }
    // Воронка R2: сектора азимута отбираются по кандидатам минимальной зоны
    // вариантов — иначе сектора зальют шорт-лист теми, кого узкий вариант
    // отсечёт по зоне, и он умрёт NO_CANDIDATES. Разреженный пул (спальный
    // район) добирается внешними кандидатами по скору: ядро узкого варианта
    // уже набрано, широкий вариант получает свой радиус.
    const minZone = minimalLoopZoneMeters(input.budgetMinutes);
    const withCoords = scored.map((entry) => ({ entry, coordinates: entry.place.coordinates }));
    const core = diversifyByAzimuth(
      withCoords.filter((item) => haversineMeters(start, item.coordinates) <= minZone),
      start,
      ENGINE_CANDIDATE_CAP,
    ).map((item) => item.entry);
    let shortlist = core;
    if (core.length < ENGINE_CANDIDATE_CAP) {
      const takenIds = new Set(core.map((entry) => `${entry.place.id}`));
      shortlist = [...core, ...scored.filter((entry) => !takenIds.has(`${entry.place.id}`))]
        .slice(0, ENGINE_CANDIDATE_CAP);
    }
    const candidates = shortlist.map((entry) => entry.place);
    const planResult = await createWalkPlan({ ...engineInputBase, candidates }, routingPort);

    if (!planResult.ok) {
      // Лестница деградации (PRODUCT: почти всегда прогулка): строгий движок
      // честен, но спальный район не должен ронять главный сценарий. Тот же
      // мемо-порт; INVALID_INPUT деградацией не лечится — отсекается в оркестраторе.
      // Отказ строгого движка передаётся как есть: лестница не прогоняет его второй раз.
      const fallback = await buildWalkWithFallback(
        { ...engineInputBase, candidates },
        routingPort,
        { strict: planResult },
      );
      if (!fallback.ok) {
        // Упала и уличная петля — роутер недоступен; INVALID_INPUT — наши параметры.
        return {
          ok: false,
          error:
            fallback.failure.code === 'INVALID_INPUT'
              ? 'Некорректные параметры прогулки'
              : 'Даже простая петля не построилась — роутер недоступен, попробуй ещё раз через минуту',
        };
      }
      const locale = input.locale ?? 'ru';
      return {
        ok: true,
        uiPlans: enginePlansToUiPlans(fallback.plans, input.budgetMinutes, locale, buildScoreReasonsMap(shortlist)),
        enginePlans: fallback.plans,
      };
    }

    const locale = input.locale ?? 'ru';
    return {
      ok: true,
      // Скоринговые причины едут в карточку вместе с планом: якорная строка
      // из движка остаётся главной, PlaceScore — вторичные чипы.
      uiPlans: enginePlansToUiPlans(planResult.plans, input.budgetMinutes, locale, buildScoreReasonsMap(shortlist)),
      enginePlans: planResult.plans,
    };
  };

  const { places: pool, searchFailed } = await collectCandidates(provider, start, profile, input.budgetMinutes);
  const first = await assemble(pool, searchFailed);
  let result = first;

  // Недобор (R1.d): добор живёт внутри пула движка; если и он не дотянул до
  // пола коридора — единственная эскалация на уровне экшена: вторая волна
  // поиска с расширенным радиусом и пересборка. Вторая волна не дотянула
  // или отказала — возвращаем первую как есть: фиктивных минут не бывает.
  if (first.ok && isUnderfloor(first.enginePlans[0], input.budgetMinutes)) {
    const secondPool = await collectCandidates(provider, start, profile, input.budgetMinutes, {
      radiusMultiplier: SECOND_WAVE_MULTIPLIER,
    });
    const second = await assemble(secondPool.places, secondPool.searchFailed);
    if (second.ok && !isUnderfloor(second.enginePlans[0], input.budgetMinutes)) {
      result = second;
    }
  }

  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    plans: result.uiPlans,
    fastMode: await provider.isFastArea(start),
    context,
  };
}
