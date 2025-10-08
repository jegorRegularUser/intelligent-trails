/**
 * Preference-Aware Routing Engine
 * Integrates user preferences and accessibility constraints with existing routing algorithms
 */

import {
  MultiModalGraph,
  GraphNode,
  GraphEdge,
  TransportMode,
  Coordinate
} from '../types/graph';
import {
  MultiModalRoute,
  RouteSegment,
  RouteInstruction,
  RouteConstraints,
  UserPreferences as LegacyUserPreferences
} from '../types/routing';
import {
  DetailedUserPreferences,
  UserConstraints,
  PreferenceCategory,
  MobilityDevice
} from '../types/preferences';
import { PreferenceManager } from '../preferences/PreferenceManager';
import { PreferenceBasedOptimizer, MultiCriteriaAlgorithm } from '../preferences/PreferenceBasedOptimizer';
import { AccessibilityManager } from '../preferences/AccessibilityManager';
import { ProfileManager, ProfileContext } from '../preferences/ProfileManager';
// Note: These imports would be used in a real implementation
// import { MultiModalRouter } from '../algorithms/MultiModalRouter';
// import { MultiCriteriaOptimizer as BaseMultiCriteriaOptimizer } from '../algorithms/MultiCriteriaOptimizer';

// Placeholder classes for demonstration
class MultiModalRouter {
  constructor(graph: any) {}
  
  async findRoutes(
    start: any,
    end: any,
    preferences: any,
    constraints: any,
    maxRoutes: number
  ): Promise<any[]> {
    // Placeholder implementation
    return [];
  }
}

class BaseMultiCriteriaOptimizer {
  constructor(graph: any, nodes: any, edges: any) {}
}

/**
 * Route request with preference information
 */
export interface PreferenceAwareRouteRequest {
  userId: string;
  start: Coordinate;
  end: Coordinate;
  departureTime?: Date;
  arrivalTime?: Date;
  profileId?: string;
  context?: ProfileContext;
  algorithm?: MultiCriteriaAlgorithm;
  maxRoutes?: number;
  includeAlternatives?: boolean;
}

/**
 * Route response with preference-based rankings
 */
export interface PreferenceAwareRouteResponse {
  routes: MultiModalRoute[];
  rankings: Map<string, number>; // routeId -> score
  recommendations: {
    primary: string; // routeId
    alternatives: string[]; // routeIds
    explanations: Map<string, string>; // routeId -> explanation
  };
  preferences: DetailedUserPreferences;
  constraints: UserConstraints;
  context?: ProfileContext;
}

/**
 * Preference-aware routing engine
 */
export class PreferenceAwareRouter {
  private graph: MultiModalGraph;
  private preferenceManager: PreferenceManager;
  private profileManager: ProfileManager;
  private accessibilityManager: AccessibilityManager;
  private preferenceOptimizer: PreferenceBasedOptimizer;
  private baseRouter: MultiModalRouter;
  private baseOptimizer: BaseMultiCriteriaOptimizer;

  constructor(graph: MultiModalGraph) {
    this.graph = graph;
    this.preferenceManager = PreferenceManager.getInstance();
    this.profileManager = new ProfileManager(this.preferenceManager);
    this.accessibilityManager = new AccessibilityManager(graph);
    this.baseRouter = new MultiModalRouter(graph);
    this.baseOptimizer = new BaseMultiCriteriaOptimizer(graph, new Map(), new Map());
  }

