/**
 * Enhanced Route Visualizer implementation
 * Handles advanced visualization of multi-modal routes with real-time conditions,
 * accessibility information, and interactive features.
 */

import {
  RouteVisualization,
  RouteVisualizationOptions,
  VisualRouteSegment,
  VisualPOIMarker,
  VisualTransferPoint,
  VisualRouteAdaptation,
  RouteStatistics,
  AnimationKeyframe,
  VisualizationTheme,
  VisualizationConfig,
  VisualizationEvent,
  VisualizationEventType,
  IVisualizationManager,
  TrafficCondition,
  InteractiveElement,
  InteractiveElementType,
  InteractiveAction,
  TooltipConfig,
  PopupConfig
} from '../types/visualization';

import { MultiModalRoute, RouteSegment, RealTimeConditions } from '../types/routing';
import { TransportMode } from '../types/graph';
import { Coordinate } from '../types/graph';
import { PointOfInterest } from '../types/poi';

/**
 * Default visualization configuration
 */
const DEFAULT_CONFIG: VisualizationConfig = {
  themes: [],
  defaultTheme: 'default',
  options: {
    showRouteSegments: true,
    showPOIMarkers: true,
    showTransfers: true,
    showRealTimeConditions: true,
    showAccessibilityInfo: true,
    colorByMode: true,
    colorByCondition: true,
    animateRoute: false,
    clusterNearbyPOIs: false,
    clusterRadius: 100,
    simplifyGeometry: false,
    simplifyTolerance: 10,
    interactive: true,
    animation: {
      enabled: false,
      duration: 5000,
      easing: 'linear',
      loop: false,
      speed: 1
    }
  },
  tooltip: {
    enabled: true,
    content: (element) => element.data.name || 'Route element',
    position: 'auto',
    offset: 10,
    delay: 200
  },
  popup: {
    enabled: true,
    content: (element) => `<div>${element.data.name || 'Route element'}</div>`,
    position: { latitude: 0, longitude: 0 },
    offset: 20,
    closeButton: true,
    draggable: false
  },
  interactions: {
    enabled: true,
    dragEnabled: true,
    scrollEnabled: true,
    doubleClickZoom: true,
    touchEnabled: true
  },
  performance: {
    simplifyGeometry: false,
    simplifyTolerance: 10,
    clusterPOIs: false,
    clusterRadius: 100,
    maxMarkers: 1000,
    maxSegments: 500
  }
};

/**
 * Enhanced Route Visualizer class
 */
export class EnhancedRouteVisualizer implements IVisualizationManager {
  private config: VisualizationConfig;
  private currentTheme: VisualizationTheme | null = null;
  private currentVisualization: RouteVisualization | null = null;
  private eventListeners: Map<VisualizationEventType, Function[]> = new Map();
  private animationState: {
    isPlaying: boolean;
    isPaused: boolean;
    currentTime: number;
    animationId: number | null;
  } = {
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    animationId: null
  };

  constructor(config?: Partial<VisualizationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeThemes();
  }

  /**
   * Initialize the visualization system
   */
  async initialize(config: VisualizationConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    this.initializeThemes();
    this.setTheme(config.defaultTheme);
    this.emitEvent({
      type: VisualizationEventType.ROUTE_LOADED,
      timestamp: new Date(),
      data: { initialized: true },
      source: 'EnhancedRouteVisualizer'
    });
  }

