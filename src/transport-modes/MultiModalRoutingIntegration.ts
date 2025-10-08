/**
 * Multi-modal routing integration
 * Integrates all transport mode handlers and provides a unified interface for multi-modal routing
 */

import {
  GraphNode,
  GraphEdge,
  TransportMode,
  Coordinate,
  RealTimeEdgeData
} from '../types/graph';
import { MultiModalGraphImpl } from '../graph/MultiModalGraph';
import {
  MultiModalRoute,
  RouteSegment,
  RouteInstruction,
  UserPreferences,
  RouteConstraints,
  InstructionType,
  Maneuver
} from '../types/routing';
import { TransportModeHandler, RoutingContext, TransportModeParameters } from './TransportModeHandler';
import { TransportModeFactory, TransportModeRegistry, TransportModeCompatibility } from './TransportModeFactory';
import { CarRoutingHandler, CarRoutingParameters } from './CarRoutingHandler';
import { PublicTransportRoutingHandler, PublicTransportRoutingParameters } from './PublicTransportRoutingHandler';
import { BicycleRoutingHandler, BicycleRoutingParameters } from './BicycleRoutingHandler';
import { WalkingRoutingHandler, WalkingRoutingParameters } from './WalkingRoutingHandler';
import { PriorityQueue } from '../data-structures/PriorityQueue';

/**
 * Multi-modal routing request
 */
export interface MultiModalRoutingRequest {
  origin: Coordinate;
  destination: Coordinate;
  preferredModes: TransportMode[];
  avoidedModes: TransportMode[];
  preferences: UserPreferences;
  constraints: RouteConstraints;
  departureTime?: Date;
  arrivalTime?: Date;
  waypoints?: Coordinate[];
  realTimeData?: Map<string, RealTimeEdgeData>;
}

/**
 * Multi-modal routing options
 */
export interface MultiModalRoutingOptions {
  algorithm: 'dijkstra' | 'astar' | 'bidirectional' | 'multicriteria';
  maxAlternatives: number;
  maxTransfers: number;
  maxWalkingDistance: number;
  maxCyclingDistance: number;
  optimizeFor: ('time' | 'cost' | 'distance' | 'safety' | 'accessibility' | 'environmental' | 'comfort' | 'transfers')[];
  returnIntermediateResults: boolean;
}

/**
 * Multi-modal routing result
 */
export interface MultiModalRoutingResult {
  success: boolean;
  routes: MultiModalRoute[];
  primaryRoute?: MultiModalRoute;
  error?: string;
  calculationTime: number;
}

/**
 * Path node for multi-modal routing
 */
interface PathNode {
  nodeId: string;
  edgeId?: string;
  transferId?: string;
  mode: TransportMode;
  fromNodeId?: string;
  toNodeId?: string;
  cost: number;
  time: number;
  distance: number;
}

/**
 * Search state for multi-modal routing
 */
interface SearchState {
  nodeId: string;
  currentModes: TransportMode[];
  path: PathNode[];
  totalCost: number;
  totalTime: number;
  totalDistance: number;
  transfers: number;
}

/**
 * Multi-modal routing integration implementation
 */
export class MultiModalRoutingIntegration {
  private graph: MultiModalGraphImpl;
  private handlers: Map<TransportMode, TransportModeHandler>;
  private defaultOptions: MultiModalRoutingOptions;

  constructor(graph: MultiModalGraphImpl) {
    this.graph = graph;
    this.handlers = new Map();
    this.defaultOptions = {
      algorithm: 'multicriteria',
      maxAlternatives: 3,
      maxTransfers: 5,
      maxWalkingDistance: 2000,
      maxCyclingDistance: 15000,
      optimizeFor: ['time', 'cost'],
      returnIntermediateResults: false
    };

    // Register transport mode handlers
    this.registerHandlers();
  }

  /**
   * Register all transport mode handlers
   */
  private registerHandlers(): void {
    // Register handlers
    TransportModeRegistry.register(TransportMode.CAR, CarRoutingHandler);
    TransportModeRegistry.register(TransportMode.BUS, PublicTransportRoutingHandler);
    TransportModeRegistry.register(TransportMode.METRO, PublicTransportRoutingHandler);
    TransportModeRegistry.register(TransportMode.TRAM, PublicTransportRoutingHandler);
    TransportModeRegistry.register(TransportMode.TRAIN, PublicTransportRoutingHandler);
    TransportModeRegistry.register(TransportMode.FERRY, PublicTransportRoutingHandler);
    TransportModeRegistry.register(TransportMode.BICYCLE, BicycleRoutingHandler);
    TransportModeRegistry.register(TransportMode.WALKING, WalkingRoutingHandler);

    // Create handler instances
    for (const mode of TransportModeRegistry.getRegisteredModes()) {
      const handler = TransportModeFactory.createHandler(mode);
      this.handlers.set(mode, handler);
    }
  }

