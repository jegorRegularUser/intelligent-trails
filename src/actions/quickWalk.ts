"use server";

// Серверный экшен главного сценария «Прогуляться сейчас» (docs/PRODUCT.md, вход №1).
// Ревизия 2026-11-18 «улица первична» (docs/walk-engine.md §19): конвейер
// зависит от вайба —
//   rain  → якорь-драйвен: пул POI → скоринг → строгий движок → лестница
//           деградации. Дождь — единственное исключение из уличного правила:
//           крытые музеи/галереи — честно местовая логика.
//   иначе → street-first: уличная петля (умная роза со снапом) сама заполняет
//           бюджет, POI — гарниш 0–2 в коридоре петли; пустой пул — не отказ.
// Экшен тонкий: склейка пула и скоринга живёт в quickPipeline (её же ест
// локальная замена остановки), логика — в чистых модулях (geo/vibes/walk).
import { getCloudProvider } from '@/lib/geo/instance';
import { memoizeRoutingPort } from '@/lib/walk/memoPort';
import { fetchWeatherContext } from '@/lib/weather';
import { getArchetype } from '@/lib/vibes/archetypes';
import { combineContext, seasonalStayMinutes } from '@/lib/vibes/combine';
import { userLocalHour, userLocalMonth } from '@/lib/vibes/localHour';
import { streetLoopNote } from '@/lib/vibes/streetInterest';
import {
  createWalkPlan,
  buildWalkWithFallback,
  buildStreetFirstPlans,
  isUnderfloor,
  minimalLoopZoneMeters,
} from '@/lib/walk';
import { enginePlansToUiPlans } from '@/lib/walk/uiAdapter';
import {
  buildScoreReasonsMap,
  collectCandidates,
  fetchStreetInterest,
  scoreCandidatePool,
  diversifyByAzimuth,
  DEFAULT_TIMEZONE,
  ENGINE_CANDIDATE_CAP,
  MAX_BUDGET,
  MIN_BUDGET,
  SECOND_WAVE_MULTIPLIER,
  type StreetInterestBundle,
} from '@/lib/walk/quickPipeline';
import { haversineMeters } from '@/lib/walk/internal/geo';
import type { VibeId } from '@/components/walk/logic';
import type { WalkPlan as UiWalkPlan } from '@/components/walk/types';
import type { WalkPlan as EnginePlan } from '@/lib/walk/types';
import type { GeoPlace } from '@/lib/geo';

/**
 * Вайб приходит с главного экрана в словаре UI (logic.ts VIBE_IDS).
 * Ревизия 2026-11-18: 'sightseeing' убран — вкладка «Новый город» удалена
 * (PRODUCT.md, «Два сценария входа»); архетип sightseeing остался в vibes
 * как запасной профиль, но экшен его больше не принимает.
 */
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

/** Общий контекст сборки: один и тот же для обоих конвейеров (§19.1). */
interface BuildContext {
  start: [number, number];
  budgetMinutes: number;
  input: QuickWalkInput;
  profile: ReturnType<typeof combineContext>;
  archetype: ReturnType<typeof getArchetype>;
  weather: Awaited<ReturnType<typeof fetchWeatherContext>>;
  hour?: number;
  timezone: string;
  now: Date;
  excluded: ReadonlySet<string>;
  categoryStayMinutes: Record<string, number>;
  routingPort: ReturnType<typeof memoizeRoutingPort>;
  fastMode: boolean;
  context: WalkContextInfo;
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
  // общий на оба конвейера — повторный заход по тому же району почти бесплатен.
  const routingPort = memoizeRoutingPort(provider);
  // Стоянки — из архетипа с сезонной поправкой (холод: улица короче); без них
  // таблица живёт на дефолтах (парк 25 вместо 30).
  const categoryStayMinutes = seasonalStayMinutes(
    archetype.stayMinutes,
    month,
    weather ? weather.tempC : null,
  ) as Record<string, number>;

  const build: BuildContext = {
    start,
    budgetMinutes: input.budgetMinutes,
    input,
    profile,
    archetype,
    weather,
    hour,
    timezone: timeZone,
    now,
    excluded,
    categoryStayMinutes,
    routingPort,
    fastMode: await provider.isFastArea(start),
    context,
  };

  // Дождь — якорь-драйвен исключение (§19.1): под дождём улица не содержание,
  // а проблема; ядро плана — крытые музеи/галереи/ТЦ с честными причинами.
  if (input.vibe === 'rain') {
    return buildAnchoredWalk(build);
  }
  // Все остальные вайбы — улица первична (§19): петля решает, якоря — гарниш.
  return buildStreetWalk(build);
}

// --- Конвейер дождя: якорь-драйвен (§4–§18 без изменений) --------------------

