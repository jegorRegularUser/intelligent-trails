/**
 * Route Interaction Manager implementation
 * Handles interactive features for route visualization including segment selection,
 * hover information, action menus, and comparison tools.
 */

import {
  InteractiveElement,
  InteractiveElementType,
  InteractiveActionType,
  InteractiveAction,
  ContextMenuItem,
  TooltipConfig,
  PopupConfig,
  VisualizationEvent,
  VisualizationEventType,
  RouteVisualization,
  VisualRouteSegment,
  VisualPOIMarker
} from '../types/visualization';

import { Coordinate, TransportMode } from '../types/graph';
import { RouteSegment } from '../types/routing';
import { PointOfInterest } from '../types/poi';

/**
 * Interaction state types
 */
export enum InteractionState {
  IDLE = 'idle',
  HOVERING = 'hovering',
  SELECTING = 'selecting',
  DRAGGING = 'dragging',
  COMPARING = 'comparing'
}

/**
 * Selection mode types
 */
export enum SelectionMode {
  SINGLE = 'single',
  MULTIPLE = 'multiple',
  RANGE = 'range'
}

/**
 * Comparison mode types
 */
export enum ComparisonMode {
  SIDE_BY_SIDE = 'side_by_side',
  OVERLAY = 'overlay',
  SPLIT_VIEW = 'split_view'
}

/**
 * Interaction event data
 */
export interface InteractionEventData {
  type: InteractionState;
  element?: InteractiveElement;
  elements?: InteractiveElement[];
  position?: Coordinate;
  timestamp: Date;
}

/**
 * Selection data
 */
export interface SelectionData {
  elements: InteractiveElement[];
  mode: SelectionMode;
  bounds?: {
    northEast: Coordinate;
    southWest: Coordinate;
  };
}

/**
 * Comparison data
 */
export interface ComparisonData {
  primary: InteractiveElement[];
  secondary: InteractiveElement[];
  mode: ComparisonMode;
  metrics: {
    time: number;
    cost: number;
    distance: number;
    accessibility: number;
  };
}

/**
 * Interaction options
 */
export interface InteractionOptions {
  enabled: boolean;
  selectionMode: SelectionMode;
  hoverEnabled: boolean;
  clickEnabled: boolean;
  doubleClickEnabled: boolean;
  dragEnabled: boolean;
  contextMenuEnabled: boolean;
  comparisonEnabled: boolean;
  tooltip: TooltipConfig;
  popup: PopupConfig;
  selectionStyle: {
    color: string;
    width: number;
    opacity: number;
    zIndex: number;
  };
  hoverStyle: {
    color: string;
    width: number;
    opacity: number;
    zIndex: number;
  };
}

/**
 * Route Interaction Manager class
 */
export class RouteInteractionManager {
  private currentState: InteractionState = InteractionState.IDLE;
  private selectedElements: InteractiveElement[] = [];
  private hoveredElement: InteractiveElement | null = null;
  private draggedElement: InteractiveElement | null = null;
  private comparisonData: ComparisonData | null = null;
  private options: InteractionOptions;
  private eventListeners: Map<VisualizationEventType, Function[]> = new Map();
  private contextMenuItems: Map<InteractiveElementType, ContextMenuItem[]> = new Map();

  constructor(options?: Partial<InteractionOptions>) {
    this.options = {
      enabled: true,
      selectionMode: SelectionMode.SINGLE,
      hoverEnabled: true,
      clickEnabled: true,
      doubleClickEnabled: true,
      dragEnabled: true,
      contextMenuEnabled: true,
      comparisonEnabled: true,
      tooltip: {
        enabled: true,
        content: (element) => this.createTooltipContent(element),
        position: 'auto',
        offset: 10,
        delay: 200
      },
      popup: {
        enabled: true,
        content: (element) => this.createPopupContent(element),
        position: { latitude: 0, longitude: 0 },
        offset: 20,
        closeButton: true,
        draggable: false
      },
      selectionStyle: {
        color: '#FFC107',
        width: 6,
        opacity: 1,
        zIndex: 20
      },
      hoverStyle: {
        color: '#2196F3',
        width: 5,
        opacity: 0.8,
        zIndex: 15
      },
      ...options
    };

    this.initializeContextMenuItems();
  }

