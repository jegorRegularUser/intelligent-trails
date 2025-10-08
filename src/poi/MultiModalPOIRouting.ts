/**
 * Multi-Modal POI Routing implementation
 * Extends the existing routing system to handle POI constraints and preferences across multiple transport modes
 */

import {
  PointOfInterest,
  POIRoutingRequest,
  POIRoutingResult,
  POICategory,
  POITimeWindow,
  POIAccessibility,
  POITransportConstraints
} from '../types/poi';
import { Coordinate, TransportMode, AccessibilityInfo, GraphNode, GraphEdge } from '../types/graph';
import { MultiModalGraphImpl } from '../graph/MultiModalGraph';
import { MultiModalRoute, RouteSegment, RouteConstraints, UserPreferences } from '../types/routing';
import { POIService } from './POIService';
import { POIRoutingPlanner } from './POIRoutingPlanner';
import { MultiModalDijkstra } from '../algorithms/Dijkstra';
import { MultiModalAStar } from '../algorithms/AStar';
import { BidirectionalSearch } from '../algorithms/BidirectionalSearch';
import { MultiCriteriaOptimizer, OptimizationCriteria } from '../algorithms/MultiCriteriaOptimizer';

/**
 * Multi-modal route segment with POI information
 */
interface MultiModalPOIRouteSegment {
  from: Coordinate;
  to: Coordinate;
  fromPOI?: PointOfInterest;
  toPOI?: PointOfInterest;
  mode: TransportMode;
  distance: number; // in meters
  duration: number; // in seconds
  cost: number;
  instructions: string[];
  accessibility: AccessibilityInfo;
  geometry: Coordinate[];
  edges: GraphEdge[]; // Actual graph edges used
}

/**
 * Multi-modal POI route with detailed transport information
 */
interface MultiModalPOIRoute {
  id: string;
  geometry: Coordinate[];
  distance: number; // in meters
  duration: number; // in seconds
  cost: number;
  pois: {
    poi: PointOfInterest;
    order: number;
    arrivalTime?: Date;
    departureTime?: Date;
    visitDuration: number; // in seconds
    distanceFromPrevious: number; // in meters
    timeFromPrevious: number; // in seconds
    accessMode: TransportMode; // Mode used to reach this POI
    departureMode: TransportMode; // Mode used to leave this POI
  }[];
  segments: MultiModalPOIRouteSegment[];
  transfers: {
    from: TransportMode;
    to: TransportMode;
    at: Coordinate;
    duration: number; // in seconds
    cost: number;
    instructions: string[];
  }[];
  statistics: {
    totalDistance: number;
    totalDuration: number;
    totalCost: number;
    totalPOIs: number;
    requiredPOIsVisited: number;
    optionalPOIsVisited: number;
    averageRating?: number;
    accessibilityScore: number;
    modeDistribution: Map<TransportMode, number>; // Distance per mode
    transferCount: number;
  };
}

/**
 * Multi-modal routing options with POI constraints
 */
interface MultiModalPOIRoutingOptions {
  optimizeFor: 'time' | 'distance' | 'cost' | 'scenic' | 'accessibility' | 'balanced';
  maxDetourDistance?: number; // in meters
  maxDetourTime?: number; // in seconds
  maxDetourCost?: number;
  requiredPOIs: string[]; // POI IDs
  avoidPOIs: string[]; // POI IDs
  preferredModes: TransportMode[];
  avoidedModes: TransportMode[];
  accessibility?: AccessibilityInfo;
  departureTime?: Date;
  arrivalTime?: Date;
  maxWalkingDistance?: number; // in meters
  maxTransfers?: number;
  allowModeSwitching: boolean;
  considerRealTimeData: boolean;
}

/**
 * Multi-Modal POI Routing implementation
 */
export class MultiModalPOIRouting {
  private graph: MultiModalGraphImpl;
  private poiService: POIService;
  private routingPlanner: POIRoutingPlanner;
  private dijkstra: MultiModalDijkstra;
  private aStar: MultiModalAStar;
  private bidirectionalSearch: BidirectionalSearch;
  private multiCriteriaOptimizer: MultiCriteriaOptimizer;

  constructor(
    graph: MultiModalGraphImpl,
    poiService: POIService,
    preferences: UserPreferences,
    constraints: RouteConstraints
  ) {
    this.graph = graph;
    this.poiService = poiService;
    this.routingPlanner = new POIRoutingPlanner(poiService);
    this.dijkstra = new MultiModalDijkstra(graph, preferences, constraints);
    this.aStar = new MultiModalAStar(graph, preferences, constraints);
    this.bidirectionalSearch = new BidirectionalSearch(graph, preferences, constraints);
    this.multiCriteriaOptimizer = new MultiCriteriaOptimizer(graph, preferences, constraints);
  }

