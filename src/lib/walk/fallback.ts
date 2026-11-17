// src/lib/walk/fallback.ts
// Оркестратор лестницы деградации главного сценария (PRODUCT: «Прогуляться
// сейчас» почти всегда выдаёт прогулку; экран ошибки — только когда мёртв
// роутер). L1 — строгий движок с гейтами; при его отказе L2 — петля через
// лучших кандидатов пула; при пустом пуле L3 — чистая уличная петля; если
// упала и она — честный отказ L1 (самый информативный).
// Чистый модуль: вход/выход — типы движка, никакого UI и сети.

import type { WalkFailure, WalkInput, WalkPlan, WalkPlanResult } from './types';
import type { WalkRoutingPort } from './ports';
import { createWalkPlan } from './createWalkPlan';
import { buildLoopThroughCandidates } from './loopThrough';
import { buildStreetLoop } from './streetLoop';

export type WalkWithFallbackResult =
  | { ok: true; plans: WalkPlan[] }
  | { ok: false; failure: WalkFailure };

export interface WalkWithFallbackOptions {
  /**
   * Уже посчитанный результат строгого движка. Оркестратор уровня экшена
   * зовёт createWalkPlan сам и передаёт отказ сюда — без него лестница
   * прогоняла бы строгий движок второй раз (матрица 60×60 — не бесплатна).
   */
  strict?: WalkPlanResult;
}

export async function buildWalkWithFallback(
  input: WalkInput,
  ports: WalkRoutingPort,
  options: WalkWithFallbackOptions = {},
): Promise<WalkWithFallbackResult> {
  const strict = options.strict ?? (await createWalkPlan(input, ports));
  if (strict.ok) return strict; // деградация не понадобилась, гейты строгие

  // Кривой вход — деградацией не лечится, честный отказ сразу.
  if (strict.failure.code === 'INVALID_INPUT') return strict;
  // Лестница определена только для петли главного сценария; А→Б деградирует
  // по-другому (укорачивание коридора) и здесь не трогается.
  if (!input.isLoop) return strict;

  const loopThrough = await buildLoopThroughCandidates(
    {
      start: input.start,
      budgetMinutes: input.budgetMinutes,
      speedKmh: input.walkingSpeedKmh,
      categoryWeights: input.categoryWeights,
      categoryStayMinutes: input.categoryStayMinutes,
      candidates: input.candidates,
    },
    ports,
  );
  if (loopThrough.ok) return { ok: true, plans: [loopThrough.plan] };

  const streetLoop = await buildStreetLoop({
    start: input.start,
    budgetMinutes: input.budgetMinutes,
    speedKmh: input.walkingSpeedKmh,
    ports,
  });
  if (streetLoop.ok) return { ok: true, plans: [streetLoop.plan] };

  return { ok: false, failure: strict.failure };
}
