import { describe, expect, it } from "vitest";
import {
  BUDGET_TOLERANCE,
  DEFAULT_CUSTOM_MINUTES,
  INITIAL_WALK_STATE,
  MAX_CUSTOM_MINUTES,
  MIN_CUSTOM_MINUTES,
  budgetOverrunPercent,
  canStartWalk,
  computeTotals,
  estimateBuildRange,
  isWithinBudget,
  normalizeCustomMinutes,
  toggleVibe,
  walkMachine,
  type WalkMachineState,
} from "../logic";
import {
  COFFEE_LOOP_30,
  FIXTURES,
  GREEN_LOOP_60,
  RAIN_ATOB_90,
  budgetBadgeState,
  nextSwapCandidate,
  pickFixture,
} from "../fixtures";

describe("normalizeCustomMinutes (степпер «Точно…»)", () => {
  it("округляет к шагу 5", () => {
    expect(normalizeCustomMinutes(12)).toBe(10);
    expect(normalizeCustomMinutes(13)).toBe(15);
    expect(normalizeCustomMinutes(47)).toBe(45);
  });

  it("зажимает в диапазон 10–180", () => {
    expect(normalizeCustomMinutes(3)).toBe(MIN_CUSTOM_MINUTES);
    expect(normalizeCustomMinutes(500)).toBe(MAX_CUSTOM_MINUTES);
  });

  it("значения на границах не меняет", () => {
    expect(normalizeCustomMinutes(MIN_CUSTOM_MINUTES)).toBe(MIN_CUSTOM_MINUTES);
    expect(normalizeCustomMinutes(MAX_CUSTOM_MINUTES)).toBe(MAX_CUSTOM_MINUTES);
  });
});