  /**
   * Plan a multi-modal route that includes specified POIs
   */
  async planMultiModalRouteWithPOIs(request: POIRoutingRequest): Promise<POIRoutingResult> {
    const startTime = performance.now();

    // Extract and validate POIs
    const validPOIs = this.extractAndValidatePOIs(request.pois);
    if (validPOIs.length === 0) {
      throw new Error('No valid POIs provided');
    }

    // Create multi-modal routing options
    const routingOptions: MultiModalPOIRoutingOptions = {
      optimizeFor: this.mapOptimizeFor(request.preferences.optimizeFor),
      maxDetourDistance: request.preferences.maxDetourDistance,
      maxDetourTime: request.preferences.maxDetourTime,
      maxDetourCost: request.preferences.maxDetourTime ? request.preferences.maxDetourTime / 60 : undefined, // Convert to cost units
      requiredPOIs: request.preferences.requiredPOIs || [],
      avoidPOIs: request.preferences.avoidPOIs || [],
      preferredModes: request.preferences.transportModes || [
        TransportMode.WALKING,
        TransportMode.BICYCLE,
        TransportMode.METRO,
        TransportMode.BUS,
        TransportMode.TRAM,
        TransportMode.TRAIN
      ],
      avoidedModes: [],
      accessibility: request.preferences.accessibility,
      departureTime: request.constraints?.departureTime,
      arrivalTime: request.constraints?.arrivalTime,
      maxWalkingDistance: 1000, // 1km default
      maxTransfers: 5,
      allowModeSwitching: true,
      considerRealTimeData: false
    };

    // Determine optimal POI sequence considering multi-modal constraints
    const poiSequence = await this.determineOptimalPOISequenceMultiModal(
      request.origin,
      request.destination,
      validPOIs,
      routingOptions
    );

    // Calculate multi-modal route segments
    const routeSegments = await this.calculateMultiModalRouteSegments(
      request.origin,
      request.destination,
      poiSequence,
      routingOptions
    );

    // Generate visit plans with timing and mode information
    const visitPlans = this.generateMultiModalVisitPlans(
      poiSequence,
      routeSegments,
      routingOptions.departureTime,
      routingOptions.arrivalTime
    );

    // Calculate route statistics
    const statistics = this.calculateMultiModalRouteStatistics(
      visitPlans,
      routeSegments,
      routingOptions
    );

    // Generate alternatives if requested
    const alternatives = await this.generateMultiModalAlternativeRoutes(
      request.origin,
      request.destination,
      validPOIs,
      routingOptions,
      request.constraints
    );

    // Create route geometry
    const geometry = this.generateMultiModalRouteGeometry(request.origin, request.destination, routeSegments);

    const endTime = performance.now();

    return {
      route: {
        id: `route-${Date.now()}`,
        geometry,
        distance: statistics.totalDistance,
        duration: statistics.totalDuration,
        pois: visitPlans.map(plan => ({
          poi: plan.poi,
          order: plan.order,
          arrivalTime: plan.arrivalTime,
          departureTime: plan.departureTime,
          visitDuration: plan.visitDuration,
          distanceFromPrevious: plan.distanceFromPrevious,
          timeFromPrevious: plan.timeFromPrevious
        })),
        segments: routeSegments.map(segment => ({
          from: segment.from,
          to: segment.to,
          mode: segment.mode,
          distance: segment.distance,
          duration: segment.duration,
          instructions: segment.instructions
        }))
      },
      alternatives: alternatives.map(alt => ({
        id: alt.id,
        geometry: alt.geometry,
        distance: alt.statistics.totalDistance,
        duration: alt.statistics.totalDuration,
        pois: alt.pois.map(plan => ({
          poi: plan.poi,
          order: plan.order,
          arrivalTime: plan.arrivalTime,
          departureTime: plan.departureTime,
          visitDuration: plan.visitDuration,
          distanceFromPrevious: plan.distanceFromPrevious,
          timeFromPrevious: plan.timeFromPrevious
        })),
        segments: alt.segments.map(segment => ({
          from: segment.from,
          to: segment.to,
          mode: segment.mode,
          distance: segment.distance,
          duration: segment.duration,
          instructions: segment.instructions
        }))
      })),
      statistics: {
        totalDistance: statistics.totalDistance,
        totalDuration: statistics.totalDuration,
        totalPOIs: statistics.totalPOIs,
        requiredPOIsVisited: statistics.requiredPOIsVisited,
        optionalPOIsVisited: statistics.optionalPOIsVisited,
        averageRating: statistics.averageRating,
        accessibilityScore: statistics.accessibilityScore
      },
      calculationTime: endTime - startTime
    };
  }

  /**
   * Map optimization criteria from POI routing to multi-modal routing
   */
  private mapOptimizeFor(optimizeFor: string): MultiModalPOIRoutingOptions['optimizeFor'] {
    switch (optimizeFor) {
      case 'time':
        return 'time';
      case 'distance':
        return 'distance';
      case 'scenic':
        return 'scenic';
      case 'balanced':
        return 'balanced';
      default:
        return 'balanced';
    }
  }

  /**
   * Extract and validate POIs from the request
   */
  private extractAndValidatePOIs(pois: PointOfInterest[]): PointOfInterest[] {
    return pois.filter(poi => {
      // Check if POI has valid coordinates
      if (!poi.coordinate || 
          isNaN(poi.coordinate.latitude) || 
          isNaN(poi.coordinate.longitude)) {
        return false;
      }

      // Check if POI is accessible if required
      // This would be expanded based on specific requirements

      return true;
    });
  }