  /**
   * Initialize context menu items for different element types
   */
  private initializeContextMenuItems(): void {
    // Route segment context menu
    this.contextMenuItems.set(InteractiveElementType.ROUTE_SEGMENT, [
      {
        id: 'select',
        label: 'Select Segment',
        action: () => this.handleContextAction('select')
      },
      {
        id: 'details',
        label: 'View Details',
        action: () => this.handleContextAction('details')
      },
      {
        id: 'compare',
        label: 'Compare with Alternative',
        action: () => this.handleContextAction('compare')
      },
      {
        id: 'avoid',
        label: 'Avoid in Future Routes',
        action: () => this.handleContextAction('avoid')
      }
    ]);

    // POI marker context menu
    this.contextMenuItems.set(InteractiveElementType.POI_MARKER, [
      {
        id: 'select',
        label: 'Select POI',
        action: () => this.handleContextAction('select')
      },
      {
        id: 'details',
        label: 'View Details',
        action: () => this.handleContextAction('details')
      },
      {
        id: 'visit',
        label: 'Mark as Visited',
        action: () => this.handleContextAction('visit')
      },
      {
        id: 'remove',
        label: 'Remove from Route',
        action: () => this.handleContextAction('remove')
      }
    ]);

    // Transfer point context menu
    this.contextMenuItems.set(InteractiveElementType.TRANSFER_POINT, [
      {
        id: 'select',
        label: 'Select Transfer',
        action: () => this.handleContextAction('select')
      },
      {
        id: 'details',
        label: 'View Details',
        action: () => this.handleContextAction('details')
      },
      {
        id: 'alternatives',
        label: 'Show Alternatives',
        action: () => this.handleContextAction('alternatives')
      }
    ]);

    // Adaptation point context menu
    this.contextMenuItems.set(InteractiveElementType.ADAPTATION_POINT, [
      {
        id: 'select',
        label: 'Select Adaptation',
        action: () => this.handleContextAction('select')
      },
      {
        id: 'details',
        label: 'View Details',
        action: () => this.handleContextAction('details')
      },
      {
        id: 'revert',
        label: 'Revert Adaptation',
        action: () => this.handleContextAction('revert')
      }
    ]);
  }