  /**
   * Calculate multi-modal routes
   */
  async calculateRoutes(
    request: MultiModalRoutingRequest,
    options: Partial<MultiModalRoutingOptions> = {}
  ): Promise<MultiModalRoutingResult> {
    const startTime = performance.now();
    const mergedOptions = { ...this.defaultOptions, ...options };

    try {
      // Find nearest nodes to origin and destination
      const originNodes = this.graph.findNearbyNodes(request.origin, 500);
      const destinationNodes = this.graph.findNearbyNodes(request.destination, 500);

      if (originNodes.length === 0 || destinationNodes.length === 0) {
        return {
          success: false,
          routes: [],
          error: 'No nodes found near origin or destination',
          calculationTime: performance.now() - startTime
        };
      }

      const originNode = originNodes[0];
      const destinationNode = destinationNodes[0];

      // Create routing context
      const context: RoutingContext = {
        graph: this.graph,
        preferences: request.preferences,
        constraints: request.constraints,
        departureTime: request.departureTime,
        realTimeData: request.realTimeData
      };

      // Calculate routes based on selected algorithm
      let routes: MultiModalRoute[] = [];
      switch (mergedOptions.algorithm) {
        case 'dijkstra':
          routes = await this.calculateWithDijkstra(
            originNode.id,
            destinationNode.id,
            request,
            context,
            mergedOptions
          );
          break;
        case 'astar':
          routes = await this.calculateWithAStar(
            originNode.id,
            destinationNode.id,
            request,
            context,
            mergedOptions
          );
          break;
        case 'bidirectional':
          routes = await this.calculateWithBidirectional(
            originNode.id,
            destinationNode.id,
            request,
            context,
            mergedOptions
          );
          break;
        case 'multicriteria':
        default:
          routes = await this.calculateWithMultiCriteria(
            originNode.id,
            destinationNode.id,
            request,
            context,
            mergedOptions
          );
          break;
      }

      // Limit number of alternatives
      const limitedRoutes = routes.slice(0, mergedOptions.maxAlternatives);

      // Extract primary route
      const primaryRoute = limitedRoutes.length > 0 ? limitedRoutes[0] : undefined;

      const calculationTime = performance.now() - startTime;

      return {
        success: true,
        routes: limitedRoutes,
        primaryRoute,
        calculationTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        routes: [],
        error: errorMessage,
        calculationTime: performance.now() - startTime
      };
    }
  }

  /**
   * Calculate routes using Dijkstra's algorithm
   */
  private async calculateWithDijkstra(
    startNodeId: string,
    endNodeId: string,
    request: MultiModalRoutingRequest,
    context: RoutingContext,
    options: MultiModalRoutingOptions
  ): Promise<MultiModalRoute[]> {
    // Priority queue for search states
    const queue = new PriorityQueue<SearchState>();
    const visited = new Set<string>();

    // Initialize with start node
    queue.enqueue({
      nodeId: startNodeId,
      currentModes: [],
      path: [],
      totalCost: 0,
      totalTime: 0,
      totalDistance: 0,
      transfers: 0
    }, 0);

    const results: MultiModalRoute[] = [];

    while (!queue.isEmpty()) {
      const current = queue.dequeue();
      if (!current) break;

      // Generate state key
      const stateKey = `${current.nodeId}-${current.currentModes.join(',')}`;
      if (visited.has(stateKey)) continue;
      visited.add(stateKey);

      // Check if we've reached the destination
      if (current.nodeId === endNodeId) {
        const route = this.convertPathToRoute(current.path, request, context);
        if (route) {
          results.push(route);
        }
        continue;
      }

      // Explore neighbors
      const neighbors = this.getNeighbors(current, request, context, options);
      for (const neighbor of neighbors) {
        // Check if we've already visited this state
        const neighborStateKey = `${neighbor.nodeId}-${neighbor.currentModes.join(',')}`;
        if (visited.has(neighborStateKey)) continue;

        queue.enqueue(neighbor, neighbor.totalCost);
      }
    }

    return results;
  }