  /**
   * Determine optimal POI sequence considering multi-modal constraints
   */
  private async determineOptimalPOISequenceMultiModal(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: MultiModalPOIRoutingOptions
  ): Promise<PointOfInterest[]> {
    // Separate required and optional POIs
    const requiredPOIs = pois.filter(poi => options.requiredPOIs.includes(poi.id));
    const optionalPOIs = pois.filter(poi => !options.requiredPOIs.includes(poi.id) && 
                                         !options.avoidPOIs.includes(poi.id));

    // Start with required POIs
    let sequence: PointOfInterest[] = [...requiredPOIs];

    // Add optional POIs based on optimization criteria and multi-modal accessibility
    if (optionalPOIs.length > 0) {
      const selectedOptionalPOIs = await this.selectOptionalPOIsMultiModal(
        origin,
        destination,
        sequence,
        optionalPOIs,
        options
      );
      
      // Insert optional POIs at optimal positions
      sequence = await this.insertOptionalPOIsMultiModal(
        origin,
        destination,
        sequence,
        selectedOptionalPOIs,
        options
      );
    }

    // Optimize the order of the sequence considering multi-modal travel
    sequence = await this.optimizePOIOrderMultiModal(
      origin,
      destination,
      sequence,
      options
    );

    return sequence;
  }

  /**
   * Select optional POIs to include in the route considering multi-modal constraints
   */
  private async selectOptionalPOIsMultiModal(
    origin: Coordinate,
    destination: Coordinate,
    requiredPOIs: PointOfInterest[],
    optionalPOIs: PointOfInterest[],
    options: MultiModalPOIRoutingOptions
  ): Promise<PointOfInterest[]> {
    // Score each optional POI based on various factors including multi-modal accessibility
    const scoredPOIs = await Promise.all(
      optionalPOIs.map(async poi => {
        let score = 0;

        // Base score from priority
        if (poi.visitPriority) {
          score += poi.visitPriority.priority * 10;
        }

        // Rating score
        if (poi.rating) {
          score += poi.rating.average * 5;
        }

        // Popularity score
        score += poi.metadata.popularity * 10;

        // Multi-modal accessibility score
        const accessibilityScore = await this.calculateMultiModalAccessibilityScore(
          poi.coordinate,
          options
        );
        score += accessibilityScore * 15;

        // Distance from route score (closer is better)
        const routeDistance = this.calculateDistanceFromRoute(
          poi.coordinate,
          origin,
          destination,
          requiredPOIs
        );
        
        const maxDetour = options.maxDetourDistance || 2000; // 2km default
        const distanceScore = (1 - Math.min(routeDistance / maxDetour, 1)) * 20;
        score += distanceScore;

        // Category preference score
        if (this.isPreferredCategory(poi.category, options)) {
          score += 15;
        }

        // Transport mode compatibility score
        const modeCompatibilityScore = this.calculateModeCompatibilityScore(poi, options);
        score += modeCompatibilityScore * 10;

        return { poi, score };
      })
    );

    // Sort by score and select top POIs
    scoredPOIs.sort((a, b) => b.score - a.score);
    
    // Limit number of optional POIs based on constraints
    const maxOptionalPOIs = options.maxDetourTime ? 
      Math.floor(options.maxDetourTime / 1800) : 5; // 30 min per POI default
    
    return scoredPOIs.slice(0, maxOptionalPOIs).map(item => item.poi);
  }

  /**
   * Calculate multi-modal accessibility score for a POI
   */
  private async calculateMultiModalAccessibilityScore(
    poiCoordinate: Coordinate,
    options: MultiModalPOIRoutingOptions
  ): Promise<number> {
    // Find nearest nodes to the POI for each preferred transport mode
    let totalScore = 0;
    let modeCount = 0;

    for (const mode of options.preferredModes) {
      // Find nodes that support this mode near the POI
      const nearbyNodes = this.graph.findNearbyNodes(poiCoordinate, 500); // 500m radius
      const modeNodes = nearbyNodes.filter(node => node.modes.includes(mode));
      
      if (modeNodes.length > 0) {
        // Calculate average distance to mode nodes
        const avgDistance = modeNodes.reduce((sum, node) => {
          return sum + this.calculateDistance(poiCoordinate, node.coordinate);
        }, 0) / modeNodes.length;
        
        // Score based on distance (closer is better)
        const modeScore = Math.max(0, 1 - avgDistance / 500);
        totalScore += modeScore;
        modeCount++;
      }
    }

    return modeCount > 0 ? totalScore / modeCount : 0;
  }

  /**
   * Calculate transport mode compatibility score for a POI
   */
  private calculateModeCompatibilityScore(
    poi: PointOfInterest,
    options: MultiModalPOIRoutingOptions
  ): number {
    if (!poi.transportConstraints) {
      return 0.5; // Neutral score if no constraints specified
    }

    let score = 0;
    let maxScore = 0;

    // Check preferred modes
    for (const mode of options.preferredModes) {
      maxScore += 1;
      
      if (poi.transportConstraints.preferredModes?.includes(mode)) {
        score += 1;
      } else if (!poi.transportConstraints.avoidedModes?.includes(mode)) {
        score += 0.5; // Partial score if not explicitly avoided
      }
    }

    // Check avoided modes
    for (const mode of options.avoidedModes) {
      maxScore += 1;
      
      if (poi.transportConstraints.avoidedModes?.includes(mode)) {
        score -= 0.5; // Penalty for avoided modes
      } else if (!poi.transportConstraints.preferredModes?.includes(mode)) {
        score += 0.5; // Partial score if not explicitly preferred
      }
    }

    return maxScore > 0 ? score / maxScore : 0.5;
  }

