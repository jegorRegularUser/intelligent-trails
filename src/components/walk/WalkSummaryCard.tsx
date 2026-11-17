"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle,
  Check,
  Compass,
  Footprints,
  Info,
  Route,
  RotateCcw,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/utils/cn";
import { budgetOverrunPercent, isWithinBudget, type WalkPhase } from "./logic";
import type { WalkDegradedLevel, WalkPlan, WalkStop } from "./types";
import { StopRow, WalkLegRow } from "./StopRow";

/**
 * Фазы, которые карточка рисует сама. `offline` — не фаза карточки:
 * сверху рендерится OfflineBanner, а контент остаётся замороженным.
 */
export type WalkCardPhase = Exclude<WalkPhase, "offline" | "params">;

/** Доля ходьбы в полосе бюджета, 0–100; нулевая прогулка — 0. */
function budgetSharePct(walkMin: number, totalMin: number): number {
  if (totalMin <= 0) return 0;
  const pct = Math.round((walkMin / totalMin) * 100);
  return Math.min(100, Math.max(0, pct));
}

export interface WalkSummaryCardProps {
  phase: WalkCardPhase;
  plan: WalkPlan | null;
  /** Текст от движка; без него — общий текст ошибки */
  errorMessage?: string | null;
  /** Остановки, для которых ищется замена */
  swappingStopIds?: string[];
  /** Оффлайн: кнопки видны, но инертны — контент заморожен */
  interactionsDisabled?: boolean;
  onSwapRequest?: (stopId: string) => void;
  onRetry?: () => void;
  onEditParams?: () => void;
  onStartWalk?: () => void;
  className?: string;
}

/**
 * Живая карточка «твоя прогулка»: одна карточка, которая морфится
 * скелетон → сводка → (иногда) ошибка. Иерархия — docs/ux-main-screen.md, раздел 5.
 */
