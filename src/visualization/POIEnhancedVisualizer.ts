/**
 * Enhanced POI Visualizer implementation
 * Handles advanced visualization of Points of Interest with custom icons,
 * information popups, visit sequences, and visual connections to route segments.
 */

import {
  VisualPOIMarker,
  VisualizationTheme,
  VisualizationEvent,
  VisualizationEventType,
  InteractiveElement,
  InteractiveElementType,
  TooltipConfig,
  PopupConfig
} from '../types/visualization';

import { PointOfInterest, POICategory, POIVisitStatus } from '../types/poi';
import { Coordinate, TransportMode } from '../types/graph';
import { RouteSegment } from '../types/routing';

/**
 * POI cluster configuration
 */
export interface POIClusterConfig {
  enabled: boolean;
  radius: number; // in meters
  maxZoom: number;
  gridSize: number;
}

/**
 * POI marker animation configuration
 */
export interface POIAnimationConfig {
  enabled: boolean;
  duration: number; // in milliseconds
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce';
  delay: number; // in milliseconds
}

/**
 * POI visualization options
 */
export interface POIVisualizationOptions {
  showIcons: boolean;
  showLabels: boolean;
  showVisitOrder: boolean;
  showConnections: boolean;
  showAccessibility: boolean;
  showRating: boolean;
  showCategories: boolean;
  clusterPOIs: boolean;
  animateMarkers: boolean;
  interactive: boolean;
  clusterConfig: POIClusterConfig;
  animationConfig: POIAnimationConfig;
  tooltip: TooltipConfig;
  popup: PopupConfig;
}

/**
 * Visual representation of a POI cluster
 */
export interface POICluster {
  id: string;
  center: Coordinate;
  pois: PointOfInterest[];
  count: number;
  radius: number;
  categories: POICategory[];
  averageRating?: number;
  style: {
    icon: string;
    size: number;
    color: string;
    borderColor: string;
    borderWidth: number;
    labelColor: string;
    labelSize: number;
    opacity: number;
    zIndex: number;
  };
}

/**
 * Visual representation of a POI connection
 */
export interface POIConnection {
  id: string;
  from: Coordinate;
  to: Coordinate;
  type: 'direct' | 'route' | 'suggested';
  style: {
    color: string;
    width: number;
    opacity: number;
    dashArray?: number[];
    zIndex: number;
  };
  label?: string;
}

/**
 * POI visualization data
 */
export interface POIVisualization {
  id: string;
  markers: VisualPOIMarker[];
  clusters: POICluster[];
  connections: POIConnection[];
  bounds: {
    northEast: Coordinate;
    southWest: Coordinate;
  };
  center: Coordinate;
  zoom: number;
  options: POIVisualizationOptions;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    totalPOIs: number;
    clusteredPOIs: number;
    visiblePOIs: number;
  };
}

/**
 * Enhanced POI Visualizer class
 */
export class POIEnhancedVisualizer {
  private currentVisualization: POIVisualization | null = null;
  private theme: VisualizationTheme | null = null;
  private eventListeners: Map<VisualizationEventType, Function[]> = new Map();
  private animationFrame: number | null = null;

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
   * Create POI visualization from POI data
   */
  createVisualization(
    pois: PointOfInterest[],
    routeSegments?: RouteSegment[],
    options?: Partial<POIVisualizationOptions>
  ): POIVisualization {
    const mergedOptions: POIVisualizationOptions = {
      showIcons: true,
      showLabels: true,
      showVisitOrder: true,
      showConnections: true,
      showAccessibility: true,
      showRating: true,
      showCategories: true,
      clusterPOIs: true,
      animateMarkers: true,
      interactive: true,
      clusterConfig: {
        enabled: true,
        radius: 100,
        maxZoom: 15,
        gridSize: 50
      },
      animationConfig: {
        enabled: true,
        duration: 500,
        easing: 'ease-out',
        delay: 100
      },
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
      ...options
    };

    // Create individual POI markers
    const markers = this.createPOIMarkers(pois, mergedOptions);

    // Cluster POIs if enabled
    const clusters = mergedOptions.clusterPOIs && mergedOptions.clusterConfig.enabled
      ? this.createPOIClusters(pois, mergedOptions.clusterConfig)
      : [];

    // Create connections between POIs and route segments
    const connections = routeSegments && mergedOptions.showConnections
      ? this.createPOIConnections(pois, routeSegments, mergedOptions)
      : [];

    // Calculate bounds and center
    const bounds = this.calculateBounds(pois);
    const center = this.calculateCenter(bounds);
    const zoom = this.calculateZoom(bounds);

    const visualization: POIVisualization = {
      id: `poi-viz-${Date.now()}`,
      markers,
      clusters,
      connections,
      bounds,
      center,
      zoom,
      options: mergedOptions,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        totalPOIs: pois.length,
        clusteredPOIs: clusters.reduce((sum, cluster) => sum + cluster.pois.length, 0),
        visiblePOIs: markers.length
      }
    };

