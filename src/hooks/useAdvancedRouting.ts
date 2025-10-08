// hooks/useAdvancedRouting.ts
import { useState, useEffect } from 'react';

// Import new types and classes
import {
  MultiModalGraph,
  GraphNode,
  GraphEdge,
  TransferPoint,
  TransportMode,
  Coordinate,
  GraphConstraints,
  NodeType,
  AccessibilityInfo
} from '../types/graph';
import {
  MultiModalRoute,
  RouteSegment,
  RouteInstruction,
  UserPreferences,
  RouteConstraints,
  InstructionType,
  Maneuver,
  Landmark,
  RouteScore,
  RouteComparison
} from '../types/routing';
import { OptimizationWeights } from '../algorithms/MultiCriteriaOptimizer';
import { MultiModalGraphImpl } from '../graph/MultiModalGraph';
import { MultiModalDijkstra } from '../algorithms/Dijkstra';
import { MultiModalAStar } from '../algorithms/AStar';
import { BidirectionalSearch } from '../algorithms/BidirectionalSearch';
import { MultiCriteriaOptimizer, OptimizationCriteria } from '../algorithms/MultiCriteriaOptimizer';
import { RouteScorer, RouteAnalysis, ComparisonMetrics } from '../algorithms/RouteScorer';

// Legacy interfaces for backward compatibility
export interface RoutePreferences {
  avoidTraffic: boolean;
  scenicRoute: boolean;
  minimizeWalking: boolean;
  includeParks: boolean;
  includeHistorical: boolean;
  includeCultural: boolean;
  includeFood: boolean;
  maxDetourTime: number;
}

export interface AdvancedRoute {
  id: string;
  name: string;
  description: string;
  distance: number;
  duration: number;
  coordinates: [number, number][];
  places: any[];
  mode: string;
  from: [number, number];
  to: [number, number];
  score: number;
}

// New interfaces for multi-modal routing
export interface MultiModalRoutingState {
  isCalculating: boolean;
  graph: MultiModalGraphImpl | null;
  error: string | null;
  lastCalculationTime: number;
}

export interface RoutingOptions {
  algorithm: 'dijkstra' | 'astar' | 'bidirectional' | 'multicriteria';
  optimizeFor: OptimizationCriteria[];
  returnAlternatives: boolean;
  maxAlternatives: number;
}