export function WalkSummaryCard({
  phase,
  plan,
  errorMessage,
  swappingStopIds = [],
  interactionsDisabled = false,
  onSwapRequest,
  onRetry,
  onEditParams,
  onStartWalk,
  className,
}: WalkSummaryCardProps) {
  const t = useTranslations("WalkUI");
  // Уличный план (§19.7): раскладка гарниша по кольцу ног; несостыковка
  // (старые/расшаренные планы без координат) → прежний таймлайн.
  const streetRing =
    plan && plan.kind === "street" && plan.stops.length > 0 ? buildStreetRing(plan) : null;

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {phase === "idle" && <EmptyState />}

      {phase === "building" && <BuildingState />}

      {phase === "error" && (
        <ErrorState message={errorMessage} onRetry={onRetry} onEditParams={onEditParams} />
      )}

      {/* Defensive: ready без плана — показываем заглушку, а не пустой div */}
      {phase === "ready" && !plan && <EmptyState />}

      {phase === "ready" && plan && (
        <>
          {/* Шапка: тип прогулки */}
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-slate-800">{t("summaryTitle")}</h3>
            <Badge variant="primary">
              {plan.type === "loop" ? t("typeLoop") : t("typeAtoB")}
            </Badge>
          </div>

          {/* Сводка честного времени + бейдж бюджета + полоса пропорции:
              «путь 20 минут, а пишет 60» видно до чтения цифр.
              Итог — единственная дисплейная цифра экрана (ux-main-screen §5). */}
          <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-3xl font-bold text-pine-800 tabular-nums">
                {plan.totals.totalMin}
                <span className="ml-1.5 font-sans text-lg font-bold text-slate-600">{t("minutesUnit")}</span>
              </span>
              <BudgetBadge totalMin={plan.totals.totalMin} budgetMin={plan.budgetMin} />
            </div>
            <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-white/80" aria-hidden>
              <div
                className="bg-brand-600"
                style={{ width: `${budgetSharePct(plan.totals.walkMin, plan.totals.totalMin)}%` }}
              />
              <div className="flex-1 bg-amber-400" />
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-brand-600" aria-hidden />
                {t("walkPart", { minutes: plan.totals.walkMin })}
              </span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />
                {t("stayPart", { minutes: plan.totals.stayMin })}
              </span>
            </p>
          </div>

          {/* Деградация: честная заметка — заметно, но не пугающе (принцип 5 PRODUCT.md) */}
          {plan.degraded && (
            <DegradationNote
              level={plan.degraded.level}
              note={plan.degradedNote}
            />
          )}

          {/* Уличный интерес (S3 волны «Улицы с характером»): не деградация,
              а другая формулировка — брендовая плашка вместо amber-заметки. */}
          {plan.streetInterest && (
            <StreetInterestNote note={plan.streetInterestNote} />
          )}

          {/* Честность в UI (R5): отчёты гейтов как есть — одна строка на
              провал человеческим языком; перерасход бюджета уже показывает
              бейдж, недобор объясняет строка. */}
          {plan.gatesSummary && !plan.gatesPass && (
            <FailedGatesNotes plan={plan} />
          )}

          {/* Таймлайн остановок */}
          <div className="flex flex-col">
            <h4 className="relative z-10 mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
              {t("timelineTitle")}
            </h4>
            <div className="relative">
              {/* Уличный план (rev «улица первична», walk-engine.md §19.7): якоря-
                  гарниш сидят НА петле — между ними слитые перегоны ног, иначе
                  ходьба до первого якоря была бы невидима. Ноги не совпали с
                  якорями (старые/расшаренные планы) — прежний таймлайн. */}
              {plan.stops.length > 0 && streetRing ? (
                <StreetTimeline
                  items={streetRing}
                  swappingStopIds={swappingStopIds}
                  swapDisabled={interactionsDisabled}
                  onSwapRequest={onSwapRequest}
                />
              ) : null}
              {plan.stops.length > 0 && !streetRing && (
                <>
                  {/* Сплошная линия таймлайна позади кругов — модель эксперт-билдера:
                      круги w-10 с border-white перекрывают линию, leg-тексты по
                      выравниванию кругов (pl-52px) */}
                  <div
                    aria-hidden
                    className="absolute left-[19px] top-5 bottom-8 w-0.5 bg-slate-200"
                  />
                  {plan.stops.map((stop, index) => (
                    <div key={stop.id} className="relative">
                      {index > 0 && (
                        <WalkLegRow
                          walkMin={plan.legs[index]?.walkMin ?? 0}
                          microNotes={plan.legs[index]?.microNotes}
                        />
                      )}
                      <StopRow
                        stop={stop}
                        isSwapping={swappingStopIds.includes(stop.id)}
                        swapDisabled={interactionsDisabled}
                        onSwapRequest={plan.stops.length > 0 ? onSwapRequest : undefined}
                        className="pb-4"
                      />
                    </div>
                  ))}
                  {plan.type === "loop" && plan.legs.length > 0 && (
                    <WalkLegRow
                      walkMin={plan.legs[plan.legs.length - 1].walkMin}
                      label={t("legWalkBack", { minutes: plan.legs[plan.legs.length - 1].walkMin })}
                      microNotes={plan.legs[plan.legs.length - 1].microNotes}
                      className="pb-6"
                    />
                  )}
                </>
              )}
              {/* Чистая петля без якорей: таймлайн «Старт → петля → Старт» —
                  одна строка с суммой перегонов; замены нечего предлагать. */}
              {plan.stops.length === 0 && plan.legs.length > 0 && (
                <WalkLegRow
                  walkMin={plan.totals.walkMin}
                  label={t("loopOnlyLeg", { minutes: plan.totals.walkMin })}
                  className="pb-6"
                />
              )}
            </div>
          </div>

          {/* Действия: одна первичная кнопка, всегда в зоне большого пальца.
              «Пересобрать всё» здесь нет: варианты листает VariantNav над
              таймлайном, а смена параметров — честная «Изменить параметры». */}
          <div className="flex flex-col gap-2">
            {onStartWalk && (
              <Button
                size="lg"
                className="w-full"
                disabled={interactionsDisabled}
                onClick={onStartWalk}
                leftIcon={<Footprints size={20} />}
              >
                {t("startWalkCta")}
              </Button>
            )}
            {onEditParams && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={interactionsDisabled}
                onClick={onEditParams}
                leftIcon={<RotateCcw size={16} />}
              >
                {t("editParamsCta")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BudgetBadge({ totalMin, budgetMin }: { totalMin: number; budgetMin: number }) {
  const t = useTranslations("WalkUI");
  if (isWithinBudget(totalMin, budgetMin)) {
    return (
      <Badge variant="success">
        <Check size={12} />
        {t("budgetWithin")}
      </Badge>
    );
  }
  return (
    <Badge variant="warning">
      <AlertTriangle size={12} />
      {t("budgetOver", { percent: budgetOverrunPercent(totalMin, budgetMin) })}
    </Badge>
  );
}

interface DegradationNoteProps {
  level: WalkDegradedLevel;
  /** Параллельная заметка из данных — фолбэк, если словарный ключ недоступен. */
  note?: { ru: string; en: string };
}

/**
 * Заметка о деградации: тёплая (amber), не красная — прогулка состоялась,
 * просто честно объясняем, почему она проще обычной. Рендер из словаря
 * WalkUI по уровню; данные-заметка — фолбэк для планов без i18n-контекста.
 */
function DegradationNote({ level, note }: DegradationNoteProps) {
  const t = useTranslations("WalkUI");
  const locale = useLocale();
  const dictText =
    level === "partial"
      ? t("degradedPartial")
      : level === "loop-only"
        ? t("degradedLoopOnly")
        : t("degradedStreetNoData");
  const text = dictText || (note ? (locale === "en" ? note.en : note.ru) : "");
  return (
    <p
      role="status"
      className="flex items-start gap-1.5 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800"
    >
      <Info size={13} className="mt-0.5 shrink-0 text-amber-600" />
      <span>{text}</span>
    </p>
  );
}

/**
 * Заметка уличного интереса (S3): брендовая (не amber) — петля по характерным
 * улицам не является деградацией. Текст — только из данных (параллельные
 * ru/en адаптера): словарь WalkUI уличных заметок не содержит намеренно
 * (гвард-тест uiAdapter), без заметки компонент не рендерится.
 */
function StreetInterestNote({ note }: { note?: { ru: string; en: string } }) {
  const locale = useLocale();
  const text = locale === "en" ? note?.en : note?.ru;
  if (!text) return null;
  return (
    <p
      role="status"
      className="flex items-start gap-1.5 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-xs leading-relaxed text-brand-800"
    >
      <Route size={13} className="mt-0.5 shrink-0 text-brand-600" />
      <span>{text}</span>
    </p>
  );
}

/**
 * Отчёты проваленных гейтов (R5, GATE_NOTES): одну строку на провал,
 * человеческим языком. Рендер сам решает, какую заметку показать:
 * недобор бюджета объясняет строка («прогулка вышла короче плана»),
 * перерасход уже виден бейджем; walk_share показывается всегда при провале.
 */
function FailedGatesNotes({ plan }: { plan: WalkPlan }) {
  const t = useTranslations("WalkUI");
  const failed = new Set((plan.gatesSummary ?? []).filter((g) => !g.pass).map((g) => g.name));
  if (failed.size === 0) return null;
  const notes: string[] = [];
  if (failed.has("budget") && plan.totals.totalMin < plan.budgetMin) {
    notes.push(t("gateNoteUnderfloor"));
  }
  if (failed.has("walk_share")) {
    notes.push(t("gateNoteWalkShare"));
  }
  if (failed.has("street_interest")) {
    notes.push(t("gateNoteStreetInterest"));
  }
  if (notes.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {notes.map((note) => (
        <p
          key={note}
          role="status"
          className="flex items-start gap-1.5 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800"
        >
          <Info size={13} className="mt-0.5 shrink-0 text-amber-600" />
          <span>{note}</span>
        </p>
      ))}
    </div>
  );
}

function EmptyState() {
  const t = useTranslations("WalkUI");
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600">
        <Compass size={24} />
      </div>
      <p className="font-semibold text-slate-700">{t("emptyTitle")}</p>
      <p className="text-sm text-slate-500">{t("emptyHint")}</p>
    </div>
  );
}

/** Скелетон повторяет структуру будущей карточки — глаз не прыгает на ready */
function BuildingState() {
  const t = useTranslations("WalkUI");
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-lg font-bold text-slate-800">{t("buildingTitle")}</p>
        <p className="mt-0.5 text-sm text-slate-500">{t("buildingHint")}</p>
      </div>
      <div aria-hidden className="flex flex-col gap-4">
        <div className="h-5 w-1/3 animate-pulse rounded-full bg-slate-200" />
        <div className="h-20 animate-pulse rounded-2xl bg-slate-200" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-200" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">{t("buildingA11y")}</span>
    </div>
  );
}

interface ErrorStateProps {
  message?: string | null;
  onRetry?: () => void;
  onEditParams?: () => void;
}

/** Ошибка — состояние карточки, не модалка: главный экран не рвём */
function ErrorState({ message, onRetry, onEditParams }: ErrorStateProps) {
  const t = useTranslations("WalkUI");
  return (
    <div role="alert" className="flex flex-col gap-4 py-2">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle size={20} />
        </div>
        <div>
          <p className="font-bold text-slate-800">{t("errorTitle")}</p>
          <p className="mt-1 text-sm text-slate-500">{message || t("errorGeneric")}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {onRetry && (
          <Button onClick={onRetry} className="w-full" leftIcon={<RotateCcw size={16} />}>
            {t("retryCta")}
          </Button>
        )}
        {onEditParams && (
          <Button variant="ghost" onClick={onEditParams} className="w-full">
            {t("editParamsCta")}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * «Нет сети» — полоса поверх замороженного контента, не тупик:
 * готовая прогулка остаётся читаемой (принцип честной деградации).
 */
export function OfflineBanner({ className }: { className?: string }) {
  const t = useTranslations("WalkUI");
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4",
        className
      )}
    >
      <WifiOff size={18} className="mt-0.5 shrink-0 text-slate-500" />
      <div>
        <p className="text-sm font-bold text-slate-700">{t("offlineTitle")}</p>
        <p className="mt-0.5 text-xs text-slate-500">{t("offlineHint")}</p>
      </div>
    </div>
  );
}

// --- Таймлайн уличного плана (rev «улица первична», walk-engine.md §19.7) ---

type MicroNote = NonNullable<WalkPlan["legs"][number]["microNotes"]>[number];

type StreetRingItem =
  | { kind: "leg"; walkMin: number; microNotes?: MicroNote[]; back?: boolean }
  | { kind: "stop"; stop: WalkStop; stopIndex: number };

/** Координаты совпали (движковые планы несут точные массивы; JSON — с допуском). */
function samePoint(
  a: [number, number] | undefined,
  b: [number, number] | undefined
): boolean {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

/** Конец ноги UI-плана = последняя точка геометрии (UI-тип несёт только геометрию). */
function legEnd(leg: WalkPlan["legs"][number]): [number, number] | undefined {
  const geometry = leg.geometry;
  return geometry && geometry.length > 0 ? geometry[geometry.length - 1] : undefined;
}

/**
 * Раскладка гарниша по кольцу ног: якорь-слот = нога, чей конец совпал с
 * координатами якоря; ноги между якорями сливаются в один перегон с суммой
 * минут и общими микро-стопами. Каждый якорь встанет на свою ногу (движок
 * кладёт один якорь на ногу, stops — в порядке кольца); если хоть один не
 * лег — null, вызывающий рендерит прежний таймлайн.
 */
function buildStreetRing(plan: WalkPlan): StreetRingItem[] | null {
  const slots = plan.stops.map((stop) => {
    if (!stop.coordinates) return -1;
    return plan.legs.findIndex((leg) => samePoint(legEnd(leg), stop.coordinates));
  });
  if (slots.some((slot) => slot < 0)) return null;

  const ordered = plan.stops
    .map((stop, i) => ({ stop, slot: slots[i] }))
    .sort((a, b) => a.slot - b.slot);

  const items: StreetRingItem[] = [];
  let cursor = 0;
  for (const { stop, slot } of ordered) {
    const legs = plan.legs.slice(cursor, slot + 1);
    if (legs.length === 0) return null;
    items.push(mergedLegRow(legs));
    items.push({ kind: "stop", stop, stopIndex: plan.stops.indexOf(stop) });
    cursor = slot + 1;
  }
  const tail = plan.legs.slice(cursor);
  if (tail.length === 0) return null;
  items.push({ ...mergedLegRow(tail), back: true });
  return items;
}

function mergedLegRow(legs: WalkPlan["legs"]): { kind: "leg"; walkMin: number; microNotes?: MicroNote[] } {
  const microNotes = legs.flatMap((leg) => leg.microNotes ?? []);
  return {
    kind: "leg",
    walkMin: legs.reduce((sum, leg) => sum + leg.walkMin, 0),
    ...(microNotes.length > 0 ? { microNotes } : {}),
  };
}

interface StreetTimelineProps {
  items: StreetRingItem[];
  swappingStopIds?: string[];
  swapDisabled?: boolean;
  onSwapRequest?: (stopId: string) => void;
}

/**
 * Таймлайн уличной петли с якорями-гарнишем: та же визуальная модель
 * (сплошная линия, круги w-10, leg-тексты pl-52px), но перегоны — слитые
 * куски петли между якорями; замыкание помечено «до старта».
 */
function StreetTimeline({ items, swappingStopIds = [], swapDisabled = false, onSwapRequest }: StreetTimelineProps) {
  const t = useTranslations("WalkUI");
  return (
    <>
      {/* Сплошная линия таймлайна позади кругов — как в якорь-драйвен модели */}
      <div aria-hidden className="absolute left-[19px] top-5 bottom-8 w-0.5 bg-slate-200" />
      {items.map((item, i) =>
        item.kind === "leg" ? (
          <WalkLegRow
            key={`street-leg-${i}`}
            walkMin={item.walkMin}
            label={item.back ? t("legWalkBack", { minutes: item.walkMin }) : undefined}
            microNotes={item.microNotes}
            className={i === items.length - 1 ? "pb-6" : "pb-4"}
          />
        ) : (
          <StopRow
            key={item.stop.id}
            stop={item.stop}
            isSwapping={swappingStopIds.includes(item.stop.id)}
            swapDisabled={swapDisabled}
            onSwapRequest={onSwapRequest}
            className="pb-4"
          />
        )
      )}
    </>
  );
}