async function buildAnchoredWalk(build: BuildContext): Promise<QuickWalkResult> {
  const { start, budgetMinutes, input, profile, archetype, weather, hour, timezone, now, excluded } = build;
  const provider = getCloudProvider();

  const engineInputBase = {
    start,
    budgetMinutes,
    categoryWeights: profile.categoryWeights,
    categoryStayMinutes: build.categoryStayMinutes,
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
    street: StreetInterestBundle | null,
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
    const scored = scoreCandidatePool({ pool, profile, weather, hour, timezone, now, excludeIds: excluded });
    if (scored.length === 0) {
      return { ok: false, error: 'Все найденные места вы исключили — попробуйте пересобрать прогулку' };
    }
    // Воронка R2: сектора азимута отбираются по кандидатам минимальной зоны
    // вариантов — иначе сектора зальют шорт-лист теми, кого узкий вариант
    // отсечёт по зоне, и он умрёт NO_CANDIDATES. Разреженный пул (спальный
    // район) добирается внешними кандидатами по скору: ядро узкого варианта
    // уже набрано, широкий вариант получает свой радиус.
    const minZone = minimalLoopZoneMeters(budgetMinutes);
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
    // Улицы с характером (S6): данные есть → фичи + hints едут в движок
    // (микро-стопы, тайбрейкер альтернатив, снап петли L3); нет → поля
    // остаются undefined, планы бит-в-бит совпадают с прежними.
    const engineInput = {
      ...engineInputBase,
      ...(street ? { streetFeatures: street.features, streetHints: street.hints } : {}),
    };
    const planResult = await createWalkPlan({ ...engineInput, candidates }, build.routingPort);

    if (!planResult.ok) {
      // Лестница деградации (PRODUCT: почти всегда прогулка): строгий движок
      // честен, но спальный район не должен ронять главный сценарий. Тот же
      // мемо-порт; INVALID_INPUT деградацией не лечится — отсекается в оркестраторе.
      // Отказ строгого движка передаётся как есть: лестница не прогоняет его второй раз.
      const fallback = await buildWalkWithFallback(
        { ...engineInput, candidates },
        build.routingPort,
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
        uiPlans: enginePlansToUiPlans(fallback.plans, budgetMinutes, locale, buildScoreReasonsMap(shortlist)),
        enginePlans: fallback.plans,
      };
    }

    const locale = input.locale ?? 'ru';
    return {
      ok: true,
      // Скоринговые причины едут в карточку вместе с планом: якорная строка
      // из движка остаётся главной, PlaceScore — вторичные чипы.
      uiPlans: enginePlansToUiPlans(planResult.plans, budgetMinutes, locale, buildScoreReasonsMap(shortlist)),
      enginePlans: planResult.plans,
    };
  };

  const { places: pool, searchFailed } = await collectCandidates(provider, start, build.profile, budgetMinutes);
  // Улицы с характером (S6/S7): фичи улиц — отдельным «батчем из 1» ПОСЛЕ
  // последней категории POI (пауза внутри, вне ретрай-волны, упал → null).
  // Бандл общий для обеих волн поиска: в провайдере TTL-кэш 10 мин.
  const streetBundle = await fetchStreetInterest(provider, start, budgetMinutes, build.archetype);
  const first = await assemble(pool, searchFailed, streetBundle);
  let result = first;

  // Недобор (R1.d): добор живёт внутри пула движка; если и он не дотянул до
  // пола коридора — единственная эскалация на уровне экшена: вторая волна
  // поиска с расширенным радиусом и пересборка. Вторая волна не дотянула
  // или отказала — возвращаем первую как есть: фиктивных минут не бывает.
  if (first.ok && isUnderfloor(first.enginePlans[0], budgetMinutes)) {
    const secondPool = await collectCandidates(provider, start, build.profile, budgetMinutes, {
      radiusMultiplier: SECOND_WAVE_MULTIPLIER,
    });
    const second = await assemble(secondPool.places, secondPool.searchFailed, streetBundle);
    if (second.ok && !isUnderfloor(second.enginePlans[0], budgetMinutes)) {
      result = second;
    }
  }

  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    plans: result.uiPlans,
    fastMode: build.fastMode,
    context: build.context,
  };
}

// --- Конвейер «улица первична»: петля + гарниш (walk-engine.md §19) ----------

async function buildStreetWalk(build: BuildContext): Promise<QuickWalkResult> {
  const { start, budgetMinutes, input, profile, archetype, weather, hour, timezone, now, excluded } = build;
  const provider = getCloudProvider();

  // Пул гарниша (§19.1): пустой пул или упавший поиск — это 0 якорей, а не
  // отказ прогулки; петля от POI не зависит.
  const { places: pool } = await collectCandidates(provider, start, profile, budgetMinutes);
  const scored =
    pool.length > 0
      ? scoreCandidatePool({ pool, profile, weather, hour, timezone, now, excludeIds: excluded })
      : [];

  // Улицы с характером (S6/S7): отдельным «батчем из 1» после POI (пауза
  // внутри); упал → null → петля без данных среды с честной заметкой (§19.5).
  const streetBundle = await fetchStreetInterest(provider, start, budgetMinutes, archetype);

  const streetResult = await buildStreetFirstPlans({
    start,
    budgetMinutes,
    // Скор-порядок пула = порядок выбора гарниша (§19.3); никакой зонной
    // обрезки и диверсификации — гарниш отбирается коридором петли, а не
    // зоной вариантов якорь-драйвена.
    candidates: scored.map((entry) => entry.place),
    categoryWeights: profile.categoryWeights,
    categoryStayMinutes: build.categoryStayMinutes,
    ...(archetype.categoryLimits
      ? { categoryLimits: archetype.categoryLimits as Record<string, number> }
      : {}),
    ...(streetBundle ? { streetFeatures: streetBundle.features, streetHints: streetBundle.hints } : {}),
    ports: build.routingPort,
  });
  if (!streetResult.ok) {
    // Отказ уличной петли — мёртвый роутер (§19.1); INVALID_INPUT — параметры.
    return {
      ok: false,
      error:
        streetResult.failure.code === 'INVALID_INPUT'
          ? 'Некорректные параметры прогулки'
          : 'Даже простая петля не построилась — роутер недоступен, попробуй ещё раз через минуту',
    };
  }

  const locale = input.locale ?? 'ru';
  return {
    ok: true,
    // Заметка «почему петля идёт тут» (§19.7): архетипные множители решили,
    // куда пошла роза, — формулировка называет это словами вайба.
    plans: enginePlansToUiPlans(
      streetResult.plans,
      budgetMinutes,
      locale,
      buildScoreReasonsMap(scored),
      streetLoopNote(archetype.id),
    ),
    fastMode: build.fastMode,
    context: build.context,
  };
}
