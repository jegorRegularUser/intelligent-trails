/**
 * Enhanced Visualization Manager implementation
 * Integrates all visualization components with the existing map to provide
 * a comprehensive route visualization system with real-time updates,
 * interactive features, and accessibility information.
 */

import {
  IVisualizationManager,
  VisualizationConfig,
  VisualizationTheme,
  VisualizationEvent,
  VisualizationEventType,
  RouteVisualization,
  RouteVisualizationOptions,
  RouteStatistics,
  TooltipConfig,
  PopupConfig,
  VisualRouteAdaptation
} from '../types/visualization';

import { MultiModalRoute, RouteSegment, RealTimeConditions } from '../types/routing';
import { PointOfInterest } from '../types/poi';
import { Coordinate, TransportMode } from '../types/graph';
import { RouteAdaptation } from '../types/adaptation';

import { EnhancedRouteVisualizer } from './EnhancedRouteVisualizer';
import { RealTimeConditionVisualizer } from './RealTimeConditionVisualizer';
import { POIEnhancedVisualizer } from './POIEnhancedVisualizer';
import { RouteInteractionManager } from './RouteInteractionManager';
import { DynamicAdaptationVisualizer } from './DynamicAdaptationVisualizer';
import { RouteStatisticsVisualizer } from './RouteStatisticsVisualizer';
import { RouteAnimationPlayer } from './RouteAnimationPlayer';
import { AccessibilityVisualizer } from './AccessibilityVisualizer';

/**
 * Visualization manager state
 */
export enum VisualizationManagerState {
  IDLE = 'idle',
  LOADING = 'loading',
  READY = 'ready',
  UPDATING = 'updating',
  ERROR = 'error'
}

/**
 * Visualization component status
 */
export interface VisualizationComponentStatus {
  enhancedRouteVisualizer: boolean;
  realTimeConditionVisualizer: boolean;
  poiEnhancedVisualizer: boolean;
  routeInteractionManager: boolean;
  dynamicAdaptationVisualizer: boolean;
  routeStatisticsVisualizer: boolean;
  routeAnimationPlayer: boolean;
  accessibilityVisualizer: boolean;
}

/**
 * Enhanced Visualization Manager class
 */
export class EnhancedVisualizationManager implements IVisualizationManager {
  private config: VisualizationConfig | null = null;
  private currentTheme: VisualizationTheme | null = null;
  private currentRoute: MultiModalRoute | null = null;
  private currentVisualization: RouteVisualization | null = null;
  private state: VisualizationManagerState = VisualizationManagerState.IDLE;
  private eventListeners: Map<VisualizationEventType, Function[]> = new Map();
  private componentStatus: VisualizationComponentStatus = {
    enhancedRouteVisualizer: false,
    realTimeConditionVisualizer: false,
    poiEnhancedVisualizer: false,
    routeInteractionManager: false,
    dynamicAdaptationVisualizer: false,
    routeStatisticsVisualizer: false,
    routeAnimationPlayer: false,
    accessibilityVisualizer: false
  };

  // Visualization components
  private enhancedRouteVisualizer: EnhancedRouteVisualizer | null = null;
  private realTimeConditionVisualizer: RealTimeConditionVisualizer | null = null;
  private poiEnhancedVisualizer: POIEnhancedVisualizer | null = null;
  private routeInteractionManager: RouteInteractionManager | null = null;
  private dynamicAdaptationVisualizer: DynamicAdaptationVisualizer | null = null;
  private routeStatisticsVisualizer: RouteStatisticsVisualizer | null = null;
  private routeAnimationPlayer: RouteAnimationPlayer | null = null;
  private accessibilityVisualizer: AccessibilityVisualizer | null = null;

  constructor() {
    // Initialize with default configuration
    this.initializeDefaultConfig();
  }

  /**
   * Initialize the visualization system
   */
  async initialize(config: VisualizationConfig): Promise<void> {
    try {
      this.setState(VisualizationManagerState.LOADING);
      this.config = config;

      // Set default theme
      this.currentTheme = config.themes.find(t => t.id === config.defaultTheme) || config.themes[0];

      // Initialize visualization components
      await this.initializeComponents();

      this.setState(VisualizationManagerState.READY);
      this.emitEvent({
        type: VisualizationEventType.INTERACTION,
        timestamp: new Date(),
        data: { action: 'initialized' },
        source: 'EnhancedVisualizationManager'
      });
    } catch (error) {
      this.setState(VisualizationManagerState.ERROR);
      throw error;
    }
  }

  /**
   * Initialize default configuration
   */
  private initializeDefaultConfig(): void {
    // This would create a default configuration if none is provided
    // For now, we'll just leave it as null
  }

