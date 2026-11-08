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

  // Первая страница истории; дальше клиент догружает с фильтрами/поиском/пагинацией
  const { routes, total } = await getUserRoutesAction({}, 'date-desc', PAGE_SIZE, 0);

  return <HistoryPageClient initialRoutes={routes} initialTotal={total} />;
}