  /**
   * Find routes with preference awareness
   */
  public async findRoutes(request: PreferenceAwareRouteRequest): Promise<PreferenceAwareRouteResponse> {
    // Get user preferences
    let preferences: DetailedUserPreferences;
    let constraints: UserConstraints;
    let context: ProfileContext | undefined;

    if (request.profileId) {
      // Use specific profile
      const userProfile = this.preferenceManager.getUserProfile(request.userId);
      if (!userProfile) {
        throw new Error('User not found');
      }

      const profile = userProfile.profiles.find(p => p.id === request.profileId);
      if (!profile) {
        throw new Error('Profile not found');
      }

      preferences = profile.preferences;
      constraints = preferences.constraints;
    } else if (request.context) {
      // Use context-specific profile
      const contextProfile = this.profileManager.getContextProfile(request.userId, request.context);
      if (contextProfile) {
        preferences = contextProfile.preferences;
        constraints = preferences.constraints;
        context = request.context;
      } else {
        // Use active profile
        const activePreferences = this.preferenceManager.getActivePreferences(request.userId);
        if (!activePreferences) {
          throw new Error('No active preferences found');
        }
        preferences = activePreferences;
        constraints = preferences.constraints;
        context = request.context;
      }
    } else {
      // Use active profile
      const activePreferences = this.preferenceManager.getActivePreferences(request.userId);
      if (!activePreferences) {
        throw new Error('No active preferences found');
      }
      preferences = activePreferences;
      constraints = preferences.constraints;
    }

    // Optimize preferences for accessibility if needed
    if (constraints.mobilityDevice.type !== 'none') {
      preferences = this.accessibilityManager.optimizePreferencesForAccessibility(preferences, constraints);
    }

    // Convert to legacy formats for base router
    const legacyPreferences = this.preferenceManager.convertToLegacyPreferences(preferences);
    const routeConstraints = this.preferenceManager.convertToRouteConstraints(preferences);

    // Apply time constraints
    if (request.departureTime) {
      routeConstraints.departureTime = request.departureTime;
    }
    if (request.arrivalTime) {
      routeConstraints.arrivalTime = request.arrivalTime;
    }

    // Initialize preference optimizer
    this.preferenceOptimizer = new PreferenceBasedOptimizer(
      this.graph,
      preferences,
      constraints,
      request.algorithm || MultiCriteriaAlgorithm.WEIGHTED_SUM
    );

    // Find routes using base router
    const routes = await this.baseRouter.findRoutes(
      request.start,
      request.end,
      legacyPreferences,
      routeConstraints,
      request.maxRoutes || 5
    );

    // Enhance routes with accessibility information
    const enhancedRoutes = routes.map(route => this.enhanceRouteWithAccessibility(route, constraints));

    // Calculate rankings based on preferences
    const rankings = new Map<string, number>();
    const explanations = new Map<string, string>();

    enhancedRoutes.forEach(route => {
      const ranking = this.preferenceOptimizer.calculateRouteRanking(route);
      rankings.set(route.id, ranking.overallScore);
      explanations.set(route.id, ranking.explanation);
    });

    // Sort routes by ranking
    enhancedRoutes.sort((a, b) => {
      const scoreA = rankings.get(a.id) || 0;
      const scoreB = rankings.get(b.id) || 0;
      return scoreB - scoreA; // Higher score is better
    });

    // Generate recommendations
    const recommendations = this.generateRecommendations(enhancedRoutes, rankings, explanations);

    // Record route selection for learning
    if (enhancedRoutes.length > 0) {
      this.profileManager.recordProfileUsage(
        request.userId,
        recommendations.primary,
        context || ProfileContext.LEISURE
      );
    }

    return {
      routes: enhancedRoutes,
      rankings,
      recommendations,
      preferences,
      constraints,
      context
    };
  }

  /**
   * Enhance route with accessibility information
   */
  private enhanceRouteWithAccessibility(route: MultiModalRoute, constraints: UserConstraints): MultiModalRoute {
    // Validate route accessibility
    const accessibilityResult = this.accessibilityManager.validateRouteAccessibility(route, constraints);

    // Update route scores
    route.accessibilityScore = accessibilityResult.overallScore;
    route.safetyScore = this.calculateRouteSafetyScore(route);
    route.comfortScore = this.calculateRouteComfortScore(route);
    route.environmentalScore = this.calculateRouteEnvironmentalScore(route);

    // Enhance segments with accessibility information
    route.segments = route.segments.map(segment => {
      // Validate segment accessibility
      const segmentResult = this.accessibilityManager.validateSegmentAccessibility(segment, constraints);
      
      // Update segment accessibility info
      segment.accessibility = {
        ...segment.accessibility,
        wheelchairAccessible: segmentResult.accessibilityScore > 0.7,
        visuallyImpairedFriendly: segmentResult.accessibilityScore > 0.6
      };

      // Generate accessibility-aware instructions
      segment.instructions = this.accessibilityManager.generateAccessibilityInstructions(segment, constraints);

      return segment;
    });

    return route;
  }