  /**
   * Initialize visualization components
   */
  private async initializeComponents(): Promise<void> {
    if (!this.config || !this.currentTheme) {
      throw new Error('Configuration or theme not set');
    }

    // Initialize Enhanced Route Visualizer
    this.enhancedRouteVisualizer = new EnhancedRouteVisualizer(this.config);
    this.componentStatus.enhancedRouteVisualizer = true;

    // Initialize Real-Time Condition Visualizer
    this.realTimeConditionVisualizer = new RealTimeConditionVisualizer(this.currentTheme);
    this.componentStatus.realTimeConditionVisualizer = true;

    // Initialize POI Enhanced Visualizer
    this.poiEnhancedVisualizer = new POIEnhancedVisualizer(this.currentTheme);
    this.componentStatus.poiEnhancedVisualizer = true;

    // Initialize Route Interaction Manager
    this.routeInteractionManager = new RouteInteractionManager();
    this.componentStatus.routeInteractionManager = true;

    // Initialize Dynamic Adaptation Visualizer
    this.dynamicAdaptationVisualizer = new DynamicAdaptationVisualizer(this.currentTheme);
    this.componentStatus.dynamicAdaptationVisualizer = true;

    // Initialize Route Statistics Visualizer
    this.routeStatisticsVisualizer = new RouteStatisticsVisualizer(this.currentTheme);
    this.componentStatus.routeStatisticsVisualizer = true;

    // Initialize Route Animation Player
    this.routeAnimationPlayer = new RouteAnimationPlayer(this.currentTheme);
    this.componentStatus.routeAnimationPlayer = true;

    // Initialize Accessibility Visualizer
    this.accessibilityVisualizer = new AccessibilityVisualizer(this.currentTheme);
    this.componentStatus.accessibilityVisualizer = true;

    // Set up event listeners between components
    this.setupComponentEventListeners();
  }

  /**
   * Set up event listeners between components
   */
  private setupComponentEventListeners(): void {
    if (!this.enhancedRouteVisualizer || !this.routeInteractionManager || !this.routeAnimationPlayer) {
      return;
    }

    // Forward events from Enhanced Route Visualizer
    this.enhancedRouteVisualizer.addEventListener(VisualizationEventType.ROUTE_LOADED, (event) => {
      this.emitEvent(event);
    });

    // Forward events from Route Interaction Manager
    this.routeInteractionManager.addEventListener(VisualizationEventType.SEGMENT_SELECTED, (event) => {
      this.emitEvent(event);
    });

    this.routeInteractionManager.addEventListener(VisualizationEventType.POI_SELECTED, (event) => {
      this.emitEvent(event);
    });

    // Forward events from Route Animation Player
    this.routeAnimationPlayer.addEventListener(VisualizationEventType.ANIMATION_STARTED, (event) => {
      this.emitEvent(event);
    });

    this.routeAnimationPlayer.addEventListener(VisualizationEventType.ANIMATION_PAUSED, (event) => {
      this.emitEvent(event);
    });

    this.routeAnimationPlayer.addEventListener(VisualizationEventType.ANIMATION_COMPLETED, (event) => {
      this.emitEvent(event);
    });
  }

  /**
   * Load and visualize a route
   */
  async loadRoute(route: MultiModalRoute, options?: Partial<RouteVisualizationOptions>): Promise<RouteVisualization> {
    if (!this.enhancedRouteVisualizer) {
      throw new Error('Enhanced Route Visualizer not initialized');
    }

    try {
      this.setState(VisualizationManagerState.LOADING);
      this.currentRoute = route;

      // Create route visualization with Enhanced Route Visualizer
      const mergedOptions = { ...this.config?.options, ...options };
      this.currentVisualization = await this.enhancedRouteVisualizer.loadRoute(route, mergedOptions);

      // Update other visualization components
      this.updateVisualizationComponents(route, mergedOptions);

      this.setState(VisualizationManagerState.READY);
      this.emitEvent({
        type: VisualizationEventType.ROUTE_LOADED,
        timestamp: new Date(),
        data: { route, visualization: this.currentVisualization },
        source: 'EnhancedVisualizationManager'
      });

      return this.currentVisualization;
    } catch (error) {
      this.setState(VisualizationManagerState.ERROR);
      throw error;
    }
  }

  /**
   * Update visualization components with route data
   */
  private updateVisualizationComponents(route: MultiModalRoute, options: RouteVisualizationOptions): void {
    // Update POI Enhanced Visualizer
    if (this.poiEnhancedVisualizer && options.showPOIMarkers) {
      const pois = route.waypoints
        .filter(w => w.properties.poiId)
        .filter(w => w.properties.poiId)
        .map(w => {
          // Create a POI object from the waypoint
          return {
            id: w.properties.poiId || `poi-${w.name}`,
            name: w.name || `POI`,
            category: (w.properties.type as any) || 'default',
            coordinate: w.coordinate,
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
              description: w.name || `Point of interest`,
              images: []
            }
          };
        });
      
      if (pois.length > 0) {
        this.poiEnhancedVisualizer.createVisualization(pois, route.segments);
      }
    }

