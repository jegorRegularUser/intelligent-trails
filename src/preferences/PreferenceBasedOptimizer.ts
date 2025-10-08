/**
 * Preference-Based Route Optimization for the multi-modal routing application
 * Implements multi-criteria decision making algorithms based on user preferences
 */

import {
  PreferenceCategory,
  DetailedUserPreferences,
  PreferenceWeights,
  PreferenceSegmentScore,
  PreferenceRouteRanking,
  UserConstraints,
  MobilityDevice
} from '../types/preferences';
import {
  MultiModalRoute,
  RouteSegment,
  RouteScore,
  UserPreferences as LegacyUserPreferences,
  RouteConstraints
} from '../types/routing';
import {
  MultiModalGraph,
  GraphNode,
  GraphEdge,
  TransportMode,
  AccessibilityInfo
} from '../types/graph';
import { OptimizationWeights } from '../algorithms/MultiCriteriaOptimizer';

/**
 * Cost function for route segments based on preferences
 */
export interface PreferenceCostFunction {
  /**
   * Calculate the cost of a route segment based on preferences
   * @param segment The route segment to evaluate
   * @param preferences User preferences
   * @param constraints User constraints
   * @returns The calculated cost (lower is better)
   */
  calculateCost(
    segment: RouteSegment,
    preferences: DetailedUserPreferences,
    constraints: UserConstraints
  ): number;
}

/**
 * Multi-criteria decision making algorithm
 */
export enum MultiCriteriaAlgorithm {
  WEIGHTED_SUM = 'weighted_sum',
  LEXICOGRAPHIC = 'lexicographic',
  TOPSIS = 'topsis',
  ELECTRE = 'electre',
  PARETO = 'pareto'
}

/**
 * Preference-based route optimizer
 */
export class PreferenceBasedOptimizer {
  private graph: MultiModalGraph;
  private preferences: DetailedUserPreferences;
  private constraints: UserConstraints;
  private costFunctions: Map<PreferenceCategory, PreferenceCostFunction>;
  private algorithm: MultiCriteriaAlgorithm;

  constructor(
    graph: MultiModalGraph,
    preferences: DetailedUserPreferences,
    constraints: UserConstraints,
    algorithm: MultiCriteriaAlgorithm = MultiCriteriaAlgorithm.WEIGHTED_SUM
  ) {
    this.graph = graph;
    this.preferences = preferences;
    this.constraints = constraints;
    this.algorithm = algorithm;
    this.costFunctions = new Map();
    this.initializeCostFunctions();
  }

  /**
   * Initialize cost functions for each preference category
   */
  private initializeCostFunctions(): void {
    // Speed cost function - lower time is better
    this.costFunctions.set(PreferenceCategory.SPEED, {
      calculateCost: (segment, preferences, constraints) => {
        // Normalize time to 0-1 range (lower is better)
        const maxReasonableTime = 3600; // 1 hour
        return Math.min(segment.duration / maxReasonableTime, 1);
      }
    });

    // Safety cost function - higher safety score is better
    this.costFunctions.set(PreferenceCategory.SAFETY, {
      calculateCost: (segment, preferences, constraints) => {
        // Calculate safety based on transport mode and accessibility
        const modeSafety = this.getTransportModeSafetyScore(segment.mode);
        const accessibilitySafety = segment.accessibility.visuallyImpairedFriendly ? 0.2 : 0;
        return 1 - (modeSafety + accessibilitySafety);
      }
    });

    // Accessibility cost function - higher accessibility score is better
    this.costFunctions.set(PreferenceCategory.ACCESSIBILITY, {
      calculateCost: (segment, preferences, constraints) => {
        // Check if segment meets accessibility constraints
        const violations = this.checkAccessibilityConstraints(segment, constraints);
        
        // If there are violations, assign high cost
        if (violations.length > 0) {
          return 1 + violations.length * 0.5;
        }
        
        // Otherwise, calculate accessibility score
        const wheelchairScore = segment.accessibility.wheelchairAccessible ? 1 : 0;
        const elevatorScore = segment.accessibility.hasElevator ? 0.5 : 0;
        const rampScore = segment.accessibility.hasRamp ? 0.3 : 0;
        const tactileScore = segment.accessibility.tactilePaving ? 0.2 : 0;
        const accessibilityScore = Math.min(wheelchairScore + elevatorScore + rampScore + tactileScore, 1);
        return 1 - accessibilityScore;
      }
    });

    // Cost cost function - lower monetary cost is better
    this.costFunctions.set(PreferenceCategory.COST, {
      calculateCost: (segment, preferences, constraints) => {
        // Normalize cost to 0-1 range (lower is better)
        const maxReasonableCost = 100; // currency units
        return Math.min(segment.cost / maxReasonableCost, 1);
      }
    });

    // Environment cost function - higher environmental score is better
    this.costFunctions.set(PreferenceCategory.ENVIRONMENT, {
      calculateCost: (segment, preferences, constraints) => {
        // Calculate environmental impact based on transport mode
        const modeImpact = this.getTransportModeEnvironmentalImpact(segment.mode);
        return 1 - modeImpact;
      }
    });

    // Comfort cost function - higher comfort score is better
    this.costFunctions.set(PreferenceCategory.COMFORT, {
      calculateCost: (segment, preferences, constraints) => {
        // Calculate comfort based on transport mode and segment properties
        const modeComfort = this.getTransportModeComfortScore(segment.mode);
        return 1 - modeComfort;
      }
    });

    // Scenic cost function - higher scenic value is better
    this.costFunctions.set(PreferenceCategory.SCENIC, {
      calculateCost: (segment, preferences, constraints) => {
        // Check if segment has scenic properties
        const isScenic = this.isSegmentScenic(segment);
        return isScenic ? 0 : 1;
      }
    });
  }

