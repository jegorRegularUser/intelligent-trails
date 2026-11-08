"use client";

// SketchCard — рисованная карточка через roughjs (паттерн jegor-landing:
// rough.svg(mount) + rc.polygon({seed, roughness, bowing, fill, fillStyle})).
// Формула владельца: сплошная светло-зелёная заливка-полигон + слегка
// смещённый тёмно-зелёный рисованный контур. Никаких SVG-фильтров.
import { ReactNode, useLayoutEffect, useRef } from "react";
import rough from "roughjs";
import { cn } from "@/utils/cn";

const FILL_COLOR = "#e2efdb"; // светло-зелёная заливка
const STROKE_COLOR = "#2e6b34"; // тёмно-зелёная обводка

/** Детерминированный PRNG — джиттер вершин воспроизводится same-seed redraw'ом. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 8-вершинный «вырезанный» контур вокруг карточки (углы + середины сторон). */
function jitteredPolygon(
  width: number,
  height: number,
  seed: number,
  jitter: number,
  offset: [number, number],
): Array<[number, number]> {
  const rand = mulberry32(seed);
  const off = () => (rand() * 2 - 1) * jitter;
  const pad = 6;
  const x0 = pad + offset[0];
  const y0 = pad + offset[1];
  const x1 = width - pad + offset[0];
  const y1 = height - pad + offset[1];
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  const pts: Array<[number, number]> = [
    [x0, y0],
    [xm, y0],
    [x1, y0],
    [x1, ym],
    [x1, y1],
    [xm, y1],
    [x0, y1],
    [x0, ym],
  ];
  return pts.map(([px, py]) => [px + off(), py + off()]);
}

export interface SketchCardProps {
  children: ReactNode;
  /** Выключен по умолчанию: true рисует rough-фон и обводку */
  sketch?: boolean;
  seed?: number;
  className?: string;
}

export function SketchCard({ children, sketch = false, seed = 7, className }: SketchCardProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Rough рисуется императивно в layout-effect (до покраски) и перерисовывается
  // при ресайзе — геометрия живёт в px карточки, viewBox не искажает штрих.
  useLayoutEffect(() => {
    if (!sketch) return;
    const mount = mountRef.current;
    if (!mount) return;

    let svg: SVGSVGElement | null = null;

    const draw = () => {
      if (!mount) return;
      const w = mount.offsetWidth;
      const h = mount.offsetHeight;
      if (w < 2 || h < 2) return;

      mount
        .querySelectorAll<SVGSVGElement>(":scope > .rough-overlay")
        .forEach((old) => old.remove());

      const nextSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      nextSvg.setAttribute("width", String(w));
      nextSvg.setAttribute("height", String(h));
      nextSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      nextSvg.setAttribute("aria-hidden", "true");
      nextSvg.classList.add("rough-overlay");
      nextSvg.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;overflow:visible;z-index:0;";

      const rc = rough.svg(nextSvg);

      // 1) Фон-полигон: сплошная светло-зелёная заливка (fillStyle solid)
      const fillPoly = rc.polygon(jitteredPolygon(w, h, seed, 2.4, [0, 0]), {
        seed,
        roughness: 1.8,
        bowing: 1,
        stroke: "none",
        fill: FILL_COLOR,
        fillStyle: "solid",
      });
      nextSvg.appendChild(fillPoly);

      // 2) Обводка: тёмно-зелёный рисованный контур, слегка смещён от фона
      const strokePoly = rc.polygon(jitteredPolygon(w, h, seed + 13, 3.2, [1.6, 2.2]), {
        seed: seed + 13,
        roughness: 2.2,
        bowing: 1.4,
        stroke: STROKE_COLOR,
        strokeWidth: 2,
        fill: undefined,
      });
      nextSvg.appendChild(strokePoly);

      mount.prepend(nextSvg);
      svg = nextSvg;
    };

    draw();

    // Ресайз карточки (контент, вьюпорт) → перерисовка тем же seed («почерк» тот же)
    const observer = new ResizeObserver(draw);
    observer.observe(mount);

    return () => {
      observer.disconnect();
      svg?.remove();
    };
  }, [sketch, seed]);

  if (!sketch) {
    return (
      <div className={cn("rounded-3xl border border-slate-200 bg-white shadow-sm", className)}>
        {children}
      </div>
    );
  }

  return (
    <div ref={mountRef} className={cn("relative rounded-2xl", className)} style={{ backgroundColor: "transparent" }}>
      <div className="relative">{children}</div>
    </div>
  );
}

/** Наличие roughjs в рантайме — для dev-переключателей, чтобы не мигать без либы. */
export const SKETCH_AVAILABLE = true;