  /**
   * Insert optional POIs at optimal positions in the sequence considering multi-modal travel
   */
  private async insertOptionalPOIsMultiModal(
    origin: Coordinate,
    destination: Coordinate,
    requiredPOIs: PointOfInterest[],
    optionalPOIs: PointOfInterest[],
    options: MultiModalPOIRoutingOptions
  ): Promise<PointOfInterest[]> {
    let sequence = [...requiredPOIs];
    
    for (const poi of optionalPOIs) {
      // Find the best position to insert this POI considering multi-modal travel
      let bestPosition = 0;
      let minAdditionalCost = Infinity;
      
      for (let i = 0; i <= sequence.length; i++) {
        // Calculate additional cost if POI is inserted at position i
        const additionalCost = await this.calculateInsertionCostMultiModal(
          poi,
          sequence,
          i,
          origin,
          destination,
          options
        );
        
        if (additionalCost < minAdditionalCost) {
          minAdditionalCost = additionalCost;
          bestPosition = i;
        }
      }
      
      // Insert POI at best position if it doesn't exceed max detour
      const maxDetourCost = options.maxDetourCost || 1800; // 30 minutes default
      if (minAdditionalCost <= maxDetourCost) {
        sequence.splice(bestPosition, 0, poi);
      }
    }
    
    return sequence;
  }

  /**
   * Calculate the cost of inserting a POI at a specific position considering multi-modal travel
   */
  private async calculateInsertionCostMultiModal(
    poi: PointOfInterest,
    sequence: PointOfInterest[],
    position: number,
    origin: Coordinate,
    destination: Coordinate,
    options: MultiModalPOIRoutingOptions
  ): Promise<number> {
    // Get coordinates for route segments
    const routePoints = [origin, ...sequence.map(p => p.coordinate), destination];
    
    let additionalCost = 0;
    
    if (position === 0) {
      // Insert at beginning
      additionalCost = await this.calculateMultiModalRouteCost(
        origin,
        poi.coordinate,
        options
      );
    } else if (position === sequence.length) {
      // Insert at end
      additionalCost = await this.calculateMultiModalRouteCost(
        routePoints[routePoints.length - 2],
        poi.coordinate,
        options
      );
    } else {
      // Insert between two POIs
      const before = routePoints[position];
      const after = routePoints[position + 1];
      
      const directCost = await this.calculateMultiModalRouteCost(before, after, options);
      const detourCost = await this.calculateMultiModalRouteCost(before, poi.coordinate, options) +
                        await this.calculateMultiModalRouteCost(poi.coordinate, after, options);
      
      additionalCost = detourCost - directCost;
    }
    
    return additionalCost;
  }

  /**
   * Calculate multi-modal route cost between two coordinates
   */
  private async calculateMultiModalRouteCost(
    from: Coordinate,
    to: Coordinate,
    options: MultiModalPOIRoutingOptions
  ): Promise<number> {
    // Find nearest nodes to the coordinates
    const fromNodes = this.graph.findNearbyNodes(from, 200); // 200m radius
    const toNodes = this.graph.findNearbyNodes(to, 200); // 200m radius
    
    if (fromNodes.length === 0 || toNodes.length === 0) {
      // Fallback to direct distance calculation
      const distance = this.calculateDistance(from, to);
      return distance / 1.4; // Assume walking speed
    }
    
    // Try to find a route using the preferred transport modes
    let minCost = Infinity;
    
    for (const fromNode of fromNodes) {
      for (const toNode of toNodes) {
        for (const mode of options.preferredModes) {
          // Check if both nodes support this mode
          if (fromNode.modes.includes(mode) && toNode.modes.includes(mode)) {
            // Use Dijkstra's algorithm to find the shortest path
            const result = this.dijkstra.findShortestPath(fromNode.id, toNode.id);
            
            if (result.success) {
              const route = this.dijkstra.convertToRoute(result, fromNode.id, toNode.id);
              if (route) {
                let cost = 0;
                
                // Calculate cost based on optimization criteria
                switch (options.optimizeFor) {
                  case 'time':
                    cost = route.totalDuration;
                    break;
                  case 'distance':
                    cost = route.totalDistance;
                    break;
                  case 'cost':
                    cost = route.totalCost;
                    break;
                  case 'scenic':
                    // For scenic routes, we want to maximize scenic value while minimizing time
                    cost = route.totalDuration / 2; // Simplified scenic calculation
                    break;
                  case 'accessibility':
                    cost = route.totalDuration * (1 - route.accessibilityScore);
                    break;
                  case 'balanced':
                    // Balanced approach considering time, distance, and cost
                    cost = (route.totalDuration * 0.5) + 
                           (route.totalDistance * 0.3) + 
                           (route.totalCost * 0.2);
                    break;
                }
                
                minCost = Math.min(minCost, cost);
              }
            }
          }
        }
      }
    }
    
    // If no route found, use direct distance with walking speed
    if (minCost === Infinity) {
      const distance = this.calculateDistance(from, to);
      minCost = distance / 1.4; // Assume walking speed
    }
    
    return minCost;
  }