  /**
   * Calculate environmental impact of a transport mode
   */
  private getTransportModeEnvironmentalImpact(mode: TransportMode): number {
    // Environmental impact scores (0-1, higher is better/more eco-friendly)
    const impactScores: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 1.0,
      [TransportMode.BICYCLE]: 0.95,
      [TransportMode.BUS]: 0.6,
      [TransportMode.TRAM]: 0.7,
      [TransportMode.METRO]: 0.75,
      [TransportMode.TRAIN]: 0.8,
      [TransportMode.FERRY]: 0.5,
      [TransportMode.CAR]: 0.2
    };

    return impactScores[mode] || 0.5;
  }

  /**
   * Calculate safety score for a transport mode
   */
  private getTransportModeSafetyScore(mode: TransportMode): number {
    // Safety scores (0-1, higher is safer)
    const safetyScores: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 0.7,
      [TransportMode.BICYCLE]: 0.6,
      [TransportMode.BUS]: 0.8,
      [TransportMode.TRAM]: 0.85,
      [TransportMode.METRO]: 0.9,
      [TransportMode.TRAIN]: 0.95,
      [TransportMode.FERRY]: 0.75,
      [TransportMode.CAR]: 0.6
    };

    return safetyScores[mode] || 0.5;
  }

  /**
   * Calculate comfort score for a transport mode
   */
  private getTransportModeComfortScore(mode: TransportMode): number {
    // Comfort scores (0-1, higher is more comfortable)
    const comfortScores: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 0.6,
      [TransportMode.BICYCLE]: 0.5,
      [TransportMode.BUS]: 0.7,
      [TransportMode.TRAM]: 0.8,
      [TransportMode.METRO]: 0.85,
      [TransportMode.TRAIN]: 0.9,
      [TransportMode.FERRY]: 0.75,
      [TransportMode.CAR]: 0.9
    };

    return comfortScores[mode] || 0.5;
  }

  /**
   * Check if a segment is scenic
   */
  private isSegmentScenic(segment: RouteSegment): boolean {
    // Check segment properties for scenic indicators
    // This would typically involve checking against map data or POIs
    // For now, we'll use a simple heuristic based on mode and location
    return segment.mode === TransportMode.WALKING || 
           segment.mode === TransportMode.BICYCLE ||
           segment.properties.routeName?.toLowerCase().includes('scenic') ||
           segment.properties.routeName?.toLowerCase().includes('park');
  }

  /**
   * Check accessibility constraints for a segment
   */
  private checkAccessibilityConstraints(segment: RouteSegment, constraints: UserConstraints): string[] {
    const violations: string[] = [];
    const device = constraints.mobilityDevice;

    // Skip accessibility checks if no mobility device is specified
    if (device.type === 'none') {
      return violations;
    }

    // Check wheelchair accessibility
    if (device.type === 'wheelchair' && !segment.accessibility.wheelchairAccessible) {
      violations.push('segment_not_wheelchair_accessible');
    }

    // Check for stairs (not directly in AccessibilityInfo, but we can infer from other properties)
    if (!segment.accessibility.hasElevator && !segment.accessibility.hasRamp) {
      violations.push('segment_potential_stairs');
    }

    // Check for elevator requirements
    if (device.requiresElevator && !segment.accessibility.hasElevator) {
      violations.push('segment_missing_elevator');
    }

    // Check for ramp requirements
    if (device.requiresRamp && !segment.accessibility.hasRamp) {
      violations.push('segment_missing_ramp');
    }

    // Check for tactile paving for visually impaired users
    if (constraints.visualImpairment && !segment.accessibility.tactilePaving) {
      violations.push('segment_missing_tactile_paving');
    }

    // Check for audio signals for visually impaired users
    if (constraints.visualImpairment && !segment.accessibility.audioSignals) {
      violations.push('segment_missing_audio_signals');
    }

    return violations;
  }

  /**
   * Calculate segment scores based on preferences
   */
  public calculateSegmentScores(segment: RouteSegment): PreferenceSegmentScore {
    const scores = {
      speed: 0,
      safety: 0,
      accessibility: 0,
      cost: 0,
      environment: 0,
      comfort: 0,
      scenic: 0
    };

    // Calculate individual scores
    this.costFunctions.forEach((costFunction, category) => {
      const cost = costFunction.calculateCost(segment, this.preferences, this.constraints);
      scores[category] = 1 - cost; // Invert cost to get score (higher is better)
    });

    // Calculate weighted score
    let weightedScore = 0;
    Object.entries(scores).forEach(([category, score]) => {
      const weight = this.preferences.weights[category as keyof PreferenceWeights];
      weightedScore += score * weight;
    });

    // Check constraints
    const constraintViolations = this.checkAccessibilityConstraints(segment, this.constraints);
    const meetsConstraints = constraintViolations.length === 0;

    return {
      segmentId: segment.id,
      scores,
      weightedScore,
      meetsConstraints,
      constraintViolations
    };
  }

  /**
   * Calculate route ranking based on preferences
   */
  public calculateRouteRanking(route: MultiModalRoute): PreferenceRouteRanking {
    // Calculate scores for each category
    const categoryScores = {
      speed: this.calculateRouteSpeedScore(route),
      safety: this.calculateRouteSafetyScore(route),
      accessibility: this.calculateRouteAccessibilityScore(route),
      cost: this.calculateRouteCostScore(route),
      environment: this.calculateRouteEnvironmentalScore(route),
      comfort: this.calculateRouteComfortScore(route),
      scenic: this.calculateRouteScenicScore(route)
    };

    // Calculate overall score based on selected algorithm
    let overallScore = 0;
    
    switch (this.algorithm) {
      case MultiCriteriaAlgorithm.WEIGHTED_SUM:
        overallScore = this.calculateWeightedSumScore(categoryScores);
        break;
      case MultiCriteriaAlgorithm.LEXICOGRAPHIC:
        overallScore = this.calculateLexicographicScore(categoryScores);
        break;
      case MultiCriteriaAlgorithm.TOPSIS:
        overallScore = this.calculateTopsisScore(categoryScores);
        break;
      case MultiCriteriaAlgorithm.ELECTRE:
        overallScore = this.calculateElectreScore(categoryScores);
        break;
      case MultiCriteriaAlgorithm.PARETO:
        overallScore = this.calculateParetoScore(categoryScores);
        break;
      default:
        overallScore = this.calculateWeightedSumScore(categoryScores);
    }

    // Check for constraint violations
    const constraintViolations = this.checkRouteConstraints(route);
    const meetsAllConstraints = constraintViolations.length === 0;

    // Generate explanation
    const explanation = this.generateExplanation(categoryScores, overallScore, constraintViolations);

    return {
      routeId: route.id,
      overallScore,
      categoryScores,
      constraintViolations,
      meetsAllConstraints,
      explanation
    };
  }

  /**
   * Calculate route speed score
   */
  private calculateRouteSpeedScore(route: MultiModalRoute): number {
    // Normalize duration to 0-1 range (higher is better)
    const maxReasonableDuration = 10800; // 3 hours
    return 1 - Math.min(route.totalDuration / maxReasonableDuration, 1);
  }

  /**
   * Calculate route safety score
   */
  private calculateRouteSafetyScore(route: MultiModalRoute): number {
    // Use the route's safety score if available, otherwise calculate from segments
    if (route.safetyScore !== undefined) {
      return route.safetyScore;
    }

    // Calculate average safety from segments
    let totalSafety = 0;
    let segmentCount = 0;

    route.segments.forEach(segment => {
      const segmentScore = this.calculateSegmentScores(segment);
      totalSafety += segmentScore.scores.safety;
      segmentCount++;
    });

    return segmentCount > 0 ? totalSafety / segmentCount : 0.5;
  }

  /**
   * Calculate route accessibility score
   */
  private calculateRouteAccessibilityScore(route: MultiModalRoute): number {
    // Use the route's accessibility score if available, otherwise calculate from segments
    if (route.accessibilityScore !== undefined) {
      return route.accessibilityScore;
    }

    // Calculate average accessibility from segments
    let totalAccessibility = 0;
    let segmentCount = 0;

    route.segments.forEach(segment => {
      const segmentScore = this.calculateSegmentScores(segment);
      totalAccessibility += segmentScore.scores.accessibility;
      segmentCount++;
    });

    return segmentCount > 0 ? totalAccessibility / segmentCount : 0.5;
  }

  /**
   * Calculate route cost score
   */
  private calculateRouteCostScore(route: MultiModalRoute): number {
    // Normalize cost to 0-1 range (higher is better)
    const maxReasonableCost = 1000; // currency units
    return 1 - Math.min(route.totalCost / maxReasonableCost, 1);
  }

  /**
   * Calculate route environmental score
   */
  private calculateRouteEnvironmentalScore(route: MultiModalRoute): number {
    // Use the route's environmental score if available, otherwise calculate from segments
    if (route.environmentalScore !== undefined) {
      return route.environmentalScore;
    }

    // Calculate average environmental impact from segments
    let totalEnvironmental = 0;
    let segmentCount = 0;

    route.segments.forEach(segment => {
      const impact = this.getTransportModeEnvironmentalImpact(segment.mode);
      totalEnvironmental += impact;
      segmentCount++;
    });

    return segmentCount > 0 ? totalEnvironmental / segmentCount : 0.5;
  }

  /**
   * Calculate route comfort score
   */
  private calculateRouteComfortScore(route: MultiModalRoute): number {
    // Use the route's comfort score if available, otherwise calculate from segments
    if (route.comfortScore !== undefined) {
      return route.comfortScore;
    }

    // Calculate average comfort from segments
    let totalComfort = 0;
    let segmentCount = 0;

    route.segments.forEach(segment => {
      const comfort = this.getTransportModeComfortScore(segment.mode);
      totalComfort += comfort;
      segmentCount++;
    });

    return segmentCount > 0 ? totalComfort / segmentCount : 0.5;
  }

  /**
   * Calculate route scenic score
   */
  private calculateRouteScenicScore(route: MultiModalRoute): number {
    // Calculate scenic score based on segments
    let scenicSegments = 0;
    let totalSegments = 0;

    route.segments.forEach(segment => {
      totalSegments++;
      if (this.isSegmentScenic(segment)) {
        scenicSegments++;
      }
    });

    return totalSegments > 0 ? scenicSegments / totalSegments : 0;
  }

  /**
   * Calculate weighted sum score
   */
  private calculateWeightedSumScore(categoryScores: PreferenceRouteRanking['categoryScores']): number {
    let weightedSum = 0;
    
    Object.entries(categoryScores).forEach(([category, score]) => {
      const weight = this.preferences.weights[category as keyof PreferenceWeights];
      weightedSum += score * weight;
    });

    return weightedSum;
  }

  /**
   * Calculate lexicographic score
   */
  private calculateLexicographicScore(categoryScores: PreferenceRouteRanking['categoryScores']): number {
    // Lexicographic ordering based on preference order
    const order = this.preferences.lexicographicOrder;
    
    // Find the first category where the score is significantly different from perfect
    for (const category of order) {
      const score = categoryScores[category];
      if (score < 0.9) {
        // Return score adjusted by position in order
        const position = order.indexOf(category);
        return score * (1 - position * 0.1);
      }
    }

    // If all scores are high, return perfect score
    return 1.0;
  }

  /**
   * Calculate TOPSIS score (Technique for Order Preference by Similarity to Ideal Solution)
   */
  private calculateTopsisScore(categoryScores: PreferenceRouteRanking['categoryScores']): number {
    // For TOPSIS, we would need multiple routes to compare
    // For a single route, we'll use a simplified version
    
    // Ideal solution (all scores = 1)
    const ideal = 1.0;
    
    // Negative ideal solution (all scores = 0)
    const negativeIdeal = 0.0;
    
    // Calculate distance to ideal solution
    let distanceToIdeal = 0;
    let distanceToNegativeIdeal = 0;
    
    Object.entries(categoryScores).forEach(([category, score]) => {
      const weight = this.preferences.weights[category as keyof PreferenceWeights];
      distanceToIdeal += weight * Math.pow(score - ideal, 2);
      distanceToNegativeIdeal += weight * Math.pow(score - negativeIdeal, 2);
    });
    
    distanceToIdeal = Math.sqrt(distanceToIdeal);
    distanceToNegativeIdeal = Math.sqrt(distanceToNegativeIdeal);
    
    // Calculate TOPSIS score
    return distanceToNegativeIdeal / (distanceToIdeal + distanceToNegativeIdeal);
  }

  /**
   * Calculate ELECTRE score (Elimination and Choice Translating Reality)
   */
  private calculateElectreScore(categoryScores: PreferenceRouteRanking['categoryScores']): number {
    // For ELECTRE, we would need multiple routes to compare
    // For a single route, we'll use a simplified version
    
    // Calculate concordance and discordance indices
    let concordance = 0;
    let discordance = 0;
    
    Object.entries(categoryScores).forEach(([category, score]) => {
      const weight = this.preferences.weights[category as keyof PreferenceWeights];
      concordance += weight * score;
      discordance += weight * (1 - score);
    });
    
    // Calculate ELECTRE score
    return concordance / (concordance + discordance);
  }

  /**
   * Calculate Pareto score
   */
  private calculateParetoScore(categoryScores: PreferenceRouteRanking['categoryScores']): number {
    // For Pareto optimality, we would need multiple routes to compare
    // For a single route, we'll use a simplified version
    
    // Calculate minimum score across all categories
    const minScore = Math.min(...Object.values(categoryScores));
    
    // Calculate average score
    const avgScore = Object.values(categoryScores).reduce((sum, score) => sum + score, 0) / 
                     Object.values(categoryScores).length;
    
    // Return a combination of minimum and average scores
    return (minScore * 0.7) + (avgScore * 0.3);
  }

  /**
   * Check route constraints
   */
  private checkRouteConstraints(route: MultiModalRoute): string[] {
    const violations: string[] = [];

    // Check maximum walking distance
    if (this.constraints.maxWalkingDistance && route.totalWalkingDistance > this.constraints.maxWalkingDistance) {
      violations.push('max_walking_distance_exceeded');
    }

    // Check maximum cycling distance
    if (this.constraints.maxCyclingDistance && route.totalCyclingDistance > this.constraints.maxCyclingDistance) {
      violations.push('max_cycling_distance_exceeded');
    }

    // Check maximum time constraint
    if (this.constraints.timeConstraints?.maxTotalTime && route.totalDuration > this.constraints.timeConstraints.maxTotalTime) {
      violations.push('max_time_exceeded');
    }

    // Check maximum stairs
    if (this.constraints.maxStairs !== undefined) {
      // Count stairs in route segments
      let totalStairs = 0;
      route.segments.forEach(segment => {
        // Infer potential stairs from lack of accessibility features
        if (!segment.accessibility.hasElevator && !segment.accessibility.hasRamp) {
          totalStairs++;
        }
      });

      if (totalStairs > this.constraints.maxStairs) {
        violations.push('max_stairs_exceeded');
      }
    }

    // Check for flat surface requirement
    if (this.constraints.requiresFlatSurface) {
      // Check if any segment has steep gradient
      const hasSteepGradient = route.segments.some(segment => {
        const edge = this.graph.edges.get(segment.id);
        return edge && edge.properties.gradient && Math.abs(edge.properties.gradient) > 5;
      });

      if (hasSteepGradient) {
        violations.push('flat_surface_required');
      }
    }

    // Check for handrails requirement
    if (this.constraints.requiresHandrails) {
      // Check if all required segments have handrails
      const missingHandrails = route.segments.some(segment => {
        // This would require additional data about handrails
        // For now, we'll assume this is not available
        return false;
      });

      if (missingHandrails) {
        violations.push('handrails_required');
      }
    }

    // Check for rest areas requirement
    if (this.constraints.requiresRestAreas) {
      // Check if route has sufficient rest areas
      // This would require additional data about rest areas
      // For now, we'll assume this is not available
      violations.push('rest_areas_required');
    }

    // Check for accessible toilets requirement
    if (this.constraints.requiresAccessibleToilets) {
      // Check if route has accessible toilets
      // This would require additional data about toilets
      // For now, we'll assume this is not available
      violations.push('accessible_toilets_required');
    }

    return violations;
  }

  /**
   * Generate explanation for route ranking
   */
  private generateExplanation(
    categoryScores: PreferenceRouteRanking['categoryScores'],
    overallScore: number,
    constraintViolations: string[]
  ): string {
    const parts: string[] = [];

    // Add overall score information
    parts.push(`Overall score: ${(overallScore * 100).toFixed(1)}%`);

    // Add information about top categories
    const sortedCategories = Object.entries(categoryScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (sortedCategories.length > 0) {
      const topCategories = sortedCategories.map(([category, score]) => 
        `${category} (${(score * 100).toFixed(1)}%)`
      ).join(', ');
      parts.push(`Strongest categories: ${topCategories}`);
    }

    // Add information about constraint violations
    if (constraintViolations.length > 0) {
      const violationMessages = constraintViolations.map(violation => {
        switch (violation) {
          case 'max_walking_distance_exceeded':
            return 'Maximum walking distance exceeded';
          case 'max_cycling_distance_exceeded':
            return 'Maximum cycling distance exceeded';
          case 'max_time_exceeded':
            return 'Maximum time exceeded';
          case 'max_stairs_exceeded':
            return 'Maximum stairs exceeded';
          case 'flat_surface_required':
            return 'Flat surface required but not available';
          case 'handrails_required':
            return 'Handrails required but not available';
          case 'rest_areas_required':
            return 'Rest areas required but not available';
          case 'accessible_toilets_required':
            return 'Accessible toilets required but not available';
          default:
            return violation.replace(/_/g, ' ');
        }
      });

      parts.push(`Constraint violations: ${violationMessages.join(', ')}`);
    }

    return parts.join('. ');
  }

  /**
   * Convert preferences to optimization weights
   */
  public convertToOptimizationWeights(): OptimizationWeights {
    return {
      time: this.preferences.weights.speed,
      cost: this.preferences.weights.cost,
      distance: 0.1, // Fixed weight for distance
      safety: this.preferences.weights.safety,
      accessibility: this.preferences.weights.accessibility,
      environmental: this.preferences.weights.environment,
      comfort: this.preferences.weights.comfort,
      transfers: this.preferences.minimizeTransfers ? 0.2 : 0.05
    };
  }

  /**
   * Update preferences
   */
  public updatePreferences(preferences: DetailedUserPreferences): void {
    this.preferences = preferences;
  }

  /**
   * Update constraints
   */
  public updateConstraints(constraints: UserConstraints): void {
    this.constraints = constraints;
  }

  /**
   * Set optimization algorithm
   */
  public setAlgorithm(algorithm: MultiCriteriaAlgorithm): void {
    this.algorithm = algorithm;
  }

  /**
   * Get current optimization algorithm
   */
  public getAlgorithm(): MultiCriteriaAlgorithm {
    return this.algorithm;
  }
}