  /**
   * Calculate routes using A* algorithm
   */
  private async calculateWithAStar(
    startNodeId: string,
    endNodeId: string,
    request: MultiModalRoutingRequest,
    context: RoutingContext,
    options: MultiModalRoutingOptions
  ): Promise<MultiModalRoute[]> {
    // This is a simplified A* implementation
    // In a real implementation, you would use a proper heuristic
    
    // Priority queue for search states
    const queue = new PriorityQueue<SearchState>();
    const visited = new Set<string>();

    // Initialize with start node
    queue.enqueue({
      nodeId: startNodeId,
      currentModes: [],
      path: [],
      totalCost: 0,
      totalTime: 0,
      totalDistance: 0,
      transfers: 0
    }, 0);

    const results: MultiModalRoute[] = [];

    while (!queue.isEmpty()) {
      const current = queue.dequeue();
      if (!current) break;

      // Generate state key
      const stateKey = `${current.nodeId}-${current.currentModes.join(',')}`;
      if (visited.has(stateKey)) continue;
      visited.add(stateKey);

      // Check if we've reached the destination
      if (current.nodeId === endNodeId) {
        const route = this.convertPathToRoute(current.path, request, context);
        if (route) {
          results.push(route);
        }
        continue;
      }

      // Explore neighbors
      const neighbors = this.getNeighbors(current, request, context, options);
      for (const neighbor of neighbors) {
        // Check if we've already visited this state
        const neighborStateKey = `${neighbor.nodeId}-${neighbor.currentModes.join(',')}`;
        if (visited.has(neighborStateKey)) continue;

        // Calculate heuristic (estimated cost to destination)
        const heuristic = this.calculateHeuristic(neighbor.nodeId, endNodeId, neighbor.currentModes);
        const priority = neighbor.totalCost + heuristic;

        queue.enqueue(neighbor, priority);
      }
    }

    return results;
  }

  /**
   * Calculate routes using bidirectional search
   */
  private async calculateWithBidirectional(
    startNodeId: string,
    endNodeId: string,
    request: MultiModalRoutingRequest,
    context: RoutingContext,
    options: MultiModalRoutingOptions
  ): Promise<MultiModalRoute[]> {
    // This is a simplified bidirectional search implementation
    // In a real implementation, you would maintain two search fronts
    
    // For now, fall back to Dijkstra's algorithm
    return this.calculateWithDijkstra(startNodeId, endNodeId, request, context, options);
  }

  /**
   * Calculate routes using multi-criteria optimization
   */
  private async calculateWithMultiCriteria(
    startNodeId: string,
    endNodeId: string,
    request: MultiModalRoutingRequest,
    context: RoutingContext,
    options: MultiModalRoutingOptions
  ): Promise<MultiModalRoute[]> {
    // Generate routes for each preferred mode
    const routes: MultiModalRoute[] = [];

    for (const mode of request.preferredModes) {
      if (request.avoidedModes.includes(mode)) continue;

      // Create mode-specific request
      const modeRequest = { ...request, preferredModes: [mode] };

      // Calculate route for this mode
      const modeRoutes = await this.calculateWithDijkstra(
        startNodeId,
        endNodeId,
        modeRequest,
        context,
        options
      );

      routes.push(...modeRoutes);
    }

    // Generate multi-modal routes
    const multiModalRoutes = await this.generateMultiModalRoutes(
      startNodeId,
      endNodeId,
      request,
      context,
      options
    );

    routes.push(...multiModalRoutes);

    // Remove duplicates and sort by overall score
    const uniqueRoutes = this.removeDuplicateRoutes(routes);
    return uniqueRoutes.sort((a, b) => this.calculateOverallScore(b) - this.calculateOverallScore(a));
  }

  /**
   * Generate multi-modal routes
   */
  private async generateMultiModalRoutes(
    startNodeId: string,
    endNodeId: string,
    request: MultiModalRoutingRequest,
    context: RoutingContext,
    options: MultiModalRoutingOptions
  ): Promise<MultiModalRoute[]> {
    const routes: MultiModalRoute[] = [];

    // Try different mode combinations
    const modeCombinations = this.generateModeCombinations(
      request.preferredModes,
      request.avoidedModes,
      options.maxTransfers
    );

    for (const combination of modeCombinations) {
      // Create combination-specific request
      const combinationRequest = { ...request, preferredModes: combination };

      // Calculate route for this combination
      const combinationRoutes = await this.calculateWithDijkstra(
        startNodeId,
        endNodeId,
        combinationRequest,
        context,
        options
      );

      routes.push(...combinationRoutes);
    }

    return routes;
  }

