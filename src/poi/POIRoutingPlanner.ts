/**
 * POI-Based Route Planning implementation
 * Handles optimal POI sequencing and route optimization with POI constraints
 */

import {
  PointOfInterest,
  POIRoutingRequest,
  POIRoutingResult,
  POIVisitPriority,
  POITimeWindow,
  POICategory,
  POIRouteCustomization,
  POIRouteVisualization
} from '../types/poi';
import { Coordinate, TransportMode, AccessibilityInfo } from '../types/graph';
import { MultiModalRoute, RouteSegment, Waypoint } from '../types/routing';
import { POIService } from './POIService';

/**
 * POI visit plan with timing information
 */
interface POIVisitPlan {
  poi: PointOfInterest;
  order: number;
  arrivalTime?: Date;
  departureTime?: Date;
  visitDuration: number; // in seconds
  distanceFromPrevious: number; // in meters
  timeFromPrevious: number; // in seconds
}

/**
 * Route segment between POIs
 */
interface POIRouteSegment {
  from: Coordinate;
  to: Coordinate;
  fromPOI?: PointOfInterest;
  toPOI?: PointOfInterest;
  mode: TransportMode;
  distance: number; // in meters
  duration: number; // in seconds
  instructions: string[];
  accessibility: AccessibilityInfo;
}

/**
 * POI routing optimization options
 */
interface POIRoutingOptimization {
  optimizeFor: 'time' | 'distance' | 'scenic' | 'balanced';
  maxDetourDistance?: number; // in meters
  maxDetourTime?: number; // in seconds
  requiredPOIs: string[]; // POI IDs
  avoidPOIs: string[]; // POI IDs
  transportModes: TransportMode[];
  accessibility?: AccessibilityInfo;
}

/**
 * POI-Based Route Planning implementation
 */
export class POIRoutingPlanner {
  private poiService: POIService;

  constructor(poiService: POIService) {
    this.poiService = poiService;
  }