  /**
   * Optimize the order of POIs in the sequence considering multi-modal travel
   */
  private async optimizePOIOrderMultiModal(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: MultiModalPOIRoutingOptions
  ): Promise<PointOfInterest[]> {
    // For small numbers of POIs, use exact algorithm (e.g., brute force)
    // For larger numbers, use heuristic algorithm (e.g., 2-opt)
    
    if (pois.length <= 5) {
      return this.optimizeOrderBruteForceMultiModal(origin, destination, pois, options);
    } else {
      return this.optimizeOrder2OptMultiModal(origin, destination, pois, options);
    }
  }

  /**
   * Optimize POI order using brute force considering multi-modal travel (exact for small n)
   */
  private async optimizeOrderBruteForceMultiModal(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: MultiModalPOIRoutingOptions
  ): Promise<PointOfInterest[]> {
    // Generate all permutations
    const permutations = this.generatePermutations(pois);
    
    // Find the permutation with minimum cost
    let bestOrder = pois;
    let minCost = Infinity;
    
    for (const order of permutations) {
      const cost = await this.calculateMultiModalRouteCostWithPOIs(
        origin,
        destination,
        order,
        options
      );
      if (cost < minCost) {
        minCost = cost;
        bestOrder = order;
      }
    }
    
    return bestOrder;
  }

  /**
   * Calculate the cost of a multi-modal route with a specific POI order
   */
  private async calculateMultiModalRouteCostWithPOIs(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: MultiModalPOIRoutingOptions
  ): Promise<number> {
    let totalCost = 0;
    
    // Add cost from origin to first POI
    totalCost += await this.calculateMultiModalRouteCost(
      origin,
      pois[0].coordinate,
      options
    );
    
    // Add costs between POIs
    for (let i = 0; i < pois.length - 1; i++) {
      totalCost += await this.calculateMultiModalRouteCost(
        pois[i].coordinate,
        pois[i + 1].coordinate,
        options
      );
    }
    
    // Add cost from last POI to destination
    totalCost += await this.calculateMultiModalRouteCost(
      pois[pois.length - 1].coordinate,
      destination,
      options
    );
    
    // Add visit times for POIs
    for (const poi of pois) {
      const visitDuration = poi.timeWindow?.preferredDuration || 1800; // 30 minutes default
      totalCost += visitDuration;
    }
    
    return totalCost;
  }

  /**
   * Generate all permutations of an array
   */
  private generatePermutations<T>(arr: T[]): T[][] {
    if (arr.length <= 1) return [arr];
    
    const result: T[][] = [];
    
    for (let i = 0; i < arr.length; i++) {
      const current = arr[i];
      const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
      const remainingPermutations = this.generatePermutations(remaining);
      
      for (const perm of remainingPermutations) {
        result.push([current, ...perm]);
      }
    }
    
    return result;
  }

  /**
   * Optimize POI order using 2-opt heuristic considering multi-modal travel (for larger n)
   */
  private async optimizeOrder2OptMultiModal(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: MultiModalPOIRoutingOptions
  ): Promise<PointOfInterest[]> {
    let bestOrder = [...pois];
    let improved = true;
    
    while (improved) {
      improved = false;
      let bestCost = await this.calculateMultiModalRouteCostWithPOIs(
        origin,
        destination,
        bestOrder,
        options
      );
      
      // Try all possible 2-opt swaps
      for (let i = 0; i < bestOrder.length - 1; i++) {
        for (let j = i + 1; j < bestOrder.length; j++) {
          // Create new order by reversing segment between i and j
          const newOrder = [
            ...bestOrder.slice(0, i),
            ...bestOrder.slice(i, j + 1).reverse(),
            ...bestOrder.slice(j + 1)
          ];
          
          const newCost = await this.calculateMultiModalRouteCostWithPOIs(
            origin,
            destination,
            newOrder,
            options
          );
          
          if (newCost < bestCost) {
            bestOrder = newOrder;
            bestCost = newCost;
            improved = true;
            break;
          }
        }
        
        if (improved) break;
      }
    }
    
    return bestOrder;
  }

  /**
   * Calculate multi-modal route segments between POIs
   */
  private async calculateMultiModalRouteSegments(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: MultiModalPOIRoutingOptions
  ): Promise<MultiModalPOIRouteSegment[]> {
    const segments: MultiModalPOIRouteSegment[] = [];
    
    // Segment from origin to first POI
    const originToFirstPOI = await this.calculateMultiModalSegment(
      origin,
      pois[0].coordinate,
      undefined,
      pois[0],
      options
    );
    segments.push(originToFirstPOI);
    
    // Segments between POIs
    for (let i = 0; i < pois.length - 1; i++) {
      const segment = await this.calculateMultiModalSegment(
        pois[i].coordinate,
        pois[i + 1].coordinate,
        pois[i],
        pois[i + 1],
        options
      );
      segments.push(segment);
    }
    
    // Segment from last POI to destination
    const lastPOIToDestination = await this.calculateMultiModalSegment(
      pois[pois.length - 1].coordinate,
      destination,
      pois[pois.length - 1],
      undefined,
      options
    );
    segments.push(lastPOIToDestination);
    
    return segments;
  }