  /**
   * Initialize default themes
   */
  private initializeThemes(): void {
    // Default theme
    const defaultTheme: VisualizationTheme = {
      id: 'default',
      name: 'Default Theme',
      colors: {
        primary: '#2196F3',
        secondary: '#FFC107',
        background: '#FFFFFF',
        text: '#212529',
        highlight: '#FFEB3B',
        shadow: 'rgba(0, 0, 0, 0.2)'
      },
      transportModes: new Map([
        [TransportMode.WALKING, { color: '#4CAF50', width: 4, opacity: 0.8, zIndex: 5 }],
        [TransportMode.BICYCLE, { color: '#2196F3', width: 5, opacity: 0.8, zIndex: 5 }],
        [TransportMode.CAR, { color: '#F44336', width: 6, opacity: 0.8, zIndex: 5 }],
        [TransportMode.BUS, { color: '#FF9800', width: 6, opacity: 0.8, zIndex: 5 }],
        [TransportMode.METRO, { color: '#9C27B0', width: 6, opacity: 0.8, zIndex: 5 }],
        [TransportMode.TRAM, { color: '#00BCD4', width: 6, opacity: 0.8, zIndex: 5 }],
        [TransportMode.TRAIN, { color: '#607D8B', width: 6, opacity: 0.8, zIndex: 5 }],
        [TransportMode.FERRY, { color: '#009688', width: 6, opacity: 0.8, zIndex: 5 }]
      ]),
      trafficConditions: new Map([
        [TrafficCondition.UNKNOWN, { color: '#9E9E9E', width: 4, opacity: 0.6, zIndex: 4 }],
        [TrafficCondition.CLEAR, { color: '#4CAF50', width: 4, opacity: 0.8, zIndex: 4 }],
        [TrafficCondition.SLOW, { color: '#FFC107', width: 4, opacity: 0.8, zIndex: 4 }],
        [TrafficCondition.CONGESTED, { color: '#FF9800', width: 4, opacity: 0.8, zIndex: 4 }],
        [TrafficCondition.BLOCKED, { color: '#F44336', width: 4, opacity: 0.8, zIndex: 4 }]
      ]),
      poiCategories: new Map(),
      accessibility: {
        wheelchairAccessible: '#4CAF50',
        notWheelchairAccessible: '#F44336',
        hasElevator: '#2196F3',
        hasRamp: '#FFC107',
        tactilePaving: '#9C27B0'
      },
      transfers: {
        icon: 'transfer',
        size: 24,
        color: '#FFC107',
        borderColor: '#FFFFFF',
        borderWidth: 2,
        labelColor: '#212529',
        labelSize: 12,
        labelOffset: 8,
        opacity: 1,
        zIndex: 10
      },
      adaptations: {
        original: { color: '#F44336', width: 4, opacity: 0.5, zIndex: 3 },
        adapted: { color: '#4CAF50', width: 4, opacity: 0.8, zIndex: 3 }
      }
    };

    this.config.themes = [defaultTheme];
  }

  /**
   * Load and visualize a route
   */
  async loadRoute(route: MultiModalRoute, options?: Partial<RouteVisualizationOptions>): Promise<RouteVisualization> {
    const mergedOptions = { ...this.config.options, ...options };
    
    // Create visualization data
    const visualization: RouteVisualization = {
      id: route.id,
      route,
      segments: this.createVisualSegments(route, mergedOptions),
      poiMarkers: this.createVisualPOIMarkers(route, mergedOptions),
      transferPoints: this.createVisualTransferPoints(route, mergedOptions),
      adaptations: [],
      bounds: this.calculateBounds(route.geometry),
      center: this.calculateCenter(route.geometry),
      zoom: this.calculateZoom(route.geometry),
      options: mergedOptions,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0'
      }
    };

    this.currentVisualization = visualization;
    
    this.emitEvent({
      type: VisualizationEventType.ROUTE_LOADED,
      timestamp: new Date(),
      data: { routeId: route.id, visualization },
      source: 'EnhancedRouteVisualizer'
    });

