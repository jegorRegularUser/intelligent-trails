/**
 * Multi-criteria optimization for multi-modal routing
 * Finds Pareto-optimal routes based on multiple criteria
 */

import {
  MultiModalGraph,
  GraphNode,
  GraphEdge,
  TransferPoint,
  TransportMode,
  Coordinate,
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
import { PriorityQueue } from '../data-structures/PriorityQueue';
import { MultiModalGraphImpl } from '../graph/MultiModalGraph';

/**
 * Optimization criteria
 */
export enum OptimizationCriteria {
  TIME = 'time',
  COST = 'cost',
  DISTANCE = 'distance',
  SAFETY = 'safety',
  ACCESSIBILITY = 'accessibility',
  ENVIRONMENTAL = 'environmental',
  COMFORT = 'comfort',
  TRANSFERS = 'transfers'
}

/**
 * Weight configuration for optimization
 */
export interface OptimizationWeights {
  time: number; // 0-1
  cost: number; // 0-1
  distance: number; // 0-1
  safety: number; // 0-1
  accessibility: number; // 0-1
  environmental: number; // 0-1
  comfort: number; // 0-1
  transfers: number; // 0-1
}

/**
 * Multi-criteria optimizer implementation
 */
export class MultiCriteriaOptimizer {
  private graph: MultiModalGraphImpl;
  private preferences: UserPreferences;
  private constraints: RouteConstraints;
  private weights: OptimizationWeights;

  constructor(
    graph: MultiModalGraphImpl, 
    preferences: UserPreferences, 
    constraints: RouteConstraints
  ) {
    this.graph = graph;
    this.preferences = preferences;
    this.constraints = constraints;
    this.weights = this.calculateWeights();
  }

  /**
   * Find Pareto-optimal routes between two nodes
   */
  findParetoOptimalRoutes(startNodeId: string, endNodeId: string): MultiModalRoute[] {
    const routes: MultiModalRoute[] = [];
    
    // Generate candidate routes using different algorithms and criteria
    routes.push(...this.generateCandidateRoutes(startNodeId, endNodeId));
    
    // Filter Pareto-optimal routes
    const paretoFront = this.filterParetoOptimal(routes);
    
    // Sort by overall score
    return paretoFront.sort((a, b) => 
      this.calculateOverallScore(b) - this.calculateOverallScore(a)
    );
  }

  /**
   * Generate candidate routes using different algorithms and criteria
   */
  private generateCandidateRoutes(startNodeId: string, endNodeId: string): MultiModalRoute[] {
    const routes: MultiModalRoute[] = [];
    
    // Create a simple route using graph's shortest path
    const path = this.graph.findShortestPath(startNodeId, endNodeId, TransportMode.WALKING);
    if (path && path.length > 1) {
      const route = this.createRouteFromPath(path, startNodeId, endNodeId);
      if (route) {
        routes.push(route);
      }
    }
    
    return routes;
  }

  /**
   * Create a route from a path of node IDs
   */
  private createRouteFromPath(path: string[], startNodeId: string, endNodeId: string): MultiModalRoute | null {
    if (path.length < 2) return null;

    const segments: RouteSegment[] = [];
    let totalDistance = 0;
    let totalDuration = 0;
    let totalCost = 0;
    const geometry: Coordinate[] = [];

    for (let i = 0; i < path.length - 1; i++) {
      const fromNodeId = path[i];
      const toNodeId = path[i + 1];
      
      const fromNode = this.graph.getNode(fromNodeId);
      const toNode = this.graph.getNode(toNodeId);
      
      if (!fromNode || !toNode) continue;

      // Find edge between nodes
      const edges = this.graph.getOutgoingEdges(fromNodeId);
      const edge = edges.find(e => e.to === toNodeId);
      
      if (!edge) {
        // Create a virtual edge for walking
        const distance = this.calculateDistance(fromNode.coordinate, toNode.coordinate);
        const duration = distance / 1.4; // ~5 km/h walking speed
        
        const segment: RouteSegment = {
          id: `segment_${i}`,
          mode: TransportMode.WALKING,
          from: fromNodeId,
          to: toNodeId,
          fromCoordinate: fromNode.coordinate,
          toCoordinate: toNode.coordinate,
          distance,
          duration,
          cost: 0,
          instructions: [],
          geometry: [fromNode.coordinate, toNode.coordinate],
          accessibility: fromNode.accessibility,
          properties: {}
        };
        
        segments.push(segment);
        totalDistance += distance;
        totalDuration += duration;
        geometry.push(fromNode.coordinate);
      } else {
        const segment: RouteSegment = {
          id: `segment_${i}`,
          mode: edge.mode,
          from: fromNodeId,
          to: toNodeId,
          fromCoordinate: fromNode.coordinate,
          toCoordinate: toNode.coordinate,
          distance: edge.distance,
          duration: edge.duration,
          cost: edge.cost,
          instructions: [],
          geometry: [fromNode.coordinate, toNode.coordinate],
          accessibility: edge.accessibility,
          properties: edge.properties
        };
        
        segments.push(segment);
        totalDistance += edge.distance;
        totalDuration += edge.duration;
        totalCost += edge.cost;
        geometry.push(fromNode.coordinate);
      }
    }

    // Add final coordinate
    const lastNode = this.graph.getNode(path[path.length - 1]);
    if (lastNode) {
      geometry.push(lastNode.coordinate);
    }

    const route: MultiModalRoute = {
      id: `route_${Date.now()}`,
      segments,
      totalDistance,
      totalDuration,
      totalCost,
      totalWalkingDistance: segments.filter(s => s.mode === TransportMode.WALKING).reduce((sum, s) => sum + s.distance, 0),
      totalCyclingDistance: segments.filter(s => s.mode === TransportMode.BICYCLE).reduce((sum, s) => sum + s.distance, 0),
      totalTransfers: segments.filter((s, i) => i > 0 && s.mode !== segments[i-1].mode).length,
      accessibilityScore: 0.8,
      environmentalScore: 0.7,
      safetyScore: 0.8,
      comfortScore: 0.7,
      waypoints: [],
      alternatives: [],
      geometry,
      bounds: this.calculateBounds(geometry),
      summary: {},
      metadata: {
        algorithm: 'simple',
        calculationTime: 0,
        createdAt: new Date(),
        isOptimal: false,
        hasRealTimeData: false
      }
    };

    return route;
  }

  /**
   * Calculate distance between two coordinates
   */
  private calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
    const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Calculate bounding box for coordinates
   */
  private calculateBounds(coordinates: Coordinate[]): { northEast: Coordinate; southWest: Coordinate } {
    if (coordinates.length === 0) {
      return {
        northEast: { latitude: 0, longitude: 0 },
        southWest: { latitude: 0, longitude: 0 }
      };
    }

    let minLat = coordinates[0].latitude;
    let maxLat = coordinates[0].latitude;
    let minLon = coordinates[0].longitude;
    let maxLon = coordinates[0].longitude;

    for (const coord of coordinates) {
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
   * Check if a route is a duplicate of any in a list
   */
  private isDuplicateRoute(route: MultiModalRoute, routes: MultiModalRoute[]): boolean {
    for (const existingRoute of routes) {
      // Check if routes have similar segments
      if (this.areRoutesSimilar(route, existingRoute)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if two routes are similar
   */
  private areRoutesSimilar(route1: MultiModalRoute, route2: MultiModalRoute): boolean {
    // Simple similarity check based on total distance and duration
    const distanceDiff = Math.abs(route1.totalDistance - route2.totalDistance);
    const durationDiff = Math.abs(route1.totalDuration - route2.totalDuration);
    
    // If both differences are less than 10%, consider them similar
    const distanceThreshold = route1.totalDistance * 0.1;
    const durationThreshold = route1.totalDuration * 0.1;
    
    return distanceDiff < distanceThreshold && durationDiff < durationThreshold;
  }

  /**
   * Filter Pareto-optimal routes from a list of candidates
   */
  private filterParetoOptimal(routes: MultiModalRoute[]): MultiModalRoute[] {
    const paretoFront: MultiModalRoute[] = [];
    
    for (const route of routes) {
      let isDominated = false;
      
      for (const other of routes) {
        if (route !== other && this.dominates(other, route)) {
          isDominated = true;
          break;
        }
      }
      
      if (!isDominated) {
        paretoFront.push(route);
      }
    }
    
    return paretoFront;
  }

  /**
   * Check if routeA dominates routeB (routeA is better or equal in all criteria)
   */
  private dominates(routeA: MultiModalRoute, routeB: MultiModalRoute): boolean {
    const scoreA = this.evaluateRoute(routeA);
    const scoreB = this.evaluateRoute(routeB);
    
    let atLeastOneBetter = false;
    
    // Check each criterion
    if (scoreA.time > scoreB.time) return false; // A is not better in time
    if (scoreA.time < scoreB.time) atLeastOneBetter = true;
    
    if (scoreA.cost > scoreB.cost) return false; // A is not better in cost
    if (scoreA.cost < scoreB.cost) atLeastOneBetter = true;
    
    if (scoreA.distance > scoreB.distance) return false; // A is not better in distance
    if (scoreA.distance < scoreB.distance) atLeastOneBetter = true;
    
    if (scoreA.safety < scoreB.safety) return false; // A is not better in safety
    if (scoreA.safety > scoreB.safety) atLeastOneBetter = true;
    
    if (scoreA.accessibility < scoreB.accessibility) return false; // A is not better in accessibility
    if (scoreA.accessibility > scoreB.accessibility) atLeastOneBetter = true;
    
    if (scoreA.environmental < scoreB.environmental) return false; // A is not better in environmental
    if (scoreA.environmental > scoreB.environmental) atLeastOneBetter = true;
    
    if (scoreA.comfort < scoreB.comfort) return false; // A is not better in comfort
    if (scoreA.comfort > scoreB.comfort) atLeastOneBetter = true;
    
    if (scoreA.transfers > scoreB.transfers) return false; // A is not better in transfers
    if (scoreA.transfers < scoreB.transfers) atLeastOneBetter = true;
    
    return atLeastOneBetter;
  }

  /**
   * Evaluate a route and return normalized scores for each criterion
   */
  private evaluateRoute(route: MultiModalRoute): RouteScore {
    return {
      time: this.normalizeTime(route.totalDuration),
      cost: this.normalizeCost(route.totalCost),
      distance: this.normalizeDistance(route.totalDistance),
      safety: route.safetyScore,
      accessibility: route.accessibilityScore,
      environmental: route.environmentalScore,
      comfort: route.comfortScore,
      transfers: this.normalizeTransfers(route.totalTransfers),
      overall: 0 // Will be calculated later
    };
  }

  /**
   * Normalize time score (0-1, lower is better)
   */
  private normalizeTime(time: number): number {
    // Normalize to 0-1 range, where 0 is best (fastest)
    // Assuming maximum reasonable travel time is 3 hours (10800 seconds)
    return Math.min(time / 10800, 1);
  }

  /**
   * Normalize cost score (0-1, lower is better)
   */
  private normalizeCost(cost: number): number {
    // Normalize to 0-1 range, where 0 is best (cheapest)
    // Assuming maximum reasonable cost is 1000 units
    return Math.min(cost / 1000, 1);
  }

  /**
   * Normalize distance score (0-1, lower is better)
   */
  private normalizeDistance(distance: number): number {
    // Normalize to 0-1 range, where 0 is best (shortest)
    // Assuming maximum reasonable distance is 100km (100000 meters)
    return Math.min(distance / 100000, 1);
  }

  /**
   * Normalize transfers score (0-1, lower is better)
   */
  private normalizeTransfers(transfers: number): number {
    // Normalize to 0-1 range, where 0 is best (fewest transfers)
    // Assuming maximum reasonable transfers is 5
    return Math.min(transfers / 5, 1);
  }

  /**
   * Calculate overall score for a route
   */
  private calculateOverallScore(route: MultiModalRoute): number {
    const score = this.evaluateRoute(route);
    
    // Calculate weighted sum
    let overall = 0;
    overall += score.time * this.weights.time;
    overall += score.cost * this.weights.cost;
    overall += score.distance * this.weights.distance;
    overall += score.safety * this.weights.safety;
    overall += score.accessibility * this.weights.accessibility;
    overall += score.environmental * this.weights.environmental;
    overall += score.comfort * this.weights.comfort;
    overall += score.transfers * this.weights.transfers;
    
    return overall;
  }

  /**
   * Calculate optimization weights based on user preferences
   */
  private calculateWeights(): OptimizationWeights {
    // Normalize user preferences to weights (0-1)
    const totalPreference = 
      this.preferences.speed + 
      this.preferences.safety + 
      this.preferences.accessibility + 
      this.preferences.cost + 
      this.preferences.comfort + 
      this.preferences.environmental;
    
    return {
      time: this.preferences.speed / totalPreference,
      cost: this.preferences.cost / totalPreference,
      distance: 0.1, // Fixed weight for distance
      safety: this.preferences.safety / totalPreference,
      accessibility: this.preferences.accessibility / totalPreference,
      environmental: this.preferences.environmental / totalPreference,
      comfort: this.preferences.comfort / totalPreference,
      transfers: this.preferences.minimizeTransfers ? 0.2 : 0.05
    };
  }

  /**
   * Compare multiple routes and provide recommendations
   */
  compareRoutes(routes: MultiModalRoute[]): RouteComparison {
    if (routes.length === 0) {
      throw new Error('No routes to compare');
    }
    
    const scores = new Map<string, RouteScore>();
    const recommendations = {
      fastest: '',
      shortest: '',
      cheapest: '',
      mostAccessible: '',
      mostEcoFriendly: '',
      safest: '',
      mostComfortable: '',
      bestOverall: ''
    };
    
    // Calculate scores for all routes
    for (const route of routes) {
      const score = this.evaluateRoute(route);
      score.overall = this.calculateOverallScore(route);
      scores.set(route.id, score);
    }
    
    // Find recommendations
    let fastestScore = Infinity;
    let shortestScore = Infinity;
    let cheapestScore = Infinity;
    let mostAccessibleScore = -1;
    let mostEcoFriendlyScore = -1;
    let safestScore = -1;
    let mostComfortableScore = -1;
    let bestOverallScore = -1;
    
    for (const [routeId, score] of scores) {
      // Fastest (lowest time)
      if (score.time < fastestScore) {
        fastestScore = score.time;
        recommendations.fastest = routeId;
      }
      
      // Shortest (lowest distance)
      if (score.distance < shortestScore) {
        shortestScore = score.distance;
        recommendations.shortest = routeId;
      }
      
      // Cheapest (lowest cost)
      if (score.cost < cheapestScore) {
        cheapestScore = score.cost;
        recommendations.cheapest = routeId;
      }
      
      // Most accessible (highest accessibility)
      if (score.accessibility > mostAccessibleScore) {
        mostAccessibleScore = score.accessibility;
        recommendations.mostAccessible = routeId;
      }
      
      // Most eco-friendly (highest environmental)
      if (score.environmental > mostEcoFriendlyScore) {
        mostEcoFriendlyScore = score.environmental;
        recommendations.mostEcoFriendly = routeId;
      }
      
      // Safest (highest safety)
      if (score.safety > safestScore) {
        safestScore = score.safety;
        recommendations.safest = routeId;
      }
      
      // Most comfortable (highest comfort)
      if (score.comfort > mostComfortableScore) {
        mostComfortableScore = score.comfort;
        recommendations.mostComfortable = routeId;
      }
      
      // Best overall (highest overall score)
      if (score.overall > bestOverallScore) {
        bestOverallScore = score.overall;
        recommendations.bestOverall = routeId;
      }
    }
    
    return {
      primary: routes.find(r => r.id === recommendations.bestOverall) || routes[0],
      alternatives: routes.filter(r => r.id !== recommendations.bestOverall),
      scores,
      recommendations
    };
  }

  /**
   * Update optimization weights
   */
  updateWeights(weights: Partial<OptimizationWeights>): void {
    this.weights = { ...this.weights, ...weights };
  }

  /**
   * Get current optimization weights
   */
  getWeights(): OptimizationWeights {
    return { ...this.weights };
  }
}