  /**
   * Calculate a multi-modal route segment between two coordinates
   */
  private async calculateMultiModalSegment(
    from: Coordinate,
    to: Coordinate,
    fromPOI: PointOfInterest | undefined,
    toPOI: PointOfInterest | undefined,
    options: MultiModalPOIRoutingOptions
  ): Promise<MultiModalPOIRouteSegment> {
    // Find nearest nodes to the coordinates
    const fromNodes = this.graph.findNearbyNodes(from, 200); // 200m radius
    const toNodes = this.graph.findNearbyNodes(to, 200); // 200m radius
    
    // Try to find a route using the preferred transport modes
    let bestSegment: MultiModalPOIRouteSegment | null = null;
    let minCost = Infinity;
    
    for (const fromNode of fromNodes) {
      for (const toNode of toNodes) {
        for (const mode of options.preferredModes) {
          // Check if both nodes support this mode
          if (fromNode.modes.includes(mode) && toNode.modes.includes(mode)) {
            // Use Dijkstra's algorithm to find the shortest path
            const result = this.dijkstra.findShortestPath(fromNode.id, toNode.id);
            
            if (result.success) {
              const route = this.dijkstra.convertToRoute(result, fromNode.id, toNode.id);
              if (route) {
                let cost = 0;
                
                // Calculate cost based on optimization criteria
                switch (options.optimizeFor) {
                  case 'time':
                    cost = route.totalDuration;
                    break;
                  case 'distance':
                    cost = route.totalDistance;
                    break;
                  case 'cost':
                    cost = route.totalCost;
                    break;
                  case 'scenic':
                    // For scenic routes, we want to maximize scenic value while minimizing time
                    cost = route.totalDuration / 2; // Simplified scenic calculation
                    break;
                  case 'accessibility':
                    cost = route.totalDuration * (1 - route.accessibilityScore);
                    break;
                  case 'balanced':
                    // Balanced approach considering time, distance, and cost
                    cost = (route.totalDuration * 0.5) + 
                           (route.totalDistance * 0.3) + 
                           (route.totalCost * 0.2);
                    break;
                }
                
                if (cost < minCost) {
                  minCost = cost;
                  
                  // Extract edges from the route
                  const edges: GraphEdge[] = [];
                  for (const segment of route.segments) {
                    const edgeId = `${segment.from}-${segment.to}-${segment.mode}`;
                    const edge = this.graph.getEdge(edgeId);
                    if (edge) {
                      edges.push(edge);
                    }
                  }
                  
                  bestSegment = {
                    from,
                    to,
                    fromPOI,
                    toPOI,
                    mode,
                    distance: route.totalDistance,
                    duration: route.totalDuration,
                    cost: route.totalCost,
                    instructions: this.generateInstructionsFromRoute(route),
                    accessibility: this.getAccessibilityInfo(options),
                    geometry: route.geometry,
                    edges
                  };
                }
              }
            }
          }
        }
      }
    }
    
    // If no route found, create a direct walking segment
    if (!bestSegment) {
      const distance = this.calculateDistance(from, to);
      const duration = distance / 1.4; // Walking speed
      
      bestSegment = {
        from,
        to,
        fromPOI,
        toPOI,
        mode: TransportMode.WALKING,
        distance,
        duration,
        cost: 0,
        instructions: this.generateDirectInstructions(from, to, TransportMode.WALKING),
        accessibility: this.getAccessibilityInfo(options),
        geometry: [from, to],
        edges: []
      };
    }
    
    return bestSegment;
  }

  /**
   * Generate instructions from a multi-modal route
   */
  private generateInstructionsFromRoute(route: MultiModalRoute): string[] {
    const instructions: string[] = [];
    
    for (const segment of route.segments) {
      for (const instruction of segment.instructions) {
        instructions.push(instruction.text);
      }
    }
    
    return instructions;
  }

  /**
   * Generate direct instructions between two coordinates
   */
  private generateDirectInstructions(
    from: Coordinate,
    to: Coordinate,
    mode: TransportMode
  ): string[] {
    const distance = this.calculateDistance(from, to);
    const duration = distance / 1.4; // Walking speed
    
    return [
      `Depart by ${mode}`,
      `Continue for ${Math.round(distance)} meters (${Math.round(duration / 60)} minutes)`,
      `Arrive at destination`
    ];
  }

  /**
   * Get accessibility information for route segments
   */
  private getAccessibilityInfo(options: MultiModalPOIRoutingOptions): AccessibilityInfo {
    if (options.accessibility) {
      return options.accessibility;
    }
    
    return {
      wheelchairAccessible: false,
      visuallyImpairedFriendly: false,
      hasElevator: false,
      hasRamp: false,
      audioSignals: false,
      tactilePaving: false
    };
  }