    return visualization;
  }

  /**
   * Create visual route segments
   */
  private createVisualSegments(route: MultiModalRoute, options: RouteVisualizationOptions): VisualRouteSegment[] {
    return route.segments.map((segment, index) => {
      // Get base style from theme
      let style = this.currentTheme?.transportModes.get(segment.mode);
      if (!style) {
        style = { color: '#2196F3', width: 4, opacity: 0.8, zIndex: 5 };
      }

      // Adjust style based on conditions if enabled
      if (options.colorByCondition && segment.realTimeData) {
        const condition = this.getTrafficCondition(segment.realTimeData);
        const conditionStyle = this.currentTheme?.trafficConditions.get(condition);
        if (conditionStyle) {
          style = { ...style, ...conditionStyle };
        }
      }

      return {
        id: `segment-${index}`,
        geometry: segment.geometry,
        mode: segment.mode,
        style,
        condition: this.getTrafficCondition(segment.realTimeData),
        realTimeData: {
          speed: segment.realTimeData?.currentSpeed || 0,
          delay: segment.realTimeData?.delay || 0,
          congestionLevel: segment.realTimeData?.congestionLevel || 0
        },
        accessibility: {
          wheelchairAccessible: segment.accessibility.wheelchairAccessible,
          hasElevator: segment.accessibility.hasElevator,
          hasRamp: segment.accessibility.hasRamp,
          tactilePaving: segment.accessibility.tactilePaving
        },
        metadata: {
          streetName: segment.properties.routeName,
          distance: segment.distance,
          duration: segment.duration,
          instructions: segment.instructions[0]?.text
        }
      };
    });
  }

  /**
   * Create visual POI markers
   */
  private createVisualPOIMarkers(route: MultiModalRoute, options: RouteVisualizationOptions): VisualPOIMarker[] {
    return route.waypoints
      .filter(waypoint => waypoint.properties.poiId)
      .map((waypoint, index) => {
        // Get POI from the route or create a default one
        const poi: PointOfInterest = {
          id: waypoint.properties.poiId || `poi-${index}`,
          name: waypoint.name || `POI ${index + 1}`,
          category: (waypoint.properties.type as any) || 'default',
          coordinate: waypoint.coordinate,
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          },
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            verified: true,
            popularity: 1,
            tags: [],
            description: waypoint.name || `Point of interest ${index + 1}`,
            images: []
          }
        };

        // Get marker style from theme
        let style = this.currentTheme?.poiCategories.get(poi.category);
        if (!style) {
          style = {
            icon: 'poi',
            size: 32,
            color: this.currentTheme?.colors.primary || '#2196F3',
            borderColor: this.currentTheme?.colors.background || '#FFFFFF',
            borderWidth: 2,
            labelColor: this.currentTheme?.colors.text || '#212529',
            labelSize: 12,
            labelOffset: 8,
            opacity: 1,
            zIndex: 10
          };
        }

        return {
          id: `poi-${index}`,
          poi,
          position: waypoint.coordinate,
          style,
          order: index + 1,
          isVisited: true,
          isRequired: waypoint.isStop,
          label: poi.name,
          icon: style.icon
        };
      });
  }

  /**
   * Create visual transfer points
   */
  private createVisualTransferPoints(route: MultiModalRoute, options: RouteVisualizationOptions): VisualTransferPoint[] {
    const transferPoints: VisualTransferPoint[] = [];

    // Find transfer points between segments with different modes
    for (let i = 0; i < route.segments.length - 1; i++) {
      const currentSegment = route.segments[i];
      const nextSegment = route.segments[i + 1];

      if (currentSegment.mode !== nextSegment.mode) {
        const transferPoint: VisualTransferPoint = {
          id: `transfer-${i}`,
          position: currentSegment.toCoordinate,
          fromMode: currentSegment.mode,
          toMode: nextSegment.mode,
          style: this.currentTheme?.transfers || {
            icon: 'transfer',
            size: 24,
            color: '#FFC107',
            borderColor: '#FFFFFF',
            borderWidth: 2,
            labelColor: '#212529',
            labelSize: 12,
            labelOffset: 8,
            opacity: 1,
            zIndex: 10
          },
          waitingTime: 0, // Could be calculated from segment data
          instructions: `Transfer from ${currentSegment.mode} to ${nextSegment.mode}`
        };

        transferPoints.push(transferPoint);
      }
    }

    return transferPoints;
  }

  /**
   * Get traffic condition from real-time data
   */
  private getTrafficCondition(realTimeData?: any): TrafficCondition {
    if (!realTimeData) {
      return TrafficCondition.UNKNOWN;
    }

    const congestionLevel = realTimeData.congestionLevel || 0;
    
    if (congestionLevel === 0) {
      return TrafficCondition.CLEAR;
    } else if (congestionLevel < 0.3) {
      return TrafficCondition.SLOW;
    } else if (congestionLevel < 0.7) {
      return TrafficCondition.CONGESTED;
    } else {
      return TrafficCondition.BLOCKED;
    }
  }

  /**
   * Calculate bounds for geometry
   */
  private calculateBounds(geometry: Coordinate[]): { northEast: Coordinate; southWest: Coordinate } {
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
   * Calculate center from geometry
   */
  private calculateCenter(geometry: Coordinate[]): Coordinate {
    const bounds = this.calculateBounds(geometry);
    return {
      latitude: (bounds.northEast.latitude + bounds.southWest.latitude) / 2,
      longitude: (bounds.northEast.longitude + bounds.southWest.longitude) / 2
    };
  }

  /**
   * Calculate zoom level from geometry
   */
  private calculateZoom(geometry: Coordinate[]): number {
    const bounds = this.calculateBounds(geometry);
    const latDiff = bounds.northEast.latitude - bounds.southWest.latitude;
    const lonDiff = bounds.northEast.longitude - bounds.southWest.longitude;
    const maxDiff = Math.max(latDiff, lonDiff);
    
    // Simple zoom calculation based on maximum difference
    return Math.max(1, Math.min(18, Math.log2(360 / maxDiff)));
  }

  /**
   * Update visualization with real-time data
   */
  updateRealTimeData(conditions: RealTimeConditions): void {
    if (!this.currentVisualization) {
      return;
    }

    // Update segments with real-time data
    this.currentVisualization.segments = this.currentVisualization.segments.map(segment => {
      const conditionData = conditions.traffic.find(t => t.segmentId === segment.id);
      
      if (conditionData) {
        return {
          ...segment,
          condition: this.getTrafficCondition({
            congestionLevel: conditionData.delay > 0 ? 0.5 : 0,
            speed: conditionData.speed
          }),
          realTimeData: {
            speed: conditionData.speed,
            delay: conditionData.delay,
            congestionLevel: conditionData.delay > 0 ? 0.5 : 0
          }
        };
      }
      
      return segment;
    });

    this.currentVisualization.metadata.updatedAt = new Date();
  }

  /**
   * Add an adaptation to the visualization
   */
  addAdaptation(adaptation: VisualRouteAdaptation): void {
    if (!this.currentVisualization) {
      return;
    }

    this.currentVisualization.adaptations.push(adaptation);
    this.currentVisualization.metadata.updatedAt = new Date();
  }

  /**
   * Start route animation
   */
  startAnimation(): void {
    if (!this.currentVisualization || this.animationState.isPlaying) {
      return;
    }

    this.animationState.isPlaying = true;
    this.animationState.isPaused = false;
    this.animationState.currentTime = 0;

    this.emitEvent({
      type: VisualizationEventType.ANIMATION_STARTED,
      timestamp: new Date(),
      data: { routeId: this.currentVisualization.id },
      source: 'EnhancedRouteVisualizer'
    });

    this.animate();
  }

  /**
   * Animate the route
   */
  private animate(): void {
    if (!this.currentVisualization || !this.animationState.isPlaying) {
      return;
    }

    const duration = this.currentVisualization.options.animation.duration;
    const speed = this.currentVisualization.options.animation.speed;
    const increment = (16.67 * speed) / duration; // 60fps

    this.animationState.currentTime += increment;

    if (this.animationState.currentTime >= 1) {
      this.animationState.currentTime = 1;
      
      if (this.currentVisualization.options.animation.loop) {
        this.animationState.currentTime = 0;
      } else {
        this.stopAnimation();
        this.emitEvent({
          type: VisualizationEventType.ANIMATION_COMPLETED,
          timestamp: new Date(),
          data: { routeId: this.currentVisualization.id },
          source: 'EnhancedRouteVisualizer'
        });
        return;
      }
    }

    this.animationState.animationId = requestAnimationFrame(() => this.animate());
  }

  /**
   * Pause route animation
   */
  pauseAnimation(): void {
    if (!this.animationState.isPlaying || this.animationState.isPaused) {
      return;
    }

    this.animationState.isPaused = true;
    
    if (this.animationState.animationId) {
      cancelAnimationFrame(this.animationState.animationId);
      this.animationState.animationId = null;
    }

    this.emitEvent({
      type: VisualizationEventType.ANIMATION_PAUSED,
      timestamp: new Date(),
      data: { currentTime: this.animationState.currentTime },
      source: 'EnhancedRouteVisualizer'
    });
  }

  /**
   * Resume route animation
   */
  resumeAnimation(): void {
    if (!this.animationState.isPlaying || !this.animationState.isPaused) {
      return;
    }

    this.animationState.isPaused = false;
    
    this.emitEvent({
      type: VisualizationEventType.ANIMATION_RESUMED,
      timestamp: new Date(),
      data: { currentTime: this.animationState.currentTime },
      source: 'EnhancedRouteVisualizer'
    });

    this.animate();
  }

  /**
   * Stop route animation
   */
  stopAnimation(): void {
    this.animationState.isPlaying = false;
    this.animationState.isPaused = false;
    this.animationState.currentTime = 0;
    
    if (this.animationState.animationId) {
      cancelAnimationFrame(this.animationState.animationId);
      this.animationState.animationId = null;
    }
  }

  /**
   * Set visualization theme
   */
  setTheme(themeId: string): void {
    const theme = this.config.themes.find(t => t.id === themeId);
    if (!theme) {
      throw new Error(`Theme '${themeId}' not found`);
    }

    this.currentTheme = theme;
    
    this.emitEvent({
      type: VisualizationEventType.THEME_CHANGED,
      timestamp: new Date(),
      data: { themeId },
      source: 'EnhancedRouteVisualizer'
    });
  }

  /**
   * Get current visualization statistics
   */
  getStatistics(): RouteStatistics {
    if (!this.currentVisualization) {
      throw new Error('No route loaded');
    }

    const route = this.currentVisualization.route;
    const segments = this.currentVisualization.segments;

    // Calculate distances by mode
    const walkingDistance = segments
      .filter(s => s.mode === TransportMode.WALKING)
      .reduce((sum, s) => sum + s.metadata.distance, 0);

    const cyclingDistance = segments
      .filter(s => s.mode === TransportMode.BICYCLE)
      .reduce((sum, s) => sum + s.metadata.distance, 0);

    const transitDistance = segments
      .filter(s => [TransportMode.BUS, TransportMode.METRO, TransportMode.TRAM, TransportMode.TRAIN, TransportMode.FERRY].includes(s.mode))
      .reduce((sum, s) => sum + s.metadata.distance, 0);

    const drivingDistance = segments
      .filter(s => s.mode === TransportMode.CAR)
      .reduce((sum, s) => sum + s.metadata.distance, 0);

    // Calculate condition distances
    const clearDistance = segments
      .filter(s => s.condition === TrafficCondition.CLEAR)
      .reduce((sum, s) => sum + s.metadata.distance, 0);

    const slowDistance = segments
      .filter(s => s.condition === TrafficCondition.SLOW)
      .reduce((sum, s) => sum + s.metadata.distance, 0);

    const congestedDistance = segments
      .filter(s => s.condition === TrafficCondition.CONGESTED)
      .reduce((sum, s) => sum + s.metadata.distance, 0);

    const blockedDistance = segments
      .filter(s => s.condition === TrafficCondition.BLOCKED)
      .reduce((sum, s) => sum + s.metadata.distance, 0);

    // Calculate accessibility percentages
    const totalSegments = segments.length;
    const wheelchairAccessible = segments
      .filter(s => s.accessibility.wheelchairAccessible)
      .length / totalSegments;

    const hasElevator = segments
      .filter(s => s.accessibility.hasElevator)
      .length / totalSegments;

    const hasRamp = segments
      .filter(s => s.accessibility.hasRamp)
      .length / totalSegments;

    const tactilePaving = segments
      .filter(s => s.accessibility.tactilePaving)
      .length / totalSegments;

    return {
      totalDistance: route.totalDistance,
      totalDuration: route.totalDuration,
      totalCost: route.totalCost,
      walkingDistance,
      cyclingDistance,
      transitDistance,
      drivingDistance,
      transfers: route.totalTransfers,
      pois: {
        total: this.currentVisualization.poiMarkers.length,
        visited: this.currentVisualization.poiMarkers.filter(p => p.isVisited).length,
        required: this.currentVisualization.poiMarkers.filter(p => p.isRequired).length,
        optional: this.currentVisualization.poiMarkers.filter(p => !p.isRequired).length
      },
      accessibility: {
        wheelchairAccessible,
        hasElevator,
        hasRamp,
        tactilePaving
      },
      conditions: {
        clearDistance,
        slowDistance,
        congestedDistance,
        blockedDistance
      },
      scores: {
        time: route.safetyScore,
        cost: route.environmentalScore,
        accessibility: route.accessibilityScore,
        comfort: route.comfortScore,
        environmental: route.environmentalScore,
        overall: (route.safetyScore + route.accessibilityScore + route.comfortScore + route.environmentalScore) / 4
      }
    };
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
    this.currentTheme = null;
  }
}