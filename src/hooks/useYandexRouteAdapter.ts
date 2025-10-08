/**
 * Adapter to convert Yandex Maps routes to MultiModalRoute format
 * Bridges Yandex API with our complex routing system
 */

import {
  MultiModalRoute,
  RouteSegment,
  RouteInstruction,
  InstructionType
} from '../types/routing';
import { TransportMode, Coordinate, AccessibilityInfo } from '../types/graph';

export interface YandexRouteData {
  distance: number; // meters
  duration: number; // seconds
  coordinates: [number, number][]; // [lat, lng]
  mode: TransportMode;
}

export class YandexRouteAdapter {
  /**
   * Convert Yandex route to MultiModalRoute format
   */
  static toMultiModalRoute(
    yandexRoute: YandexRouteData,
    fromAddress: string,
    toAddress: string
  ): MultiModalRoute {
    const routeId = `route_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create geometry from coordinates
    const geometry: Coordinate[] = yandexRoute.coordinates.map(coord => ({
      latitude: coord[0],
      longitude: coord[1]
    }));

    // Create a single segment for the route
    const segment: RouteSegment = {
      id: `segment_${routeId}_0`,
      mode: yandexRoute.mode,
      from: 'start',
      to: 'end',
      fromCoordinate: geometry[0],
      toCoordinate: geometry[geometry.length - 1],
      distance: yandexRoute.distance,
      duration: yandexRoute.duration,
      cost: this.calculateCost(yandexRoute.mode, yandexRoute.distance),
      geometry: geometry,
      instructions: this.generateInstructions(yandexRoute.mode, fromAddress, toAddress, geometry[0], geometry[geometry.length - 1]),
      properties: {},
      accessibility: this.createAccessibilityInfo(yandexRoute.mode)
    };

    // Create the multi-modal route
    const route: MultiModalRoute = {
      id: routeId,
      segments: [segment],
      totalDistance: yandexRoute.distance,
      totalDuration: yandexRoute.duration,
      totalCost: segment.cost,
      totalWalkingDistance: yandexRoute.mode === TransportMode.WALKING ? yandexRoute.distance : 0,
      totalCyclingDistance: yandexRoute.mode === TransportMode.BICYCLE ? yandexRoute.distance : 0,
      totalTransfers: 0,
      geometry: geometry,
      waypoints: [],
      accessibilityScore: this.calculateAccessibilityScore(yandexRoute.mode),
      safetyScore: this.calculateSafetyScore(yandexRoute.mode),
      comfortScore: this.calculateComfortScore(yandexRoute.mode),
      environmentalScore: this.calculateEnvironmentalScore(yandexRoute.mode),
      alternatives: [],
      bounds: this.calculateBounds(geometry),
      summary: {
        startAddress: fromAddress,
        endAddress: toAddress
      },
      metadata: {
        algorithm: 'yandex_router',
        calculationTime: 0,
        createdAt: new Date(),
        isOptimal: true,
        hasRealTimeData: false
      }
    };

    return route;
  }

  /**
   * Calculate bounds from geometry
   */
  private static calculateBounds(geometry: Coordinate[]): { northEast: Coordinate; southWest: Coordinate } {
    if (geometry.length === 0) {
      return {
        northEast: { latitude: 0, longitude: 0 },
        southWest: { latitude: 0, longitude: 0 }
      };
    }

    let minLat = geometry[0].latitude;
    let maxLat = geometry[0].latitude;
    let minLon = geometry[0].longitude;
    let maxLon = geometry[0].longitude;

    for (const coord of geometry) {
      minLat = Math.min(minLat, coord.latitude);
      maxLat = Math.max(maxLat, coord.latitude);
      minLon = Math.min(minLon, coord.longitude);
      maxLon = Math.max(maxLon, coord.longitude);
    }

    return {
      northEast: { latitude: maxLat, longitude: maxLon },
      southWest: { latitude: minLat, longitude: minLon }
    };
  }

  /**
   * Create accessibility info
   */
  private static createAccessibilityInfo(mode: TransportMode): AccessibilityInfo {
    return {
      wheelchairAccessible: this.isWheelchairAccessible(mode),
      visuallyImpairedFriendly: false,
      hasElevator: false,
      hasRamp: false,
      audioSignals: false,
      tactilePaving: false
    };
  }

  /**
   * Calculate cost based on transport mode and distance
   */
  private static calculateCost(mode: TransportMode, distance: number): number {
    const costPerKm: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 0,
      [TransportMode.BICYCLE]: 0,
      [TransportMode.CAR]: 5, // 5 руб/км for fuel
      [TransportMode.BUS]: 0.5,
      [TransportMode.METRO]: 60,
      [TransportMode.TRAM]: 40,
      [TransportMode.TRAIN]: 100,
      [TransportMode.FERRY]: 150
    };

    const distanceKm = distance / 1000;
    return Math.round(costPerKm[mode] * distanceKm);
  }

  /**
   * Generate basic instructions for the route
   */
  private static generateInstructions(
    mode: TransportMode,
    fromAddress: string,
    toAddress: string,
    fromCoord: Coordinate,
    toCoord: Coordinate
  ): RouteInstruction[] {
    const modeText = this.getModeText(mode);
    const accessibility = this.createAccessibilityInfo(mode);
    
    return [
      {
        id: 'start',
        type: InstructionType.DEPART,
        text: `Начните движение ${modeText} от ${fromAddress}`,
        coordinate: fromCoord,
        distance: 0,
        duration: 0,
        maneuver: {
          type: InstructionType.DEPART
        },
        landmarks: [],
        accessibilityInfo: accessibility
      },
      {
        id: 'end',
        type: InstructionType.ARRIVE,
        text: `Прибытие в ${toAddress}`,
        coordinate: toCoord,
        distance: 0,
        duration: 0,
        maneuver: {
          type: InstructionType.ARRIVE
        },
        landmarks: [],
        accessibilityInfo: accessibility
      }
    ];
  }

  /**
   * Get mode text in Russian
   */
  private static getModeText(mode: TransportMode): string {
    const modeTexts: Record<TransportMode, string> = {
      [TransportMode.WALKING]: 'пешком',
      [TransportMode.BICYCLE]: 'на велосипеде',
      [TransportMode.CAR]: 'на автомобиле',
      [TransportMode.BUS]: 'на автобусе',
      [TransportMode.METRO]: 'на метро',
      [TransportMode.TRAM]: 'на трамвае',
      [TransportMode.TRAIN]: 'на поезде',
      [TransportMode.FERRY]: 'на пароме'
    };
    return modeTexts[mode] || 'неизвестным способом';
  }

  /**
   * Check if mode is wheelchair accessible
   */
  private static isWheelchairAccessible(mode: TransportMode): boolean {
    return mode === TransportMode.CAR || 
           mode === TransportMode.BUS || 
           mode === TransportMode.METRO;
  }

  /**
   * Calculate accessibility score
   */
  private static calculateAccessibilityScore(mode: TransportMode): number {
    const scores: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 0.9,
      [TransportMode.BICYCLE]: 0.5,
      [TransportMode.CAR]: 0.95,
      [TransportMode.BUS]: 0.85,
      [TransportMode.METRO]: 0.9,
      [TransportMode.TRAM]: 0.8,
      [TransportMode.TRAIN]: 0.85,
      [TransportMode.FERRY]: 0.7
    };
    return scores[mode] || 0.5;
  }

  /**
   * Calculate safety score
   */
  private static calculateSafetyScore(mode: TransportMode): number {
    const scores: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 0.7,
      [TransportMode.BICYCLE]: 0.6,
      [TransportMode.CAR]: 0.75,
      [TransportMode.BUS]: 0.85,
      [TransportMode.METRO]: 0.9,
      [TransportMode.TRAM]: 0.85,
      [TransportMode.TRAIN]: 0.95,
      [TransportMode.FERRY]: 0.8
    };
    return scores[mode] || 0.5;
  }

  /**
   * Calculate comfort score
   */
  private static calculateComfortScore(mode: TransportMode): number {
    const scores: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 0.6,
      [TransportMode.BICYCLE]: 0.5,
      [TransportMode.CAR]: 0.9,
      [TransportMode.BUS]: 0.7,
      [TransportMode.METRO]: 0.85,
      [TransportMode.TRAM]: 0.8,
      [TransportMode.TRAIN]: 0.9,
      [TransportMode.FERRY]: 0.75
    };
    return scores[mode] || 0.5;
  }

  /**
   * Calculate environmental score
   */
  private static calculateEnvironmentalScore(mode: TransportMode): number {
    const scores: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 1.0,
      [TransportMode.BICYCLE]: 0.95,
      [TransportMode.CAR]: 0.2,
      [TransportMode.BUS]: 0.6,
      [TransportMode.METRO]: 0.75,
      [TransportMode.TRAM]: 0.7,
      [TransportMode.TRAIN]: 0.8,
      [TransportMode.FERRY]: 0.5
    };
    return scores[mode] || 0.5;
  }

  /**
   * Merge multiple Yandex routes into a multi-modal route
   */
  static mergeRoutes(
    routes: YandexRouteData[],
    fromAddress: string,
    toAddress: string
  ): MultiModalRoute {
    if (routes.length === 0) {
      throw new Error('No routes to merge');
    }

    if (routes.length === 1) {
      return this.toMultiModalRoute(routes[0], fromAddress, toAddress);
    }

    const routeId = `route_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create segments from all routes
    const segments: RouteSegment[] = routes.map((yandexRoute, index) => {
      const geometry: Coordinate[] = yandexRoute.coordinates.map(coord => ({
        latitude: coord[0],
        longitude: coord[1]
      }));

      return {
        id: `segment_${routeId}_${index}`,
        mode: yandexRoute.mode,
        from: index === 0 ? 'start' : `transfer_${index - 1}`,
        to: index === routes.length - 1 ? 'end' : `transfer_${index}`,
        fromCoordinate: geometry[0],
        toCoordinate: geometry[geometry.length - 1],
        distance: yandexRoute.distance,
        duration: yandexRoute.duration,
        cost: this.calculateCost(yandexRoute.mode, yandexRoute.distance),
        geometry: geometry,
        instructions: index === 0 
          ? this.generateInstructions(yandexRoute.mode, fromAddress, toAddress, geometry[0], geometry[geometry.length - 1])
          : [],
        properties: {},
        accessibility: this.createAccessibilityInfo(yandexRoute.mode)
      };
    });

    // Combine all geometry
    const allGeometry: Coordinate[] = segments.flatMap(s => s.geometry);
    
    // Calculate totals
    const totalDistance = segments.reduce((sum, s) => sum + s.distance, 0);
    const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
    const totalCost = segments.reduce((sum, s) => sum + s.cost, 0);
    const totalWalkingDistance = segments
      .filter(s => s.mode === TransportMode.WALKING)
      .reduce((sum, s) => sum + s.distance, 0);
    const totalCyclingDistance = segments
      .filter(s => s.mode === TransportMode.BICYCLE)
      .reduce((sum, s) => sum + s.distance, 0);
    const totalTransfers = Math.max(0, segments.length - 1);

    // Calculate average scores
    const avgAccessibility = segments.reduce((sum, s) => sum + this.calculateAccessibilityScore(s.mode), 0) / segments.length;
    const avgSafety = segments.reduce((sum, s) => sum + this.calculateSafetyScore(s.mode), 0) / segments.length;
    const avgComfort = segments.reduce((sum, s) => sum + this.calculateComfortScore(s.mode), 0) / segments.length;
    const avgEnvironmental = segments.reduce((sum, s) => sum + this.calculateEnvironmentalScore(s.mode), 0) / segments.length;

    const route: MultiModalRoute = {
      id: routeId,
      segments: segments,
      totalDistance,
      totalDuration,
      totalCost,
      totalWalkingDistance,
      totalCyclingDistance,
      totalTransfers,
      geometry: allGeometry,
      waypoints: [],
      accessibilityScore: avgAccessibility,
      safetyScore: avgSafety,
      comfortScore: avgComfort,
      environmentalScore: avgEnvironmental,
      alternatives: [],
      bounds: this.calculateBounds(allGeometry),
      summary: {
        startAddress: fromAddress,
        endAddress: toAddress
      },
      metadata: {
        algorithm: 'yandex_router_multimodal',
        calculationTime: 0,
        createdAt: new Date(),
        isOptimal: true,
        hasRealTimeData: false
      }
    };

    return route;
  }
}
