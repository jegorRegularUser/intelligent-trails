import { auth } from '@/lib/auth/config';
import { getUserRoutesAction } from '@/actions/routes';
import { redirect } from 'next/navigation';
import { HistoryPageClient } from '@/components/features/history/HistoryPageClient';

export default async function HistoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();

  // Если не авторизован - редирект на страницу входа
  if (!session?.user) {
    redirect(`/${locale}/signin`);
  }

  // Загружаем последние 3 маршрута
  const { routes } = await getUserRoutesAction({}, 'date-desc', 3, 0);

  return <HistoryPageClient initialRoutes={routes} />;
}