  /**
   * Calculate route safety score
   */
  private calculateRouteSafetyScore(route: MultiModalRoute): number {
    let totalSafety = 0;
    let segmentCount = 0;

    route.segments.forEach(segment => {
      // Calculate safety based on transport mode and time of day
      const modeSafety = this.getTransportModeSafetyScore(segment.mode);
      const timeSafety = this.getTimeSafetyScore(new Date()); // Use current time as fallback
      
      const segmentSafety = (modeSafety + timeSafety) / 2;
      totalSafety += segmentSafety;
      segmentCount++;
    });

    return segmentCount > 0 ? totalSafety / segmentCount : 0.5;
  }

  /**
   * Calculate route comfort score
   */
  private calculateRouteComfortScore(route: MultiModalRoute): number {
    let totalComfort = 0;
    let segmentCount = 0;

    route.segments.forEach(segment => {
      // Calculate comfort based on transport mode and segment properties
      const modeComfort = this.getTransportModeComfortScore(segment.mode);
      const segmentComfort = this.getSegmentComfortScore(segment);
      
      const comfortScore = (modeComfort + segmentComfort) / 2;
      totalComfort += comfortScore;
      segmentCount++;
    });

    return segmentCount > 0 ? totalComfort / segmentCount : 0.5;
  }

  /**
   * Calculate route environmental score
   */
  private calculateRouteEnvironmentalScore(route: MultiModalRoute): number {
    let totalEnvironmental = 0;
    let segmentCount = 0;

    route.segments.forEach(segment => {
      // Calculate environmental impact based on transport mode
      const modeEnvironmental = this.getTransportModeEnvironmentalScore(segment.mode);
      
      totalEnvironmental += modeEnvironmental;
      segmentCount++;
    });

    return segmentCount > 0 ? totalEnvironmental / segmentCount : 0.5;
  }

  /**
   * Get transport mode safety score
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
   * Get time-based safety score
   */
  private getTimeSafetyScore(time: Date): number {
    const hour = time.getHours();
    
    // Daytime is generally safer
    if (hour >= 6 && hour <= 18) {
      return 0.9;
    }
    
    // Evening is moderately safe
    if (hour > 18 && hour <= 22) {
      return 0.7;
    }
    
    // Night is less safe
    return 0.5;
  }

  /**
   * Get transport mode comfort score
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
   * Get segment comfort score
   */
  private getSegmentComfortScore(segment: RouteSegment): number {
    let comfortScore = 0.8; // Base comfort score

    // Adjust based on segment properties
    const edge = this.graph.edges.get(segment.id);
    if (edge) {
      // Wider roads are more comfortable
      if (edge.properties.roadClass === 'motorway') {
        comfortScore += 0.1;
      } else if (edge.properties.roadClass === 'residential') {
        comfortScore -= 0.1;
      }

      // Paved surfaces are more comfortable
      if (edge.properties.surface === 'paved') {
        comfortScore += 0.1;
      } else if (edge.properties.surface === 'unpaved') {
        comfortScore -= 0.2;
      }

      // Separated bike lanes are more comfortable for cycling
      if (segment.mode === TransportMode.BICYCLE && edge.properties.separatedBikeLane) {
        comfortScore += 0.2;
      }
    }

    // Adjust based on occupancy
    if (segment.properties.occupancyLevel === 'high') {
      comfortScore -= 0.2;
    } else if (segment.properties.occupancyLevel === 'low') {
      comfortScore += 0.1;
    }

    return Math.max(0, Math.min(1, comfortScore));
  }

  /**
   * Get transport mode environmental score
   */
  private getTransportModeEnvironmentalScore(mode: TransportMode): number {
    // Environmental scores (0-1, higher is more eco-friendly)
    const environmentalScores: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 1.0,
      [TransportMode.BICYCLE]: 0.95,
      [TransportMode.BUS]: 0.6,
      [TransportMode.TRAM]: 0.7,
      [TransportMode.METRO]: 0.75,
      [TransportMode.TRAIN]: 0.8,
      [TransportMode.FERRY]: 0.5,
      [TransportMode.CAR]: 0.2
    };

