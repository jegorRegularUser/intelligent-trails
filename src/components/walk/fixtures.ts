// Фейковые планы прогулок «как будто ответил движок». Только для визуала
// и демо: здесь нет ни роутинга, ни геоданных. Тесты следят, чтобы totals
// сходились с stops/legs — иначе бейдж бюджета начнёт врать в демо.

import { budgetOverrunPercent, isWithinBudget } from "./logic";
import type { WalkPlan, WalkStop, WalkStopKind } from "./types";

/** Зелёная петля, час: укладывается в бюджет с запасом */
export const GREEN_LOOP_60: WalkPlan = {
  id: "fixture-green-60",
  type: "loop",
  budgetMin: 60,
  stops: [
    {
      id: "stop-skver",
      name: "Сквер у ратуши",
      kind: "park",
      stayMin: 10,
      reason: "Тень и скамейки у фонтана",
    },
    {
      id: "stop-naberezhnaya",
      name: "Набережная",
      kind: "waterfront",
      stayMin: 12,
      reason: "Лучший вид на закат, вода рядом",
    },
    {
      id: "stop-kofeynya-most",
      name: "Кофейня «Мост»",
      kind: "cafe",
      stayMin: 13,
      reason: "Работает сейчас, окна на реку",
    },
  ],
  legs: [{ walkMin: 6 }, { walkMin: 7 }, { walkMin: 6 }, { walkMin: 5 }],
  totals: { walkMin: 24, stayMin: 35, totalMin: 59 },
};

/** Кофейная петля, полчаса: короткий маршрут с двумя сидячими точками */
export const COFFEE_LOOP_30: WalkPlan = {
  id: "fixture-coffee-30",
  type: "loop",
  budgetMin: 30,
  stops: [
    {
      id: "stop-pekarnya",
      name: "Пекарня на углу",
      kind: "cafe",
      stayMin: 8,
      reason: "Свежая выпечка до полудня",
    },
    {
      id: "stop-muraly",
      name: "Двор с муралами",
      kind: "viewpoint",
      stayMin: 7,
      reason: "Неожиданная стена с граффити",
    },
  ],
  legs: [{ walkMin: 4 }, { walkMin: 3 }, { walkMin: 5 }],
  totals: { walkMin: 12, stayMin: 15, totalMin: 27 },
};

/** Дождливая A→B, полтора часа: нарочно выходит за бюджет +24% —
 *  чтобы в демо был виден warning-бейдж */
export const RAIN_ATOB_90: WalkPlan = {
  id: "fixture-rain-90",
  type: "point_to_point",
  budgetMin: 90,
  stops: [
    {
      id: "stop-muzey",
      name: "Краеведческий музей",
      kind: "museum",
      stayMin: 30,
      reason: "Крыто и тихо, новая выставка",
    },
    {
      id: "stop-rynek",
      name: "Крытый рынок",
      kind: "market",
      stayMin: 15,
      reason: "Обед под навесом, не промокнешь",
    },
    {
      id: "stop-knizhny",
      name: "Книжный у театра",
      kind: "shop",
      stayMin: 12,
      reason: "Тёплый финал у освещённого театра",
    },
  ],
  legs: [{ walkMin: 22 }, { walkMin: 18 }, { walkMin: 15 }],
  totals: { walkMin: 55, stayMin: 57, totalMin: 112 },
};

export const FIXTURES: WalkPlan[] = [GREEN_LOOP_60, COFFEE_LOOP_30, RAIN_ATOB_90];

/** Пул замен для демо «замены в один тап» — настоящий движок вернёт свои */
export const SWAP_POOL: WalkStop[] = [
  {
    id: "swap-park-1",
    name: "Парк за мостом",
    kind: "park",
    stayMin: 15,
    reason: "Вечером тут играет уличный музыкант",
  },
  {
    id: "swap-cafe-1",
    name: "Обжарка у вокзала",
    kind: "cafe",
    stayMin: 10,
    reason: "Столики у окна, есть розетки",
  },
  {
    id: "swap-viewpoint-1",
    name: "Смотровая у маяка",
    kind: "viewpoint",
    stayMin: 10,
    reason: "Отсюда виден весь изгиб реки",
  },
  {
    id: "swap-generic-1",
    name: "Тихий двор с фонтаном",
    kind: "other",
    stayMin: 10,
    reason: "Место, где никто не спешит",
  },
];

/**
 * Следующий кандидат на замену: альтернативы того же kind идут первыми, затем
 * весь остальной пул; листаем этот порядок по кругу. attempt растёт с каждым
 * тапом по той же остановке — одну и ту же замену дважды подряд не возвращаем.
 */
export function nextSwapCandidate(kind: WalkStopKind, attempt: number): WalkStop {
  const byKind = SWAP_POOL.filter((s) => s.kind === kind);
  const rest = SWAP_POOL.filter((s) => s.kind !== kind);
  const ordered = [...byKind, ...rest];
  return ordered[attempt % ordered.length];
}

/** Заглушка «ответа движка»: план под выбранный вайб/время */
export function pickFixture(vibe: string | null, minutes: number | null): WalkPlan {
  let base: WalkPlan;
  switch (vibe) {
    case "green":
    case "evening":
      base = GREEN_LOOP_60;
      break;
    case "coffee":
      base = COFFEE_LOOP_30;
      break;
    case "rain":
      base = RAIN_ATOB_90;
      break;
    default:
      base =
        minutes !== null && minutes <= 30
          ? COFFEE_LOOP_30
          : minutes !== null && minutes >= 90
            ? RAIN_ATOB_90
            : GREEN_LOOP_60;
  }
  // Демо не перестраивает маршрут под бюджет (это работа движка), но бейдж
  // должен считать честно — от бюджета, который выбрал человек
  return { ...base, budgetMin: minutes ?? base.budgetMin };
}

/** Проверка бейджа для тестов/дебага: "within" | "over" */
export function budgetBadgeState(plan: WalkPlan): "within" | "over" {
  return isWithinBudget(plan.totals.totalMin, plan.budgetMin) ? "within" : "over";
}

/** Процент перерасхода — для теста warning-бейджа фикстуры RAIN_ATOB_90 */
export function rainOverrunPercent(): number {
  return budgetOverrunPercent(RAIN_ATOB_90.totals.totalMin, RAIN_ATOB_90.budgetMin);
}
