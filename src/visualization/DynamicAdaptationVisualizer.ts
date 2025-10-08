/**
 * Dynamic Adaptation Visualizer implementation
 * Handles visualization of route adaptations, before/after comparisons,
 * adaptation reason annotations, and alternative route visualization options.
 */

import {
  VisualRouteAdaptation,
  VisualizationTheme,
  VisualizationEvent,
  VisualizationEventType,
  AnimationKeyframe
} from '../types/visualization';

import { AdaptedRoute, MultiModalRoute } from '../types/routing';
import { Coordinate } from '../types/graph';

/**
 * Adaptation visualization types
 */
export enum AdaptationVisualizationType {
  OVERLAY = 'overlay',
  SIDE_BY_SIDE = 'side_by_side',
  SPLIT_VIEW = 'split_view',
  ANIMATED_TRANSITION = 'animated_transition'
}

/**
 * Adaptation reason types
 */
export enum AdaptationReason {
  TRAFFIC = 'traffic',
  WEATHER = 'weather',
  CLOSURE = 'closure',
  ACCIDENT = 'accident',
  DELAY = 'delay',
  USER_PREFERENCE = 'user_preference',
  OPTIMIZATION = 'optimization',
  REAL_TIME_DATA = 'real_time_data'
}

/**
 * Adaptation impact levels
 */
export enum AdaptationImpact {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Visual representation of an adaptation annotation
 */
export interface AdaptationAnnotation {
  id: string;
  position: Coordinate;
  type: 'reason' | 'impact' | 'instruction' | 'warning';
  title: string;
  content: string;
  icon: string;
  style: {
    color: string;
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    fontSize: number;
    opacity: number;
    zIndex: number;
  };
}

/**
 * Visual representation of an adaptation comparison
 */
export interface AdaptationComparison {
  id: string;
  originalRoute: MultiModalRoute;
  adaptedRoute: MultiModalRoute;
  type: AdaptationVisualizationType;
  metrics: {
    timeDifference: number; // in seconds
    distanceDifference: number; // in meters
    costDifference: number; // monetary
    accessibilityDifference: number; // 0-1
  };
  annotations: AdaptationAnnotation[];
}

/**
 * Adaptation visualization options
 */
export interface AdaptationVisualizationOptions {
  showOriginalRoute: boolean;
  showAdaptedRoute: boolean;
  showAnnotations: boolean;
  showMetrics: boolean;
  animationDuration: number; // in milliseconds
  visualizationType: AdaptationVisualizationType;
  highlightChanges: boolean;
  showAlternativeRoutes: boolean;
  autoPlay: boolean;
  loopAnimation: boolean;
}

/**
 * Adaptation visualization data
 */
export interface AdaptationVisualization {
  id: string;
  comparison: AdaptationComparison;
  adaptations: VisualRouteAdaptation[];
  alternativeRoutes: MultiModalRoute[];
  bounds: {
    northEast: Coordinate;
    southWest: Coordinate;
  };
  center: Coordinate;
  zoom: number;
  options: AdaptationVisualizationOptions;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    totalAdaptations: number;
    adaptationReasons: AdaptationReason[];
  };
}

/**
 * Dynamic Adaptation Visualizer class
 */
export class DynamicAdaptationVisualizer {
  private currentVisualization: AdaptationVisualization | null = null;
  private theme: VisualizationTheme | null = null;
  private eventListeners: Map<VisualizationEventType, Function[]> = new Map();
  private animationFrame: number | null = null;
  private animationProgress: number = 0;

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
   * Create adaptation visualization from adapted route data
   */
  createVisualization(
    adaptedRoute: AdaptedRoute,
    alternativeRoutes: MultiModalRoute[] = [],
    options?: Partial<AdaptationVisualizationOptions>
  ): AdaptationVisualization {
    const mergedOptions: AdaptationVisualizationOptions = {
      showOriginalRoute: true,
      showAdaptedRoute: true,
      showAnnotations: true,
      showMetrics: true,
      animationDuration: 2000,
      visualizationType: AdaptationVisualizationType.OVERLAY,
      highlightChanges: true,
      showAlternativeRoutes: true,
      autoPlay: false,
      loopAnimation: false,
      ...options
    };

    // Create comparison data
    const comparison = this.createComparison(adaptedRoute);

    // Create visual adaptations
    const adaptations = this.createVisualAdaptations(adaptedRoute);

    // Calculate bounds and center
    const bounds = this.calculateBounds(
      adaptedRoute.originalRoute.geometry,
      adaptedRoute.adaptedRoute.geometry
    );
    const center = this.calculateCenter(bounds);
    const zoom = this.calculateZoom(bounds);

    const visualization: AdaptationVisualization = {
      id: `adaptation-viz-${Date.now()}`,
      comparison,
      adaptations,
      alternativeRoutes,
      bounds,
      center,
      zoom,
      options: mergedOptions,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        totalAdaptations: adaptations.length,
        adaptationReasons: this.extractAdaptationReasons(adaptations)
      }
    };