    // Update Route Statistics Visualizer
    if (this.routeStatisticsVisualizer) {
      this.routeStatisticsVisualizer.createVisualization(route);
    }

    // Update Accessibility Visualizer
    if (this.accessibilityVisualizer) {
      this.accessibilityVisualizer.createVisualization(route);
    }

    // Update Route Animation Player
    if (this.routeAnimationPlayer && options.animation.enabled) {
      this.routeAnimationPlayer.createVisualization(route, {
        duration: options.animation.duration,
        easing: options.animation.easing as any,
        loop: options.animation.loop,
        autoPlay: false
      });
    }
  }

  /**
   * Update visualization with real-time data
   */
  updateRealTimeData(conditions: RealTimeConditions): void {
    if (!this.realTimeConditionVisualizer || !this.currentVisualization) {
      return;
    }

    // Update Real-Time Condition Visualizer
    this.realTimeConditionVisualizer.createVisualization(conditions);

    // Update route segments with real-time data
    const updatedSegments = this.realTimeConditionVisualizer.updateSegmentStyles(
      this.currentVisualization.segments
    );

    // Update current visualization
    this.currentVisualization.segments = updatedSegments;

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { action: 'real_time_data_updated', conditions },
      source: 'EnhancedVisualizationManager'
    });
  }

  /**
   * Add an adaptation to the visualization
   */
  addAdaptation(adaptation: VisualRouteAdaptation): void {
    if (!this.currentVisualization) {
      return;
    }

    // Update current visualization with adaptations
    this.currentVisualization.adaptations.push(adaptation);

    this.emitEvent({
      type: VisualizationEventType.ADAPTATION_SELECTED,
      timestamp: new Date(),
      data: { adaptation },
      source: 'EnhancedVisualizationManager'
    });
  }

  /**
   * Start route animation
   */
  startAnimation(): void {
    if (!this.routeAnimationPlayer) {
      return;
    }

    this.routeAnimationPlayer.play();
  }

  /**
   * Pause route animation
   */
  pauseAnimation(): void {
    if (!this.routeAnimationPlayer) {
      return;
    }

    this.routeAnimationPlayer.pause();
  }

  /**
   * Resume route animation
   */
  resumeAnimation(): void {
    if (!this.routeAnimationPlayer) {
      return;
    }

    this.routeAnimationPlayer.play();
  }

  /**
   * Stop route animation
   */
  stopAnimation(): void {
    if (!this.routeAnimationPlayer) {
      return;
    }

    this.routeAnimationPlayer.stop();
  }

  /**
   * Set visualization theme
   */
  setTheme(themeId: string): void {
    if (!this.config) {
      return;
    }

    const theme = this.config.themes.find(t => t.id === themeId);
    if (!theme) {
      return;
    }

    this.currentTheme = theme;

    // Update all visualization components with the new theme
    if (this.enhancedRouteVisualizer) {
      this.enhancedRouteVisualizer.setTheme(themeId);
    }
    if (this.realTimeConditionVisualizer) {
      this.realTimeConditionVisualizer.setTheme(theme);
    }
    if (this.poiEnhancedVisualizer) {
      this.poiEnhancedVisualizer.setTheme(theme);
    }
    if (this.dynamicAdaptationVisualizer) {
      this.dynamicAdaptationVisualizer.setTheme(theme);
    }
    if (this.routeStatisticsVisualizer) {
      this.routeStatisticsVisualizer.setTheme(theme);
    }
    if (this.routeAnimationPlayer) {
      this.routeAnimationPlayer.setTheme(theme);
    }
    if (this.accessibilityVisualizer) {
      this.accessibilityVisualizer.setTheme(theme);
    }

    // If there's a current visualization, recreate it with the new theme
    if (this.currentRoute && this.currentVisualization) {
      this.loadRoute(this.currentRoute, this.currentVisualization.options);
    }

    this.emitEvent({
      type: VisualizationEventType.THEME_CHANGED,
      timestamp: new Date(),
      data: { themeId },
      source: 'EnhancedVisualizationManager'
    });
  }

  /**
   * Get current visualization statistics
   */
  getStatistics(): RouteStatistics {
    if (!this.routeStatisticsVisualizer || !this.currentRoute) {
      throw new Error('Route Statistics Visualizer not initialized or no route loaded');
    }

    const currentVisualization = this.routeStatisticsVisualizer.createVisualization(this.currentRoute);
    return currentVisualization.statistics || {
      totalDistance: 0,
      totalDuration: 0,
      totalCost: 0,
      walkingDistance: 0,
      cyclingDistance: 0,
      transitDistance: 0,
      drivingDistance: 0,
      transfers: 0,
      pois: {
        total: 0,
        visited: 0,
        required: 0,
        optional: 0
      },
      accessibility: {
        wheelchairAccessible: 0,
        hasElevator: 0,
        hasRamp: 0,
        tactilePaving: 0
      },
      conditions: {
        clearDistance: 0,
        slowDistance: 0,
        congestedDistance: 0,
        blockedDistance: 0
      },
      scores: {
        time: 0,
        cost: 0,
        accessibility: 0,
        comfort: 0,
        environmental: 0,
        overall: 0
      }
    };
  }

  /**
   * Get current visualization
   */
  getCurrentVisualization(): RouteVisualization | null {
    return this.currentVisualization;
  }

  /**
   * Get current route
   */
  getCurrentRoute(): MultiModalRoute | null {
    return this.currentRoute;
  }

  /**
   * Get current theme
   */
  getCurrentTheme(): VisualizationTheme | null {
    return this.currentTheme;
  }

  /**
   * Get visualization manager state
   */
  getState(): VisualizationManagerState {
    return this.state;
  }

  /**
   * Get component status
   */
  getComponentStatus(): VisualizationComponentStatus {
    return { ...this.componentStatus };
  }

  /**
   * Get Enhanced Route Visualizer
   */
  getEnhancedRouteVisualizer(): EnhancedRouteVisualizer | null {
    return this.enhancedRouteVisualizer;
  }

  /**
   * Get Real-Time Condition Visualizer
   */
  getRealTimeConditionVisualizer(): RealTimeConditionVisualizer | null {
    return this.realTimeConditionVisualizer;
  }

  /**
   * Get POI Enhanced Visualizer
   */
  getPOIEnhancedVisualizer(): POIEnhancedVisualizer | null {
    return this.poiEnhancedVisualizer;
  }

  /**
   * Get Route Interaction Manager
   */
  getRouteInteractionManager(): RouteInteractionManager | null {
    return this.routeInteractionManager;
  }

  /**
   * Get Dynamic Adaptation Visualizer
   */
  getDynamicAdaptationVisualizer(): DynamicAdaptationVisualizer | null {
    return this.dynamicAdaptationVisualizer;
  }

  /**
   * Get Route Statistics Visualizer
   */
  getRouteStatisticsVisualizer(): RouteStatisticsVisualizer | null {
    return this.routeStatisticsVisualizer;
  }

  /**
   * Get Route Animation Player
   */
  getRouteAnimationPlayer(): RouteAnimationPlayer | null {
    return this.routeAnimationPlayer;
  }

  /**
   * Get Accessibility Visualizer
   */
  getAccessibilityVisualizer(): AccessibilityVisualizer | null {
    return this.accessibilityVisualizer;
  }

  /**
   * Set visualization manager state
   */
  private setState(state: VisualizationManagerState): void {
    this.state = state;
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
    // Dispose all visualization components
    if (this.enhancedRouteVisualizer) {
      this.enhancedRouteVisualizer.dispose();
      this.enhancedRouteVisualizer = null;
    }
    if (this.realTimeConditionVisualizer) {
      this.realTimeConditionVisualizer.dispose();
      this.realTimeConditionVisualizer = null;
    }
    if (this.poiEnhancedVisualizer) {
      this.poiEnhancedVisualizer.dispose();
      this.poiEnhancedVisualizer = null;
    }
    if (this.routeInteractionManager) {
      this.routeInteractionManager.dispose();
      this.routeInteractionManager = null;
    }
    if (this.dynamicAdaptationVisualizer) {
      this.dynamicAdaptationVisualizer.dispose();
      this.dynamicAdaptationVisualizer = null;
    }
    if (this.routeStatisticsVisualizer) {
      this.routeStatisticsVisualizer.dispose();
      this.routeStatisticsVisualizer = null;
    }
    if (this.routeAnimationPlayer) {
      this.routeAnimationPlayer.dispose();
      this.routeAnimationPlayer = null;
    }
    if (this.accessibilityVisualizer) {
      this.accessibilityVisualizer.dispose();
      this.accessibilityVisualizer = null;
    }

    // Clear event listeners
    this.eventListeners.clear();

    // Reset state
    this.setState(VisualizationManagerState.IDLE);
    this.currentRoute = null;
    this.currentVisualization = null;
    this.currentTheme = null;
  }
}