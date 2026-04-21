// src/__tests__/actions/routes.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Мокаем зависимости
vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db/repositories/routes', () => ({
  routesRepo: {
    saveRoute: vi.fn(),
    getUserRoutes: vi.fn(),
    deleteRoute: vi.fn(),
    updateRoute: vi.fn(),
    getRoute: vi.fn(),
    getUserStats: vi.fn(),
  },
}));

vi.mock('@/utils/routeCodec', () => ({
  decodeRouteFromUrl: vi.fn(),
}));

import { auth } from '@/lib/auth/config';
import { routesRepo } from '@/lib/db/repositories/routes';
import { decodeRouteFromUrl } from '@/utils/routeCodec';
import {
  saveRouteAction,
  getUserRoutesAction,
  deleteRouteAction,
  toggleFavoriteAction,
  updateRouteAction,
} from '@/actions/routes';

let mongoServer: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let testUserId: string;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  client = new MongoClient(uri);
  await client.connect();
  db = client.db('test-db');

  testUserId = new ObjectId().toString();
}, 60000);

afterAll(async () => {
  await client.close();
  await mongoServer.stop();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('saveRouteAction', () => {
  const mockDecodedRoute = {
    startPoint: [55.7558, 37.6173],
    startTransport: 'pedestrian' as const,
    startPointName: 'Start Point',
    waypoints: [
      {
        type: 'category' as const,
        value: 'cafe',
        originalCategory: 'cafe',
        duration: 1800,
        modeToNext: 'pedestrian' as const,
      },
    ],
    endPoint: [55.7558, 37.6173],
    endPointType: 'address' as const,
    endPointName: 'End Point',
  };

  it('should save route successfully', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId, email: 'test@example.com' },
    } as any);

    vi.mocked(decodeRouteFromUrl).mockReturnValue(mockDecodedRoute);
    vi.mocked(routesRepo.getUserRoutes).mockResolvedValue({ routes: [], total: 0 });
    vi.mocked(routesRepo.saveRoute).mockResolvedValue('route123');

    const result = await saveRouteAction({
      name: 'Test Route',
      encodedRoute: 'encoded_data',
      tags: ['test'],
    });

    expect(result.success).toBe(true);
    expect(result.routeId).toBe('route123');
    expect(result.isDuplicate).toBe(false);
    expect(routesRepo.saveRoute).toHaveBeenCalledWith(testUserId, expect.objectContaining({
      name: 'Test Route',
      encodedRoute: 'encoded_data',
      tags: ['test'],
    }));
  });

  it('should detect duplicate route', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId, email: 'test@example.com' },
    } as any);

    vi.mocked(routesRepo.getUserRoutes).mockResolvedValue({
      routes: [{ _id: 'existing123', encodedRoute: 'encoded_data' }],
      total: 1,
    } as any);

    const result = await saveRouteAction({
      name: 'Test Route',
      encodedRoute: 'encoded_data',
      tags: [],
    });

    expect(result.success).toBe(true);
    expect(result.isDuplicate).toBe(true);
    expect(result.routeId).toBe('existing123');
    expect(routesRepo.saveRoute).not.toHaveBeenCalled();
  });

  it('should throw error if not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null);

    await expect(
      saveRouteAction({ name: 'Test', encodedRoute: 'enc', tags: [] })
    ).rejects.toThrow('Unauthorized');
  });

  it('should throw error if route data is invalid', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId, email: 'test@example.com' },
    } as any);

    vi.mocked(decodeRouteFromUrl).mockReturnValue(null);

    await expect(
      saveRouteAction({ name: 'Test', encodedRoute: 'invalid', tags: [] })
    ).rejects.toThrow('Invalid route data');
  });

  it('should extract categories from waypoints', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId, email: 'test@example.com' },
    } as any);

    vi.mocked(decodeRouteFromUrl).mockReturnValue({
      ...mockDecodedRoute,
      waypoints: [
        { type: 'category', value: 'cafe', originalCategory: 'cafe' },
        { type: 'category', value: 'park', originalCategory: 'park' },
        { type: 'address', value: 'Some Address' },
      ],
    } as any);

    vi.mocked(routesRepo.getUserRoutes).mockResolvedValue({ routes: [], total: 0 });
    vi.mocked(routesRepo.saveRoute).mockResolvedValue('route123');

    await saveRouteAction({ name: 'Test', encodedRoute: 'enc', tags: [] });

    expect(routesRepo.saveRoute).toHaveBeenCalledWith(
      testUserId,
      expect.objectContaining({
        categories: expect.arrayContaining(['cafe', 'park']),
      })
    );
  });

  it('should extract transport modes', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId, email: 'test@example.com' },
    } as any);

    vi.mocked(decodeRouteFromUrl).mockReturnValue({
      ...mockDecodedRoute,
      startTransport: 'auto',
      waypoints: [
        { type: 'category', value: 'cafe', modeToNext: 'pedestrian' },
      ],
    } as any);

    vi.mocked(routesRepo.getUserRoutes).mockResolvedValue({ routes: [], total: 0 });
    vi.mocked(routesRepo.saveRoute).mockResolvedValue('route123');

    await saveRouteAction({ name: 'Test', encodedRoute: 'enc', tags: [] });

    expect(routesRepo.saveRoute).toHaveBeenCalledWith(
      testUserId,
      expect.objectContaining({
        transportModes: expect.arrayContaining(['auto', 'pedestrian']),
      })
    );
  });
});

