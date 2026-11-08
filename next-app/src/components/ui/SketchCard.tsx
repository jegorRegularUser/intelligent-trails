"use client";

import { ReactNode, useId } from "react";
import { cn } from "@/utils/cn";

/**
 * Эксперимент с hand-drawn рамкой. Демо — только на dev-странице (/dev),
 * по умолчанию выключен (sketch=false → обычная карточка).
 *
 * rough.js сознательно не добавлялся: эффект собран из нативных SVG-фильтров
 * (feTurbulence + feDisplacementMap) и дрожащего пути, ноль новых зависимостей.
 * Если стиль зайдёт в продукт — заменить на rough-рисование (см. docs/ux-main-screen.md,
 * открытые вопросы).
 */

/** Детерминированный ГПСЧ — рамка не «пляшет» между рендерами */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Дрожащий прямоугольник в координатах 0..100. Рисуется через
 * preserveAspectRatio="none" + non-scaling-stroke: не нужно мерить размер
 * контейнера, а толщина линии остаётся постоянной.
 */
export function sketchRectPath(seed: number, wobble = 1.6): string {
  const rand = mulberry32(seed);
  const steps = 14;
  const jitter = () => (rand() - 0.5) * wobble;
  const points: Array<[number, number]> = [];

  // Периметр по часовой стрелке: верх → право → низ → лево
  for (let i = 0; i <= steps; i++) points.push([(100 * i) / steps + jitter(), jitter()]);
  for (let i = 1; i <= steps; i++) points.push([100 + jitter(), (100 * i) / steps + jitter()]);
  for (let i = 1; i <= steps; i++) points.push([100 - (100 * i) / steps + jitter(), 100 + jitter()]);
  for (let i = 1; i < steps; i++) points.push([jitter(), 100 - (100 * i) / steps + jitter()]);

  return "M " + points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ");
}

export interface SketchCardProps {
  children: ReactNode;
  /** Выключен по умолчанию: true рисует hand-drawn рамку поверх карточки */
  sketch?: boolean;
  seed?: number;
  className?: string;
}

export function SketchCard({ children, sketch = false, seed = 7, className }: SketchCardProps) {
  const filterId = useId();

  if (!sketch) {
    return (
      <div className={cn("rounded-3xl border border-slate-200 bg-white shadow-sm", className)}>
        {children}
      </div>
    );
  }

  // Формула стиля (фидбек владельца): сплошная светло-зелёная заливка-полигон
  // как фон + обводка тёмно-зелёным «рисованным» контуром, слегка смещённым
  // относительно фона. Дрожание контура — feTurbulence+feDisplacementMap.
  return (
    <div className={cn("relative rounded-2xl", className)} style={{ backgroundColor: "#eaf5e4" }}>
      <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
        <svg
          className="h-full w-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <filter id={filterId}>
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.05"
                numOctaves="2"
                seed={seed}
                result="noise"
              />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" />
            </filter>
          </defs>
          {/* Фон-полигон: светло-зелёная сплошная заливка, свой контур */}
          <path
            d={sketchRectPath(seed + 31, 1.1)}
            fill="#e2efdb"
            stroke="none"
            filter={`url(#${filterId})`}
          />
          {/* Обводка: тёмно-зелёный рисованный контур, слегка смещён от фона */}
          <path
            d={sketchRectPath(seed, 1.8)}
            fill="none"
            stroke="#2e6b34"
            strokeWidth={2.4}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            transform="translate(0.9 1.3)"
            filter={`url(#${filterId})`}
          />
        </svg>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
