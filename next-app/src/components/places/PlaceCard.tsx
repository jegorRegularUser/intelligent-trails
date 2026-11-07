'use client';

// src/components/places/PlaceCard.tsx
// Полная карточка места (docs/place-cards.md): kind-иконка + подпись, имя,
// адрес, расстояние, бейдж open/closed/unknown, слот «почему сюда».
// Только пропсы, никаких зависимостей от карт и глобального стора.

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import type { PlaceCard as PlaceCardData } from '@/lib/places';
import { cn } from '@/utils/cn';

const OPEN_BADGE_STYLES = {
  open: 'bg-brand-50 text-brand-600 border-brand-100',
  closed: 'bg-red-50 text-red-600 border-red-100',
  unknown: 'bg-slate-100 text-slate-500 border-slate-200',
} as const;

const OPEN_BADGE_DOT = {
  open: 'bg-brand-500',
  closed: 'bg-red-500',
  unknown: 'bg-slate-400',
} as const;

const BADGE_LABEL_KEY = {
  open: 'open',
  closed: 'closed',
  unknown: 'hoursUnknown',
} as const;

/** Бейдж «работает ли сейчас» — честный: unknown не притворяется closed. */
export function OpenBadge({ state, className }: { state: PlaceCardData['openState']; className?: string }) {
  const t = useTranslations('Places');
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        OPEN_BADGE_STYLES[state],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', OPEN_BADGE_DOT[state])} aria-hidden />
      {t(BADGE_LABEL_KEY[state])}
    </span>
  );
}

export interface PlaceCardProps {
  card: PlaceCardData;
  /**
   * Слот «почему сюда» — контент движения прогулки (зачем останавливаться).
   * Карточка отводит под него место и ничего не придумывает сама.
   */
  reason?: ReactNode;
  className?: string;
}

export function PlaceCard({ card, reason, className }: PlaceCardProps) {
  const t = useTranslations('Places');
  const Icon = card.icon;
  const hasMetaLine = Boolean(card.address || card.distanceLabel);
  // Подпись kind, дословно повторяющая имя («МЕСТО» над «Место») — шум.
  const showKindLabel =
    card.kindLabel !== '' && card.kindLabel.toLowerCase() !== card.displayName.trim().toLowerCase();

  return (
    <section
      className={cn('rounded-2xl border border-slate-200 bg-white p-4 shadow-card', className)}
      aria-label={card.displayName}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {showKindLabel ? (
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {card.kindLabel}
              </span>
            ) : null}
            <OpenBadge state={card.openState} />
          </div>
          <h3 className="mt-0.5 truncate text-base font-semibold text-slate-900">
            {card.displayName}
          </h3>
          {hasMetaLine ? (
            <p className="mt-1 text-sm text-slate-500">
              {card.address ? <span>{card.address}</span> : null}
              {card.address && card.distanceLabel ? <span aria-hidden> · </span> : null}
              {card.distanceLabel ? <span>{card.distanceLabel}</span> : null}
            </p>
          ) : null}
          {card.nearbyLabel ? (
            <p className="mt-1 text-xs text-slate-400">{card.nearbyLabel}</p>
          ) : null}
        </div>
      </div>
      {reason ? (
        <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2">
          <p className="text-xs font-medium text-brand-600">{t('whyTitle')}</p>
          <div className="mt-0.5 text-sm text-slate-700">{reason}</div>
        </div>
      ) : null}
    </section>
  );
}
