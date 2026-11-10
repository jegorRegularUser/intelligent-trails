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
import { createWalkPlan, buildWalkWithFallback } from '@/lib/walk';
import { enginePlansToUiPlans } from '@/lib/walk/uiAdapter';
import {
  buildScoreReasonsMap,
  collectCandidates,
  scoreCandidatePool,
  DEFAULT_TIMEZONE,
  ENGINE_CANDIDATE_CAP,
  MAX_BUDGET,
  MIN_BUDGET,
} from '@/lib/walk/quickPipeline';
import type { VibeId } from '@/components/walk/logic';
import type { WalkPlan as UiWalkPlan } from '@/components/walk/types';

/** Вайб приходит с главного экрана в словаре UI (logic.ts VIBE_IDS). */
export type QuickVibe = VibeId;

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

  const { places: pool, searchFailed } = await collectCandidates(provider, start, profile, input.budgetMinutes);
  if (pool.length === 0) {
    // Все категории упали — это «поиск недоступен», а не «мало мест».
    return {
      ok: false,
      error: searchFailed
        ? 'Сервис поиска мест недоступен — попробуйте ещё раз через минуту'
        : 'Рядом не нашлось интересных мест — попробуйте увеличить бюджет или сменить вайб',
    };
  }

  const excluded = new Set(input.excludeStopIds ?? []);
  const scored = scoreCandidatePool({ pool, profile, weather, hour, timezone: timeZone, now, excludeIds: excluded });
  if (scored.length === 0) {
    return { ok: false, error: 'Все найденные места вы исключили — попробуйте пересобрать прогулку' };
  }
  const shortlist = scored.slice(0, ENGINE_CANDIDATE_CAP);

  // Порт маршрутизации: структурная совместимость GeoProvider ↔ WalkRoutingPort.
  // Мемо-слой гасит дубли route-запросов между вариантами и зеркалом кольца.
  const routingPort = memoizeRoutingPort(provider);
  // Стоянки — из архетипа с сезонной поправкой (холод: улица короче); без них
  // таблица живёт на дефолтах (парк 25 вместо 30).
  const categoryStayMinutes = seasonalStayMinutes(
    archetype.stayMinutes,
    month,
    weather ? weather.tempC : null,
  ) as Record<string, number>;
  const planResult = await createWalkPlan(
    {
      start,
      budgetMinutes: input.budgetMinutes,
      categoryWeights: profile.categoryWeights,
      categoryStayMinutes,
      candidates: shortlist.map((entry) => entry.place),
      isLoop: true,
    },
    routingPort,
  );

  if (!planResult.ok) {
    // Лестница деградации (PRODUCT: почти всегда прогулка): строгий движок
    // честен, но спальный район не должен ронять главный сценарий. Тот же
    // мемо-порт; INVALID_INPUT деградацией не лечится — отсекается в оркестраторе.
    const fallback = await buildWalkWithFallback(
      {
        start,
        budgetMinutes: input.budgetMinutes,
        categoryWeights: profile.categoryWeights,
        categoryStayMinutes,
        candidates: shortlist.map((entry) => entry.place),
        isLoop: true,
      },
      routingPort,
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
      plans: enginePlansToUiPlans(fallback.plans, input.budgetMinutes, locale, buildScoreReasonsMap(shortlist)),
      fastMode: await provider.isFastArea(start),
      context,
    };
  }

  const locale = input.locale ?? 'ru';
  return {
    ok: true,
    // Скоринговые причины едут в карточку вместе с планом: якорная строка
    // из движка остаётся главной, PlaceScore — вторичные чипы.
    plans: enginePlansToUiPlans(planResult.plans, input.budgetMinutes, locale, buildScoreReasonsMap(shortlist)),
    fastMode: await provider.isFastArea(start),
    context,
  };
}
