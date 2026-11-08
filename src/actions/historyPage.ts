"use server";

// История: серверная выдача с фильтрами/поиском/сортировкой/пагинацией.
// Обёртка над getUserRoutesAction для клиентского компонента истории
// (клиент не должен импортировать actions/routes напрямую с его мутациями).
import { getUserRoutesAction } from '@/actions/routes';
import type { RouteFilters, SortOption } from '@/types/history';

export async function fetchHistoryAction(
  filters: Partial<RouteFilters>,
  sort: SortOption,
  limit: number,
  skip: number,
): Promise<{ routes: any[]; total: number }> {
  return await getUserRoutesAction(filters, sort, limit, skip);
}
