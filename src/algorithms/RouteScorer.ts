/**
 * Route scoring and comparison functionality
 * Provides detailed scoring and comparison of multi-modal routes
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
import { MultiModalGraphImpl } from '../graph/MultiModalGraph';
import { OptimizationWeights } from './MultiCriteriaOptimizer';

/**
 * Detailed route analysis result
 */
export interface RouteAnalysis {
  route: MultiModalRoute;
  score: RouteScore;
  breakdown: {
    time: {
      total: number;
      walking: number;
      cycling: number;
      transit: number;
      driving: number;
      transfers: number;
    };
    cost: {
      total: number;
      tickets: number;
      tolls: number;
      other: number;
    };
    distance: {
      total: number;
      walking: number;
      cycling: number;
      transit: number;
      driving: number;
    };
    accessibility: {
      overall: number;
      wheelchairAccessible: number;
      visuallyImpairedFriendly: number;
      hasElevator: number;
      hasRamp: number;
    };
    environmental: {
      overall: number;
      carbonFootprint: number;
      energyConsumption: number;
    };
    safety: {
      overall: number;
      roadSafety: number;
      personalSafety: number;
      infrastructureSafety: number;
    };
    comfort: {
      overall: number;
      crowding: number;
      seating: number;
      smoothness: number;
    };
  };
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

/**
 * Route comparison metrics
 */
export interface ComparisonMetrics {
  timeDifference: number; // in seconds
  costDifference: number; // in monetary units
  distanceDifference: number; // in meters
  accessibilityDifference: number; // 0-1
  environmentalDifference: number; // 0-1
  safetyDifference: number; // 0-1
  comfortDifference: number; // 0-1
  transfersDifference: number; // count
  overallScoreDifference: number; // 0-1
}

/**
 * Route scorer implementation
 */
export class RouteScorer {
  private graph: MultiModalGraphImpl;
  private preferences: UserPreferences;
  private constraints: RouteConstraints;
  private weights: OptimizationWeights;

  constructor(
    graph: MultiModalGraphImpl, 
    preferences: UserPreferences, 
    constraints: RouteConstraints,
    weights: OptimizationWeights
  ) {
    this.graph = graph;
    this.preferences = preferences;
    this.constraints = constraints;
    this.weights = weights;
  }

  /**
   * Analyze a route and provide detailed scoring
   */
  analyzeRoute(route: MultiModalRoute): RouteAnalysis {
    const score = this.calculateDetailedScore(route);
    const breakdown = this.calculateBreakdown(route);
    const { strengths, weaknesses, recommendations } = this.generateAnalysis(route, score, breakdown);

    return {
      route,
      score,
      breakdown,
      strengths,
      weaknesses,
      recommendations
    };
  }

  /**
   * Compare two routes and provide detailed metrics
   */
  compareRoutes(routeA: MultiModalRoute, routeB: MultiModalRoute): ComparisonMetrics {
    const scoreA = this.calculateDetailedScore(routeA);
    const scoreB = this.calculateDetailedScore(routeB);

    return {
      timeDifference: routeB.totalDuration - routeA.totalDuration,
      costDifference: routeB.totalCost - routeA.totalCost,
      distanceDifference: routeB.totalDistance - routeA.totalDistance,
      accessibilityDifference: scoreB.accessibility - scoreA.accessibility,
      environmentalDifference: scoreB.environmental - scoreA.environmental,
      safetyDifference: scoreB.safety - scoreA.safety,
      comfortDifference: scoreB.comfort - scoreA.comfort,
      transfersDifference: routeB.totalTransfers - routeA.totalTransfers,
      overallScoreDifference: scoreB.overall - scoreA.overall
    };
  }

  /**
   * Calculate detailed score for a route
   */
  private calculateDetailedScore(route: MultiModalRoute): RouteScore {
    const time = this.normalizeTime(route.totalDuration);
    const cost = this.normalizeCost(route.totalCost);
    const distance = this.normalizeDistance(route.totalDistance);
    const transfers = this.normalizeTransfers(route.totalTransfers);

    // Calculate overall score
    const overall = 
      time * this.weights.time +
      cost * this.weights.cost +
      distance * this.weights.distance +
      route.safetyScore * this.weights.safety +
      route.accessibilityScore * this.weights.accessibility +
      route.environmentalScore * this.weights.environmental +
      route.comfortScore * this.weights.comfort +
      transfers * this.weights.transfers;

    return {
      time,
      cost,
      distance,
      safety: route.safetyScore,
      accessibility: route.accessibilityScore,
      environmental: route.environmentalScore,
      comfort: route.comfortScore,
      transfers,
      overall
    };
  }