  /**
   * Handle context menu action
   */
  private handleContextAction(action: string): void {
    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { action, element: this.hoveredElement },
      source: 'RouteInteractionManager'
    });
  }

  /**
   * Create interactive elements from route visualization
   */
  createInteractiveElements(visualization: RouteVisualization): InteractiveElement[] {
    const elements: InteractiveElement[] = [];

    // Create route segment elements
    visualization.segments.forEach(segment => {
      const element: InteractiveElement = {
        id: segment.id,
        type: InteractiveElementType.ROUTE_SEGMENT,
        position: this.calculateSegmentCenter(segment.geometry),
        bounds: this.calculateSegmentBounds(segment.geometry),
        data: segment,
        actions: this.createSegmentActions(segment)
      };

      elements.push(element);
    });

    // Create POI marker elements
    visualization.poiMarkers.forEach(marker => {
      const element: InteractiveElement = {
        id: marker.id,
        type: InteractiveElementType.POI_MARKER,
        position: marker.position,
        bounds: this.calculatePointBounds(marker.position, 20), // 20m radius
        data: marker,
        actions: this.createPOIActions(marker)
      };

      elements.push(element);
    });

    return elements;
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
   * Calculate segment bounds
   */
  private calculateSegmentBounds(geometry: Coordinate[]): { northEast: Coordinate; southWest: Coordinate } {
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
   * Calculate point bounds
   */
  private calculatePointBounds(position: Coordinate, radius: number): { northEast: Coordinate; southWest: Coordinate } {
    // Convert radius from meters to degrees (approximate)
    const latRadius = radius / 111000; // 1 degree latitude ≈ 111km
    const lonRadius = radius / (111000 * Math.cos(position.latitude * Math.PI / 180)); // Adjust for longitude
    
    return {
      northEast: {
        latitude: position.latitude + latRadius,
        longitude: position.longitude + lonRadius
      },
      southWest: {
        latitude: position.latitude - latRadius,
        longitude: position.longitude - lonRadius
      }
    };
  }

  /**
   * Create actions for route segment
   */
  private createSegmentActions(segment: VisualRouteSegment): InteractiveAction[] {
    const actions: InteractiveAction[] = [];

    if (this.options.clickEnabled) {
      actions.push({
        type: InteractiveActionType.CLICK,
        handler: (element, event) => this.handleSegmentClick(element, event),
        tooltip: 'Select segment'
      });
    }

    if (this.options.hoverEnabled) {
      actions.push({
        type: InteractiveActionType.HOVER,
        handler: (element, event) => this.handleSegmentHover(element, event),
        tooltip: 'View segment details'
      });
    }

    if (this.options.contextMenuEnabled) {
      actions.push({
        type: InteractiveActionType.CONTEXT_MENU,
        handler: (element, event) => this.handleSegmentContextMenu(element, event),
        contextMenu: this.contextMenuItems.get(InteractiveElementType.ROUTE_SEGMENT) || []
      });
    }

    return actions;
  }

  /**
   * Create actions for POI marker
   */
  private createPOIActions(marker: VisualPOIMarker): InteractiveAction[] {
    const actions: InteractiveAction[] = [];

    if (this.options.clickEnabled) {
      actions.push({
        type: InteractiveActionType.CLICK,
        handler: (element, event) => this.handlePOIClick(element, event),
        tooltip: 'Select POI'
      });
    }

    if (this.options.hoverEnabled) {
      actions.push({
        type: InteractiveActionType.HOVER,
        handler: (element, event) => this.handlePOIHover(element, event),
        tooltip: 'View POI details'
      });
    }

    if (this.options.contextMenuEnabled) {
      actions.push({
        type: InteractiveActionType.CONTEXT_MENU,
        handler: (element, event) => this.handlePOIContextMenu(element, event),
        contextMenu: this.contextMenuItems.get(InteractiveElementType.POI_MARKER) || []
      });
    }

    return actions;
  }

  /**
   * Handle segment click
   */
  private handleSegmentClick(element: InteractiveElement, event: any): void {
    if (!this.options.enabled) return;

    this.updateSelection(element);
    this.currentState = InteractionState.SELECTING;

    this.emitEvent({
      type: VisualizationEventType.SEGMENT_SELECTED,
      timestamp: new Date(),
      data: { element, event },
      source: 'RouteInteractionManager'
    });
  }

  /**
   * Handle segment hover
   */
  private handleSegmentHover(element: InteractiveElement, event: any): void {
    if (!this.options.enabled || !this.options.hoverEnabled) return;

    this.hoveredElement = element;
    this.currentState = InteractionState.HOVERING;

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { element, event, action: 'hover' },
      source: 'RouteInteractionManager'
    });
  }

  /**
   * Handle segment context menu
   */
  private handleSegmentContextMenu(element: InteractiveElement, event: any): void {
    if (!this.options.enabled || !this.options.contextMenuEnabled) return;

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { element, event, action: 'context_menu' },
      source: 'RouteInteractionManager'
    });
  }

  /**
   * Handle POI click
   */
  private handlePOIClick(element: InteractiveElement, event: any): void {
    if (!this.options.enabled) return;

    this.updateSelection(element);
    this.currentState = InteractionState.SELECTING;

    this.emitEvent({
      type: VisualizationEventType.POI_SELECTED,
      timestamp: new Date(),
      data: { element, event },
      source: 'RouteInteractionManager'
    });
  }

  /**
   * Handle POI hover
   */
  private handlePOIHover(element: InteractiveElement, event: any): void {
    if (!this.options.enabled || !this.options.hoverEnabled) return;

    this.hoveredElement = element;
    this.currentState = InteractionState.HOVERING;

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { element, event, action: 'hover' },
      source: 'RouteInteractionManager'
    });
  }

  /**
   * Handle POI context menu
   */
  private handlePOIContextMenu(element: InteractiveElement, event: any): void {
    if (!this.options.enabled || !this.options.contextMenuEnabled) return;

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { element, event, action: 'context_menu' },
      source: 'RouteInteractionManager'
    });
  }

  /**
   * Update selection based on selection mode
   */
  private updateSelection(element: InteractiveElement): void {
    switch (this.options.selectionMode) {
      case SelectionMode.SINGLE:
        this.selectedElements = [element];
        break;
      case SelectionMode.MULTIPLE:
        const index = this.selectedElements.findIndex(e => e.id === element.id);
        if (index > -1) {
          this.selectedElements.splice(index, 1);
        } else {
          this.selectedElements.push(element);
        }
        break;
      case SelectionMode.RANGE:
        // Range selection logic would go here
        this.selectedElements.push(element);
        break;
    }
  }

  /**
   * Create tooltip content
   */
  private createTooltipContent(element: InteractiveElement): string {
    switch (element.type) {
      case InteractiveElementType.ROUTE_SEGMENT:
        const segment = element.data as VisualRouteSegment;
        return `
          <div>
            <strong>${segment.mode} Segment</strong>
            <div>Distance: ${(segment.metadata.distance / 1000).toFixed(2)} km</div>
            <div>Duration: ${Math.floor(segment.metadata.duration / 60)} min</div>
            ${segment.metadata.streetName ? `<div>Street: ${segment.metadata.streetName}</div>` : ''}
          </div>
        `;
      case InteractiveElementType.POI_MARKER:
        const poi = element.data as VisualPOIMarker;
        return `
          <div>
            <strong>${poi.label}</strong>
            <div>${poi.poi.category}</div>
            ${poi.poi.rating ? `<div>Rating: ${poi.poi.rating.average.toFixed(1)}</div>` : ''}
          </div>
        `;
      default:
        return 'Route element';
    }
  }

  /**
   * Create popup content
   */
  private createPopupContent(element: InteractiveElement): string {
    switch (element.type) {
      case InteractiveElementType.ROUTE_SEGMENT:
        const segment = element.data as VisualRouteSegment;
        return `
          <div class="segment-popup">
            <h3>${segment.mode} Segment</h3>
            <div class="segment-info">
              <div><strong>Distance:</strong> ${(segment.metadata.distance / 1000).toFixed(2)} km</div>
              <div><strong>Duration:</strong> ${Math.floor(segment.metadata.duration / 60)} min</div>
              ${segment.metadata.streetName ? `<div><strong>Street:</strong> ${segment.metadata.streetName}</div>` : ''}
              <div><strong>Condition:</strong> ${segment.condition}</div>
              <div><strong>Accessibility:</strong> ${segment.accessibility.wheelchairAccessible ? 'Wheelchair accessible' : 'Not wheelchair accessible'}</div>
            </div>
            ${segment.realTimeData ? `
              <div class="real-time-data">
                <h4>Real-time Data</h4>
                <div><strong>Current Speed:</strong> ${segment.realTimeData.speed} km/h</div>
                <div><strong>Delay:</strong> ${segment.realTimeData.delay} sec</div>
                <div><strong>Congestion:</strong> ${(segment.realTimeData.congestionLevel * 100).toFixed(0)}%</div>
              </div>
            ` : ''}
          </div>
        `;
      case InteractiveElementType.POI_MARKER:
        const poi = element.data as VisualPOIMarker;
        return `
          <div class="poi-popup">
            <h3>${poi.label}</h3>
            <div class="poi-info">
              <div><strong>Category:</strong> ${poi.poi.category}</div>
              ${poi.poi.metadata.description ? `<div><strong>Description:</strong> ${poi.poi.metadata.description}</div>` : ''}
              ${poi.poi.address ? `<div><strong>Address:</strong> ${poi.poi.address}</div>` : ''}
              ${poi.poi.rating ? `
                <div><strong>Rating:</strong> ${poi.poi.rating.average.toFixed(1)} (${poi.poi.rating.count} reviews)</div>
              ` : ''}
              <div><strong>Accessibility:</strong> ${poi.poi.accessibility.wheelchairAccessible ? 'Wheelchair accessible' : 'Not wheelchair accessible'}</div>
            </div>
          </div>
        `;
      default:
        return 'Route element details';
    }
  }

  /**
   * Get current selection
   */
  getSelection(): SelectionData {
    return {
      elements: this.selectedElements,
      mode: this.options.selectionMode,
      bounds: this.calculateSelectionBounds()
    };
  }

  /**
   * Calculate selection bounds
   */
  private calculateSelectionBounds(): { northEast: Coordinate; southWest: Coordinate } | undefined {
    if (this.selectedElements.length === 0) {
      return undefined;
    }

    let minLat = this.selectedElements[0].bounds.southWest.latitude;
    let maxLat = this.selectedElements[0].bounds.northEast.latitude;
    let minLon = this.selectedElements[0].bounds.southWest.longitude;
    let maxLon = this.selectedElements[0].bounds.northEast.longitude;

    for (const element of this.selectedElements) {
      minLat = Math.min(minLat, element.bounds.southWest.latitude);
      maxLat = Math.max(maxLat, element.bounds.northEast.latitude);
      minLon = Math.min(minLon, element.bounds.southWest.longitude);
      maxLon = Math.max(maxLon, element.bounds.northEast.longitude);
    }

    return {
      northEast: { latitude: maxLat, longitude: maxLon },
      southWest: { latitude: minLat, longitude: minLon }
    };
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectedElements = [];
    this.currentState = InteractionState.IDLE;

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { action: 'clear_selection' },
      source: 'RouteInteractionManager'
    });
  }

  /**
   * Set selection mode
   */
  setSelectionMode(mode: SelectionMode): void {
    this.options.selectionMode = mode;
    if (mode !== SelectionMode.MULTIPLE) {
      this.selectedElements = this.selectedElements.slice(0, 1);
    }
  }

  /**
   * Start comparison mode
   */
  startComparison(primary: InteractiveElement[], secondary: InteractiveElement[], mode: ComparisonMode): void {
    this.comparisonData = {
      primary,
      secondary,
      mode,
      metrics: this.calculateComparisonMetrics(primary, secondary)
    };

    this.currentState = InteractionState.COMPARING;

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { action: 'start_comparison', comparison: this.comparisonData },
      source: 'RouteInteractionManager'
    });
  }

  /**
   * Calculate comparison metrics
   */
  private calculateComparisonMetrics(primary: InteractiveElement[], secondary: InteractiveElement[]): {
    time: number;
    cost: number;
    distance: number;
    accessibility: number;
  } {
    // This would calculate actual metrics based on the selected elements
    return {
      time: 0,
      cost: 0,
      distance: 0,
      accessibility: 0
    };
  }

  /**
   * End comparison mode
   */
  endComparison(): void {
    this.comparisonData = null;
    this.currentState = InteractionState.IDLE;

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { action: 'end_comparison' },
      source: 'RouteInteractionManager'
    });
  }

  /**
   * Get current comparison data
   */
  getComparison(): ComparisonData | null {
    return this.comparisonData;
  }

  /**
   * Get current interaction state
   */
  getCurrentState(): InteractionState {
    return this.currentState;
  }

  /**
   * Get hovered element
   */
  getHoveredElement(): InteractiveElement | null {
    return this.hoveredElement;
  }

  /**
   * Get interaction options
   */
  getOptions(): InteractionOptions {
    return { ...this.options };
  }

  /**
   * Update interaction options
   */
  updateOptions(options: Partial<InteractionOptions>): void {
    this.options = { ...this.options, ...options };
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
    this.selectedElements = [];
    this.hoveredElement = null;
    this.draggedElement = null;
    this.comparisonData = null;
    this.eventListeners.clear();
    this.contextMenuItems.clear();
  }
}