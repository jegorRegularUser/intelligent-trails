/**
 * Visualization types for enhanced route visualization
 */

import { Coordinate, TransportMode } from './graph';
import { MultiModalRoute, RouteSegment, RealTimeConditions } from './routing';
import { PointOfInterest } from './poi';

/**
 * Visual style configuration for route elements
 */
export interface VisualStyle {
  color: string;
  width: number;
  opacity: number;
  dashArray?: number[];
  zIndex: number;
}

/**
 * Marker style configuration
 */
export interface MarkerStyle {
  icon: string;
  size: number;
  color: string;
  borderColor: string;
  borderWidth: number;
  labelColor: string;
  labelSize: number;
  labelOffset: number;
  opacity: number;
  zIndex: number;
}

/**
 * Animation configuration
 */
export interface AnimationConfig {
  enabled: boolean;
  duration: number; // in milliseconds
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  loop: boolean;
  speed: number; // multiplier for animation speed
}

/**
 * Visualization options for route display
 */
export interface RouteVisualizationOptions {
  showRouteSegments: boolean;
  showPOIMarkers: boolean;
  showTransfers: boolean;
  showRealTimeConditions: boolean;
  showAccessibilityInfo: boolean;
  colorByMode: boolean;
  colorByCondition: boolean;
  animateRoute: boolean;
  clusterNearbyPOIs: boolean;
  clusterRadius: number; // in meters
  simplifyGeometry: boolean;
  simplifyTolerance: number; // in meters
  interactive: boolean;
  animation: AnimationConfig;
}

/**
 * Traffic condition levels
 */
export enum TrafficCondition {
  UNKNOWN = 'unknown',
  CLEAR = 'clear',
  SLOW = 'slow',
  CONGESTED = 'congested',
  BLOCKED = 'blocked'
}

/**
 * Visual representation of a route segment
 */
export interface VisualRouteSegment {
  id: string;
  geometry: Coordinate[];
  mode: TransportMode;
  style: VisualStyle;
  condition: TrafficCondition;
  realTimeData?: {
    speed: number;
    delay: number;
    congestionLevel: number;
  };
  accessibility: {
    wheelchairAccessible: boolean;
    hasElevator: boolean;
    hasRamp: boolean;
    tactilePaving: boolean;
  };
  metadata: {
    streetName?: string;
    distance: number;
    duration: number;
    instructions?: string;
  };
}

/**
 * Visual representation of a POI marker
 */
export interface VisualPOIMarker {
  id: string;
  poi: PointOfInterest;
  position: Coordinate;
  style: MarkerStyle;
  order: number;
  isVisited: boolean;
  isRequired: boolean;
  label: string;
  icon: string;
  clusterId?: string;
  connectionLines?: {
    toSegmentId: string;
    style: VisualStyle;
  }[];
}

/**
 * Visual representation of a transfer point
 */
export interface VisualTransferPoint {
  id: string;
  position: Coordinate;
  fromMode: TransportMode;
  toMode: TransportMode;
  style: MarkerStyle;
  waitingTime: number;
  instructions: string;
}

/**
 * Visual representation of a route adaptation
 */
export interface VisualRouteAdaptation {
  id: string;
  type: 'reroute' | 'mode_change' | 'poi_addition' | 'poi_removal' | 'timing_adjustment';
  position: Coordinate;
  originalGeometry: Coordinate[];
  adaptedGeometry: Coordinate[];
  reason: string;
  confidence: number;
  timestamp: Date;
  style: {
    original: VisualStyle;
    adapted: VisualStyle;
  };
}

/**
 * Complete visualization data for a route
 */
export interface RouteVisualization {
  id: string;
  route: MultiModalRoute;
  segments: VisualRouteSegment[];
  poiMarkers: VisualPOIMarker[];
  transferPoints: VisualTransferPoint[];
  adaptations: VisualRouteAdaptation[];
  bounds: {
    northEast: Coordinate;
    southWest: Coordinate;
  };
  center: Coordinate;
  zoom: number;
  options: RouteVisualizationOptions;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    version: string;
  };
}

/**
 * Statistics for route visualization
 */
export interface RouteStatistics {
  totalDistance: number; // in meters
  totalDuration: number; // in seconds
  totalCost: number; // monetary
  walkingDistance: number; // in meters
  cyclingDistance: number; // in meters
  transitDistance: number; // in meters
  drivingDistance: number; // in meters
  transfers: number;
  pois: {
    total: number;
    visited: number;
    required: number;
    optional: number;
  };
  accessibility: {
    wheelchairAccessible: number; // percentage
    hasElevator: number; // percentage
    hasRamp: number; // percentage
    tactilePaving: number; // percentage
  };
  conditions: {
    clearDistance: number; // in meters
    slowDistance: number; // in meters
    congestedDistance: number; // in meters
    blockedDistance: number; // in meters
  };
  scores: {
    time: number; // 0-1
    cost: number; // 0-1
    accessibility: number; // 0-1
    comfort: number; // 0-1
    environmental: number; // 0-1
    overall: number; // 0-1
  };
}

/**
 * Animation keyframe for route playback
 */
export interface AnimationKeyframe {
  time: number; // 0-1
  position: Coordinate;
  segmentId: string;
  segmentProgress: number; // 0-1
  poi?: PointOfInterest;
  speed: number; // current speed
  heading: number; // in degrees
}