  /**
   * Calculate detailed breakdown of route metrics
   */
  private calculateBreakdown(route: MultiModalRoute): RouteAnalysis['breakdown'] {
    // Initialize breakdown
    const breakdown: RouteAnalysis['breakdown'] = {
      time: {
        total: route.totalDuration,
        walking: 0,
        cycling: 0,
        transit: 0,
        driving: 0,
        transfers: 0
      },
      cost: {
        total: route.totalCost,
        tickets: 0,
        tolls: 0,
        other: 0
      },
      distance: {
        total: route.totalDistance,
        walking: 0,
        cycling: 0,
        transit: 0,
        driving: 0
      },
      accessibility: {
        overall: route.accessibilityScore,
        wheelchairAccessible: 0,
        visuallyImpairedFriendly: 0,
        hasElevator: 0,
        hasRamp: 0
      },
      environmental: {
        overall: route.environmentalScore,
        carbonFootprint: 0,
        energyConsumption: 0
      },
      safety: {
        overall: route.safetyScore,
        roadSafety: 0,
        personalSafety: 0,
        infrastructureSafety: 0
      },
      comfort: {
        overall: route.comfortScore,
        crowding: 0,
        seating: 0,
        smoothness: 0
      }
    };

    // Calculate segment-based metrics
    for (const segment of route.segments) {
      // Time breakdown
      switch (segment.mode) {
        case TransportMode.WALKING:
          breakdown.time.walking += segment.duration;
          breakdown.distance.walking += segment.distance;
          break;
        case TransportMode.BICYCLE:
          breakdown.time.cycling += segment.duration;
          breakdown.distance.cycling += segment.distance;
          break;
        case TransportMode.CAR:
          breakdown.time.driving += segment.duration;
          breakdown.distance.driving += segment.distance;
          breakdown.cost.tolls += segment.properties.routeNumber ? 50 : 0; // Assume toll for numbered routes
          break;
        case TransportMode.BUS:
        case TransportMode.METRO:
        case TransportMode.TRAM:
        case TransportMode.TRAIN:
        case TransportMode.FERRY:
          breakdown.time.transit += segment.duration;
          breakdown.distance.transit += segment.distance;
          breakdown.cost.tickets += segment.cost;
          break;
      }

      // Accessibility breakdown
      if (segment.accessibility.wheelchairAccessible) {
        breakdown.accessibility.wheelchairAccessible += 1;
      }
      if (segment.accessibility.visuallyImpairedFriendly) {
        breakdown.accessibility.visuallyImpairedFriendly += 1;
      }
      if (segment.accessibility.hasElevator) {
        breakdown.accessibility.hasElevator += 1;
      }
      if (segment.accessibility.hasRamp) {
        breakdown.accessibility.hasRamp += 1;
      }

      // Environmental breakdown
      const carbonFootprint = this.calculateCarbonFootprint(segment);
      const energyConsumption = this.calculateEnergyConsumption(segment);
      breakdown.environmental.carbonFootprint += carbonFootprint;
      breakdown.environmental.energyConsumption += energyConsumption;

      // Safety breakdown
      const roadSafety = this.calculateRoadSafety(segment);
      const personalSafety = this.calculatePersonalSafety(segment);
      const infrastructureSafety = this.calculateInfrastructureSafety(segment);
      breakdown.safety.roadSafety += roadSafety;
      breakdown.safety.personalSafety += personalSafety;
      breakdown.safety.infrastructureSafety += infrastructureSafety;

      // Comfort breakdown
      const crowding = this.calculateCrowding(segment);
      const seating = this.calculateSeating(segment);
      const smoothness = this.calculateSmoothness(segment);
      breakdown.comfort.crowding += crowding;
      breakdown.comfort.seating += seating;
      breakdown.comfort.smoothness += smoothness;
    }

    // Calculate transfer time
    breakdown.time.transfers = route.totalTransfers * 300; // Assume 5 minutes per transfer

    // Normalize accessibility breakdown
    const totalSegments = route.segments.length;
    if (totalSegments > 0) {
      breakdown.accessibility.wheelchairAccessible /= totalSegments;
      breakdown.accessibility.visuallyImpairedFriendly /= totalSegments;
      breakdown.accessibility.hasElevator /= totalSegments;
      breakdown.accessibility.hasRamp /= totalSegments;
    }

    return breakdown;
  }

  /**
   * Generate analysis insights
   */
  private generateAnalysis(
    route: MultiModalRoute, 
    score: RouteScore, 
    breakdown: RouteAnalysis['breakdown']
  ): { strengths: string[]; weaknesses: string[]; recommendations: string[] } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    // Time analysis
    if (score.time < 0.3) {
      strengths.push('Very fast route');
    } else if (score.time > 0.7) {
      weaknesses.push('Route is quite slow');
      recommendations.push('Consider alternative transport modes for faster travel');
    }