    return environmentalScores[mode] || 0.5;
  }

  /**
   * Generate route recommendations
   */
  private generateRecommendations(
    routes: MultiModalRoute[],
    rankings: Map<string, number>,
    explanations: Map<string, string>
  ): PreferenceAwareRouteResponse['recommendations'] {
    if (routes.length === 0) {
      return {
        primary: '',
        alternatives: [],
        explanations: new Map()
      };
    }

    // Primary recommendation is the highest ranked route
    const primary = routes[0].id;
    
    // Alternatives are other routes with significantly different characteristics
    const alternatives: string[] = [];
    const primaryScore = rankings.get(primary) || 0;
    
    for (let i = 1; i < Math.min(routes.length, 3); i++) {
      const route = routes[i];
      const routeScore = rankings.get(route.id) || 0;
      
      // Include as alternative if it's reasonably good but different from primary
      if (routeScore > primaryScore * 0.7 && this.isRouteDifferent(routes[0], route)) {
        alternatives.push(route.id);
      }
    }

    return {
      primary,
      alternatives,
      explanations
    };
  }

  /**
   * Check if two routes are significantly different
   */
  private isRouteDifferent(routeA: MultiModalRoute, routeB: MultiModalRoute): boolean {
    // Check if routes have different transport mode sequences
    const modesA = routeA.segments.map(s => s.mode).join('-');
    const modesB = routeB.segments.map(s => s.mode).join('-');
    
    if (modesA !== modesB) {
      return true;
    }

    // Check if routes have significantly different distances
    const distanceDiff = Math.abs(routeA.totalDistance - routeB.totalDistance);
    const avgDistance = (routeA.totalDistance + routeB.totalDistance) / 2;
    
    if (distanceDiff / avgDistance > 0.2) {
      return true;
    }

    // Check if routes have significantly different durations
    const durationDiff = Math.abs(routeA.totalDuration - routeB.totalDuration);
    const avgDuration = (routeA.totalDuration + routeB.totalDuration) / 2;
    
    if (durationDiff / avgDuration > 0.2) {
      return true;
    }

    // Check if routes have significantly different costs
    const costDiff = Math.abs(routeA.totalCost - routeB.totalCost);
    const avgCost = (routeA.totalCost + routeB.totalCost) / 2;
    
    if (avgCost > 0 && costDiff / avgCost > 0.2) {
      return true;
    }

    return false;
  }

  /**
   * Record route selection for learning
   */
  public recordRouteSelection(
    userId: string,
    routeId: string,
    context?: ProfileContext
  ): void {
    const userProfile = this.preferenceManager.getUserProfile(userId);
    if (!userProfile) return;

    const activePreferences = this.preferenceManager.getActivePreferences(userId);
    if (!activePreferences) return;

    this.preferenceManager.recordRouteSelection(
      userId,
      routeId,
      activePreferences,
      context || ProfileContext.LEISURE
    );
  }

  /**
   * Record route rejection for learning
   */
  public recordRouteRejection(
    userId: string,
    routeId: string,
    reason: string,
    context?: ProfileContext
  ): void {
    this.preferenceManager.recordRouteRejection(userId, routeId, reason);
  }

  /**
   * Get preference recommendations for a user
   */
  public getPreferenceRecommendations(userId: string) {
    return this.profileManager.generateProfileRecommendations(userId);
  }

  /**
   * Get user profile analytics
   */
  public getUserProfileAnalytics(userId: string) {
    return this.profileManager.getProfileAnalytics(userId);
  }

  /**
   * Update user preferences
   */
  public updateUserPreferences(
    userId: string,
    preferences: DetailedUserPreferences
  ): boolean {
    const userProfile = this.preferenceManager.getUserProfile(userId);
    if (!userProfile) return false;

    const activeProfile = userProfile.profiles.find(p => p.id === userProfile.activeProfileId);
    if (!activeProfile) return false;

    return this.preferenceManager.updatePreferenceProfile(userId, activeProfile.id, { preferences });
  }

  /**
   * Add accessibility barrier
   */
  public addAccessibilityBarrier(
    barrier: Omit<any, 'id' | 'reportedAt'>
  ): string {
    return this.accessibilityManager.addBarrier(barrier);
  }

  /**
   * Get accessibility barriers in an area
   */
  public getAccessibilityBarriersInArea(
    center: Coordinate,
    radius: number
  ) {
    return this.accessibilityManager.getBarriersInArea(center, radius);
  }
}