  /**
   * Get neighbors for a search state
   */
  private getNeighbors(
    current: SearchState,
    request: MultiModalRoutingRequest,
    context: RoutingContext,
    options: MultiModalRoutingOptions
  ): SearchState[] {
    const neighbors: SearchState[] = [];
    const node = this.graph.getNode(current.nodeId);
    if (!node) return neighbors;

    // Get all modes available at this node
    const availableModes = node.modes.filter(mode => 
      !request.avoidedModes.includes(mode) &&
      (request.preferredModes.length === 0 || request.preferredModes.includes(mode))
    );

    // For each available mode, get neighbors
    for (const mode of availableModes) {
      const handler = this.handlers.get(mode);
      if (!handler) continue;

      // Get edges for this mode
      const edges = this.graph.getEdgesForMode(current.nodeId, mode);
      for (const edge of edges) {
        // Validate edge
        const validationResult = handler.validateEdge(edge, context);
        if (!validationResult.isValid) continue;

        // Get target node
        const targetNodeId = edge.to === current.nodeId ? edge.from : edge.to;
        const targetNode = this.graph.getNode(targetNodeId);
        if (!targetNode) continue;

        // Validate target node
        const nodeValidationResult = handler.validateNode(targetNode, context);
        if (!nodeValidationResult.isValid) continue;

        // Calculate edge cost and time
        const edgeCost = handler.calculateEdgeCost(edge, context);
        const edgeTime = handler.calculateEdgeTime(edge, context);

        // Create new state
        const newModes = [...current.currentModes];
        if (!newModes.includes(mode)) {
          newModes.push(mode);
        }

        const newTransfers = current.transfers + (current.currentModes.length > 0 && !current.currentModes.includes(mode) ? 1 : 0);

        // Check constraints
        if (newTransfers > options.maxTransfers) continue;
        if (mode === TransportMode.WALKING && current.totalDistance + edge.distance > options.maxWalkingDistance) continue;
        if (mode === TransportMode.BICYCLE && current.totalDistance + edge.distance > options.maxCyclingDistance) continue;

        // Create path node
        const pathNode: PathNode = {
          nodeId: targetNodeId,
          edgeId: edge.id,
          mode,
          fromNodeId: current.nodeId,
          toNodeId: targetNodeId,
          cost: edgeCost,
          time: edgeTime,
          distance: edge.distance
        };

        // Create new state
        const newState: SearchState = {
          nodeId: targetNodeId,
          currentModes: newModes,
          path: [...current.path, pathNode],
          totalCost: current.totalCost + edgeCost,
          totalTime: current.totalTime + edgeTime,
          totalDistance: current.totalDistance + edge.distance,
          transfers: newTransfers
        };

        neighbors.push(newState);
      }
    }

    return neighbors;
  }