    // Cost analysis
    if (score.cost < 0.3) {
      strengths.push('Very cost-effective route');
    } else if (score.cost > 0.7) {
      weaknesses.push('Route is quite expensive');
      recommendations.push('Consider public transport options to reduce cost');
    }

    // Distance analysis
    if (score.distance < 0.3) {
      strengths.push('Very direct route');
    } else if (score.distance > 0.7) {
      weaknesses.push('Route is quite indirect');
      recommendations.push('Consider more direct routes if available');
    }

    // Accessibility analysis
    if (score.accessibility > 0.8) {
      strengths.push('Excellent accessibility features');
    } else if (score.accessibility < 0.4) {
      weaknesses.push('Limited accessibility features');
      recommendations.push('Consider alternative routes if accessibility is a concern');
    }

    // Environmental analysis
    if (score.environmental > 0.8) {
      strengths.push('Very eco-friendly route');
    } else if (score.environmental < 0.4) {
      weaknesses.push('High environmental impact');
      recommendations.push('Consider walking, cycling, or public transport to reduce environmental impact');
    }

    // Safety analysis
    if (score.safety > 0.8) {
      strengths.push('Very safe route');
    } else if (score.safety < 0.4) {
      weaknesses.push('Safety concerns on this route');
      recommendations.push('Consider alternative routes with better safety features');
    }

    // Comfort analysis
    if (score.comfort > 0.8) {
      strengths.push('Very comfortable route');
    } else if (score.comfort < 0.4) {
      weaknesses.push('Low comfort level on this route');
      recommendations.push('Consider routes with better comfort features');
    }

    // Transfer analysis
    if (score.transfers < 0.2) {
      strengths.push('Minimal transfers required');
    } else if (score.transfers > 0.6) {
      weaknesses.push('Many transfers required');
      recommendations.push('Consider routes with fewer transfers for convenience');
    }

    // Mode-specific insights
    const walkingPercentage = breakdown.time.walking / breakdown.time.total;
    if (walkingPercentage > 0.5) {
      strengths.push('Good amount of walking for health');
      if (this.preferences.avoidWalking) {
        weaknesses.push('Route involves significant walking');
        recommendations.push('Consider routes with less walking if preferred');
      }
    }

    const cyclingPercentage = breakdown.time.cycling / breakdown.time.total;
    if (cyclingPercentage > 0.3) {
      strengths.push('Good cycling component for health and environment');
      if (this.preferences.avoidCycling) {
        weaknesses.push('Route involves significant cycling');
        recommendations.push('Consider routes with less cycling if preferred');
      }
    }

    const transitPercentage = breakdown.time.transit / breakdown.time.total;
    if (transitPercentage > 0.6) {
      strengths.push('Efficient use of public transport');
    }

    return { strengths, weaknesses, recommendations };
  }

  /**
   * Normalize time score (0-1, lower is better)
   */
  private normalizeTime(time: number): number {
    return Math.min(time / 10800, 1); // Normalize to 3 hours max
  }

  /**
   * Normalize cost score (0-1, lower is better)
   */
  private normalizeCost(cost: number): number {
    return Math.min(cost / 1000, 1); // Normalize to 1000 units max
  }

  /**
   * Normalize distance score (0-1, lower is better)
   */
  private normalizeDistance(distance: number): number {
    return Math.min(distance / 100000, 1); // Normalize to 100km max
  }

  /**
   * Normalize transfers score (0-1, lower is better)
   */
  private normalizeTransfers(transfers: number): number {
    return Math.min(transfers / 5, 1); // Normalize to 5 transfers max
  }

  /**
   * Calculate carbon footprint for a segment
   */
  private calculateCarbonFootprint(segment: RouteSegment): number {
    // Carbon footprint in g CO2 per meter
    const carbonFootprintRates: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 0,
      [TransportMode.BICYCLE]: 0,
      [TransportMode.CAR]: 120, // Average car
      [TransportMode.BUS]: 30, // Average bus
      [TransportMode.METRO]: 20, // Average metro
      [TransportMode.TRAM]: 25, // Average tram
      [TransportMode.TRAIN]: 15, // Average train
      [TransportMode.FERRY]: 50 // Average ferry
    };

