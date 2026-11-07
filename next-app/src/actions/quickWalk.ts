"use server";

// Серверный экшен главного сценария «Прогуляться сейчас» (docs/PRODUCT.md, вход №1).
// Конвейер: CloudProvider → погода → архетип+контекст → скоринг → движок → UI-план.
// Экшен тонкий: вся логика — в чистых модулях (geo/vibes/walk), здесь только склейка.
import { CloudProvider, type GeoPlace, type GeoProvider } from '@/lib/geo';
import { fetchWeatherContext } from '@/lib/weather';
import { getArchetype } from '@/lib/vibes/archetypes';
import { combineContext, type AdjustedProfile } from '@/lib/vibes/combine';
import { scorePlace } from '@/lib/vibes/ranking';
import { evaluateOpeningHours } from '@/lib/places/hours';
import { createWalkPlan, type WalkPlan } from '@/lib/walk';
import { enginePlanToUiPlan } from '@/lib/walk/uiAdapter';
import type { VibeId } from '@/components/walk/logic';
import type { WalkPlan as UiWalkPlan } from '@/components/walk/types';
import { PLACE_CATEGORIES } from '@/constants/categories';

/** Вайб приходит с главного экрана в словаре UI (logic.ts VIBE_IDS). */
export type QuickVibe = VibeId;

export interface QuickWalkInput {
  /** [lat, lng] — точка старта (геолокация браузера). */
  start: [number, number];
  budgetMinutes: number;
  vibe: QuickVibe;
  /** Идентификаторы остановок, которые не показывать (кнопка «Заменить» = пересборка без них). */
  excludeStopIds?: string[];
}

export type QuickWalkResult =
  | { ok: true; plan: UiWalkPlan; fastMode: boolean }
  | { ok: false; error: string };

const MIN_BUDGET = 15;
const MAX_BUDGET = 240;

/** Пул кандидатов, который движок готов переварить: скоринг режет до этого. */
const ENGINE_CANDIDATE_CAP = 40;

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

/**
 * Радиус поиска POI: примерно 40% бюджета времени — на радиус петли
 * (остальное — ходьба туда-обратно и стоянки). Скорость из движка (4.5 км/ч).
 */
function searchRadiusMeters(budgetMinutes: number): number {
  const mPerMin = (4.5 * 1000) / 60;
  return Math.round(mPerMin * budgetMinutes * 0.4);
}

/** Поиск кандидатов по всем категориям профиля (вес > 0), параллельно, с деградацией. */
async function collectCandidates(
  provider: GeoProvider,
  start: [number, number],
  profile: AdjustedProfile,
  budgetMinutes: number,
): Promise<GeoPlace[]> {
  const radius = searchRadiusMeters(budgetMinutes);
  const categories = (Object.entries(profile.categoryWeights) as [string, number][])
    .filter(([, w]) => w > 0)
    .map(([c]) => c)
    .filter((c) => c in PLACE_CATEGORIES);

  const settled = await Promise.allSettled(
    categories.map((category) => provider.searchPlaces(start, category, { radiusMeters: radius, limit: 12 })),
  );

  const byKey = new Map<string, GeoPlace>();
  for (const outcome of settled) {
    if (outcome.status !== 'fulfilled') continue; // категория упала — деградация, не падение всего
    for (const place of outcome.value) {
      const key = `${place.id}|${place.coordinates[0].toFixed(5)},${place.coordinates[1].toFixed(5)}`;
      if (!byKey.has(key)) byKey.set(key, place);
    }
  }
  return [...byKey.values()];
}

export async function buildQuickWalk(input: QuickWalkInput): Promise<QuickWalkResult> {
  const invalid = validateInput(input);
  if (invalid) return { ok: false, error: invalid };

  // Контракт geo-слоя: провайдер собирается на сервере, ключи клиенту не уходят.
  // Пустая строка = «ключа нет» — роутинг честно деградирует в NO_ROUTE.
  const provider = new CloudProvider({
    orsApiKey: process.env.OPENROUTESERVICE_API_KEY ?? '',
  });
  const start = input.start;
  const now = new Date();

  // Погода и профиль контекста — обе деградируют честно (null/без модификаторов).
  const weather = await fetchWeatherContext(start[0], start[1]).catch(() => null);
  // Словарь UI говорит 'rain', архетип в vibes — 'rainy'
  const archetype = getArchetype(input.vibe === 'rain' ? 'rainy' : input.vibe);
  const profile = combineContext(archetype, weather, now);

  const timeZone = 'Europe/Moscow'; // пока фиксированная; поле в профиле пользователя появится с i18n-настройками
  const hour = now.getHours();

  const pool = await collectCandidates(provider, start, profile, input.budgetMinutes);
  if (pool.length === 0) {
    return { ok: false, error: 'Рядом не нашлось интересных мест — попробуйте увеличить бюджет или сменить вайб' };
  }

  const excluded = new Set(input.excludeStopIds ?? []);
  const scored = pool
    .filter((place) => !excluded.has(`${place.id}`))
    .map((place) => {
      const score = scorePlace(place, {
        archetype: profile,
        weather,
        hour,
        hoursState: evaluateOpeningHours(place.tags?.opening_hours, now, timeZone),
      });
      return { place, score: score.score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, ENGINE_CANDIDATE_CAP)
    .map(({ place }) => place);

  if (scored.length === 0) {
    return { ok: false, error: 'Все найденные места вы исключили — попробуйте пересобрать прогулку' };
  }

  // Порт маршрутизации: структурная совместимость GeoProvider ↔ WalkRoutingPort.
  const planResult = await createWalkPlan(
    {
      start,
      budgetMinutes: input.budgetMinutes,
      categoryWeights: profile.categoryWeights,
      candidates: scored,
      isLoop: true,
    },
    provider,
  );

  if (!planResult.ok) {
    const messages: Record<string, string> = {
      NOT_ENOUGH_TIME: 'В этот бюджет прогулка не влезает — попробуйте увеличить время',
      NO_CANDIDATES: 'Слишком мало подходящих мест рядом',
      NO_ROUTE: 'Не удалось построить пешеходный маршрут — попробуйте ещё раз',
      INVALID_INPUT: 'Некорректные параметры прогулки',
    };
    return { ok: false, error: messages[planResult.failure.code] ?? 'Не удалось построить прогулку' };
  }

  const best = planResult.plans[0] as WalkPlan;
  return {
    ok: true,
    plan: enginePlanToUiPlan(best, input.budgetMinutes),
    fastMode: await provider.isFastArea(start),
  };
}