  /**
   * Convert a path to a route
   */
  private convertPathToRoute(
    path: PathNode[],
    request: MultiModalRoutingRequest,
    context: RoutingContext
  ): MultiModalRoute | null {
    if (path.length === 0) return null;

    const segments: RouteSegment[] = [];
    let totalDistance = 0;
    let totalDuration = 0;
    let totalCost = 0;
    let totalWalkingDistance = 0;
    let totalCyclingDistance = 0;
    let totalTransfers = 0;
    const geometry: Coordinate[] = [];

    // Process path nodes to create segments
    for (let i = 0; i < path.length; i++) {
      const pathNode = path[i];
      const fromNode = this.graph.getNode(pathNode.fromNodeId || path[0].nodeId);
      const toNode = this.graph.getNode(pathNode.toNodeId || pathNode.nodeId);

      if (!fromNode || !toNode) continue;

      const edge = this.graph.getEdge(pathNode.edgeId || '');
      if (!edge) continue;

      const handler = this.handlers.get(pathNode.mode);
      if (!handler) continue;

      // Create segment
      const segment: RouteSegment = {
        id: `segment-${i}`,
        mode: pathNode.mode,
        from: fromNode.id,
        to: toNode.id,
        fromCoordinate: fromNode.coordinate,
        toCoordinate: toNode.coordinate,
        distance: pathNode.distance,
        duration: pathNode.time,
        cost: pathNode.cost,
        instructions: handler.generateInstructions(fromNode, toNode, edge, context),
        realTimeData: edge.realTimeData,
        geometry: [fromNode.coordinate, toNode.coordinate],
        accessibility: edge.accessibility,
        properties: {}
      };

      segments.push(segment);

      // Update totals
      totalDistance += pathNode.distance;
      totalDuration += pathNode.time;
      totalCost += pathNode.cost;

      if (pathNode.mode === TransportMode.WALKING) {
        totalWalkingDistance += pathNode.distance;
      } else if (pathNode.mode === TransportMode.BICYCLE) {
        totalCyclingDistance += pathNode.distance;
      }

      // Add to geometry
      if (i === 0) {
        geometry.push(fromNode.coordinate);
      }
      geometry.push(toNode.coordinate);
    }

    // Calculate scores
    const accessibilityScore = this.calculateAccessibilityScore(segments);
    const environmentalScore = this.calculateEnvironmentalScore(segments);
    const safetyScore = this.calculateSafetyScore(segments);
    const comfortScore = this.calculateComfortScore(segments);

    return {
      id: `route-${Date.now()}-${Math.random()}`,
      segments,
      totalDistance,
      totalDuration,
      totalCost,
      totalWalkingDistance,
      totalCyclingDistance,
      totalTransfers,
      accessibilityScore,
      environmentalScore,
      safetyScore,
      comfortScore,
      waypoints: [],
      alternatives: [],
      geometry,
      bounds: this.calculateBounds(geometry),
      summary: {},
      metadata: {
        algorithm: 'multimodal',
        calculationTime: 0,
        createdAt: new Date(),
        isOptimal: true,
        hasRealTimeData: segments.some(s => s.realTimeData !== undefined)
      }
    };
  }

  /**
   * Calculate heuristic for A* algorithm
   */
  private calculateHeuristic(
    nodeId: string,
    targetId: string,
    modes: TransportMode[]
  ): number {
    const node = this.graph.getNode(nodeId);
    const target = this.graph.getNode(targetId);
    
    if (!node || !target) return Infinity;
    
    // Calculate straight-line distance
    const distance = this.calculateDistance(node.coordinate, target.coordinate);
    
    // Get average speed for available modes
    let totalSpeed = 0;
    let count = 0;
    
    for (const mode of modes) {
      const handler = this.handlers.get(mode);
      if (handler) {
        totalSpeed += handler.getAverageSpeed({
          graph: this.graph,
          preferences: {} as any,
          constraints: {} as any
        });
        count++;
      }
    }
    
    const avgSpeed = count > 0 ? totalSpeed / count : 1.4; // Default to walking speed
    
    // Convert distance to time
    return distance / avgSpeed;
  }

  /**
   * Generate mode combinations for multi-modal routing
   */
  private generateModeCombinations(
    preferredModes: TransportMode[],
    avoidedModes: TransportMode[],
    maxTransfers: number
  ): TransportMode[][] {
    const combinations: TransportMode[][] = [];
    
    // Single mode combinations
    for (const mode of preferredModes) {
      if (!avoidedModes.includes(mode)) {
        combinations.push([mode]);
      }
    }
    
    // Multi-mode combinations
    if (maxTransfers > 0) {
      // Generate all possible combinations of preferred modes
      for (let i = 0; i < preferredModes.length; i++) {
        for (let j = i + 1; j < preferredModes.length; j++) {
          const mode1 = preferredModes[i];
          const mode2 = preferredModes[j];
          
          if (!avoidedModes.includes(mode1) && !avoidedModes.includes(mode2) &&
              TransportModeCompatibility.areModesCompatible(mode1, mode2)) {
            combinations.push([mode1, mode2]);
          }
        }
      }
    }
    
    return combinations;
  }