    this.currentVisualization = visualization;

    // Animate markers if enabled
    if (mergedOptions.animateMarkers && mergedOptions.animationConfig.enabled) {
      this.animateMarkers();
    }

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { visualization },
      source: 'POIEnhancedVisualizer'
    });

    return visualization;
  }

  /**
   * Create POI markers
   */
  private createPOIMarkers(pois: PointOfInterest[], options: POIVisualizationOptions): VisualPOIMarker[] {
    return pois.map((poi, index) => {
      // Get marker style from theme
      const style = this.getPOIMarkerStyle(poi.category);

      // Create label
      let label = '';
      if (options.showLabels) {
        label = poi.name;
        if (options.showVisitOrder && poi.visitPriority) {
          label = `${poi.visitPriority.priority}. ${label}`;
        }
      }

      // Create icon
      let icon = '';
      if (options.showIcons) {
        icon = this.getPOIIcon(poi.category);
      }

      return {
        id: `poi-${poi.id}`,
        poi,
        position: poi.coordinate,
        style,
        order: poi.visitPriority?.priority || index + 1,
        isVisited: poi.visitStatus === POIVisitStatus.VISITED,
        isRequired: poi.visitPriority?.mustVisit || false,
        label,
        icon,
        connectionLines: []
      };
    });
  }

  /**
   * Get POI marker style from theme
   */
  private getPOIMarkerStyle(category: POICategory): VisualPOIMarker['style'] {
    if (!this.theme) {
      return {
        icon: 'poi',
        size: 32,
        color: '#2196F3',
        borderColor: '#FFFFFF',
        borderWidth: 2,
        labelColor: '#212529',
        labelSize: 12,
        labelOffset: 8,
        opacity: 1,
        zIndex: 10
      };
    }

    return this.theme.poiCategories.get(category) || {
      icon: 'poi',
      size: 32,
      color: this.theme.colors.primary,
      borderColor: this.theme.colors.background,
      borderWidth: 2,
      labelColor: this.theme.colors.text,
      labelSize: 12,
      labelOffset: 8,
      opacity: 1,
      zIndex: 10
    };
  }

  /**
   * Get POI icon for category
   */
  private getPOIIcon(category: POICategory): string {
    const icons = {
      [POICategory.TOURIST_ATTRACTION]: '🏛️',
      [POICategory.MUSEUM]: '🏛️',
      [POICategory.PARK]: '🌳',
      [POICategory.MONUMENT]: '🗿',
      [POICategory.LANDMARK]: '🏰',
      [POICategory.RESTAURANT]: '🍽️',
      [POICategory.CAFE]: '☕',
      [POICategory.SHOP]: '🛍️',
      [POICategory.MARKET]: '🏪',
      [POICategory.MALL]: '🏬',
      [POICategory.HOTEL]: '🏨',
      [POICategory.HOSPITAL]: '🏥',
      [POICategory.PHARMACY]: '💊',
      [POICategory.BANK]: '🏦',
      [POICategory.ATM]: '🏧',
      [POICategory.GAS_STATION]: '⛽',
      [POICategory.PARKING]: '🅿️',
      [POICategory.PUBLIC_TRANSPORT]: '🚉',
      [POICategory.BIKE_RENTAL]: '🚲',
      [POICategory.SCHOOL]: '🏫',
      [POICategory.UNIVERSITY]: '🎓',
      [POICategory.LIBRARY]: '📚',
      [POICategory.POST_OFFICE]: '📮',
      [POICategory.PLACE_OF_WORSHIP]: '⛪',
      [POICategory.ENTERTAINMENT]: '🎭',
      [POICategory.SPORTS_FACILITY]: '⚽',
      [POICategory.PLAYGROUND]: '🎠',
      [POICategory.BEACH]: '🏖️',
      [POICategory.NATURE]: '🌲',
      [POICategory.VIEWPOINT]: '🌅',
      [POICategory.CAMPGROUND]: '⛺',
      [POICategory.CUSTOM]: '📍'
    };

    return icons[category] || '📍';
  }

  /**
   * Create POI clusters
   */
  private createPOIClusters(pois: PointOfInterest[], config: POIClusterConfig): POICluster[] {
    const clusters: POICluster[] = [];
    const usedPOIs = new Set<string>();

    for (const poi of pois) {
      if (usedPOIs.has(poi.id)) {
        continue;
      }

      // Find nearby POIs
      const nearbyPOIs = pois.filter(p => {
        if (usedPOIs.has(p.id)) {
          return false;
        }
        return this.calculateDistance(poi.coordinate, p.coordinate) <= config.radius;
      });

      if (nearbyPOIs.length > 1) {
        // Create cluster
        const center = this.calculateClusterCenter(nearbyPOIs);
        const categories = [...new Set(nearbyPOIs.map(p => p.category))];
        const averageRating = this.calculateAverageRating(nearbyPOIs);

        const cluster: POICluster = {
          id: `cluster-${clusters.length}`,
          center,
          pois: nearbyPOIs,
          count: nearbyPOIs.length,
          radius: config.radius,
          categories,
          averageRating,
          style: {
            icon: '📍',
            size: 32 + Math.min(nearbyPOIs.length * 2, 20),
            color: '#2196F3',
            borderColor: '#FFFFFF',
            borderWidth: 2,
            labelColor: '#212529',
            labelSize: 14,
            opacity: 0.9,
            zIndex: 15
          }
        };

        clusters.push(cluster);

        // Mark POIs as used
        nearbyPOIs.forEach(p => usedPOIs.add(p.id));
      }
    }

    return clusters;
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
   * Calculate cluster center
   */
  private calculateClusterCenter(pois: PointOfInterest[]): Coordinate {
    const centerLat = pois.reduce((sum, p) => sum + p.coordinate.latitude, 0) / pois.length;
    const centerLon = pois.reduce((sum, p) => sum + p.coordinate.longitude, 0) / pois.length;
    
    return {
      latitude: centerLat,
      longitude: centerLon
    };
  }

  /**
   * Calculate average rating
   */
  private calculateAverageRating(pois: PointOfInterest[]): number | undefined {
    const ratings = pois
      .filter(p => p.rating)
      .map(p => p.rating!.average);
    
    return ratings.length > 0 
      ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length 
      : undefined;
  }

  /**
   * Create POI connections
   */
  private createPOIConnections(
    pois: PointOfInterest[],
    routeSegments: RouteSegment[],
    options: POIVisualizationOptions
  ): POIConnection[] {
    const connections: POIConnection[] = [];

    // Create connections between POIs and nearby route segments
    for (const poi of pois) {
      for (const segment of routeSegments) {
        // Find closest point on segment to POI
        const closestPoint = this.findClosestPointOnSegment(poi.coordinate, segment);
        const distance = this.calculateDistance(poi.coordinate, closestPoint);

        if (distance <= 200) { // Within 200 meters
          const connection: POIConnection = {
            id: `connection-${poi.id}-${segment.id}`,
            from: poi.coordinate,
            to: closestPoint,
            type: 'direct',
            style: {
              color: '#9E9E9E',
              width: 2,
              opacity: 0.6,
              dashArray: [5, 5],
              zIndex: 3
            }
          };

          connections.push(connection);
        }
      }
    }

    return connections;
  }

  /**
   * Find closest point on segment to coordinate
   */
  private findClosestPointOnSegment(coordinate: Coordinate, segment: RouteSegment): Coordinate {
    let closestPoint = segment.fromCoordinate;
    let minDistance = this.calculateDistance(coordinate, closestPoint);

    // Check segment geometry points
    for (const point of segment.geometry) {
      const distance = this.calculateDistance(coordinate, point);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
      }
    }

    return closestPoint;
  }

  /**
   * Calculate bounds for POIs
   */
  private calculateBounds(pois: PointOfInterest[]): { northEast: Coordinate; southWest: Coordinate } {
    if (pois.length === 0) {
      return {
        northEast: { latitude: 0, longitude: 0 },
        southWest: { latitude: 0, longitude: 0 }
      };
    }

    let minLat = pois[0].coordinate.latitude;
    let maxLat = pois[0].coordinate.latitude;
    let minLon = pois[0].coordinate.longitude;
    let maxLon = pois[0].coordinate.longitude;
    
    for (const poi of pois) {
      minLat = Math.min(minLat, poi.coordinate.latitude);
      maxLat = Math.max(maxLat, poi.coordinate.latitude);
      minLon = Math.min(minLon, poi.coordinate.longitude);
      maxLon = Math.max(maxLon, poi.coordinate.longitude);
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
   * Animate POI markers
   */
  private animateMarkers(): void {
    if (!this.currentVisualization || !this.currentVisualization.options.animateMarkers) {
      return;
    }

    const config = this.currentVisualization.options.animationConfig;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / config.duration, 1);

      // Update marker animations
      this.currentVisualization!.markers.forEach((marker, index) => {
        const delay = index * config.delay;
        const markerProgress = Math.max(0, Math.min(1, (elapsed - delay) / config.duration));
        
        // Apply easing function
        const easedProgress = this.applyEasing(markerProgress, config.easing);
        
        // Update marker scale based on progress
        marker.style.size = 32 * easedProgress;
        marker.style.opacity = easedProgress;
      });

      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(animate);
      }
    };

    animate();
  }

  /**
   * Apply easing function
   */
  private applyEasing(progress: number, easing: string): number {
    switch (easing) {
      case 'linear':
        return progress;
      case 'ease-in':
        return progress * progress;
      case 'ease-out':
        return 1 - (1 - progress) * (1 - progress);
      case 'ease-in-out':
        return progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      case 'bounce':
        const n1 = 7.5625;
        const d1 = 2.75;
        if (progress < 1 / d1) {
          return n1 * progress * progress;
        } else if (progress < 2 / d1) {
          return n1 * (progress -= 1.5 / d1) * progress + 0.75;
        } else if (progress < 2.5 / d1) {
          return n1 * (progress -= 2.25 / d1) * progress + 0.9375;
        } else {
          return n1 * (progress -= 2.625 / d1) * progress + 0.984375;
        }
      default:
        return progress;
    }
  }

  /**
   * Create tooltip content
   */
  private createTooltipContent(element: InteractiveElement): string {
    if (element.type === InteractiveElementType.POI_MARKER) {
      const poi = element.data.poi as PointOfInterest;
      return `
        <div>
          <strong>${poi.name}</strong>
          <div>${poi.category}</div>
          ${poi.rating ? `<div>Rating: ${poi.rating.average.toFixed(1)}</div>` : ''}
        </div>
      `;
    }
    return 'POI';
  }

  /**
   * Create popup content
   */
  private createPopupContent(element: InteractiveElement): string {
    if (element.type === InteractiveElementType.POI_MARKER) {
      const poi = element.data.poi as PointOfInterest;
      return `
        <div class="poi-popup">
          <h3>${poi.name}</h3>
          <div class="poi-category">${poi.category}</div>
          ${poi.metadata.description ? `<p>${poi.metadata.description}</p>` : ''}
          ${poi.rating ? `
            <div class="poi-rating">
              Rating: ${poi.rating.average.toFixed(1)} (${poi.rating.count} reviews)
            </div>
          ` : ''}
          ${poi.address ? `<div class="poi-address">${poi.address}</div>` : ''}
          ${poi.contact?.website ? `<div class="poi-website"><a href="${poi.contact.website}" target="_blank">Website</a></div>` : ''}
        </div>
      `;
    }
    return 'POI';
  }

  /**
   * Get current visualization
   */
  getCurrentVisualization(): POIVisualization | null {
    return this.currentVisualization;
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
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.eventListeners.clear();
    this.currentVisualization = null;
  }
}