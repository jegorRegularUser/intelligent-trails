"use client";

// src/app/dev/cards/WalkCardsSection.tsx
// Оффлайн-приёмка карточки прогулки: три фейк-плана, слайдер вариантов
// (VariantNav), полоса «ходьба/стоянки», kind-цвета таймлайна. Никакой сети —
// демо работает, пока ORS/Overpass лежат или не настроены.
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { VariantNav } from "@/components/walk/VariantNav";
import { WalkSummaryCard } from "@/components/walk/WalkSummaryCard";
import type { WalkPlan } from "@/components/walk/types";

const WALK_PLANS: WalkPlan[] = [
  {
    id: "walk-demo-1",
    type: "loop",
    budgetMin: 60,
    totals: { walkMin: 30, stayMin: 30, totalMin: 60 },
    gatesPass: true,
    gatesPassedCount: 5,
    stops: [
      {
        id: "w1-s1",
        name: "Царёв павильон",
        kind: "park",
        stayMin: 15,
        reason: "Лучший «парк» поблизости",
        category: "park",
        rating: 4.8,
        openingHours: "Mo-Su 07:00-23:00",
        scoreReasons: {
          ru: ["высокий рейтинг (4.8)", "упоминается в Википедии"],
          en: ["high rating (4.8)", "mentioned in Wikipedia"],
        },
      },
      {
        id: "w1-s2",
        name: "Верхневолжская набережная",
        kind: "waterfront",
        stayMin: 8,
        reason: "Лучший «вид» поблизости",
        category: "viewpoint",
        scoreReasons: {
          ru: ["под открытым небом — то, что нужно"],
          en: ["outdoors — exactly what the weather calls for"],
        },
      },
      {
        id: "w1-s3",
        name: "Кладовая башня",
        kind: "viewpoint",
        stayMin: 7,
        reason: "Ещё один хороший «вид» рядом",
        category: "viewpoint",
        scoreReasons: { ru: ["упоминается в Википедии"], en: ["mentioned in Wikipedia"] },
      },
    ],
    legs: [{ walkMin: 8 }, { walkMin: 9 }, { walkMin: 7 }, { walkMin: 6 }],
  },
  {
    id: "walk-demo-2",
    type: "loop",
    budgetMin: 60,
    totals: { walkMin: 21, stayMin: 39, totalMin: 60 },
    gatesPass: true,
    gatesPassedCount: 5,
    stops: [
      {
        id: "w2-s1",
        name: "Coffee Cake",
        kind: "cafe",
        stayMin: 15,
        reason: "Лучшее «кафе» поблизости",
        category: "cafe",
        rating: 4.6,
        openingHours: "Mo-Su 08:00-22:00",
        scoreReasons: { ru: ["высокий рейтинг (4.6)", "работает сейчас"], en: ["high rating (4.6)", "open right now"] },
      },
      {
        id: "w2-s2",
        name: "Плоды&Ягоды",
        kind: "shop",
        stayMin: 12,
        reason: "Ещё одно хорошее место рядом",
        category: "shopping",
        openingHours: "Mo-Su 09:00-21:00",
        scoreReasons: { ru: ["прямо по пути"], en: ["right on the way"] },
      },
      {
        id: "w2-s3",
        name: "Большая Покровская",
        kind: "other",
        stayMin: 12,
        reason: "Лучшее место поблизости",
        category: "attraction",
        scoreReasons: { ru: ["упоминается в Википедии"], en: ["mentioned in Wikipedia"] },
      },
    ],
    legs: [{ walkMin: 5 }, { walkMin: 7 }, { walkMin: 4 }, { walkMin: 5 }],
  },
  {
    id: "walk-demo-3",
    type: "loop",
    budgetMin: 60,
    totals: { walkMin: 28, stayMin: 32, totalMin: 60 },
    gatesPass: false,
    gatesPassedCount: 4,
    stops: [
      {
        id: "w3-s1",
        name: "Нижегородский кремль",
        kind: "museum",
        stayMin: 18,
        reason: "Лучший «музей» поблизости",
        category: "museum",
        rating: 4.9,
        openingHours: "Mo-Su 10:00-20:00",
        scoreReasons: {
          ru: ["высокий рейтинг (4.9)", "упоминается в Википедии"],
          en: ["high rating (4.9)", "mentioned in Wikipedia"],
        },
      },
      {
        id: "w3-s2",
        name: "Чкаловская лестница",
        kind: "viewpoint",
        stayMin: 8,
        reason: "Ещё один хороший «вид» рядом",
        category: "viewpoint",
        scoreReasons: { ru: ["упоминается в Википедии"], en: ["mentioned in Wikipedia"] },
      },
      {
        id: "w3-s3",
        name: "Кладовая башня",
        kind: "viewpoint",
        stayMin: 6,
        reason: "Прямо по пути",
        category: "viewpoint",
        scoreReasons: { ru: ["рядом с маршрутом"], en: ["right by the route"] },
      },
    ],
    legs: [{ walkMin: 7 }, { walkMin: 6 }, { walkMin: 9 }, { walkMin: 6 }],
  },
];

export function WalkCardsSection() {
  const t = useTranslations("WalkUI");
  const locale = useLocale();
  const ru = locale !== "en";
  const [planIndex, setPlanIndex] = useState(0);
  const plan = WALK_PLANS[planIndex];

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-slate-900">
        {ru ? "Карточка прогулки" : "Walk summary card"}
      </h2>
      <p className="mb-3 text-sm text-slate-500">
        {ru
          ? "Три фейк-плана: слайдер вариантов, полоса «ходьба/стоянки», цвета категорий в таймлайне. «Заменить» и «Изменить параметры» — кнопки-заглушки."
          : "Three fake plans: variant slider, walk/stay bar, category colors on the timeline. Swap and Edit-params are no-op buttons."}
      </p>
      <div className="mx-auto max-w-sm">
        <VariantNav
          index={planIndex}
          count={WALK_PLANS.length}
          label={t("variantOf", { index: planIndex + 1, count: WALK_PLANS.length })}
          prevLabel={ru ? "Предыдущий вариант" : "Previous variant"}
          nextLabel={ru ? "Следующий вариант" : "Next variant"}
          onSelect={setPlanIndex}
        />
        <div className="mt-3">
          <WalkSummaryCard phase="ready" plan={plan} onSwapRequest={() => {}} onEditParams={() => {}} />
        </div>
      </div>
    </section>
  );
}