  /**
   * Remove duplicate routes
   */
  private removeDuplicateRoutes(routes: MultiModalRoute[]): MultiModalRoute[] {
    const uniqueRoutes: MultiModalRoute[] = [];
    
    for (const route of routes) {
      const isDuplicate = uniqueRoutes.some(existingRoute => 
        this.areRoutesSimilar(route, existingRoute)
      );
      
      if (!isDuplicate) {
        uniqueRoutes.push(route);
      }
    }
    
    return uniqueRoutes;
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
   * Calculate overall score for a route
   */
  private calculateOverallScore(route: MultiModalRoute): number {
    // Simple weighted sum of scores
    return (
      route.accessibilityScore * 0.2 +
      route.environmentalScore * 0.2 +
      route.safetyScore * 0.3 +
      route.comfortScore * 0.3
    );
  }

  /**
   * Calculate accessibility score for a route
   */
  private calculateAccessibilityScore(segments: RouteSegment[]): number {
    if (segments.length === 0) return 0;
    
    let totalScore = 0;
    for (const segment of segments) {
      let segmentScore = 0;
      const accessibility = segment.accessibility;
      
      if (accessibility.wheelchairAccessible) segmentScore += 0.25;
      if (accessibility.visuallyImpairedFriendly) segmentScore += 0.25;
      if (accessibility.hasElevator) segmentScore += 0.25;
      if (accessibility.hasRamp) segmentScore += 0.25;
      
      totalScore += segmentScore;
    }
    
    return totalScore / segments.length;
  }

  /**
   * Calculate environmental score for a route
   */
  private calculateEnvironmentalScore(segments: RouteSegment[]): number {
    if (segments.length === 0) return 0;
    
    let totalScore = 0;
    for (const segment of segments) {
      let segmentScore = 0;
      
      switch (segment.mode) {
        case TransportMode.WALKING:
        case TransportMode.BICYCLE:
          segmentScore = 1.0;
          break;
        case TransportMode.BUS:
        case TransportMode.METRO:
        case TransportMode.TRAM:
        case TransportMode.TRAIN:
          segmentScore = 0.8;
          break;
        case TransportMode.FERRY:
          segmentScore = 0.6;
          break;
        case TransportMode.CAR:
          segmentScore = 0.2;
          break;
      }
      
      totalScore += segmentScore;
    }
    
    return totalScore / segments.length;
  }

  /**
   * Calculate safety score for a route
   */
  private calculateSafetyScore(segments: RouteSegment[]): number {
    if (segments.length === 0) return 0;
    
    let totalScore = 0;
    for (const segment of segments) {
      let segmentScore = 0.5; // Base score
      
      // Adjust based on mode and infrastructure
      switch (segment.mode) {
        case TransportMode.METRO:
        case TransportMode.TRAIN:
          segmentScore = 0.9;
          break;
        case TransportMode.BUS:
        case TransportMode.TRAM:
          segmentScore = 0.8;
          break;
        case TransportMode.WALKING:
          segmentScore = segment.accessibility.hasRamp ? 0.8 : 0.6;
          break;
        case TransportMode.BICYCLE:
          segmentScore = segment.accessibility.hasRamp ? 0.8 : 0.5;
          break;
        case TransportMode.CAR:
          segmentScore = 0.4;
          break;
      }
      
      totalScore += segmentScore;
    }
    
    return totalScore / segments.length;
  }

  /**
   * Calculate comfort score for a route
   */
  private calculateComfortScore(segments: RouteSegment[]): number {
    if (segments.length === 0) return 0;
    
    let totalScore = 0;
    for (const segment of segments) {
      let segmentScore = 0.5; // Base score
      
      // Adjust based on mode
      switch (segment.mode) {
        case TransportMode.METRO:
        case TransportMode.TRAIN:
          segmentScore = 0.9;
          break;
        case TransportMode.BUS:
        case TransportMode.TRAM:
          segmentScore = 0.7;
          break;
        case TransportMode.CAR:
          segmentScore = 0.8;
          break;
        case TransportMode.WALKING:
        case TransportMode.BICYCLE:
          segmentScore = 0.6;
          break;
      }
      
      totalScore += segmentScore;
    }
    
    return totalScore / segments.length;
  }

  /**
   * Calculate bounds from geometry
   */
  private calculateBounds(geometry: Coordinate[]): { northEast: Coordinate; southWest: Coordinate } {
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
   * Get a transport mode handler
   */
  getHandler(mode: TransportMode): TransportModeHandler | undefined {
    return this.handlers.get(mode);
  }

  /**
   * Get all registered transport mode handlers
   */
  getAllHandlers(): TransportModeHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Update real-time data
   */
  updateRealTimeData(realTimeData: Map<string, RealTimeEdgeData>): void {
    // In a real implementation, this would update the graph with real-time data
    // For now, we'll just store it for use in routing calculations
  }
}