  /**
   * Plan a route that includes specified POIs
   */
  async planRouteWithPOIs(request: POIRoutingRequest): Promise<POIRoutingResult> {
    const startTime = performance.now();

    // Extract and validate POIs
    const validPOIs = this.extractAndValidatePOIs(request.pois);
    if (validPOIs.length === 0) {
      throw new Error('No valid POIs provided');
    }

    // Create optimization options
    const optimizationOptions: POIRoutingOptimization = {
      optimizeFor: request.preferences.optimizeFor,
      maxDetourDistance: request.preferences.maxDetourDistance,
      maxDetourTime: request.preferences.maxDetourTime,
      requiredPOIs: request.preferences.requiredPOIs || [],
      avoidPOIs: request.preferences.avoidPOIs || [],
      transportModes: request.preferences.transportModes || [],
      accessibility: request.preferences.accessibility
    };

    // Determine optimal POI sequence
    const poiSequence = await this.determineOptimalPOISequence(
      request.origin,
      request.destination,
      validPOIs,
      optimizationOptions
    );

    // Calculate route segments
    const routeSegments = await this.calculateRouteSegments(
      request.origin,
      request.destination,
      poiSequence,
      optimizationOptions
    );

    // Generate visit plans with timing
    const visitPlans = this.generateVisitPlans(
      poiSequence,
      routeSegments,
      request.constraints?.departureTime,
      request.constraints?.arrivalTime
    );

    // Calculate route statistics
    const statistics = this.calculateRouteStatistics(
      visitPlans,
      routeSegments,
      optimizationOptions
    );

    // Generate alternatives if requested
    const alternatives = await this.generateAlternativeRoutes(
      request.origin,
      request.destination,
      validPOIs,
      optimizationOptions,
      request.constraints
    );

    // Create route geometry
    const geometry = this.generateRouteGeometry(request.origin, request.destination, routeSegments);

    const endTime = performance.now();

    return {
      route: {
        id: `route-${Date.now()}`,
        geometry,
        distance: statistics.totalDistance,
        duration: statistics.totalDuration,
        pois: visitPlans,
        segments: routeSegments.map(segment => ({
          from: segment.from,
          to: segment.to,
          mode: segment.mode,
          distance: segment.distance,
          duration: segment.duration,
          instructions: segment.instructions
        }))
      },
      alternatives,
      statistics,
      calculationTime: endTime - startTime
    };
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
   * Determine optimal POI sequence using various algorithms
   */
  private async determineOptimalPOISequence(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: POIRoutingOptimization
  ): Promise<PointOfInterest[]> {
    // Separate required and optional POIs
    const requiredPOIs = pois.filter(poi => options.requiredPOIs.includes(poi.id));
    const optionalPOIs = pois.filter(poi => !options.requiredPOIs.includes(poi.id) && 
                                         !options.avoidPOIs.includes(poi.id));

    // Start with required POIs
    let sequence: PointOfInterest[] = [...requiredPOIs];

    // Add optional POIs based on optimization criteria
    if (optionalPOIs.length > 0) {
      const selectedOptionalPOIs = this.selectOptionalPOIs(
        origin,
        destination,
        sequence,
        optionalPOIs,
        options
      );
      
      // Insert optional POIs at optimal positions
      sequence = this.insertOptionalPOIs(sequence, selectedOptionalPOIs, options);
    }

    // Optimize the order of the sequence
    sequence = await this.optimizePOIOrder(origin, destination, sequence, options);

    return sequence;
  }

  /**
   * Select optional POIs to include in the route
   */
  private selectOptionalPOIs(
    origin: Coordinate,
    destination: Coordinate,
    requiredPOIs: PointOfInterest[],
    optionalPOIs: PointOfInterest[],
    options: POIRoutingOptimization
  ): PointOfInterest[] {
    // Score each optional POI based on various factors
    const scoredPOIs = optionalPOIs.map(poi => {
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

      return { poi, score };
    });

    // Sort by score and select top POIs
    scoredPOIs.sort((a, b) => b.score - a.score);
    
    // Limit number of optional POIs based on constraints
    const maxOptionalPOIs = options.maxDetourTime ? 
      Math.floor(options.maxDetourTime / 1800) : 5; // 30 min per POI default
    
    return scoredPOIs.slice(0, maxOptionalPOIs).map(item => item.poi);
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
  private isPreferredCategory(category: POICategory, options: POIRoutingOptimization): boolean {
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
   * Insert optional POIs at optimal positions in the sequence
   */
  private insertOptionalPOIs(
    requiredPOIs: PointOfInterest[],
    optionalPOIs: PointOfInterest[],
    options: POIRoutingOptimization
  ): PointOfInterest[] {
    let sequence = [...requiredPOIs];
    
    for (const poi of optionalPOIs) {
      // Find the best position to insert this POI
      let bestPosition = 0;
      let minAdditionalDistance = Infinity;
      
      for (let i = 0; i <= sequence.length; i++) {
        // Calculate additional distance if POI is inserted at position i
        let additionalDistance = 0;
        
        if (i === 0) {
          // Insert at beginning
          additionalDistance = this.calculateDistance(poi.coordinate, sequence[0].coordinate);
        } else if (i === sequence.length) {
          // Insert at end
          additionalDistance = this.calculateDistance(
            sequence[sequence.length - 1].coordinate,
            poi.coordinate
          );
        } else {
          // Insert between two POIs
          const before = sequence[i - 1].coordinate;
          const after = sequence[i].coordinate;
          const directDistance = this.calculateDistance(before, after);
          const detourDistance = this.calculateDistance(before, poi.coordinate) + 
                               this.calculateDistance(poi.coordinate, after);
          additionalDistance = detourDistance - directDistance;
        }
        
        if (additionalDistance < minAdditionalDistance) {
          minAdditionalDistance = additionalDistance;
          bestPosition = i;
        }
      }
      
      // Insert POI at best position if it doesn't exceed max detour
      const maxDetour = options.maxDetourDistance || 2000;
      if (minAdditionalDistance <= maxDetour) {
        sequence.splice(bestPosition, 0, poi);
      }
    }
    
    return sequence;
  }

  /**
   * Optimize the order of POIs in the sequence
   */
  private async optimizePOIOrder(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: POIRoutingOptimization
  ): Promise<PointOfInterest[]> {
    // For small numbers of POIs, use exact algorithm (e.g., brute force)
    // For larger numbers, use heuristic algorithm (e.g., 2-opt)
    
    if (pois.length <= 5) {
      return this.optimizeOrderBruteForce(origin, destination, pois, options);
    } else {
      return this.optimizeOrder2Opt(origin, destination, pois, options);
    }
  }

  /**
   * Optimize POI order using brute force (exact for small n)
   */
  private async optimizeOrderBruteForce(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: POIRoutingOptimization
  ): Promise<PointOfInterest[]> {
    // Generate all permutations
    const permutations = this.generatePermutations(pois);
    
    // Find the permutation with minimum cost
    let bestOrder = pois;
    let minCost = Infinity;
    
    for (const order of permutations) {
      const cost = await this.calculateRouteCost(origin, destination, order, options);
      if (cost < minCost) {
        minCost = cost;
        bestOrder = order;
      }
    }
    
    return bestOrder;
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
   * Optimize POI order using 2-opt heuristic (for larger n)
   */
  private async optimizeOrder2Opt(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: POIRoutingOptimization
  ): Promise<PointOfInterest[]> {
    let bestOrder = [...pois];
    let improved = true;
    
    while (improved) {
      improved = false;
      let bestCost = await this.calculateRouteCost(origin, destination, bestOrder, options);
      
      // Try all possible 2-opt swaps
      for (let i = 0; i < bestOrder.length - 1; i++) {
        for (let j = i + 1; j < bestOrder.length; j++) {
          // Create new order by reversing segment between i and j
          const newOrder = [
            ...bestOrder.slice(0, i),
            ...bestOrder.slice(i, j + 1).reverse(),
            ...bestOrder.slice(j + 1)
          ];
          
          const newCost = await this.calculateRouteCost(origin, destination, newOrder, options);
          
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
   * Calculate the cost of a route with a specific POI order
   */
  private async calculateRouteCost(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: POIRoutingOptimization
  ): Promise<number> {
    // Simple cost calculation based on distance and time
    // In a real implementation, this would use the routing engine
    
    let totalDistance = 0;
    let totalTime = 0;
    
    // Add distance from origin to first POI
    totalDistance += this.calculateDistance(origin, pois[0].coordinate);
    totalTime += this.estimateTravelTime(origin, pois[0].coordinate, options.transportModes[0]);
    
    // Add distances between POIs
    for (let i = 0; i < pois.length - 1; i++) {
      totalDistance += this.calculateDistance(pois[i].coordinate, pois[i + 1].coordinate);
      totalTime += this.estimateTravelTime(
        pois[i].coordinate, 
        pois[i + 1].coordinate, 
        options.transportModes[0]
      );
    }
    
    // Add distance from last POI to destination
    totalDistance += this.calculateDistance(pois[pois.length - 1].coordinate, destination);
    totalTime += this.estimateTravelTime(
      pois[pois.length - 1].coordinate, 
      destination, 
      options.transportModes[0]
    );
    
    // Add visit times for POIs
    for (const poi of pois) {
      const visitDuration = poi.timeWindow?.preferredDuration ||
                           1800; // 30 minutes default
      totalTime += visitDuration;
    }
    
    // Calculate weighted cost based on optimization criteria
    let cost = 0;
    
    switch (options.optimizeFor) {
      case 'time':
        cost = totalTime;
        break;
      case 'distance':
        cost = totalDistance;
        break;
      case 'scenic':
        // For scenic routes, we want to maximize scenic value while minimizing time
        const scenicValue = this.calculateScenicValue(pois);
        cost = totalTime / scenicValue;
        break;
      case 'balanced':
        // Balanced approach considering both time and distance
        cost = (totalTime * 0.6) + (totalDistance * 0.4);
        break;
    }
    
    return cost;
  }

  /**
   * Estimate travel time between two coordinates
   */
  private estimateTravelTime(
    from: Coordinate,
    to: Coordinate,
    mode: TransportMode
  ): number {
    const distance = this.calculateDistance(from, to);
    
    // Average speeds for different transport modes (m/s)
    const speeds: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 1.4,
      [TransportMode.BICYCLE]: 4.2,
      [TransportMode.CAR]: 11.1,
      [TransportMode.BUS]: 5.6,
      [TransportMode.METRO]: 8.3,
      [TransportMode.TRAM]: 6.9,
      [TransportMode.TRAIN]: 16.7,
      [TransportMode.FERRY]: 4.2
    };
    
    const speed = speeds[mode] || 1.4;
    return distance / speed;
  }

  /**
   * Calculate scenic value of a route
   */
  private calculateScenicValue(pois: PointOfInterest[]): number {
    // Scenic categories
    const scenicCategories = [
      POICategory.PARK,
      POICategory.MONUMENT,
      POICategory.LANDMARK,
      POICategory.VIEWPOINT,
      POICategory.NATURE,
      POICategory.BEACH
    ];
    
    let scenicValue = 1; // Base value
    
    for (const poi of pois) {
      if (scenicCategories.includes(poi.category)) {
        scenicValue += 0.5;
      }
      
      // Bonus for high ratings
      if (poi.rating && poi.rating.average > 4) {
        scenicValue += 0.2;
      }
    }
    
    return scenicValue;
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
   * Calculate route segments between POIs
   */
  private async calculateRouteSegments(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: POIRoutingOptimization
  ): Promise<POIRouteSegment[]> {
    const segments: POIRouteSegment[] = [];
    
    // Segment from origin to first POI
    segments.push({
      from: origin,
      to: pois[0].coordinate,
      toPOI: pois[0],
      mode: options.transportModes[0],
      distance: this.calculateDistance(origin, pois[0].coordinate),
      duration: this.estimateTravelTime(origin, pois[0].coordinate, options.transportModes[0]),
      instructions: this.generateInstructions(origin, pois[0].coordinate, options.transportModes[0]),
      accessibility: this.getAccessibilityInfo(options)
    });
    
    // Segments between POIs
    for (let i = 0; i < pois.length - 1; i++) {
      segments.push({
        from: pois[i].coordinate,
        to: pois[i + 1].coordinate,
        fromPOI: pois[i],
        toPOI: pois[i + 1],
        mode: options.transportModes[0],
        distance: this.calculateDistance(pois[i].coordinate, pois[i + 1].coordinate),
        duration: this.estimateTravelTime(
          pois[i].coordinate, 
          pois[i + 1].coordinate, 
          options.transportModes[0]
        ),
        instructions: this.generateInstructions(
          pois[i].coordinate, 
          pois[i + 1].coordinate, 
          options.transportModes[0]
        ),
        accessibility: this.getAccessibilityInfo(options)
      });
    }
    
    // Segment from last POI to destination
    segments.push({
      from: pois[pois.length - 1].coordinate,
      to: destination,
      fromPOI: pois[pois.length - 1],
      mode: options.transportModes[0],
      distance: this.calculateDistance(pois[pois.length - 1].coordinate, destination),
      duration: this.estimateTravelTime(
        pois[pois.length - 1].coordinate, 
        destination, 
        options.transportModes[0]
      ),
      instructions: this.generateInstructions(
        pois[pois.length - 1].coordinate, 
        destination, 
        options.transportModes[0]
      ),
      accessibility: this.getAccessibilityInfo(options)
    });
    
    return segments;
  }

  /**
   * Generate route instructions
   */
  private generateInstructions(
    from: Coordinate,
    to: Coordinate,
    mode: TransportMode
  ): string[] {
    // Simplified instruction generation
    // In a real implementation, this would use more sophisticated logic
    
    const distance = this.calculateDistance(from, to);
    const duration = this.estimateTravelTime(from, to, mode);
    
    const instructions: string[] = [];
    
    // Add departure instruction
    instructions.push(`Depart by ${mode}`);
    
    // Add continue instruction
    instructions.push(`Continue for ${Math.round(distance)} meters`);
    
    // Add arrival instruction
    instructions.push(`Arrive at destination`);
    
    return instructions;
  }

  /**
   * Get accessibility information for route segments
   */
  private getAccessibilityInfo(options: POIRoutingOptimization): AccessibilityInfo {
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
   * Generate visit plans with timing information
   */
  private generateVisitPlans(
    pois: PointOfInterest[],
    segments: POIRouteSegment[],
    departureTime?: Date,
    arrivalTime?: Date
  ): POIVisitPlan[] {
    const visitPlans: POIVisitPlan[] = [];
    
    // Calculate arrival and departure times for each POI
    let currentTime = departureTime || new Date();
    
    for (let i = 0; i < pois.length; i++) {
      const poi = pois[i];
      const segment = segments[i]; // Segment to this POI
      
      // Calculate arrival time
      const arrivalTime = new Date(currentTime.getTime() + segment.duration * 1000);
      
      // Determine visit duration
      let visitDuration = poi.timeWindow?.preferredDuration ||
                          1800; // 30 minutes default
      
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
      
      visitPlans.push({
        poi,
        order: i + 1,
        arrivalTime,
        departureTime,
        visitDuration,
        distanceFromPrevious,
        timeFromPrevious
      });
      
      // Update current time for next POI
      currentTime = departureTime;
    }
    
    return visitPlans;
  }

  /**
   * Calculate route statistics
   */
  private calculateRouteStatistics(
    visitPlans: POIVisitPlan[],
    segments: POIRouteSegment[],
    options: POIRoutingOptimization
  ) {
    // Calculate total distance and duration
    const totalDistance = segments.reduce((sum, segment) => sum + segment.distance, 0);
    const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0) +
                         visitPlans.reduce((sum, plan) => sum + plan.visitDuration, 0);
    
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
    
    return {
      totalDistance,
      totalDuration,
      totalPOIs,
      requiredPOIsVisited,
      optionalPOIsVisited,
      averageRating,
      accessibilityScore
    };
  }

  /**
   * Calculate accessibility score for the route
   */
  private calculateAccessibilityScore(
    visitPlans: POIVisitPlan[],
    segments: POIRouteSegment[]
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
   * Generate alternative routes
   */
  private async generateAlternativeRoutes(
    origin: Coordinate,
    destination: Coordinate,
    pois: PointOfInterest[],
    options: POIRoutingOptimization,
    constraints?: any
  ): Promise<POIRoutingResult['route'][]> {
    // Generate alternatives by varying optimization criteria
    const alternatives: POIRoutingResult['route'][] = [];
    
    // Try different optimization criteria
    const optimizationOptions = ['time', 'distance', 'scenic', 'balanced'];
    
    for (const optimizeFor of optimizationOptions) {
      if (optimizeFor === options.optimizeFor) continue; // Skip primary option
      
      try {
        const altOptions = { ...options, optimizeFor: optimizeFor as any };
        const altSequence = await this.determineOptimalPOISequence(
          origin,
          destination,
          pois,
          altOptions
        );
        
        const altSegments = await this.calculateRouteSegments(
          origin,
          destination,
          altSequence,
          altOptions
        );
        
        const altVisitPlans = this.generateVisitPlans(
          altSequence,
          altSegments,
          constraints?.departureTime,
          constraints?.arrivalTime
        );
        
        const altStatistics = this.calculateRouteStatistics(
          altVisitPlans,
          altSegments,
          altOptions
        );
        
        const altGeometry = this.generateRouteGeometry(origin, destination, altSegments);
        
        alternatives.push({
          id: `route-${Date.now()}-${Math.random()}`,
          geometry: altGeometry,
          distance: altStatistics.totalDistance,
          duration: altStatistics.totalDuration,
          pois: altVisitPlans,
          segments: altSegments.map(segment => ({
            from: segment.from,
            to: segment.to,
            mode: segment.mode,
            distance: segment.distance,
            duration: segment.duration,
            instructions: segment.instructions
          }))
        });
      } catch (error) {
        // Skip alternatives that can't be generated
        console.warn(`Failed to generate alternative route with ${optimizeFor} optimization:`, error);
      }
    }
    
    return alternatives;
  }

  /**
   * Generate route geometry from segments
   */
  private generateRouteGeometry(
    origin: Coordinate,
    destination: Coordinate,
    segments: POIRouteSegment[]
  ): Coordinate[] {
    const geometry: Coordinate[] = [origin];
    
    for (const segment of segments) {
      geometry.push(segment.to);
    }
    
    return geometry;
  }

  /**
   * Customize a route with POI modifications
   */
  async customizeRoute(
    route: POIRoutingResult['route'],
    customizations: POIRouteCustomization[]
  ): Promise<POIRoutingResult['route']> {
    // Apply customizations to the route
    let modifiedRoute = { ...route };
    
    for (const customization of customizations) {
      switch (customization.action) {
        case 'add':
          modifiedRoute = await this.addPOIToRoute(modifiedRoute, customization.poiId);
          break;
        case 'remove':
          modifiedRoute = await this.removePOIFromRoute(modifiedRoute, customization.poiId);
          break;
        case 'reorder':
          if (customization.parameters?.newOrder !== undefined) {
            modifiedRoute = await this.reorderPOIInRoute(
              modifiedRoute, 
              customization.poiId, 
              customization.parameters.newOrder
            );
          }
          break;
        case 'modify_time':
          if (customization.parameters?.newDuration !== undefined) {
            modifiedRoute = await this.modifyPOIVisitTime(
              modifiedRoute, 
              customization.poiId, 
              customization.parameters.newDuration
            );
          }
          break;
        case 'skip':
          modifiedRoute = await this.skipPOIInRoute(modifiedRoute, customization.poiId);
          break;
      }
    }
    
    return modifiedRoute;
  }

  /**
   * Add a POI to an existing route
   */
  private async addPOIToRoute(
    route: POIRoutingResult['route'],
    poiId: string
  ): Promise<POIRoutingResult['route']> {
    // Get POI from service
    const poi = this.poiService.getPOI(poiId);
    if (!poi) {
      throw new Error(`POI with ID ${poiId} not found`);
    }
    
    // Find best position to insert POI
    const bestPosition = this.findBestInsertPosition(route, poi);
    
    // Insert POI at best position
    const newPOIs = [...route.pois.map(p => p.poi)];
    newPOIs.splice(bestPosition, 0, poi);
    
    // Recalculate route with new POI
    // This is a simplified implementation - in a real system, you'd reuse the existing route planning logic
    return route; // Placeholder
  }

  /**
   * Find the best position to insert a POI in a route
   */
  private findBestInsertPosition(
    route: POIRoutingResult['route'],
    poi: PointOfInterest
  ): number {
    // Find the position that minimizes additional distance
    let bestPosition = 0;
    let minAdditionalDistance = Infinity;
    
    for (let i = 0; i <= route.pois.length; i++) {
      let additionalDistance = 0;
      
      if (i === 0) {
        // Insert at beginning
        additionalDistance = this.calculateDistance(poi.coordinate, route.pois[0].poi.coordinate);
      } else if (i === route.pois.length) {
        // Insert at end
        additionalDistance = this.calculateDistance(
          route.pois[route.pois.length - 1].poi.coordinate,
          poi.coordinate
        );
      } else {
        // Insert between two POIs
        const before = route.pois[i - 1].poi.coordinate;
        const after = route.pois[i].poi.coordinate;
        const directDistance = this.calculateDistance(before, after);
        const detourDistance = this.calculateDistance(before, poi.coordinate) + 
                             this.calculateDistance(poi.coordinate, after);
        additionalDistance = detourDistance - directDistance;
      }
      
      if (additionalDistance < minAdditionalDistance) {
        minAdditionalDistance = additionalDistance;
        bestPosition = i;
      }
    }
    
    return bestPosition;
  }

  /**
   * Remove a POI from an existing route
   */
  private async removePOIFromRoute(
    route: POIRoutingResult['route'],
    poiId: string
  ): Promise<POIRoutingResult['route']> {
    // Find and remove POI
    const newPOIs = route.pois.filter(p => p.poi.id !== poiId);
    
    // Recalculate route without POI
    // This is a simplified implementation - in a real system, you'd reuse the existing route planning logic
    return route; // Placeholder
  }

  /**
   * Reorder a POI in an existing route
   */
  private async reorderPOIInRoute(
    route: POIRoutingResult['route'],
    poiId: string,
    newOrder: number
  ): Promise<POIRoutingResult['route']> {
    // Find POI and move to new position
    const poiIndex = route.pois.findIndex(p => p.poi.id === poiId);
    if (poiIndex === -1) {
      throw new Error(`POI with ID ${poiId} not found in route`);
    }
    
    const poi = route.pois[poiIndex];
    const newPOIs = [...route.pois];
    newPOIs.splice(poiIndex, 1);
    newPOIs.splice(newOrder, 0, poi);
    
    // Recalculate route with reordered POIs
    // This is a simplified implementation - in a real system, you'd reuse the existing route planning logic
    return route; // Placeholder
  }

  /**
   * Modify POI visit time in an existing route
   */
  private async modifyPOIVisitTime(
    route: POIRoutingResult['route'],
    poiId: string,
    newDuration: number
  ): Promise<POIRoutingResult['route']> {
    // Find POI and update visit duration
    const poiIndex = route.pois.findIndex(p => p.poi.id === poiId);
    if (poiIndex === -1) {
      throw new Error(`POI with ID ${poiId} not found in route`);
    }
    
    const newPOIs = [...route.pois];
    newPOIs[poiIndex] = {
      ...newPOIs[poiIndex],
      visitDuration: newDuration
    };
    
    // Recalculate timing for subsequent POIs
    // This is a simplified implementation - in a real system, you'd reuse the existing timing logic
    return {
      ...route,
      pois: newPOIs
    };
  }

  /**
   * Skip a POI in an existing route
   */
  private async skipPOIInRoute(
    route: POIRoutingResult['route'],
    poiId: string
  ): Promise<POIRoutingResult['route']> {
    // Mark POI as skipped
    const poiIndex = route.pois.findIndex(p => p.poi.id === poiId);
    if (poiIndex === -1) {
      throw new Error(`POI with ID ${poiId} not found in route`);
    }
    
    const newPOIs = [...route.pois];
    newPOIs[poiIndex] = {
      ...newPOIs[poiIndex],
      visitDuration: 0
    };
    
    // Recalculate route without spending time at this POI
    // This is a simplified implementation - in a real system, you'd reuse the existing timing logic
    return {
      ...route,
      pois: newPOIs
    };
  }

  /**
   * Generate visualization data for a POI route
   */
  generateVisualizationData(route: POIRoutingResult['route']): POIRouteVisualization {
    // Calculate bounds
    let minLat = route.geometry[0].latitude;
    let maxLat = route.geometry[0].latitude;
    let minLon = route.geometry[0].longitude;
    let maxLon = route.geometry[0].longitude;
    
    for (const coord of route.geometry) {
      minLat = Math.min(minLat, coord.latitude);
      maxLat = Math.max(maxLat, coord.latitude);
      minLon = Math.min(minLon, coord.longitude);
      maxLon = Math.max(maxLon, coord.longitude);
    }
    
    const bounds = {
      northEast: { latitude: maxLat, longitude: maxLon },
      southWest: { latitude: minLat, longitude: minLon }
    };
    
    // Calculate center
    const center = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2
    };
    
    // Calculate zoom (simplified)
    const latDiff = maxLat - minLat;
    const lonDiff = maxLon - minLon;
    const maxDiff = Math.max(latDiff, lonDiff);
    const zoom = Math.max(1, Math.min(18, Math.log2(360 / maxDiff)));
    
    // Generate POI markers
    const poiMarkers = route.pois.map((visit, index) => {
      const isRequired = visit.poi.visitPriority?.mustVisit || false;
      const isVisited = visit.visitDuration > 0;
      
      return {
        poi: visit.poi,
        position: visit.poi.coordinate,
        order: visit.order,
        isVisited,
        isRequired,
        label: `${visit.order}. ${visit.poi.name}`,
        icon: this.getIconForCategory(visit.poi.category),
        color: isRequired ? '#FF0000' : (isVisited ? '#00FF00' : '#0000FF')
      };
    });
    
    // Generate segments
    const segments = route.segments.map((segment, index) => ({
      from: segment.from,
      to: segment.to,
      mode: segment.mode,
      color: this.getColorForMode(segment.mode),
      width: 5,
      style: 'solid' as const,
      label: `${segment.mode} to ${route.pois[index + 1]?.poi.name || 'destination'}`
    }));
    
    return {
      routeId: route.id,
      geometry: route.geometry,
      poiMarkers,
      segments,
      bounds,
      center,
      zoom
    };
  }

  /**
   * Get icon for POI category
   */
  private getIconForCategory(category: POICategory): string {
    // Simplified icon mapping
    const iconMap: Record<POICategory, string> = {
      [POICategory.TOURIST_ATTRACTION]: 'attraction',
      [POICategory.MUSEUM]: 'museum',
      [POICategory.PARK]: 'park',
      [POICategory.MONUMENT]: 'monument',
      [POICategory.LANDMARK]: 'landmark',
      [POICategory.RESTAURANT]: 'restaurant',
      [POICategory.CAFE]: 'cafe',
      [POICategory.SHOP]: 'shop',
      [POICategory.MARKET]: 'market',
      [POICategory.MALL]: 'mall',
      [POICategory.HOTEL]: 'hotel',
      [POICategory.HOSPITAL]: 'hospital',
      [POICategory.PHARMACY]: 'pharmacy',
      [POICategory.BANK]: 'bank',
      [POICategory.ATM]: 'atm',
      [POICategory.GAS_STATION]: 'gas',
      [POICategory.PARKING]: 'parking',
      [POICategory.PUBLIC_TRANSPORT]: 'transit',
      [POICategory.BIKE_RENTAL]: 'bike',
      [POICategory.SCHOOL]: 'school',
      [POICategory.UNIVERSITY]: 'university',
      [POICategory.LIBRARY]: 'library',
      [POICategory.POST_OFFICE]: 'post',
      [POICategory.PLACE_OF_WORSHIP]: 'worship',
      [POICategory.ENTERTAINMENT]: 'entertainment',
      [POICategory.SPORTS_FACILITY]: 'sports',
      [POICategory.PLAYGROUND]: 'playground',
      [POICategory.BEACH]: 'beach',
      [POICategory.NATURE]: 'nature',
      [POICategory.VIEWPOINT]: 'viewpoint',
      [POICategory.CAMPGROUND]: 'camping',
      [POICategory.CUSTOM]: 'poi'
    };
    
    return iconMap[category] || 'poi';
  }

  /**
   * Get color for transport mode
   */
  private getColorForMode(mode: TransportMode): string {
    // Simplified color mapping
    const colorMap: Record<TransportMode, string> = {
      [TransportMode.WALKING]: '#4CAF50',
      [TransportMode.BICYCLE]: '#2196F3',
      [TransportMode.CAR]: '#F44336',
      [TransportMode.BUS]: '#FF9800',
      [TransportMode.METRO]: '#9C27B0',
      [TransportMode.TRAM]: '#00BCD4',
      [TransportMode.TRAIN]: '#607D8B',
      [TransportMode.FERRY]: '#009688'
    };
    
    return colorMap[mode] || '#000000';
  }
}