  /**
   * Generate multi-modal visit plans with timing and mode information
   */
  private generateMultiModalVisitPlans(
    pois: PointOfInterest[],
    segments: MultiModalPOIRouteSegment[],
    departureTime?: Date,
    arrivalTime?: Date
  ) {
    const visitPlans = [];
    
    // Calculate arrival and departure times for each POI
    let currentTime = departureTime || new Date();
    
    for (let i = 0; i < pois.length; i++) {
      const poi = pois[i];
      const segment = segments[i]; // Segment to this POI
      
      // Calculate arrival time
      const arrivalTime = new Date(currentTime.getTime() + segment.duration * 1000);
      
      // Determine visit duration
      let visitDuration = poi.timeWindow?.preferredDuration || 1800; // 30 minutes default
      
      // Apply time window constraints
      if (poi.timeWindow) {
        if (poi.timeWindow.minDuration) {
          visitDuration = Math.max(visitDuration, poi.timeWindow.minDuration);
        }
        
        if (poi.timeWindow.maxDuration) {
          visitDuration = Math.min(visitDuration, poi.timeWindow.maxDuration);
        }
      }
      
      // Calculate departure time
      const departureTime = new Date(arrivalTime.getTime() + visitDuration * 1000);
      
      // Calculate distance and time from previous POI
      let distanceFromPrevious = 0;
      let timeFromPrevious = 0;
      
      if (i > 0) {
        distanceFromPrevious = segment.distance;
        timeFromPrevious = segment.duration;
      }
      
      // Determine access and departure modes
      const accessMode = segments[i].mode;
      const departureMode = i < segments.length - 1 ? segments[i + 1].mode : accessMode;
      
      visitPlans.push({
        poi,
        order: i + 1,
        arrivalTime,
        departureTime,
        visitDuration,
        distanceFromPrevious,
        timeFromPrevious,
        accessMode,
        departureMode
      });
      
      // Update current time for next POI
      currentTime = departureTime;
    }
    
    return visitPlans;
  }

  /**
   * Calculate multi-modal route statistics
   */
  private calculateMultiModalRouteStatistics(
    visitPlans: any[],
    segments: MultiModalPOIRouteSegment[],
    options: MultiModalPOIRoutingOptions
  ) {
    // Calculate total distance, duration, and cost
    const totalDistance = segments.reduce((sum, segment) => sum + segment.distance, 0);
    const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0) +
                         visitPlans.reduce((sum, plan) => sum + plan.visitDuration, 0);
    const totalCost = segments.reduce((sum, segment) => sum + segment.cost, 0);
    
    // Count POIs
    const totalPOIs = visitPlans.length;
    const requiredPOIsVisited = visitPlans.filter(plan => 
      options.requiredPOIs.includes(plan.poi.id)
    ).length;
    const optionalPOIsVisited = totalPOIs - requiredPOIsVisited;
    
    // Calculate average rating
    const ratings = visitPlans
      .filter(plan => plan.poi.rating)
      .map(plan => plan.poi.rating!.average);
    const averageRating = ratings.length > 0 ? 
      ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 
      undefined;
    
    // Calculate accessibility score
    const accessibilityScore = this.calculateAccessibilityScore(visitPlans, segments);
    
    // Calculate mode distribution
    const modeDistribution = new Map<TransportMode, number>();
    for (const segment of segments) {
      const current = modeDistribution.get(segment.mode) || 0;
      modeDistribution.set(segment.mode, current + segment.distance);
    }
    