describe('getUserRoutesAction', () => {
  it('should get user routes successfully', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId, email: 'test@example.com' },
    } as any);

    const mockRoutes = {
      routes: [
        { _id: 'route1', name: 'Route 1' },
        { _id: 'route2', name: 'Route 2' },
      ],
      total: 2,
    };

    vi.mocked(routesRepo.getUserRoutes).mockResolvedValue(mockRoutes as any);

    const result = await getUserRoutesAction({}, 'date-desc', 10, 0);

    expect(result).toEqual(mockRoutes);
    expect(routesRepo.getUserRoutes).toHaveBeenCalledWith(testUserId, {}, 'date-desc', 10, 0);
  });

  it('should throw error if not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null);

    await expect(getUserRoutesAction()).rejects.toThrow('Unauthorized');
  });
});

describe('deleteRouteAction', () => {
  it('should delete route successfully', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId, email: 'test@example.com' },
    } as any);

    vi.mocked(routesRepo.deleteRoute).mockResolvedValue(true);

    const result = await deleteRouteAction('route123');

    expect(result.success).toBe(true);
    expect(routesRepo.deleteRoute).toHaveBeenCalledWith('route123', testUserId);
  });

  it('should throw error if not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null);

    await expect(deleteRouteAction('route123')).rejects.toThrow('Unauthorized');
  });
});

describe('toggleFavoriteAction', () => {
  it('should toggle favorite to true', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId, email: 'test@example.com' },
    } as any);

    vi.mocked(routesRepo.getRoute).mockResolvedValue({
      _id: 'route123',
      isFavorite: false,
    } as any);

    vi.mocked(routesRepo.updateRoute).mockResolvedValue(true);

    const result = await toggleFavoriteAction('route123');

    expect(result.success).toBe(true);
    expect(result.isFavorite).toBe(true);
    expect(routesRepo.updateRoute).toHaveBeenCalledWith('route123', testUserId, {
      isFavorite: true,
    });
  });

  it('should toggle favorite to false', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId, email: 'test@example.com' },
    } as any);

    vi.mocked(routesRepo.getRoute).mockResolvedValue({
      _id: 'route123',
      isFavorite: true,
    } as any);

    vi.mocked(routesRepo.updateRoute).mockResolvedValue(true);

    const result = await toggleFavoriteAction('route123');

    expect(result.success).toBe(true);
    expect(result.isFavorite).toBe(false);
  });

  it('should throw error if route not found', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId, email: 'test@example.com' },
    } as any);

    vi.mocked(routesRepo.getRoute).mockResolvedValue(null);

    await expect(toggleFavoriteAction('route123')).rejects.toThrow('Route not found');
  });

  it('should throw error if not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null);

    await expect(toggleFavoriteAction('route123')).rejects.toThrow('Unauthorized');
  });
});

describe('updateRouteAction', () => {
  it('should update route name', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId, email: 'test@example.com' },
    } as any);

    vi.mocked(routesRepo.updateRoute).mockResolvedValue(true);

    const result = await updateRouteAction('route123', { name: 'New Name' });

    expect(result.success).toBe(true);
    expect(routesRepo.updateRoute).toHaveBeenCalledWith('route123', testUserId, {
      name: 'New Name',
    });
  });

  it('should update route tags', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: testUserId, email: 'test@example.com' },
    } as any);

    vi.mocked(routesRepo.updateRoute).mockResolvedValue(true);

    const result = await updateRouteAction('route123', { tags: ['tag1', 'tag2'] });

    expect(result.success).toBe(true);
    expect(routesRepo.updateRoute).toHaveBeenCalledWith('route123', testUserId, {
      tags: ['tag1', 'tag2'],
    });
  });

  it('should throw error if not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null);

    await expect(
      updateRouteAction('route123', { name: 'New Name' })
    ).rejects.toThrow('Unauthorized');
  });
});
