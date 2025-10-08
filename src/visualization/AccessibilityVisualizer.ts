/**
 * Accessibility Visualizer implementation
 * Handles visualization of accessibility information, wheelchair access indicators,
 * accessible route options, and detailed accessibility features for routes.
 */

import {
  VisualizationTheme,
  VisualizationEvent,
  VisualizationEventType
} from '../types/visualization';

import { MultiModalRoute, RouteSegment } from '../types/routing';
import { PointOfInterest } from '../types/poi';
import { Coordinate, TransportMode } from '../types/graph';

/**
 * Accessibility feature types
 */
export enum AccessibilityFeature {
  WHEELCHAIR_ACCESSIBLE = 'wheelchair_accessible',
  HAS_ELEVATOR = 'has_elevator',
  HAS_RAMP = 'has_ramp',
  TACTILE_PAVING = 'tactile_paving',
  AUDIO_SIGNALS = 'audio_signals',
  VISUALLY_IMPAIRED_FRIENDLY = 'visually_impaired_friendly',
  HEARING_ASSISTANCE = 'hearing_assistance',
  ACCESSIBLE_RESTROOMS = 'accessible_restrooms',
  WHEELCHAIR_RENTAL = 'wheelchair_rental',
  QUIET_SPACE = 'quiet_space'
}

/**
 * Accessibility rating levels
 */
export enum AccessibilityRating {
  NOT_ACCESSIBLE = 'not_accessible',
  PARTIALLY_ACCESSIBLE = 'partially_accessible',
  MOSTLY_ACCESSIBLE = 'mostly_accessible',
  FULLY_ACCESSIBLE = 'fully_accessible'
}

/**
 * Accessibility visualization types
 */
export enum AccessibilityVisualizationType {
  OVERLAY = 'overlay',
  HIGHLIGHT = 'highlight',
  SEPARATE_LAYER = 'separate_layer',
  TOOLTIPS = 'tooltips'
}

/**
 * Visual representation of an accessibility feature
 */
export interface VisualAccessibilityFeature {
  id: string;
  type: AccessibilityFeature;
  position: Coordinate;
  radius: number; // in meters
  available: boolean;
  confidence: number; // 0-1
  style: {
    icon: string;
    size: number;
    color: string;
    borderColor: string;
    borderWidth: number;
    opacity: number;
    zIndex: number;
  };
  description: string;
}

/**
 * Visual representation of an accessibility rating
 */
export interface VisualAccessibilityRating {
  id: string;
  position: Coordinate;
  rating: AccessibilityRating;
  score: number; // 0-1
  details: {
    features: AccessibilityFeature[];
    availableCount: number;
    totalCount: number;
  };
  style: {
    icon: string;
    size: number;
    color: string;
    borderColor: string;
    borderWidth: number;
    opacity: number;
    zIndex: number;
  };
}

/**
 * Visual representation of an accessible route segment
 */
export interface VisualAccessibleSegment {
  id: string;
  segmentId: string;
  geometry: Coordinate[];
  accessibility: {
    rating: AccessibilityRating;
    score: number;
    features: AccessibilityFeature[];
  };
  style: {
    color: string;
    width: number;
    opacity: number;
    dashArray?: number[];
    zIndex: number;
  };
  issues: {
    type: 'no_ramp' | 'no_elevator' | 'narrow_path' | 'steep_slope' | 'uneven_surface';
    position: Coordinate;
    description: string;
  }[];
}

/**
 * Accessibility visualization options
 */
export interface AccessibilityVisualizationOptions {
  showFeatures: boolean;
  showRatings: boolean;
  showIssues: boolean;
  showAccessibleSegments: boolean;
  showInaccessibleSegments: boolean;
  visualizationType: AccessibilityVisualizationType;
  highlightMode: 'color' | 'width' | 'pattern';
  featureIcons: boolean;
  tooltips: boolean;
  filterByFeature?: AccessibilityFeature[];
  minAccessibilityScore: number; // 0-1
}

/**
 * Accessibility visualization data
 */
export interface AccessibilityVisualization {
  id: string;
  route: MultiModalRoute;
  features: VisualAccessibilityFeature[];
  ratings: VisualAccessibilityRating[];
  segments: VisualAccessibleSegment[];
  bounds: {
    northEast: Coordinate;
    southWest: Coordinate;
  };
  center: Coordinate;
  zoom: number;
  options: AccessibilityVisualizationOptions;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    overallAccessibilityScore: number; // 0-1
    overallRating: AccessibilityRating;
    totalFeatures: number;
    accessibleFeatures: number;
    issuesCount: number;
  };
}

