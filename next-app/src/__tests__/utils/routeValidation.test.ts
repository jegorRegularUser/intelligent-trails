import { describe, it, expect } from 'vitest';
import {
  shouldShowDistanceWarning,
  calculateDirectDistance,
  formatDistance,
  ROUTE_DISTANCE_LIMITS,
} from '@/utils/routeValidation';
import { Coordinates } from '@/types/map';

describe('routeValidation', () => {
  // Москва, Красная площадь
  const moscowCenter: Coordinates = [55.7539, 37.6208];

  // Москва, примерно 10 км от центра
  const moscow10km: Coordinates = [55.8339, 37.6208];

  // Москва, примерно 30 км от центра
  const moscow30km: Coordinates = [56.0239, 37.6208];

  // Варшава (примерно 1200 км от Москвы)
  const warsaw: Coordinates = [52.2297, 21.0122];

  describe('calculateDirectDistance', () => {
    it('should return 0 when end point is null', () => {
      expect(calculateDirectDistance(moscowCenter, null)).toBe(0);
    });

    it('should calculate distance between two points', () => {
      const distance = calculateDirectDistance(moscowCenter, moscow10km);
      // Примерно 9 км (с погрешностью)
      expect(distance).toBeGreaterThan(8000);
      expect(distance).toBeLessThan(10000);
    });

    it('should calculate long distance correctly', () => {
      const distance = calculateDirectDistance(moscowCenter, warsaw);
      // Примерно 1200 км
      expect(distance).toBeGreaterThan(1100000);
      expect(distance).toBeLessThan(1300000);
    });
  });

  describe('shouldShowDistanceWarning', () => {
    it('should not show warning for short distances (< 50 km)', () => {
      expect(shouldShowDistanceWarning(10000)).toBe(false); // 10 km
      expect(shouldShowDistanceWarning(30000)).toBe(false); // 30 km
      expect(shouldShowDistanceWarning(49000)).toBe(false); // 49 km
    });

    it('should show warning for long distances (> 50 km)', () => {
      expect(shouldShowDistanceWarning(51000)).toBe(true); // 51 km
      expect(shouldShowDistanceWarning(100000)).toBe(true); // 100 km
      expect(shouldShowDistanceWarning(1000000)).toBe(true); // 1000 km
    });

    it('should show warning exactly at threshold', () => {
      expect(shouldShowDistanceWarning(ROUTE_DISTANCE_LIMITS.MAX_REASONABLE_DISTANCE)).toBe(false);
      expect(shouldShowDistanceWarning(ROUTE_DISTANCE_LIMITS.MAX_REASONABLE_DISTANCE + 1)).toBe(true);
    });
  });

  describe('formatDistance', () => {
    it('should format distances less than 1 km in meters', () => {
      expect(formatDistance(500)).toBe('500 м');
      expect(formatDistance(999)).toBe('999 м');
    });

    it('should format distances 1 km and more in kilometers', () => {
      expect(formatDistance(1000)).toBe('1 км');
      expect(formatDistance(5500)).toBe('6 км'); // округление
      expect(formatDistance(10000)).toBe('10 км');
      expect(formatDistance(50000)).toBe('50 км');
    });

    it('should round kilometers correctly', () => {
      expect(formatDistance(1499)).toBe('1 км');
      expect(formatDistance(1500)).toBe('2 км');
      expect(formatDistance(2499)).toBe('2 км');
      expect(formatDistance(2500)).toBe('3 км');
    });
  });

  describe('ROUTE_DISTANCE_LIMITS', () => {
    it('should have correct threshold values', () => {
      expect(ROUTE_DISTANCE_LIMITS.MAX_REASONABLE_DISTANCE).toBe(50000); // 50 km
      expect(ROUTE_DISTANCE_LIMITS.RECOMMENDED_MAX_DISTANCE).toBe(30000); // 30 km
      expect(ROUTE_DISTANCE_LIMITS.TYPICAL_CITY_WALK).toBe(15000); // 15 km
    });

    it('should have thresholds in ascending order', () => {
      expect(ROUTE_DISTANCE_LIMITS.TYPICAL_CITY_WALK)
        .toBeLessThan(ROUTE_DISTANCE_LIMITS.RECOMMENDED_MAX_DISTANCE);
      expect(ROUTE_DISTANCE_LIMITS.RECOMMENDED_MAX_DISTANCE)
        .toBeLessThan(ROUTE_DISTANCE_LIMITS.MAX_REASONABLE_DISTANCE);
    });
  });

  describe('Real-world scenarios', () => {
    it('should not warn for typical city walk (Moscow center to 10km)', () => {
      const distance = calculateDirectDistance(moscowCenter, moscow10km);
      expect(shouldShowDistanceWarning(distance)).toBe(false);
    });

    it('should not warn for longer city route (Moscow center to 30km)', () => {
      const distance = calculateDirectDistance(moscowCenter, moscow30km);
      expect(shouldShowDistanceWarning(distance)).toBe(false);
    });

    it('should warn for intercity route (Moscow to Warsaw)', () => {
      const distance = calculateDirectDistance(moscowCenter, warsaw);
      expect(shouldShowDistanceWarning(distance)).toBe(true);
    });
  });
});