    return segment.distance * (carbonFootprintRates[segment.mode] || 50);
  }

  /**
   * Calculate energy consumption for a segment
   */
  private calculateEnergyConsumption(segment: RouteSegment): number {
    // Energy consumption in Wh per meter
    const energyConsumptionRates: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 0,
      [TransportMode.BICYCLE]: 0,
      [TransportMode.CAR]: 60, // Average car
      [TransportMode.BUS]: 15, // Average bus
      [TransportMode.METRO]: 10, // Average metro
      [TransportMode.TRAM]: 12, // Average tram
      [TransportMode.TRAIN]: 8, // Average train
      [TransportMode.FERRY]: 20 // Average ferry
    };

    return segment.distance * (energyConsumptionRates[segment.mode] || 20);
  }

  /**
   * Calculate road safety for a segment
   */
  private calculateRoadSafety(segment: RouteSegment): number {
    // Road safety score (0-1, higher is better)
    const roadSafetyRates: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 0.6,
      [TransportMode.BICYCLE]: 0.5,
      [TransportMode.CAR]: 0.7,
      [TransportMode.BUS]: 0.9,
      [TransportMode.METRO]: 0.95,
      [TransportMode.TRAM]: 0.9,
      [TransportMode.TRAIN]: 0.95,
      [TransportMode.FERRY]: 0.85
    };

    return roadSafetyRates[segment.mode] || 0.5;
  }

  /**
   * Calculate personal safety for a segment
   */
  private calculatePersonalSafety(segment: RouteSegment): number {
    // Personal safety score (0-1, higher is better)
    const personalSafetyRates: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 0.7,
      [TransportMode.BICYCLE]: 0.6,
      [TransportMode.CAR]: 0.8,
      [TransportMode.BUS]: 0.8,
      [TransportMode.METRO]: 0.85,
      [TransportMode.TRAM]: 0.8,
      [TransportMode.TRAIN]: 0.9,
      [TransportMode.FERRY]: 0.8
    };

    // Adjust based on time of day (simplified)
    let adjustment = 0;
    // In a real implementation, you'd check the actual time
    // For now, assume it's daytime

    return Math.min(1, Math.max(0, personalSafetyRates[segment.mode] + adjustment));
  }

  /**
   * Calculate infrastructure safety for a segment
   */
  private calculateInfrastructureSafety(segment: RouteSegment): number {
    // Infrastructure safety score (0-1, higher is better)
    let score = 0.5; // Base score

    // Adjust based on accessibility features
    if (segment.accessibility.wheelchairAccessible) score += 0.2;
    if (segment.accessibility.hasRamp) score += 0.1;
    if (segment.accessibility.hasElevator) score += 0.1;
    if (segment.accessibility.visuallyImpairedFriendly) score += 0.1;

    return Math.min(1, score);
  }

  /**
   * Calculate crowding for a segment
   */
  private calculateCrowding(segment: RouteSegment): number {
    // Crowding score (0-1, lower is better)
    const crowdingRates: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 0.1,
      [TransportMode.BICYCLE]: 0.1,
      [TransportMode.CAR]: 0.2,
      [TransportMode.BUS]: 0.7,
      [TransportMode.METRO]: 0.6,
      [TransportMode.TRAM]: 0.6,
      [TransportMode.TRAIN]: 0.5,
      [TransportMode.FERRY]: 0.4
    };

    // Adjust based on occupancy level if available
    let adjustment = 0;
    if (segment.properties.occupancyLevel) {
      switch (segment.properties.occupancyLevel) {
        case 'low':
          adjustment = -0.2;
          break;
        case 'medium':
          adjustment = 0;
          break;
        case 'high':
          adjustment = 0.2;
          break;
      }
    }

    return Math.min(1, Math.max(0, crowdingRates[segment.mode] + adjustment));
  }

  /**
   * Calculate seating for a segment
   */
  private calculateSeating(segment: RouteSegment): number {
    // Seating score (0-1, higher is better)
    const seatingRates: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 0,
      [TransportMode.BICYCLE]: 0,
      [TransportMode.CAR]: 1,
      [TransportMode.BUS]: 0.6,
      [TransportMode.METRO]: 0.7,
      [TransportMode.TRAM]: 0.6,
      [TransportMode.TRAIN]: 0.8,
      [TransportMode.FERRY]: 0.7
    };

    return seatingRates[segment.mode] || 0.5;
  }

  /**
   * Calculate smoothness for a segment
   */
  private calculateSmoothness(segment: RouteSegment): number {
    // Smoothness score (0-1, higher is better)
    const smoothnessRates: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 0.7,
      [TransportMode.BICYCLE]: 0.6,
      [TransportMode.CAR]: 0.9,
      [TransportMode.BUS]: 0.5,
      [TransportMode.METRO]: 0.8,
      [TransportMode.TRAM]: 0.7,
      [TransportMode.TRAIN]: 0.9,
      [TransportMode.FERRY]: 0.6
    };

    // Adjust based on road surface if available
    let adjustment = 0;
    if (segment.mode === TransportMode.WALKING || segment.mode === TransportMode.BICYCLE) {
      if (segment.accessibility.hasRamp) adjustment += 0.2;
    }

    return Math.min(1, Math.max(0, smoothnessRates[segment.mode] + adjustment));
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