    // Calculate transfer count
    let transferCount = 0;
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].mode !== segments[i - 1].mode) {
        transferCount++;
      }
    }
    
    return {
      totalDistance,
      totalDuration,
      totalCost,
      totalPOIs,
      requiredPOIsVisited,
      optionalPOIsVisited,
      averageRating,
      accessibilityScore,
      modeDistribution,
      transferCount
    };
  }

  /**
   * Calculate accessibility score for the route
   */
  private calculateAccessibilityScore(
    visitPlans: any[],
    segments: MultiModalPOIRouteSegment[]
  ): number {
    if (visitPlans.length === 0) return 0;
    
    let totalScore = 0;
    let scoreCount = 0;
    
    // Score POI accessibility
    for (const plan of visitPlans) {
      const accessibility = plan.poi.accessibility;
      let poiScore = 0;
      
      if (accessibility.wheelchairAccessible) poiScore += 0.25;
      if (accessibility.visuallyImpairedFriendly) poiScore += 0.25;
      if (accessibility.hasElevator) poiScore += 0.25;
      if (accessibility.hasRamp) poiScore += 0.25;
      
      totalScore += poiScore;
      scoreCount++;
    }
    
    // Score segment accessibility
    for (const segment of segments) {
      const accessibility = segment.accessibility;
      let segmentScore = 0;
      
      if (accessibility.wheelchairAccessible) segmentScore += 0.25;
      if (accessibility.visuallyImpairedFriendly) segmentScore += 0.25;
      if (accessibility.hasElevator) segmentScore += 0.25;
      if (accessibility.hasRamp) segmentScore += 0.25;
      
      totalScore += segmentScore;
      scoreCount++;
    }
    
    return scoreCount > 0 ? totalScore / scoreCount : 0;
  }

  /**
   * Generate alternative multi-modal routes
   */
  private async generateMultiModalAlternativeRoutes(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: MultiModalPOIRoutingOptions,
    constraints?: any
  ): Promise<MultiModalPOIRoute[]> {
    // Generate alternatives by varying optimization criteria
    const alternatives: MultiModalPOIRoute[] = [];
    
    // Try different optimization criteria
    const optimizationOptions = ['time', 'distance', 'cost', 'scenic', 'accessibility', 'balanced'];
    
    for (const optimizeFor of optimizationOptions) {
      if (optimizeFor === options.optimizeFor) continue; // Skip primary option
      
      try {
        const altOptions = { ...options, optimizeFor: optimizeFor as any };
        const altSequence = await this.determineOptimalPOISequenceMultiModal(
          origin,
          destination,
          pois,
          altOptions
        );
        
        const altSegments = await this.calculateMultiModalRouteSegments(
          origin,
          destination,
          altSequence,
          altOptions
        );
        
        const altVisitPlans = this.generateMultiModalVisitPlans(
          altSequence,
          altSegments,
          constraints?.departureTime,
          constraints?.arrivalTime
        );
        
        const altStatistics = this.calculateMultiModalRouteStatistics(
          altVisitPlans,
          altSegments,
          altOptions
        );
        
        const altGeometry = this.generateMultiModalRouteGeometry(origin, destination, altSegments);
        
        // Calculate transfers
        const transfers = this.calculateTransfers(altSegments);
        
        alternatives.push({
          id: `route-${Date.now()}-${Math.random()}`,
          geometry: altGeometry,
          distance: altStatistics.totalDistance,
          duration: altStatistics.totalDuration,
          cost: altStatistics.totalCost,
          pois: altVisitPlans,
          segments: altSegments,
          transfers,
          statistics: altStatistics
        });
      } catch (error) {
        // Skip alternatives that can't be generated
        console.warn(`Failed to generate alternative route with ${optimizeFor} optimization:`, error);
      }
    }
    
    return alternatives;
  }

  /**
   * Calculate transfers between segments
   */
  private calculateTransfers(segments: MultiModalPOIRouteSegment[]) {
    const transfers = [];
    
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].mode !== segments[i - 1].mode) {
        transfers.push({
          from: segments[i - 1].mode,
          to: segments[i].mode,
          at: segments[i].from,
          duration: 300, // 5 minutes default transfer time
          cost: 0,
          instructions: [
            `Transfer from ${segments[i - 1].mode} to ${segments[i].mode}`,
            `Walk to ${segments[i].mode} stop/station`
          ]
        });
      }
    }
    
    return transfers;
  }

  /**
   * Generate multi-modal route geometry from segments
   */
  private generateMultiModalRouteGeometry(
    origin: Coordinate,
    destination: Coordinate,
    segments: MultiModalPOIRouteSegment[]
  ): Coordinate[] {
    const geometry: Coordinate[] = [origin];
    
    for (const segment of segments) {
      // Add all geometry points except the first one to avoid duplicates
      for (let i = 1; i < segment.geometry.length; i++) {
        geometry.push(segment.geometry[i]);
      }
    }
    
    return geometry;
  }

  /**
   * Calculate distance from a POI to the route
   */
  private calculateDistanceFromRoute(
    poiCoordinate: Coordinate,
    origin: Coordinate,
    destination: Coordinate,
    routePOIs: PointOfInterest[]
  ): number {
    // Simple implementation: find minimum distance to any route segment
    const routePoints = [origin, ...routePOIs.map(p => p.coordinate), destination];
    
    let minDistance = Infinity;
    
    for (let i = 0; i < routePoints.length - 1; i++) {
      const distance = this.calculateDistanceToLineSegment(
        poiCoordinate,
        routePoints[i],
        routePoints[i + 1]
      );
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
  }

  /**
   * Calculate distance from a point to a line segment
   */
  private calculateDistanceToLineSegment(
    point: Coordinate,
    lineStart: Coordinate,
    lineEnd: Coordinate
  ): number {
    // Calculate the distance from point to line segment using vector projection
    const A = point.latitude - lineStart.latitude;
    const B = point.longitude - lineStart.longitude;
    const C = lineEnd.latitude - lineStart.latitude;
    const D = lineEnd.longitude - lineStart.longitude;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
      // Line segment is a point
      return this.calculateDistance(point, lineStart);
    }
    
    let param = dot / lenSq;
    
    // Clamp parameter to line segment
    param = Math.max(0, Math.min(1, param));
    
    const xx = lineStart.latitude + param * C;
    const yy = lineStart.longitude + param * D;
    
    const closestPoint = { latitude: xx, longitude: yy };
    
    return this.calculateDistance(point, closestPoint);
  }

  /**
   * Check if a POI category is preferred
   */
  private isPreferredCategory(category: POICategory, options: MultiModalPOIRoutingOptions): boolean {
    // This would be expanded based on user preferences
    // For now, we'll assume some categories are preferred for scenic routes
    if (options.optimizeFor === 'scenic') {
      return [
        POICategory.PARK,
        POICategory.MONUMENT,
        POICategory.LANDMARK,
        POICategory.VIEWPOINT,
        POICategory.NATURE,
        POICategory.BEACH
      ].includes(category);
    }
    
    return false;
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
   * Update user preferences for routing
   */
  updateUserPreferences(preferences: UserPreferences, constraints: RouteConstraints): void {
    this.dijkstra = new MultiModalDijkstra(this.graph, preferences, constraints);
    this.aStar = new MultiModalAStar(this.graph, preferences, constraints);
    this.bidirectionalSearch = new BidirectionalSearch(this.graph, preferences, constraints);
    this.multiCriteriaOptimizer = new MultiCriteriaOptimizer(this.graph, preferences, constraints);
  }
}