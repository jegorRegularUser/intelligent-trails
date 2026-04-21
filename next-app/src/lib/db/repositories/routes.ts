// src/lib/db/repositories/routes.ts

import { getDb } from '../mongodb';
import { RouteDocument } from '../schemas';
import { RouteFilters, SortOption } from '@/types/history';
import { ObjectId } from 'mongodb';

export class RoutesRepository {
  private async getCollection() {
    const db = await getDb();
    return db.collection<RouteDocument>('routes');
  }

  // Создание индексов (вызывать при инициализации)
  async createIndexes() {
    const collection = await this.getCollection();
    await collection.createIndexes([
      { key: { userId: 1, createdAt: -1 } }, // Основной запрос: маршруты пользователя
      { key: { userId: 1, isFavorite: 1 } }, // Фильтр по избранным
      { key: { categories: 1 } }, // Фильтр по категориям
      { key: { 'metrics.totalDistance': 1 } }, // Сортировка по дистанции
      { key: { 'metrics.totalDuration': 1 } }, // Сортировка по времени
      { key: { name: 'text' } }, // Полнотекстовый поиск по названию
    ]);
  }

  // Сохранить маршрут
  async saveRoute(userId: string, route: Omit<RouteDocument, '_id' | 'userId' | 'createdAt' | 'updatedAt'>) {
    const collection = await this.getCollection();
    const now = new Date();

    const doc: Omit<RouteDocument, '_id'> = {
      ...route,
      userId,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(doc as any);
    return result.insertedId.toString();
  }

  // Получить маршруты с фильтрацией и сортировкой
  async getUserRoutes(
    userId: string,
    filters: Partial<RouteFilters> = {},
    sort: SortOption = 'date-desc',
    limit = 50,
    skip = 0
  ) {
    const collection = await this.getCollection();

    // Строим query
    const query: any = { userId };

    if (filters.showFavorites) {
      query.isFavorite = true;
    }

    if (filters.categories?.length) {
      query.categories = { $in: filters.categories };
    }

    if (filters.transportModes?.length) {
      query.transportModes = { $in: filters.transportModes };
    }

    if (filters.distanceRange) {
      const [min, max] = filters.distanceRange;
      query['metrics.totalDistance'] = {
        $gte: min * 1000, // км -> метры
        $lte: max * 1000
      };
    }

    if (filters.durationRange) {
      const [min, max] = filters.durationRange;
      query['metrics.totalDuration'] = { $gte: min, $lte: max };
    }

    if (filters.search) {
      query.$text = { $search: filters.search };
    }

    // Строим сортировку
    const sortMap: Record<SortOption, any> = {
      'date-desc': { createdAt: -1 },
      'date-asc': { createdAt: 1 },
      'name-asc': { name: 1 },
      'name-desc': { name: -1 },
      'distance-asc': { 'metrics.totalDistance': 1 },
      'distance-desc': { 'metrics.totalDistance': -1 },
      'duration-asc': { 'metrics.totalDuration': 1 },
      'duration-desc': { 'metrics.totalDuration': -1 },
    };

    const routes = await collection
      .find(query)
      .sort(sortMap[sort])
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await collection.countDocuments(query);

    return { routes, total };
  }

  // Обновить маршрут
  async updateRoute(routeId: string, userId: string, updates: Partial<RouteDocument>) {
    const collection = await this.getCollection();

    const result = await collection.updateOne(
      { _id: new ObjectId(routeId) as any, userId }, // Проверяем владельца
      {
        $set: {
          ...updates,
          updatedAt: new Date()
        }
      }
    );

    return result.modifiedCount > 0;
  }

  // Удалить маршрут
  async deleteRoute(routeId: string, userId: string) {
    const collection = await this.getCollection();
    const result = await collection.deleteOne({ _id: new ObjectId(routeId) as any, userId });
    return result.deletedCount > 0;
  }

  // Получить один маршрут
  async getRoute(routeId: string, userId: string) {
    const collection = await this.getCollection();
    return await collection.findOne({ _id: new ObjectId(routeId) as any, userId });
  }

  // Статистика пользователя
  async getUserStats(userId: string) {
    const collection = await this.getCollection();

    const stats = await collection.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalRoutes: { $sum: 1 },
          totalDistance: { $sum: '$metrics.totalDistance' },
          totalDuration: { $sum: '$metrics.totalDuration' },
          favoriteCount: {
            $sum: { $cond: ['$isFavorite', 1, 0] }
          },
        }
      }
    ]).toArray();

    return stats[0] || {
      totalRoutes: 0,
      totalDistance: 0,
      totalDuration: 0,
      favoriteCount: 0,
    };
  }
}

export const routesRepo = new RoutesRepository();