describe("canStartWalk (CTA активна от одного времени)", () => {
  it("null не позволяет стартовать", () => {
    expect(canStartWalk(null)).toBe(false);
  });

  it("время ниже минимума не позволяет стартовать", () => {
    expect(canStartWalk(MIN_CUSTOM_MINUTES - 5)).toBe(false);
    expect(canStartWalk(0)).toBe(false);
  });

  it("любой пресет и валидный кастом позволяют стартовать", () => {
    expect(canStartWalk(30)).toBe(true);
    expect(canStartWalk(60)).toBe(true);
    expect(canStartWalk(90)).toBe(true);
    expect(canStartWalk(MAX_CUSTOM_MINUTES)).toBe(true);
  });

  it("бесконечность — не число минут", () => {
    expect(canStartWalk(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("toggleVibe (одиночный выбор, «удиви меня» — вайлдкард)", () => {
  it("выбирает архетип", () => {
    expect(toggleVibe(null, "green")).toBe("green");
    expect(toggleVibe("green", "coffee")).toBe("coffee");
  });

  it("повторный тап снимает выбор", () => {
    expect(toggleVibe("green", "green")).toBeNull();
  });

  it("«удиви меня» всегда сбрасывает конкретный вайб", () => {
    expect(toggleVibe(null, "surprise")).toBeNull();
    expect(toggleVibe("rain", "surprise")).toBeNull();
  });
});

describe("бюджет ±10% (гейт генератора из PRODUCT.md)", () => {
  it("итог ровно в бюджете — в бюджете", () => {
    expect(isWithinBudget(60, 60)).toBe(true);
  });

  it("недобор — тоже в бюджете («с запасом»)", () => {
    expect(isWithinBudget(50, 60)).toBe(true);
  });

  it("граница +10% включительно", () => {
    expect(isWithinBudget(66, 60)).toBe(true);
    expect(isWithinBudget(66.0001, 60)).toBe(false);
    expect(isWithinBudget(67, 60)).toBe(false);
  });

  it("перерасход считается в процентах и округляется", () => {
    expect(budgetOverrunPercent(112, 90)).toBe(24);
    expect(budgetOverrunPercent(67, 60)).toBe(12);
    expect(budgetOverrunPercent(59, 60)).toBe(0);
  });

  it("нулевой бюджет не делит на ноль", () => {
    expect(budgetOverrunPercent(10, 0)).toBe(0);
  });

  it("константа допуска совпадает с документом", () => {
    expect(BUDGET_TOLERANCE).toBe(0.1);
  });
});

describe("computeTotals (честное время)", () => {
  it("суммирует стоянки и ходьбу раздельно", () => {
    const totals = computeTotals(
      [{ stayMin: 10 }, { stayMin: 12 }, { stayMin: 13 }],
      [{ walkMin: 6 }, { walkMin: 7 }, { walkMin: 6 }, { walkMin: 5 }]
    );
    expect(totals).toEqual({ walkMin: 24, stayMin: 35, totalMin: 59 });
  });

  it("пустая прогулка — нули", () => {
    expect(computeTotals([], [])).toEqual({ walkMin: 0, stayMin: 0, totalMin: 0 });
  });
});

describe("estimateBuildRange (прогноз под CTA)", () => {
  it("бюджет ±25%, скругление наружу до 10 мин", () => {
    expect(estimateBuildRange(30)).toEqual({ from: 20, to: 40 });
    expect(estimateBuildRange(60)).toEqual({ from: 40, to: 80 });
  });

  it("не опускается ниже 10 минут", () => {
    expect(estimateBuildRange(10).from).toBe(10);
  });
});

describe("walkMachine (фазы главного экрана)", () => {
  const phaseOf = (state: WalkMachineState) => state.phase;

  it("стартовая фаза — idle", () => {
    expect(INITIAL_WALK_STATE).toEqual({ phase: "idle", resumePhase: null });
  });

  it("idle → params по первому касанию чипов", () => {
    expect(phaseOf(walkMachine(INITIAL_WALK_STATE, { type: "PARAMS_TOUCHED" }))).toBe("params");
  });

  it("params → building → ready (счастливый путь)", () => {
    let state = walkMachine(INITIAL_WALK_STATE, { type: "PARAMS_TOUCHED" });
    state = walkMachine(state, { type: "START_BUILD" });
    expect(state.phase).toBe("building");
    state = walkMachine(state, { type: "BUILD_SUCCESS" });
    expect(state.phase).toBe("ready");
  });

  it("building → error → retry → building (ошибка не сбрасывает путь)", () => {
    let state = walkMachine({ phase: "building", resumePhase: null }, { type: "BUILD_FAILED" });
    expect(state.phase).toBe("error");
    state = walkMachine(state, { type: "RETRY" });
    expect(state.phase).toBe("building");
  });

  it("из error можно вернуться к параметрам одним касанием", () => {
    const state = walkMachine({ phase: "error", resumePhase: null }, { type: "PARAMS_TOUCHED" });
    expect(state.phase).toBe("params");
  });

  it("OFFLINE запоминает фазу, ONLINE возвращает ровно туда", () => {
    const params = walkMachine(INITIAL_WALK_STATE, { type: "PARAMS_TOUCHED" });
    const offline = walkMachine(params, { type: "OFFLINE" });
    expect(offline.phase).toBe("offline");
    expect(offline.resumePhase).toBe("params");

    const back = walkMachine(offline, { type: "ONLINE" });
    expect(back.phase).toBe("params");
    expect(back.resumePhase).toBeNull();
  });

  it("OFFLINE из ready сохраняет готовую прогулку для возврата", () => {
    const offline = walkMachine({ phase: "ready", resumePhase: null }, { type: "OFFLINE" });
    expect(walkMachine(offline, { type: "ONLINE" }).phase).toBe("ready");
  });

  it("OFFLINE из building не приходит — обрыв сети обрабатывается как BUILD_FAILED", () => {
    const state = walkMachine({ phase: "building", resumePhase: null }, { type: "OFFLINE" });
    expect(state.phase).toBe("building");
    expect(walkMachine(state, { type: "BUILD_FAILED" }).phase).toBe("error");
  });

  it("случайные события в неподходящей фазе игнорируются", () => {
    expect(walkMachine(INITIAL_WALK_STATE, { type: "BUILD_SUCCESS" }).phase).toBe("idle");
    expect(walkMachine(INITIAL_WALK_STATE, { type: "RETRY" }).phase).toBe("idle");
    expect(walkMachine({ phase: "ready", resumePhase: null }, { type: "START_BUILD" }).phase).toBe(
      "ready"
    );
    expect(walkMachine({ phase: "offline", resumePhase: null }, { type: "ONLINE" }).phase).toBe(
      "offline"
    );
  });

  it("RESET возвращает в idle из любой фазы", () => {
    for (const phase of ["params", "building", "ready", "error", "offline"] as const) {
      expect(walkMachine({ phase, resumePhase: null }, { type: "RESET" }).phase).toBe("idle");
    }
  });
});

describe("fixtures (фейковые планы согласованы)", () => {
  it("totals каждой фикстуры сходятся со stops/legs", () => {
    for (const plan of FIXTURES) {
      const walkMin = plan.legs.reduce((sum, l) => sum + l.walkMin, 0);
      const stayMin = plan.stops.reduce((sum, s) => sum + s.stayMin, 0);
      expect(plan.totals).toEqual({
        walkMin,
        stayMin,
        totalMin: walkMin + stayMin,
      });
    }
  });

  it("число перегонов соответствует типу маршрута", () => {
    for (const plan of FIXTURES) {
      if (plan.type === "loop") {
        expect(plan.legs).toHaveLength(plan.stops.length + 1);
      } else {
        expect(plan.legs).toHaveLength(plan.stops.length);
      }
    }
  });

  it("у каждой остановки есть причина (гейт генератора)", () => {
    for (const plan of FIXTURES) {
      for (const stop of plan.stops) {
        expect(stop.reason.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("зелёная и кофейная петли — в бюджете, дождливая A→B — с warning-бейджем", () => {
    expect(budgetBadgeState(GREEN_LOOP_60)).toBe("within");
    expect(budgetBadgeState(COFFEE_LOOP_30)).toBe("within");
    expect(budgetBadgeState(RAIN_ATOB_90)).toBe("over");
    expect(RAIN_ATOB_90.totals.totalMin).toBeGreaterThan(90 * 1.1);
  });

  it("в демо есть хотя бы один якорь и минимум остановок по гейту", () => {
    for (const plan of FIXTURES) {
      expect(plan.stops.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("pickFixture (заглушка ответа движка)", () => {
  it("подбирает план по вайбу", () => {
    expect(pickFixture("green", 60).id).toBe(GREEN_LOOP_60.id);
    expect(pickFixture("coffee", 30).id).toBe(COFFEE_LOOP_30.id);
    expect(pickFixture("rain", 90).id).toBe(RAIN_ATOB_90.id);
  });

  it("без вайба опирается на время", () => {
    expect(pickFixture(null, 30).id).toBe(COFFEE_LOOP_30.id);
    expect(pickFixture(null, 90).id).toBe(RAIN_ATOB_90.id);
    expect(pickFixture(null, 60).id).toBe(GREEN_LOOP_60.id);
  });

  it("бюджет плана подменяется выбранным временем — бейдж считается честно", () => {
    expect(pickFixture("green", 30).budgetMin).toBe(30);
    expect(pickFixture("green", null).budgetMin).toBe(GREEN_LOOP_60.budgetMin);
  });
});

describe("nextSwapCandidate (замена в один тап)", () => {
  it("сперва предлагает замену того же вида", () => {
    expect(nextSwapCandidate("cafe", 0).kind).toBe("cafe");
    expect(nextSwapCandidate("park", 0).kind).toBe("park");
  });

  it("растущий attempt не повторяет одну и ту же замену", () => {
    const first = nextSwapCandidate("cafe", 0);
    const second = nextSwapCandidate("cafe", 1);
    expect(second.id).not.toBe(first.id);
  });

  it("для вида без альтернатив листает общий пул по кругу", () => {
    const a = nextSwapCandidate("museum", 0);
    const b = nextSwapCandidate("museum", 1);
    expect(a.id).not.toBe(b.id);
    // полный круг — на четвёртом шаге возвращается первый кандидат
    expect(nextSwapCandidate("museum", 4).id).toBe(a.id);
  });

  it("DEFAULT_CUSTOM_MINUTES в разумном диапазоне степпера", () => {
    expect(normalizeCustomMinutes(DEFAULT_CUSTOM_MINUTES)).toBe(DEFAULT_CUSTOM_MINUTES);
  });
});
