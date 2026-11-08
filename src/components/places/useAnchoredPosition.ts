'use client';

// src/components/places/useAnchoredPosition.ts
// Позиционирование якорной мини-карточки (docs/place-cards.md):
// пиксельный якорь от карты (адаптер пишет интеграционный чат) → CSS-переменные
// --pc-x/--pc-y с пиксельным clamp внутри контейнера, чтобы карточка не вылезала
// за края. Никакой зависимости от карт-библиотек.

import {
  type CSSProperties,
  type RefObject,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface AnchorPoint {
  /** Пиксели относительно левого края контейнера. */
  x: number;
  /** Пиксели относительно верхнего края контейнера. */
  y: number;
}

export interface AnchoredPositionOptions {
  /** Якорь в пикселях относительно контейнера. */
  anchor: AnchorPoint;
  /** Контейнер (обычно div карты) с position: relative. */
  containerRef: RefObject<HTMLElement | null>;
  /** Зазор между якорем и карточкой, px. */
  offset?: number;
  /** Минимальный отступ карточки от краёв контейнера, px. */
  padding?: number;
  /** 'auto' — над якорем, а если сверху не помещается — под. */
  placement?: 'auto' | 'above' | 'below';
}

export interface AnchoredPositionResult {
  /** Реф на позиционируемый элемент карточки. */
  cardRef: RefObject<HTMLDivElement | null>;
  /** Готовый style: CSS-переменные + left/top от них. */
  style: CSSProperties;
  /** Итоговое размещение (после авто-выбора). */
  placement: 'above' | 'below';
  /** false, пока размеры не измерены (карточка скрыта, чтобы не мигала). */
  measured: boolean;
}

const DEFAULT_OFFSET = 12;
const DEFAULT_PADDING = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function useAnchoredPosition({
  anchor,
  containerRef,
  offset = DEFAULT_OFFSET,
  padding = DEFAULT_PADDING,
  placement = 'auto',
}: AnchoredPositionOptions): AnchoredPositionResult {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [measured, setMeasured] = useState(false);

  useLayoutEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let raf = 0;
    let measure: () => void = () => {};

    // Контейнер ищем эффектом с ретраем, а не зависимостями: карточка — прямой
    // ребёнок контейнера карты, но на момент самого первого layout-эффекта ref
    // родителя ещё может не прикрепиться (deps [containerRef] стабильны — эффект
    // больше не перезапустится и карточка навсегда оставалась невидимой).
    const attach = () => {
      if (disposed) return;
      const card = cardRef.current;
      const container =
        containerRef.current ?? card?.parentElement ?? null;
      if (!card || !container) {
        raf = requestAnimationFrame(attach);
        return;
      }

      measure = () => {
        if (disposed) return;
        setCardSize({ width: card.offsetWidth, height: card.offsetHeight });
        setContainerSize({ width: container.clientWidth, height: container.clientHeight });
        setMeasured(true);
      };
      measure();

      observer = new ResizeObserver(measure);
      observer.observe(card);
      observer.observe(container);
      window.addEventListener('resize', measure);
    };
    attach();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [containerRef]);

  const resolvedPlacement = useMemo<'above' | 'below'>(() => {
    if (placement !== 'auto') return placement;
    return anchor.y - offset - cardSize.height < 0 ? 'below' : 'above';
  }, [placement, anchor.y, offset, cardSize.height]);

  const style = useMemo<CSSProperties>(() => {
    let x = 0;
    let y = 0;
    let visibility: CSSProperties['visibility'] = 'hidden';
    if (measured && cardSize.width > 0 && containerSize.width > 0) {
      const maxX = Math.max(padding, containerSize.width - cardSize.width - padding);
      x = clamp(anchor.x - cardSize.width / 2, padding, maxX);
      const rawY =
        resolvedPlacement === 'above'
          ? anchor.y - offset - cardSize.height
          : anchor.y + offset;
      const maxY = Math.max(padding, containerSize.height - cardSize.height - padding);
      y = clamp(rawY, padding, maxY);
      visibility = 'visible';
    }
    return {
      visibility,
      left: 'var(--pc-x)',
      top: 'var(--pc-y)',
      '--pc-x': `${Math.round(x)}px`,
      '--pc-y': `${Math.round(y)}px`,
    } as CSSProperties;
  }, [measured, cardSize, containerSize, anchor, offset, padding, resolvedPlacement]);

  return { cardRef, style, placement: resolvedPlacement, measured };
}