    this.currentVisualization = visualization;

    // Start animation if auto-play is enabled
    if (mergedOptions.autoPlay) {
      this.startAnimation();
    }

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { visualization },
      source: 'DynamicAdaptationVisualizer'
    });

    return visualization;
  }

  /**
   * Create comparison data
   */
  private createComparison(adaptedRoute: AdaptedRoute): AdaptationComparison {
    const metrics = {
      timeDifference: adaptedRoute.adaptedRoute.totalDuration - adaptedRoute.originalRoute.totalDuration,
      distanceDifference: adaptedRoute.adaptedRoute.totalDistance - adaptedRoute.originalRoute.totalDistance,
      costDifference: adaptedRoute.adaptedRoute.totalCost - adaptedRoute.originalRoute.totalCost,
      accessibilityDifference: adaptedRoute.adaptedRoute.accessibilityScore - adaptedRoute.originalRoute.accessibilityScore
    };

    const annotations = this.createAnnotations(adaptedRoute);

    return {
      id: `comparison-${Date.now()}`,
      originalRoute: adaptedRoute.originalRoute,
      adaptedRoute: adaptedRoute.adaptedRoute,
      type: AdaptationVisualizationType.OVERLAY,
      metrics,
      annotations
    };
  }

  /**
   * Create visual adaptations
   */
  private createVisualAdaptations(adaptedRoute: AdaptedRoute): VisualRouteAdaptation[] {
    const adaptations: VisualRouteAdaptation[] = [];

    // Create a visual adaptation for the overall route change
    const overallAdaptation: VisualRouteAdaptation = {
      id: `adaptation-overall-${Date.now()}`,
      type: 'reroute',
      position: this.calculateRouteCenter(adaptedRoute.originalRoute.geometry),
      originalGeometry: adaptedRoute.originalRoute.geometry,
      adaptedGeometry: adaptedRoute.adaptedRoute.geometry,
      reason: adaptedRoute.adaptationReason,
      confidence: adaptedRoute.confidence,
      timestamp: adaptedRoute.adaptationTime,
      style: {
        original: this.theme?.adaptations.original || {
          color: '#F44336',
          width: 4,
          opacity: 0.5,
          zIndex: 3
        },
        adapted: this.theme?.adaptations.adapted || {
          color: '#4CAF50',
          width: 4,
          opacity: 0.8,
          zIndex: 3
        }
      }
    };

    adaptations.push(overallAdaptation);

    // Create adaptations for specific segment changes
    // This would require more detailed comparison of the routes
    // For now, we'll just add the overall adaptation

    return adaptations;
  }

  /**
   * Create annotations for the adaptation
   */
  private createAnnotations(adaptedRoute: AdaptedRoute): AdaptationAnnotation[] {
    const annotations: AdaptationAnnotation[] = [];

    // Add reason annotation
    const reasonAnnotation: AdaptationAnnotation = {
      id: `annotation-reason-${Date.now()}`,
      position: this.calculateRouteCenter(adaptedRoute.originalRoute.geometry),
      type: 'reason',
      title: 'Adaptation Reason',
      content: adaptedRoute.adaptationReason,
      icon: 'ℹ️',
      style: {
        color: '#212529',
        backgroundColor: '#FFFFFF',
        borderColor: '#2196F3',
        borderWidth: 2,
        fontSize: 14,
        opacity: 0.9,
        zIndex: 20
      }
    };

    annotations.push(reasonAnnotation);

    // Add impact annotation
    const impactLevel = this.calculateImpactLevel(adaptedRoute);
    const impactAnnotation: AdaptationAnnotation = {
      id: `annotation-impact-${Date.now()}`,
      position: this.calculateRouteCenter(adaptedRoute.adaptedRoute.geometry),
      type: 'impact',
      title: 'Impact',
      content: `This adaptation has a ${impactLevel} impact on your route.`,
      icon: this.getImpactIcon(impactLevel),
      style: {
        color: '#212529',
        backgroundColor: this.getImpactColor(impactLevel),
        borderColor: '#FFFFFF',
        borderWidth: 2,
        fontSize: 14,
        opacity: 0.9,
        zIndex: 20
      }
    };

    annotations.push(impactAnnotation);

    // Add metrics annotation
    const metricsAnnotation: AdaptationAnnotation = {
      id: `annotation-metrics-${Date.now()}`,
      position: this.calculateRouteCenter(adaptedRoute.adaptedRoute.geometry),
      type: 'instruction',
      title: 'Route Changes',
      content: this.createMetricsContent(adaptedRoute),
      icon: '📊',
      style: {
        color: '#212529',
        backgroundColor: '#E3F2FD',
        borderColor: '#2196F3',
        borderWidth: 2,
        fontSize: 14,
        opacity: 0.9,
        zIndex: 20
      }
    };

    annotations.push(metricsAnnotation);

    return annotations;
  }

  /**
   * Calculate impact level
   */
  private calculateImpactLevel(adaptedRoute: AdaptedRoute): AdaptationImpact {
    const timeImpact = Math.abs(adaptedRoute.changes.timeDifference);
    const costImpact = Math.abs(adaptedRoute.changes.costDifference);

    // Calculate a combined impact score
    const impactScore = (timeImpact / 300) + (costImpact / 10);

    if (impactScore < 0.3) {
      return AdaptationImpact.LOW;
    } else if (impactScore < 0.6) {
      return AdaptationImpact.MEDIUM;
    } else if (impactScore < 0.9) {
      return AdaptationImpact.HIGH;
    } else {
      return AdaptationImpact.CRITICAL;
    }
  }

  /**
   * Get impact icon
   */
  private getImpactIcon(impact: AdaptationImpact): string {
    const icons = {
      [AdaptationImpact.LOW]: '✅',
      [AdaptationImpact.MEDIUM]: '⚠️',
      [AdaptationImpact.HIGH]: '🔴',
      [AdaptationImpact.CRITICAL]: '🚨'
    };

    return icons[impact] || 'ℹ️';
  }

  /**
   * Get impact color
   */
  private getImpactColor(impact: AdaptationImpact): string {
    const colors = {
      [AdaptationImpact.LOW]: '#E8F5E9',
      [AdaptationImpact.MEDIUM]: '#FFF8E1',
      [AdaptationImpact.HIGH]: '#FFEBEE',
      [AdaptationImpact.CRITICAL]: '#FFCDD2'
    };

    return colors[impact] || '#E3F2FD';
  }

  /**
   * Create metrics content
   */
  private createMetricsContent(adaptedRoute: AdaptedRoute): string {
    const timeDiff = adaptedRoute.changes.timeDifference;
    const costDiff = adaptedRoute.changes.costDifference;

    let content = '';

    if (timeDiff !== 0) {
      const timeSign = timeDiff > 0 ? '+' : '';
      content += `Time: ${timeSign}${Math.floor(timeDiff / 60)} min<br>`;
    }

    if (costDiff !== 0) {
      const costSign = costDiff > 0 ? '+' : '';
      content += `Cost: ${costSign}${costDiff.toFixed(2)}`;
    }

    return content || 'No significant changes to route metrics.';
  }

  /**
   * Calculate route center
   */
  private calculateRouteCenter(geometry: Coordinate[]): Coordinate {
    const centerLat = geometry.reduce((sum, coord) => sum + coord.latitude, 0) / geometry.length;
    const centerLon = geometry.reduce((sum, coord) => sum + coord.longitude, 0) / geometry.length;
    
    return {
      latitude: centerLat,
      longitude: centerLon
    };
  }

  /**
   * Calculate bounds for multiple routes
   */
  private calculateBounds(...geometries: Coordinate[][]): { northEast: Coordinate; southWest: Coordinate } {
    if (geometries.length === 0 || geometries[0].length === 0) {
      return {
        northEast: { latitude: 0, longitude: 0 },
        southWest: { latitude: 0, longitude: 0 }
      };
    }

    let minLat = geometries[0][0].latitude;
    let maxLat = geometries[0][0].latitude;
    let minLon = geometries[0][0].longitude;
    let maxLon = geometries[0][0].longitude;
    
    for (const geometry of geometries) {
      for (const coord of geometry) {
        minLat = Math.min(minLat, coord.latitude);
        maxLat = Math.max(maxLat, coord.latitude);
        minLon = Math.min(minLon, coord.longitude);
        maxLon = Math.max(maxLon, coord.longitude);
      }
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
   * Extract adaptation reasons from adaptations
   */
  private extractAdaptationReasons(adaptations: VisualRouteAdaptation[]): AdaptationReason[] {
    const reasons = new Set<AdaptationReason>();

    adaptations.forEach(adaptation => {
      // Extract reason from adaptation text
      const reasonText = adaptation.reason.toLowerCase();
      
      if (reasonText.includes('traffic')) {
        reasons.add(AdaptationReason.TRAFFIC);
      }
      if (reasonText.includes('weather')) {
        reasons.add(AdaptationReason.WEATHER);
      }
      if (reasonText.includes('closure') || reasonText.includes('closed')) {
        reasons.add(AdaptationReason.CLOSURE);
      }
      if (reasonText.includes('accident')) {
        reasons.add(AdaptationReason.ACCIDENT);
      }
      if (reasonText.includes('delay')) {
        reasons.add(AdaptationReason.DELAY);
      }
      if (reasonText.includes('preference')) {
        reasons.add(AdaptationReason.USER_PREFERENCE);
      }
      if (reasonText.includes('optimization')) {
        reasons.add(AdaptationReason.OPTIMIZATION);
      }
      if (reasonText.includes('real-time') || reasonText.includes('realtime')) {
        reasons.add(AdaptationReason.REAL_TIME_DATA);
      }
    });

    return Array.from(reasons);
  }

  /**
   * Start animation
   */
  startAnimation(): void {
    if (!this.currentVisualization || !this.currentVisualization.options.animationDuration) {
      return;
    }

    this.animationProgress = 0;
    const startTime = Date.now();
    const duration = this.currentVisualization.options.animationDuration;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      this.animationProgress = Math.min(elapsed / duration, 1);

      this.emitEvent({
        type: VisualizationEventType.INTERACTION,
        timestamp: new Date(),
        data: { 
          action: 'animation_progress', 
          progress: this.animationProgress 
        },
        source: 'DynamicAdaptationVisualizer'
      });

      if (this.animationProgress < 1) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        if (this.currentVisualization?.options.loopAnimation) {
          this.startAnimation();
        } else {
          this.stopAnimation();
        }
      }
    };

    animate();
  }

  /**
   * Stop animation
   */
  stopAnimation(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { action: 'animation_stopped' },
      source: 'DynamicAdaptationVisualizer'
    });
  }

  /**
   * Get animation progress
   */
  getAnimationProgress(): number {
    return this.animationProgress;
  }

  /**
   * Get current visualization
   */
  getCurrentVisualization(): AdaptationVisualization | null {
    return this.currentVisualization;
  }

  /**
   * Get adaptation annotations
   */
  getAnnotations(): AdaptationAnnotation[] {
    return this.currentVisualization?.comparison.annotations || [];
  }

  /**
   * Get comparison metrics
   */
  getComparisonMetrics() {
    return this.currentVisualization?.comparison.metrics;
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
    this.stopAnimation();
    this.eventListeners.clear();
    this.currentVisualization = null;
  }
}