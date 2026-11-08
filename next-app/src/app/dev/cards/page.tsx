// src/app/dev/cards/page.tsx
// Dev-демо карточек мест. noindex: страница только для разработки,
// в поисковую выдачу попасть не должна; в проде — честный 404.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CardsDemo } from './CardsDemo';

export const metadata: Metadata = {
  title: 'dev · карточки мест',
  robots: { index: false, follow: false },
};

export default function DevCardsPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return (
    <main className="min-h-screen bg-slate-50">
      <CardsDemo />
    </main>
  );
}