export const useAdvancedRouting = () => {
  const [state, setState] = useState<MultiModalRoutingState>({
    isCalculating: false,
    graph: null,
    error: null,
    lastCalculationTime: 0
  });

  // Initialize graph on first use
  useEffect(() => {
    if (!state.graph) {
      initializeGraph();
    }
  }, [state.graph]);

  const initializeGraph = () => {
    try {
      const constraints: GraphConstraints = {
        maxDistance: 100000, // 100km
        maxDuration: 10800, // 3 hours
        maxTransfers: 5,
        maxWalkingDistance: 2000, // 2km
        maxCyclingDistance: 15000, // 15km
        maxCost: 1000,
        departureTime: undefined,
        arrivalTime: undefined,
        avoidTolls: false,
        avoidHighways: false,
        avoidFerries: false,
        avoidUnpavedRoads: false,
        requireBikeLane: false,
        requireSidewalk: false
      };

      const graph = new MultiModalGraphImpl(constraints);
      setState(prev => ({
        ...prev,
        graph,
        error: null
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to initialize graph'
      }));
    }
  };

  const calculateOptimalRoute = (
    from: [number, number],
    to: [number, number],
    places: any[],
    preferences: RoutePreferences,
    mode: string
  ): AdvancedRoute => {
    // Legacy implementation for backward compatibility
    const baseDistance = calculateDistance(from, to);
    const baseDuration = calculateDuration(baseDistance, mode);

    // Фильтруем места по предпочтениям
    const filteredPlaces = places.filter(place => {
      if (preferences.includeParks && place.type === 'park') return true;
      if (preferences.includeHistorical && place.type === 'historical') return true;
      if (preferences.includeCultural && place.type === 'cultural') return true;
      if (preferences.includeFood && place.type === 'food') return true;
      return false;
    });

    // Выбираем лучшие места по рейтингу и близости к маршруту
    const selectedPlaces = selectBestPlaces(from, to, filteredPlaces, preferences);

    // Рассчитываем итоговые параметры маршрута
    const totalDistance = baseDistance + (selectedPlaces.length * 0.5); // добавляем расстояние на объезды
    const totalDuration = baseDuration + selectedPlaces.reduce((sum, place) => sum + (place.visitDuration || 30), 0);

    // Генерируем координаты маршрута с учетом мест
    const routeCoordinates = generateRouteWithPlaces(from, to, selectedPlaces);

    // Рассчитываем оценку маршрута
    const score = calculateRouteScore(selectedPlaces, preferences, totalDistance, totalDuration);

    return {
      id: `route-${Date.now()}-${Math.random()}`,
      name: generateRouteName(selectedPlaces, preferences),
      description: generateRouteDescription(selectedPlaces, preferences),
      distance: Math.round(totalDistance * 10) / 10,
      duration: Math.round(totalDuration),
      coordinates: routeCoordinates,
      places: selectedPlaces,
      mode,
      from,
      to,
      score: Math.round(score)
    };
  };

  // New multi-modal routing functions
  const calculateMultiModalRoute = async (
    origin: Coordinate,
    destination: Coordinate,
    userPreferences: UserPreferences,
    routeConstraints: RouteConstraints,
    options: RoutingOptions = {
      algorithm: 'multicriteria',
      optimizeFor: [OptimizationCriteria.TIME, OptimizationCriteria.COST],
      returnAlternatives: true,
      maxAlternatives: 3
    }
  ): Promise<{
    primaryRoute: MultiModalRoute | null;
    alternativeRoutes: MultiModalRoute[];
    comparison: RouteComparison | null;
    error: string | null;
  }> => {
    if (!state.graph) {
      return {
        primaryRoute: null,
        alternativeRoutes: [],
        comparison: null,
        error: 'Graph not initialized'
      };
    }

    setState(prev => ({ ...prev, isCalculating: true, error: null }));
    const startTime = performance.now();

    try {
      // Find nearest nodes to origin and destination
      const originNodes = state.graph.findNearbyNodes(origin, 500);
      const destinationNodes = state.graph.findNearbyNodes(destination, 500);

      if (originNodes.length === 0 || destinationNodes.length === 0) {
        throw new Error('No nodes found near origin or destination');
      }

      const originNode = originNodes[0];
      const destinationNode = destinationNodes[0];

      let routes: MultiModalRoute[] = [];

      // Calculate routes based on selected algorithm
      switch (options.algorithm) {
        case 'dijkstra':
          routes = await calculateWithDijkstra(
            state.graph,
            originNode.id,
            destinationNode.id,
            userPreferences,
            routeConstraints
          );
          break;
        case 'astar':
          routes = await calculateWithAStar(
            state.graph,
            originNode.id,
            destinationNode.id,
            userPreferences,
            routeConstraints
          );
          break;
        case 'bidirectional':
          routes = await calculateWithBidirectional(
            state.graph,
            originNode.id,
            destinationNode.id,
            userPreferences,
            routeConstraints
          );
          break;
        case 'multicriteria':
        default:
          routes = await calculateWithMultiCriteria(
            state.graph,
            originNode.id,
            destinationNode.id,
            userPreferences,
            routeConstraints,
            options.optimizeFor
          );
          break;
      }

      // Limit number of alternatives
      const limitedRoutes = routes.slice(0, options.maxAlternatives);

      // Extract primary and alternative routes
      const primaryRoute = limitedRoutes.length > 0 ? limitedRoutes[0] : null;
      const alternativeRoutes = limitedRoutes.slice(1);

      // Generate comparison if we have multiple routes
      let comparison: RouteComparison | null = null;
      if (limitedRoutes.length > 1) {
        const optimizer = new MultiCriteriaOptimizer(state.graph, userPreferences, routeConstraints);
        comparison = optimizer.compareRoutes(limitedRoutes);
      }

      const calculationTime = performance.now() - startTime;
      setState(prev => ({
        ...prev,
        isCalculating: false,
        lastCalculationTime: calculationTime
      }));

      return {
        primaryRoute,
        alternativeRoutes,
        comparison,
        error: null
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        isCalculating: false,
        error: errorMessage
      }));

      return {
        primaryRoute: null,
        alternativeRoutes: [],
        comparison: null,
        error: errorMessage
      };
    }
  };

  const calculateWithDijkstra = async (
    graph: MultiModalGraphImpl,
    startNodeId: string,
    endNodeId: string,
    preferences: UserPreferences,
    constraints: RouteConstraints
  ): Promise<MultiModalRoute[]> => {
    const dijkstra = new MultiModalDijkstra(graph, preferences, constraints);
    const result = dijkstra.findShortestPath(startNodeId, endNodeId);
    
    if (result.success) {
      const route = dijkstra.convertToRoute(result, startNodeId, endNodeId);
      return route ? [route] : [];
    }
    
    return [];
  };

  const calculateWithAStar = async (
    graph: MultiModalGraphImpl,
    startNodeId: string,
    endNodeId: string,
    preferences: UserPreferences,
    constraints: RouteConstraints
  ): Promise<MultiModalRoute[]> => {
    const aStar = new MultiModalAStar(graph, preferences, constraints);
    const result = aStar.findShortestPath(startNodeId, endNodeId);
    
    if (result.success) {
      const route = aStar.convertToRoute(result, startNodeId, endNodeId);
      return route ? [route] : [];
    }
    
    return [];
  };

  const calculateWithBidirectional = async (
    graph: MultiModalGraphImpl,
    startNodeId: string,
    endNodeId: string,
    preferences: UserPreferences,
    constraints: RouteConstraints
  ): Promise<MultiModalRoute[]> => {
    const bidirectional = new BidirectionalSearch(graph, preferences, constraints);
    const result = bidirectional.findShortestPath(startNodeId, endNodeId);
    
    if (result.success) {
      const route = bidirectional.convertToRoute(result, startNodeId, endNodeId);
      return route ? [route] : [];
    }
    
    return [];
  };

  const calculateWithMultiCriteria = async (
    graph: MultiModalGraphImpl,
    startNodeId: string,
    endNodeId: string,
    preferences: UserPreferences,
    constraints: RouteConstraints,
    optimizeFor: OptimizationCriteria[]
  ): Promise<MultiModalRoute[]> => {
    const optimizer = new MultiCriteriaOptimizer(graph, preferences, constraints);
    return optimizer.findParetoOptimalRoutes(startNodeId, endNodeId);
  };

  const analyzeRoute = (route: MultiModalRoute): RouteAnalysis | null => {
    if (!state.graph) return null;
    
    const weights: OptimizationWeights = {
      time: 0.3,
      cost: 0.2,
      distance: 0.1,
      safety: 0.15,
      accessibility: 0.1,
      environmental: 0.05,
      comfort: 0.05,
      transfers: 0.05
    };
    
    const scorer = new RouteScorer(
      state.graph,
      route.metadata.createdAt as any,
      {} as any,
      weights
    );
    
    return scorer.analyzeRoute(route);
  };

  const compareRoutes = (routeA: MultiModalRoute, routeB: MultiModalRoute): ComparisonMetrics | null => {
    if (!state.graph) return null;
    
    const weights: OptimizationWeights = {
      time: 0.3,
      cost: 0.2,
      distance: 0.1,
      safety: 0.15,
      accessibility: 0.1,
      environmental: 0.05,
      comfort: 0.05,
      transfers: 0.05
    };
    
    const scorer = new RouteScorer(
      state.graph,
      routeA.metadata.createdAt as any,
      {} as any,
      weights
    );
    
    return scorer.compareRoutes(routeA, routeB);
  };

  // Legacy helper functions
  const calculateDistance = (from: [number, number], to: [number, number]): number => {
    const R = 6371;
    const dLat = (to[0] - from[0]) * Math.PI / 180;
    const dLon = (to[1] - from[1]) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(from[0] * Math.PI / 180) * Math.cos(to[0] * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1.3; // коэффициент для реальных дорог
  };

  const calculateDuration = (distance: number, mode: string): number => {
    const speeds: { [key: string]: number } = {
      walking: 5,
      bike: 15,
      car: 40
    };
    const speed = speeds[mode] || 5;
    return (distance / speed) * 60;
  };

  const selectBestPlaces = (
    from: [number, number],
    to: [number, number],
    places: any[],
    preferences: RoutePreferences
  ): any[] => {
    // Сортируем места по релевантности
    const scoredPlaces = places.map(place => ({
      ...place,
      routeScore: calculatePlaceRouteScore(place, from, to, preferences)
    }));

    // Сортируем по оценке и берем лучшие
    scoredPlaces.sort((a, b) => b.routeScore - a.routeScore);
    
    // Ограничиваем количество мест в зависимости от времени
    const maxPlaces = Math.min(6, Math.floor(preferences.maxDetourTime / 15));
    return scoredPlaces.slice(0, maxPlaces);
  };

  const calculatePlaceRouteScore = (
    place: any,
    from: [number, number],
    to: [number, number],
    preferences: RoutePreferences
  ): number => {
    let score = 0;

    // Базовая оценка по рейтингу места
    score += (place.rating || 3) * 20;

    // Бонус за популярность
    if (place.popularity === 'high') score += 15;
    else if (place.popularity === 'medium') score += 10;

    // Штраф за удаленность от маршрута
    const distanceFromRoute = calculateDistanceFromRoute(place.coordinates, from, to);
    score -= distanceFromRoute * 50;

    // Бонус за живописность маршрута
    if (preferences.scenicRoute && (place.type === 'park' || place.type === 'viewpoint')) {
      score += 20;
    }

    return Math.max(0, score);
  };

  const calculateDistanceFromRoute = (
    point: [number, number],
    from: [number, number],
    to: [number, number]
  ): number => {
    // Упрощенный расчет расстояния от точки до линии маршрута
    const A = to[0] - from[0];
    const B = to[1] - from[1];
    const C = from[0] - point[0];
    const D = from[1] - point[1];
    
    const dot = A * C + B * D;
    const lenSq = A * A + B * B;
    
    if (lenSq === 0) return Math.sqrt(C * C + D * D);
    
    const param = dot / lenSq;
    
    let xx, yy;
    if (param < 0) {
      xx = from[0];
      yy = from[1];
    } else if (param > 1) {
      xx = to[0];
      yy = to[1];
    } else {
      xx = from[0] + param * A;
      yy = from[1] + param * B;
    }
    
    const dx = point[0] - xx;
    const dy = point[1] - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const generateRouteWithPlaces = (
    from: [number, number],
    to: [number, number],
    places: any[]
  ): [number, number][] => {
    const coordinates: [number, number][] = [from];
    
    // Добавляем места в порядке их расположения вдоль маршрута
    const sortedPlaces = places.sort((a, b) => {
      const distA = calculateDistance(from, a.coordinates);
      const distB = calculateDistance(from, b.coordinates);
      return distA - distB;
    });

    sortedPlaces.forEach(place => {
      coordinates.push(place.coordinates);
    });

    coordinates.push(to);
    return coordinates;
  };

  const calculateRouteScore = (
    places: any[],
    preferences: RoutePreferences,
    distance: number,
    duration: number
  ): number => {
    let score = 50; // базовая оценка

    // Бонус за количество интересных мест
    score += places.length * 10;

    // Бонус за высокорейтинговые места
    const avgRating = places.reduce((sum, place) => sum + (place.rating || 3), 0) / places.length;
    score += (avgRating - 3) * 20;

    // Штраф за превышение времени
    if (duration > preferences.maxDetourTime * 2) {
      score -= 20;
    }

    // Бонус за соответствие предпочтениям
    if (preferences.scenicRoute) {
      const scenicPlaces = places.filter(p => p.type === 'park' || p.type === 'viewpoint');
      score += scenicPlaces.length * 5;
    }

    return Math.min(100, Math.max(0, score));
  };

  const generateRouteName = (places: any[], preferences: RoutePreferences): string => {
    if (places.length === 0) return "Прямой маршрут";
    
    const types = [...new Set(places.map(p => p.type))];
    
    if (types.includes('historical') && types.includes('cultural')) {
      return "Культурно-исторический маршрут";
    } else if (types.includes('park') && types.includes('viewpoint')) {
      return "Природно-панорамный маршрут";
    } else if (types.includes('food')) {
      return "Гастрономический маршрут";
    } else if (preferences.scenicRoute) {
      return "Живописный маршрут";
    }
    
    return "Тематический маршрут";
  };

  const generateRouteDescription = (places: any[], preferences: RoutePreferences): string => {
    if (places.length === 0) return "Кратчайший путь без остановок";
    
    const descriptions = [
      `Включает ${places.length} интересных мест`,
      `Средний рейтинг мест: ${(places.reduce((sum, p) => sum + (p.rating || 3), 0) / places.length).toFixed(1)}/5`
    ];

    if (preferences.scenicRoute) {
      descriptions.push("Проходит через живописные места");
    }

    return descriptions.join(" • ");
  };

  return {
    // State
    isCalculating: state.isCalculating,
    error: state.error,
    lastCalculationTime: state.lastCalculationTime,

    // Legacy functions
    calculateOptimalRoute,

    // New multi-modal routing functions
    calculateMultiModalRoute,
    analyzeRoute,
    compareRoutes,

    // Graph management
    reinitializeGraph: initializeGraph
  };
};