/**
 * Interactive element types
 */
export enum InteractiveElementType {
  ROUTE_SEGMENT = 'route_segment',
  POI_MARKER = 'poi_marker',
  TRANSFER_POINT = 'transfer_point',
  ADAPTATION_POINT = 'adaptation_point'
}

/**
 * Interactive element data
 */
export interface InteractiveElement {
  id: string;
  type: InteractiveElementType;
  position: Coordinate;
  bounds: {
    northEast: Coordinate;
    southWest: Coordinate;
  };
  data: any; // type-specific data
  actions: InteractiveAction[];
}

/**
 * Interactive action types
 */
export enum InteractiveActionType {
  SELECT = 'select',
  HOVER = 'hover',
  CONTEXT_MENU = 'context_menu',
  DRAG = 'drag',
  CLICK = 'click',
  DOUBLE_CLICK = 'double_click'
}

/**
 * Interactive action configuration
 */
export interface InteractiveAction {
  type: InteractiveActionType;
  handler: (element: InteractiveElement, event: any) => void;
  tooltip?: string;
  contextMenu?: ContextMenuItem[];
}

/**
 * Context menu item
 */
export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  submenu?: ContextMenuItem[];
  action: () => void;
}

/**
 * Tooltip configuration
 */
export interface TooltipConfig {
  enabled: boolean;
  content: (element: InteractiveElement) => string | JSX.Element;
  position: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  offset: number;
  delay: number; // in milliseconds
}

/**
 * Popup configuration
 */
export interface PopupConfig {
  enabled: boolean;
  content: (element: InteractiveElement) => string | JSX.Element;
  position: Coordinate;
  offset: number;
  closeButton: boolean;
  draggable: boolean;
}

/**
 * Theme configuration for visualization
 */
export interface VisualizationTheme {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    highlight: string;
    shadow: string;
  };
  transportModes: Map<TransportMode, VisualStyle>;
  trafficConditions: Map<TrafficCondition, VisualStyle>;
  poiCategories: Map<string, MarkerStyle>;
  accessibility: {
    wheelchairAccessible: string;
    notWheelchairAccessible: string;
    hasElevator: string;
    hasRamp: string;
    tactilePaving: string;
  };
  transfers: MarkerStyle;
  adaptations: {
    original: VisualStyle;
    adapted: VisualStyle;
  };
}

/**
 * Visualization event types
 */
export enum VisualizationEventType {
  ROUTE_LOADED = 'route_loaded',
  SEGMENT_SELECTED = 'segment_selected',
  POI_SELECTED = 'poi_selected',
  TRANSFER_SELECTED = 'transfer_selected',
  ADAPTATION_SELECTED = 'adaptation_selected',
  ANIMATION_STARTED = 'animation_started',
  ANIMATION_PAUSED = 'animation_paused',
  ANIMATION_RESUMED = 'animation_resumed',
  ANIMATION_COMPLETED = 'animation_completed',
  THEME_CHANGED = 'theme_changed',
  VIEWPORT_CHANGED = 'viewport_changed',
  INTERACTION = 'interaction'
}

/**
 * Visualization event data
 */
export interface VisualizationEvent {
  type: VisualizationEventType;
  timestamp: Date;
  data: any;
  source: string;
}

/**
 * Visualization configuration
 */
export interface VisualizationConfig {
  themes: VisualizationTheme[];
  defaultTheme: string;
  options: RouteVisualizationOptions;
  tooltip: TooltipConfig;
  popup: PopupConfig;
  interactions: {
    enabled: boolean;
    dragEnabled: boolean;
    scrollEnabled: boolean;
    doubleClickZoom: boolean;
    touchEnabled: boolean;
  };
  performance: {
    simplifyGeometry: boolean;
    simplifyTolerance: number;
    clusterPOIs: boolean;
    clusterRadius: number;
    maxMarkers: number;
    maxSegments: number;
  };
}

/**
 * Visualization manager interface
 */
export interface IVisualizationManager {
  /**
   * Initialize the visualization system
   */
  initialize(config: VisualizationConfig): Promise<void>;

  /**
   * Load and visualize a route
   */
  loadRoute(route: MultiModalRoute, options?: Partial<RouteVisualizationOptions>): Promise<RouteVisualization>;

  /**
   * Update visualization with real-time data
   */
  updateRealTimeData(conditions: RealTimeConditions): void;

  /**
   * Add an adaptation to the visualization
   */
  addAdaptation(adaptation: VisualRouteAdaptation): void;

  /**
   * Start route animation
   */
  startAnimation(): void;

  /**
   * Pause route animation
   */
  pauseAnimation(): void;

  /**
   * Resume route animation
   */
  resumeAnimation(): void;

  /**
   * Stop route animation
   */
  stopAnimation(): void;

  /**
   * Set visualization theme
   */
  setTheme(themeId: string): void;

  /**
   * Get current visualization statistics
   */
  getStatistics(): RouteStatistics;

  /**
   * Add event listener
   */
  addEventListener(type: VisualizationEventType, handler: (event: VisualizationEvent) => void): void;

  /**
   * Remove event listener
   */
  removeEventListener(type: VisualizationEventType, handler: (event: VisualizationEvent) => void): void;

  /**
   * Clean up resources
   */
  dispose(): void;
}