// src/app/dev/cards/page.tsx
// Dev-демо карточек мест. noindex: страница только для разработки,
// в поисковую выдачу попасть не должна.

import type { Metadata } from 'next';

import { CardsDemo } from './CardsDemo';

export const metadata: Metadata = {
  title: 'dev · карточки мест',
  robots: { index: false, follow: false },
};

export default function DevCardsPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <CardsDemo />
    </main>
  );
}