/**
 * Accessibility Visualizer class
 */
export class AccessibilityVisualizer {
  private currentVisualization: AccessibilityVisualization | null = null;
  private theme: VisualizationTheme | null = null;
  private eventListeners: Map<VisualizationEventType, Function[]> = new Map();

  constructor(theme?: VisualizationTheme) {
    this.theme = theme || null;
  }

  /**
   * Set visualization theme
   */
  setTheme(theme: VisualizationTheme): void {
    this.theme = theme;
  }

  /**
   * Create accessibility visualization from route data
   */
  createVisualization(
    route: MultiModalRoute,
    options?: Partial<AccessibilityVisualizationOptions>
  ): AccessibilityVisualization {
    const mergedOptions: AccessibilityVisualizationOptions = {
      showFeatures: true,
      showRatings: true,
      showIssues: true,
      showAccessibleSegments: true,
      showInaccessibleSegments: true,
      visualizationType: AccessibilityVisualizationType.OVERLAY,
      highlightMode: 'color',
      featureIcons: true,
      tooltips: true,
      minAccessibilityScore: 0,
      ...options
    };

    // Create visual accessibility features
    const features = this.createVisualAccessibilityFeatures(route, mergedOptions);

    // Create visual accessibility ratings
    const ratings = this.createVisualAccessibilityRatings(route, mergedOptions);

    // Create visual accessible segments
    const segments = this.createVisualAccessibleSegments(route, mergedOptions);

    // Calculate bounds and center
    const bounds = this.calculateBounds(route.geometry);
    const center = this.calculateCenter(bounds);
    const zoom = this.calculateZoom(bounds);

    // Calculate overall accessibility score
    const overallAccessibilityScore = this.calculateOverallAccessibilityScore(route);
    const overallRating = this.getRatingFromScore(overallAccessibilityScore);

    const visualization: AccessibilityVisualization = {
      id: `accessibility-viz-${Date.now()}`,
      route,
      features,
      ratings,
      segments,
      bounds,
      center,
      zoom,
      options: mergedOptions,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        overallAccessibilityScore,
        overallRating,
        totalFeatures: features.length,
        accessibleFeatures: features.filter(f => f.available).length,
        issuesCount: segments.reduce((sum, segment) => sum + segment.issues.length, 0)
      }
    };

