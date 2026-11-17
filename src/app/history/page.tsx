import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const ru = locale !== "en";
  return {
    title: ru ? "История прогулок" : "Walk history",
    description: ru
      ? "Сохранённые прогулки: поиск, фильтры, избранное и шаринг."
      : "Saved walks: search, filters, favorites and sharing.",
  };
}

import { auth } from '@/lib/auth/config';
import { getUserRoutesAction } from '@/actions/routes';
import { redirect } from 'next/navigation';
import { HistoryPageClient } from '@/components/features/history/HistoryPageClient';

const PAGE_SIZE = 12;

export default async function HistoryPage() {
  const session = await auth();

  // Если не авторизован - редирект на страницу входа
  if (!session?.user) {
    redirect("/signin");
  }

  // Mongo может лежать (рестарт сервера, сеть): история — не повод для 500.
  // Честный баннер «сохранения недоступны» внутри обычной страницы.
  let routes: any[] = [];
  let total = 0;
  let unavailable = false;
  try {
    const result = await getUserRoutesAction({}, 'date-desc', PAGE_SIZE, 0);
    routes = result.routes;
    total = result.total;
  } catch (error) {
    console.error('[history] база недоступна:', error);
    unavailable = true;
  }

  return (
    <HistoryPageClient
      initialRoutes={routes}
      initialTotal={total}
      unavailable={unavailable}
    />
  );
}
