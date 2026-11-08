'use client';

// src/components/places/PlaceMiniCard.tsx
// Якорная мини-карточка над картой (docs/place-cards.md):
//  - десктоп (md+): компактная карточка у якоря, позиционирование через
//    useAnchoredPosition (CSS-переменные + пиксельный clamp);
//  - мобильный: bottom sheet с полной PlaceCard.
// Родителю контейнера нужен position: relative. Карт-библиотек нет:
// адаптер «координата карты → пиксельный якорь» пишет интеграционный чат.

import type { ReactNode, RefObject } from 'react';

import type { PlaceCard as PlaceCardData } from '@/lib/places';
import { cn } from '@/utils/cn';

import { OpenBadge, PlaceCard } from './PlaceCard';
import { useAnchoredPosition, type AnchorPoint } from './useAnchoredPosition';

export interface PlaceMiniCardProps {
  card: PlaceCardData;
  /** Якорь в пикселях относительно containerRef (спроецированная точка места). */
  anchor: AnchorPoint;
  /** Контейнер карты с position: relative. */
  containerRef: RefObject<HTMLElement | null>;
  /** Клик по мини-карточке на десктопе (раскрыть полный вариант). */
  onExpand?: () => void;
  /** Слот «почему сюда» для мобильного bottom sheet. */
  reason?: ReactNode;
  placement?: 'auto' | 'above' | 'below';
  /**
   * 'chip' — компактная карточка у якоря; 'full' — богатая карточка
   * (как в фикстурах) в якорном попапе, для демо и пинов прогулки.
   */
  variant?: 'chip' | 'full';
  className?: string;
}

export function PlaceMiniCard({
  card,
  anchor,
  containerRef,
  onExpand,
  reason,
  placement = 'auto',
  variant = 'chip',
  className,
}: PlaceMiniCardProps) {
  const { cardRef, style } = useAnchoredPosition({ anchor, containerRef, placement });
  const Icon = card.icon;
  const metaLine = [card.kindLabel, card.distanceLabel].filter(Boolean).join(' · ');

  return (
    <>
      {/* Десктоп: у якоря — компактный чип или богатая карточка (variant='full'). */}
      <div
        ref={cardRef}
        style={style}
        className={cn('absolute z-20 hidden md:block', className)}
      >
        {variant === 'full' ? (
          <div className="w-[300px] rounded-2xl border border-slate-200 bg-white shadow-float">
            <PlaceCard card={card} reason={reason} />
          </div>
        ) : (
          <button
            type="button"
            onClick={onExpand}
            className="flex max-w-[260px] items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-float transition-colors hover:border-brand-200"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">
                {card.displayName}
              </span>
              {metaLine ? (
                <span className="block truncate text-xs text-slate-500">{metaLine}</span>
              ) : null}
            </span>
            <OpenBadge state={card.openState} />
          </button>
        )}
      </div>

      {/* Мобильный: bottom sheet с полной карточкой. */}
      <div className={cn('absolute inset-x-0 bottom-0 z-20 md:hidden', className)}>
        <div className="mx-2 mb-2">
          <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-slate-300" aria-hidden />
          <PlaceCard card={card} reason={reason} />
        </div>
      </div>
    </>
  );
}