    this.currentVisualization = visualization;

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { visualization },
      source: 'AccessibilityVisualizer'
    });

    return visualization;
  }

  /**
   * Create visual accessibility features
   */
  private createVisualAccessibilityFeatures(
    route: MultiModalRoute,
    options: AccessibilityVisualizationOptions
  ): VisualAccessibilityFeature[] {
    const features: VisualAccessibilityFeature[] = [];

    // Process route segments to extract accessibility features
    route.segments.forEach((segment, index) => {
      // Add wheelchair accessible feature
      if (segment.accessibility.wheelchairAccessible) {
        features.push(this.createFeature(
          AccessibilityFeature.WHEELCHAIR_ACCESSIBLE,
          this.calculateSegmentCenter(segment.geometry),
          true,
          0.9,
          options
        ));
      }

      // Add elevator feature
      if (segment.accessibility.hasElevator) {
        features.push(this.createFeature(
          AccessibilityFeature.HAS_ELEVATOR,
          this.calculateSegmentCenter(segment.geometry),
          true,
          0.9,
          options
        ));
      }

      // Add ramp feature
      if (segment.accessibility.hasRamp) {
        features.push(this.createFeature(
          AccessibilityFeature.HAS_RAMP,
          this.calculateSegmentCenter(segment.geometry),
          true,
          0.9,
          options
        ));
      }

      // Add tactile paving feature
      if (segment.accessibility.tactilePaving) {
        features.push(this.createFeature(
          AccessibilityFeature.TACTILE_PAVING,
          this.calculateSegmentCenter(segment.geometry),
          true,
          0.9,
          options
        ));
      }
    });

    // Process POIs to extract accessibility features
    route.waypoints.forEach(waypoint => {
      if (waypoint.properties.poiId) {
        // This would check the POI's accessibility features
        // For now, we'll just add some example features
        features.push(this.createFeature(
          AccessibilityFeature.ACCESSIBLE_RESTROOMS,
          waypoint.coordinate,
          Math.random() > 0.3, // 70% chance of having accessible restrooms
          0.8,
          options
        ));
      }
    });

    // Filter features by min accessibility score if specified
    if (options.minAccessibilityScore > 0) {
      return features.filter(feature => feature.confidence >= options.minAccessibilityScore);
    }

    return features;
  }

  /**
   * Create a visual accessibility feature
   */
  private createFeature(
    type: AccessibilityFeature,
    position: Coordinate,
    available: boolean,
    confidence: number,
    options: AccessibilityVisualizationOptions
  ): VisualAccessibilityFeature {
    const style = this.getFeatureStyle(type, available, confidence, options);

    return {
      id: `feature-${type}-${Date.now()}`,
      type,
      position,
      radius: 50, // 50 meters default radius
      available,
      confidence,
      style,
      description: this.getFeatureDescription(type, available)
    };
  }

  /**
   * Get feature style
   */
  private getFeatureStyle(
    type: AccessibilityFeature,
    available: boolean,
    confidence: number,
    options: AccessibilityVisualizationOptions
  ): VisualAccessibilityFeature['style'] {
    const baseColor = available ? '#4CAF50' : '#F44336';
    const opacity = 0.7 + (confidence * 0.3); // Higher confidence = more opaque

    return {
      icon: this.getFeatureIcon(type),
      size: 24,
      color: baseColor,
      borderColor: '#FFFFFF',
      borderWidth: 2,
      opacity,
      zIndex: 15
    };
  }

  /**
   * Get feature icon
   */
  private getFeatureIcon(type: AccessibilityFeature): string {
    const icons = {
      [AccessibilityFeature.WHEELCHAIR_ACCESSIBLE]: '♿',
      [AccessibilityFeature.HAS_ELEVATOR]: '🛗',
      [AccessibilityFeature.HAS_RAMP]: '📐',
      [AccessibilityFeature.TACTILE_PAVING]: '🦯',
      [AccessibilityFeature.AUDIO_SIGNALS]: '🔊',
      [AccessibilityFeature.VISUALLY_IMPAIRED_FRIENDLY]: '👁️',
      [AccessibilityFeature.HEARING_ASSISTANCE]: '👂',
      [AccessibilityFeature.ACCESSIBLE_RESTROOMS]: '🚻',
      [AccessibilityFeature.WHEELCHAIR_RENTAL]: '🦽',
      [AccessibilityFeature.QUIET_SPACE]: '🤫'
    };

    return icons[type] || '♿';
  }

  /**
   * Get feature description
   */
  private getFeatureDescription(type: AccessibilityFeature, available: boolean): string {
    const descriptions = {
      [AccessibilityFeature.WHEELCHAIR_ACCESSIBLE]: available 
        ? 'Wheelchair accessible' 
        : 'Not wheelchair accessible',
      [AccessibilityFeature.HAS_ELEVATOR]: available 
        ? 'Elevator available' 
        : 'No elevator',
      [AccessibilityFeature.HAS_RAMP]: available 
        ? 'Ramp available' 
        : 'No ramp',
      [AccessibilityFeature.TACTILE_PAVING]: available 
        ? 'Tactile paving available' 
        : 'No tactile paving',
      [AccessibilityFeature.AUDIO_SIGNALS]: available 
        ? 'Audio signals available' 
        : 'No audio signals',
      [AccessibilityFeature.VISUALLY_IMPAIRED_FRIENDLY]: available 
        ? 'Visually impaired friendly' 
        : 'Not visually impaired friendly',
      [AccessibilityFeature.HEARING_ASSISTANCE]: available 
        ? 'Hearing assistance available' 
        : 'No hearing assistance',
      [AccessibilityFeature.ACCESSIBLE_RESTROOMS]: available 
        ? 'Accessible restrooms available' 
        : 'No accessible restrooms',
      [AccessibilityFeature.WHEELCHAIR_RENTAL]: available 
        ? 'Wheelchair rental available' 
        : 'No wheelchair rental',
      [AccessibilityFeature.QUIET_SPACE]: available 
        ? 'Quiet space available' 
        : 'No quiet space'
    };

    return descriptions[type] || 'Accessibility feature';
  }

  /**
   * Create visual accessibility ratings
   */
  private createVisualAccessibilityRatings(
    route: MultiModalRoute,
    options: AccessibilityVisualizationOptions
  ): VisualAccessibilityRating[] {
    const ratings: VisualAccessibilityRating[] = [];

    // Create ratings for each waypoint
    route.waypoints.forEach((waypoint, index) => {
      const score = this.calculateAccessibilityScore(waypoint);
      const rating = this.getRatingFromScore(score);
      const features = this.getAccessibilityFeatures(waypoint);
      const availableCount = features.filter(f => this.isFeatureAvailable(f)).length;

      const style = this.getRatingStyle(rating, score, options);

      ratings.push({
        id: `rating-${index}`,
        position: waypoint.coordinate,
        rating,
        score,
        details: {
          features,
          availableCount,
          totalCount: features.length
        },
        style
      });
    });

    return ratings;
  }

  /**
   * Calculate accessibility score for a waypoint
   */
  private calculateAccessibilityScore(waypoint: any): number {
    // This would calculate the actual accessibility score based on the waypoint's features
    // For now, we'll return a random score between 0 and 1
    return Math.random();
  }

  /**
   * Get rating from score
   */
  private getRatingFromScore(score: number): AccessibilityRating {
    if (score < 0.25) {
      return AccessibilityRating.NOT_ACCESSIBLE;
    } else if (score < 0.5) {
      return AccessibilityRating.PARTIALLY_ACCESSIBLE;
    } else if (score < 0.75) {
      return AccessibilityRating.MOSTLY_ACCESSIBLE;
    } else {
      return AccessibilityRating.FULLY_ACCESSIBLE;
    }
  }

  /**
   * Get accessibility features for a waypoint
   */
  private getAccessibilityFeatures(waypoint: any): AccessibilityFeature[] {
    // This would return the actual accessibility features for the waypoint
    // For now, we'll return a random subset of features
    const allFeatures = Object.values(AccessibilityFeature);
    const featureCount = Math.floor(Math.random() * allFeatures.length);
    const features: AccessibilityFeature[] = [];

    for (let i = 0; i < featureCount; i++) {
      const randomIndex = Math.floor(Math.random() * allFeatures.length);
      features.push(allFeatures[randomIndex]);
    }

    return features;
  }

  /**
   * Check if a feature is available
   */
  private isFeatureAvailable(feature: AccessibilityFeature): boolean {
    // This would check if the feature is actually available
    // For now, we'll return a random boolean
    return Math.random() > 0.3; // 70% chance of being available
  }

  /**
   * Get rating style
   */
  private getRatingStyle(
    rating: AccessibilityRating,
    score: number,
    options: AccessibilityVisualizationOptions
  ): VisualAccessibilityRating['style'] {
    const colors = {
      [AccessibilityRating.NOT_ACCESSIBLE]: '#F44336',
      [AccessibilityRating.PARTIALLY_ACCESSIBLE]: '#FF9800',
      [AccessibilityRating.MOSTLY_ACCESSIBLE]: '#2196F3',
      [AccessibilityRating.FULLY_ACCESSIBLE]: '#4CAF50'
    };

    const opacity = 0.7 + (score * 0.3); // Higher score = more opaque

    return {
      icon: this.getRatingIcon(rating),
      size: 32,
      color: colors[rating],
      borderColor: '#FFFFFF',
      borderWidth: 2,
      opacity,
      zIndex: 12
    };
  }

  /**
   * Get rating icon
   */
  private getRatingIcon(rating: AccessibilityRating): string {
    const icons = {
      [AccessibilityRating.NOT_ACCESSIBLE]: '❌',
      [AccessibilityRating.PARTIALLY_ACCESSIBLE]: '⚠️',
      [AccessibilityRating.MOSTLY_ACCESSIBLE]: '✅',
      [AccessibilityRating.FULLY_ACCESSIBLE]: '✅'
    };

    return icons[rating] || '❓';
  }

  /**
   * Create visual accessible segments
   */
  private createVisualAccessibleSegments(
    route: MultiModalRoute,
    options: AccessibilityVisualizationOptions
  ): VisualAccessibleSegment[] {
    const segments: VisualAccessibleSegment[] = [];

    route.segments.forEach((segment, index) => {
      // Calculate accessibility score for the segment
      const score = this.calculateSegmentAccessibilityScore(segment);
      const rating = this.getRatingFromScore(score);
      const features = this.getSegmentAccessibilityFeatures(segment);

      // Only include segments that meet the minimum accessibility score
      if (score >= options.minAccessibilityScore) {
        const style = this.getSegmentStyle(rating, score, options);

        // Create accessibility issues
        const issues = this.createAccessibilityIssues(segment, features);

        segments.push({
          id: `accessible-segment-${index}`,
          segmentId: segment.id,
          geometry: segment.geometry,
          accessibility: {
            rating,
            score,
            features
          },
          style,
          issues
        });
      }
    });

    return segments;
  }

  /**
   * Calculate segment accessibility score
   */
  private calculateSegmentAccessibilityScore(segment: RouteSegment): number {
    let score = 0;
    let totalWeight = 0;

    // Weight each accessibility feature
    const weights = {
      wheelchairAccessible: 0.4,
      hasElevator: 0.2,
      hasRamp: 0.2,
      tactilePaving: 0.2
    };

    if (segment.accessibility.wheelchairAccessible) {
      score += weights.wheelchairAccessible;
    }
    totalWeight += weights.wheelchairAccessible;

    if (segment.accessibility.hasElevator) {
      score += weights.hasElevator;
    }
    totalWeight += weights.hasElevator;

    if (segment.accessibility.hasRamp) {
      score += weights.hasRamp;
    }
    totalWeight += weights.hasRamp;

    if (segment.accessibility.tactilePaving) {
      score += weights.tactilePaving;
    }
    totalWeight += weights.tactilePaving;

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  /**
   * Get segment accessibility features
   */
  private getSegmentAccessibilityFeatures(segment: RouteSegment): AccessibilityFeature[] {
    const features: AccessibilityFeature[] = [];

    if (segment.accessibility.wheelchairAccessible) {
      features.push(AccessibilityFeature.WHEELCHAIR_ACCESSIBLE);
    }
    if (segment.accessibility.hasElevator) {
      features.push(AccessibilityFeature.HAS_ELEVATOR);
    }
    if (segment.accessibility.hasRamp) {
      features.push(AccessibilityFeature.HAS_RAMP);
    }
    if (segment.accessibility.tactilePaving) {
      features.push(AccessibilityFeature.TACTILE_PAVING);
    }

    return features;
  }

  /**
   * Get segment style
   */
  private getSegmentStyle(
    rating: AccessibilityRating,
    score: number,
    options: AccessibilityVisualizationOptions
  ): VisualAccessibleSegment['style'] {
    const colors = {
      [AccessibilityRating.NOT_ACCESSIBLE]: '#F44336',
      [AccessibilityRating.PARTIALLY_ACCESSIBLE]: '#FF9800',
      [AccessibilityRating.MOSTLY_ACCESSIBLE]: '#2196F3',
      [AccessibilityRating.FULLY_ACCESSIBLE]: '#4CAF50'
    };

    const color = colors[rating];
    const opacity = 0.7 + (score * 0.3); // Higher score = more opaque

    let dashArray: number[] | undefined;
    if (options.highlightMode === 'pattern') {
      dashArray = rating === AccessibilityRating.FULLY_ACCESSIBLE 
        ? undefined 
        : [10, 5];
    }

    return {
      color,
      width: options.highlightMode === 'width' ? 4 + (score * 4) : 4,
      opacity,
      dashArray,
      zIndex: 5
    };
  }

  /**
   * Create accessibility issues
   */
  private createAccessibilityIssues(
    segment: RouteSegment,
    features: AccessibilityFeature[]
  ): VisualAccessibleSegment['issues'] {
    const issues: VisualAccessibleSegment['issues'] = [];

    // Check for missing accessibility features
    if (!features.includes(AccessibilityFeature.HAS_RAMP) && segment.mode !== TransportMode.WALKING) {
      issues.push({
        type: 'no_ramp',
        position: this.calculateSegmentCenter(segment.geometry),
        description: 'No ramp available for this segment'
      });
    }

    if (!features.includes(AccessibilityFeature.HAS_ELEVATOR) && segment.mode === TransportMode.METRO) {
      issues.push({
        type: 'no_elevator',
        position: this.calculateSegmentCenter(segment.geometry),
        description: 'No elevator available for this segment'
      });
    }

    // Add more issues based on segment properties
    if (Math.random() > 0.7) { // 30% chance of having a narrow path issue
      issues.push({
        type: 'narrow_path',
        position: this.calculateSegmentCenter(segment.geometry),
        description: 'Path may be too narrow for wheelchairs'
      });
    }

    if (Math.random() > 0.8) { // 20% chance of having a steep slope issue
      issues.push({
        type: 'steep_slope',
        position: this.calculateSegmentCenter(segment.geometry),
        description: 'Slope may be too steep for wheelchairs'
      });
    }

    if (Math.random() > 0.9) { // 10% chance of having an uneven surface issue
      issues.push({
        type: 'uneven_surface',
        position: this.calculateSegmentCenter(segment.geometry),
        description: 'Surface may be uneven for wheelchairs'
      });
    }

    return issues;
  }

  /**
   * Calculate segment center
   */
  private calculateSegmentCenter(geometry: Coordinate[]): Coordinate {
    const centerLat = geometry.reduce((sum, coord) => sum + coord.latitude, 0) / geometry.length;
    const centerLon = geometry.reduce((sum, coord) => sum + coord.longitude, 0) / geometry.length;
    
    return {
      latitude: centerLat,
      longitude: centerLon
    };
  }

  /**
   * Calculate bounds for route
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
   * Calculate center from bounds
   */
  private calculateCenter(bounds: { northEast: Coordinate; southWest: Coordinate }): Coordinate {
    return {
      latitude: (bounds.northEast.latitude + bounds.southWest.latitude) / 2,
      longitude: (bounds.northEast.longitude + bounds.southWest.longitude) / 2
    };
  }

  /**
   * Calculate zoom level from bounds
   */
  private calculateZoom(bounds: { northEast: Coordinate; southWest: Coordinate }): number {
    const latDiff = bounds.northEast.latitude - bounds.southWest.latitude;
    const lonDiff = bounds.northEast.longitude - bounds.southWest.longitude;
    const maxDiff = Math.max(latDiff, lonDiff);
    
    return Math.max(1, Math.min(18, Math.log2(360 / maxDiff)));
  }

  /**
   * Calculate overall accessibility score for route
   */
  private calculateOverallAccessibilityScore(route: MultiModalRoute): number {
    let totalScore = 0;
    let segmentCount = 0;

    route.segments.forEach(segment => {
      const score = this.calculateSegmentAccessibilityScore(segment);
      totalScore += score;
      segmentCount++;
    });

    return segmentCount > 0 ? totalScore / segmentCount : 0;
  }

  /**
   * Get current visualization
   */
  getCurrentVisualization(): AccessibilityVisualization | null {
    return this.currentVisualization;
  }

  /**
   * Get accessibility features by type
   */
  getFeaturesByType(type: AccessibilityFeature): VisualAccessibilityFeature[] {
    if (!this.currentVisualization) {
      return [];
    }

    return this.currentVisualization.features.filter(feature => feature.type === type);
  }

  /**
   * Get segments by accessibility rating
   */
  getSegmentsByRating(rating: AccessibilityRating): VisualAccessibleSegment[] {
    if (!this.currentVisualization) {
      return [];
    }

    return this.currentVisualization.segments.filter(segment => segment.accessibility.rating === rating);
  }

  /**
   * Get overall accessibility score
   */
  getOverallAccessibilityScore(): number | null {
    return this.currentVisualization?.metadata.overallAccessibilityScore || null;
  }

  /**
   * Get overall accessibility rating
   */
  getOverallAccessibilityRating(): AccessibilityRating | null {
    return this.currentVisualization?.metadata.overallRating || null;
  }

  /**
   * Add event listener
   */
  addEventListener(type: VisualizationEventType, handler: (event: VisualizationEvent) => void): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    
    this.eventListeners.get(type)!.push(handler);
  }

  /**
   * Remove event listener
   */
  removeEventListener(type: VisualizationEventType, handler: (event: VisualizationEvent) => void): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      const index = listeners.indexOf(handler);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  private emitEvent(event: VisualizationEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(handler => handler(event));
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.eventListeners.clear();
    this.currentVisualization = null;
  }
}