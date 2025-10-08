/**
 * POI Route Visualization implementation
 * Handles the visual representation of POI routes on maps and other UI components
 */

import {
  PointOfInterest,
  POIRoutingResult,
  POIRouteVisualization,
  POICategory,
  POIVisitStatus
} from '../types/poi';
import { Coordinate, TransportMode } from '../types/graph';
import { POIService } from './POIService';

/**
 * Visualization options for POI routes
 */
interface POIRouteVisualizationOptions {
  showPOIIcons?: boolean;
  showPOILabels?: boolean;
  showRouteSegments?: boolean;
  showTransfers?: boolean;
  colorByMode?: boolean;
  highlightRequiredPOIs?: boolean;
  showVisitOrder?: boolean;
  showTiming?: boolean;
  clusterNearbyPOIs?: boolean;
  clusterRadius?: number; // in meters
  simplifyGeometry?: boolean;
  simplifyTolerance?: number; // in meters
  animationDuration?: number; // in milliseconds
  interactive?: boolean;
}

/**
 * POI marker style configuration
 */
interface POIMarkerStyle {
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
 * Route segment style configuration
 */
interface RouteSegmentStyle {
  color: string;
  width: number;
  opacity: number;
  dashArray?: number[];
  zIndex: number;
}

/**
 * Visualization theme configuration
 */
interface VisualizationTheme {
  name: string;
  poiMarkerStyles: Map<POICategory, POIMarkerStyle>;
  routeSegmentStyles: Map<TransportMode, RouteSegmentStyle>;
  backgroundColor: string;
  textColor: string;
  highlightColor: string;
  shadowColor: string;
}

/**
 * POI cluster for visualization
 */
interface POIVisualizationCluster {
  id: string;
  center: Coordinate;
  pois: PointOfInterest[];
  count: number;
  radius: number;
  categories: POICategory[];
  averageRating?: number;
  style: POIMarkerStyle;
}

/**
 * Animation keyframe for route visualization
 */
interface AnimationKeyframe {
  time: number; // 0-1
  position: Coordinate;
  poi?: PointOfInterest;
  segmentIndex: number;
  segmentProgress: number; // 0-1
}

/**
 * POI Route Visualizer implementation
 */
export class POIRouteVisualizer {
  private poiService: POIService;
  private themes: Map<string, VisualizationTheme>;
  private currentTheme: string;

  constructor(poiService: POIService) {
    this.poiService = poiService;
    this.themes = new Map();
    this.currentTheme = 'default';
    this.initializeThemes();
  }

  /**
   * Initialize visualization themes
   */
  private initializeThemes(): void {
    // Default theme
    const defaultTheme: VisualizationTheme = {
      name: 'default',
      poiMarkerStyles: this.createDefaultPOIMarkerStyles(),
      routeSegmentStyles: this.createDefaultRouteSegmentStyles(),
      backgroundColor: '#f8f9fa',
      textColor: '#212529',
      highlightColor: '#ffeb3b',
      shadowColor: 'rgba(0, 0, 0, 0.2)'
    };

    // Dark theme
    const darkTheme: VisualizationTheme = {
      name: 'dark',
      poiMarkerStyles: this.createDarkPOIMarkerStyles(),
      routeSegmentStyles: this.createDarkRouteSegmentStyles(),
      backgroundColor: '#121212',
      textColor: '#ffffff',
      highlightColor: '#ffd54f',
      shadowColor: 'rgba(0, 0, 0, 0.5)'
    };

    // High contrast theme
    const highContrastTheme: VisualizationTheme = {
      name: 'high-contrast',
      poiMarkerStyles: this.createHighContrastPOIMarkerStyles(),
      routeSegmentStyles: this.createHighContrastRouteSegmentStyles(),
      backgroundColor: '#000000',
      textColor: '#ffffff',
      highlightColor: '#ffff00',
      shadowColor: 'rgba(255, 255, 255, 0.8)'
    };

    this.themes.set('default', defaultTheme);
    this.themes.set('dark', darkTheme);
    this.themes.set('high-contrast', highContrastTheme);
  }

  /**
   * Create default POI marker styles
   */
  private createDefaultPOIMarkerStyles(): Map<POICategory, POIMarkerStyle> {
    const styles = new Map<POICategory, POIMarkerStyle>();

    // Base style
    const baseStyle: POIMarkerStyle = {
      icon: 'poi',
      size: 32,
      color: '#2196F3',
      borderColor: '#ffffff',
      borderWidth: 2,
      labelColor: '#212529',
      labelSize: 12,
      labelOffset: 8,
      opacity: 1,
      zIndex: 10
    };

    // Category-specific styles
    const categoryStyles: Partial<Record<POICategory, Partial<POIMarkerStyle>>> = {
      [POICategory.TOURIST_ATTRACTION]: { icon: 'attraction', color: '#F44336' },
      [POICategory.MUSEUM]: { icon: 'museum', color: '#9C27B0' },
      [POICategory.PARK]: { icon: 'park', color: '#4CAF50' },
      [POICategory.MONUMENT]: { icon: 'monument', color: '#FF9800' },
      [POICategory.LANDMARK]: { icon: 'landmark', color: '#795548' },
      [POICategory.RESTAURANT]: { icon: 'restaurant', color: '#E91E63' },
      [POICategory.CAFE]: { icon: 'cafe', color: '#795548' },
      [POICategory.SHOP]: { icon: 'shop', color: '#607D8B' },
      [POICategory.MARKET]: { icon: 'market', color: '#FF5722' },
      [POICategory.MALL]: { icon: 'mall', color: '#3F51B5' },
      [POICategory.HOTEL]: { icon: 'hotel', color: '#009688' },
      [POICategory.HOSPITAL]: { icon: 'hospital', color: '#F44336' },
      [POICategory.PHARMACY]: { icon: 'pharmacy', color: '#E91E63' },
      [POICategory.BANK]: { icon: 'bank', color: '#3F51B5' },
      [POICategory.ATM]: { icon: 'atm', color: '#2196F3' },
      [POICategory.GAS_STATION]: { icon: 'gas', color: '#FF5722' },
      [POICategory.PARKING]: { icon: 'parking', color: '#607D8B' },
      [POICategory.PUBLIC_TRANSPORT]: { icon: 'transit', color: '#00BCD4' },
      [POICategory.BIKE_RENTAL]: { icon: 'bike', color: '#4CAF50' },
      [POICategory.SCHOOL]: { icon: 'school', color: '#2196F3' },
      [POICategory.UNIVERSITY]: { icon: 'university', color: '#9C27B0' },
      [POICategory.LIBRARY]: { icon: 'library', color: '#795548' },
      [POICategory.POST_OFFICE]: { icon: 'post', color: '#FF5722' },
      [POICategory.PLACE_OF_WORSHIP]: { icon: 'worship', color: '#9C27B0' },
      [POICategory.ENTERTAINMENT]: { icon: 'entertainment', color: '#E91E63' },
      [POICategory.SPORTS_FACILITY]: { icon: 'sports', color: '#4CAF50' },
      [POICategory.PLAYGROUND]: { icon: 'playground', color: '#FF9800' },
      [POICategory.BEACH]: { icon: 'beach', color: '#03A9F4' },
      [POICategory.NATURE]: { icon: 'nature', color: '#4CAF50' },
      [POICategory.VIEWPOINT]: { icon: 'viewpoint', color: '#8BC34A' },
      [POICategory.CAMPGROUND]: { icon: 'camping', color: '#795548' },
      [POICategory.CUSTOM]: { icon: 'poi', color: '#607D8B' }
    };

    // Apply category-specific styles to base style
    for (const [category, categoryStyle] of Object.entries(categoryStyles)) {
      styles.set(category as POICategory, {
        ...baseStyle,
        ...categoryStyle
      });
    }

    return styles;
  }

  /**
   * Create default route segment styles
   */
  private createDefaultRouteSegmentStyles(): Map<TransportMode, RouteSegmentStyle> {
    const styles = new Map<TransportMode, RouteSegmentStyle>();

    // Base style
    const baseStyle: RouteSegmentStyle = {
      color: '#2196F3',
      width: 5,
      opacity: 0.8,
      zIndex: 5
    };

    // Mode-specific styles
    const modeStyles: Partial<Record<TransportMode, Partial<RouteSegmentStyle>>> = {
      [TransportMode.WALKING]: { color: '#4CAF50', width: 3 },
      [TransportMode.BICYCLE]: { color: '#2196F3', width: 4 },
      [TransportMode.CAR]: { color: '#F44336', width: 5 },
      [TransportMode.BUS]: { color: '#FF9800', width: 5 },
      [TransportMode.METRO]: { color: '#9C27B0', width: 5 },
      [TransportMode.TRAM]: { color: '#00BCD4', width: 5 },
      [TransportMode.TRAIN]: { color: '#607D8B', width: 5 },
      [TransportMode.FERRY]: { color: '#009688', width: 5 }
    };

    // Apply mode-specific styles to base style
    for (const [mode, modeStyle] of Object.entries(modeStyles)) {
      styles.set(mode as TransportMode, {
        ...baseStyle,
        ...modeStyle
      });
    }

    return styles;
  }

  /**
   * Create dark theme POI marker styles
   */
  private createDarkPOIMarkerStyles(): Map<POICategory, POIMarkerStyle> {
    const styles = this.createDefaultPOIMarkerStyles();
    
    // Adjust colors for dark theme
    for (const [category, style] of styles.entries()) {
      styles.set(category, {
        ...style,
        borderColor: '#000000',
        labelColor: '#ffffff'
      });
    }
    
    return styles;
  }

  /**
   * Create dark theme route segment styles
   */
  private createDarkRouteSegmentStyles(): Map<TransportMode, RouteSegmentStyle> {
    const styles = this.createDefaultRouteSegmentStyles();
    
    // Adjust colors for dark theme
    for (const [mode, style] of styles.entries()) {
      styles.set(mode, {
        ...style,
        opacity: 0.9
      });
    }
    
    return styles;
  }

  /**
   * Create high contrast POI marker styles
   */
  private createHighContrastPOIMarkerStyles(): Map<POICategory, POIMarkerStyle> {
    const styles = this.createDefaultPOIMarkerStyles();
    
    // Adjust colors for high contrast theme
    for (const [category, style] of styles.entries()) {
      styles.set(category, {
        ...style,
        borderColor: '#000000',
        borderWidth: 3,
        labelColor: '#000000'
      });
    }
    
    return styles;
  }

  /**
   * Create high contrast route segment styles
   */
  private createHighContrastRouteSegmentStyles(): Map<TransportMode, RouteSegmentStyle> {
    const styles = this.createDefaultRouteSegmentStyles();
    
    // Adjust colors for high contrast theme
    for (const [mode, style] of styles.entries()) {
      styles.set(mode, {
        ...style,
        width: 7,
        opacity: 1
      });
    }
    
    return styles;
  }

  /**
   * Generate visualization data for a POI route
   */
  generateVisualizationData(
    route: POIRoutingResult['route'],
    options?: POIRouteVisualizationOptions
  ): POIRouteVisualization {
    const opts = {
      showPOIIcons: true,
      showPOILabels: true,
      showRouteSegments: true,
      showTransfers: true,
      colorByMode: true,
      highlightRequiredPOIs: true,
      showVisitOrder: true,
      showTiming: false,
      clusterNearbyPOIs: false,
      clusterRadius: 100,
      simplifyGeometry: false,
      simplifyTolerance: 10,
      animationDuration: 1000,
      interactive: true,
      ...options
    };

    // Get current theme
    const theme = this.themes.get(this.currentTheme);
    if (!theme) {
      throw new Error(`Theme '${this.currentTheme}' not found`);
    }

    // Calculate bounds
    const bounds = this.calculateBounds(route.geometry);

    // Calculate center and zoom
    const center = this.calculateCenter(bounds);
    const zoom = this.calculateZoom(bounds, opts);

    // Process geometry if needed
    const geometry = opts.simplifyGeometry 
      ? this.simplifyGeometry(route.geometry, opts.simplifyTolerance!)
      : route.geometry;

    // Generate POI markers
    const poiMarkers = this.generatePOIMarkers(route, theme, opts);

    // Cluster POIs if requested
    const clusteredMarkers = opts.clusterNearbyPOIs
      ? this.clusterPOIMarkers(poiMarkers, opts.clusterRadius!)
      : poiMarkers;

    // Generate route segments
    const segments = this.generateRouteSegments(route, theme, opts);

    return {
      routeId: route.id,
      geometry,
      poiMarkers: clusteredMarkers,
      segments,
      bounds,
      center,
      zoom
    };
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
  private calculateZoom(
    bounds: { northEast: Coordinate; southWest: Coordinate },
    options: POIRouteVisualizationOptions
  ): number {
    const latDiff = bounds.northEast.latitude - bounds.southWest.latitude;
    const lonDiff = bounds.northEast.longitude - bounds.southWest.longitude;
    const maxDiff = Math.max(latDiff, lonDiff);
    
    // Simple zoom calculation based on maximum difference
    // In a real implementation, this would consider map dimensions and projection
    const zoom = Math.max(1, Math.min(18, Math.log2(360 / maxDiff)));
    
    // Adjust zoom based on options
    if (options.clusterNearbyPOIs) {
      return Math.max(1, zoom - 1);
    }
    
    return zoom;
  }

  /**
   * Simplify geometry using Douglas-Peucker algorithm
   */
  private simplifyGeometry(geometry: Coordinate[], tolerance: number): Coordinate[] {
    if (geometry.length <= 2) {
      return geometry;
    }
    
    // Find the point with the maximum distance
    let maxDistance = 0;
    let maxIndex = 0;
    
    for (let i = 1; i < geometry.length - 1; i++) {
      const distance = this.calculatePerpendicularDistance(
        geometry[i],
        geometry[0],
        geometry[geometry.length - 1]
      );
      
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    
    // If max distance is greater than tolerance, recursively simplify
    if (maxDistance > tolerance) {
      const leftPart = this.simplifyGeometry(
        geometry.slice(0, maxIndex + 1),
        tolerance
      );
      const rightPart = this.simplifyGeometry(
        geometry.slice(maxIndex),
        tolerance
      );
      
      // Combine the results, avoiding duplication of the maxIndex point
      return [...leftPart.slice(0, -1), ...rightPart];
    } else {
      // Return the start and end points
      return [geometry[0], geometry[geometry.length - 1]];
    }
  }

  /**
   * Calculate perpendicular distance from a point to a line
   */
  private calculatePerpendicularDistance(
    point: Coordinate,
    lineStart: Coordinate,
    lineEnd: Coordinate
  ): number {
    // Calculate the distance from point to line segment using vector projection
    const A = point.latitude - lineStart.latitude;
    const B = point.longitude - lineStart.longitude;
    const C = lineEnd.latitude - lineStart.latitude;
    const D = lineEnd.longitude - lineStart.longitude;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    if (lenSq === 0) {
      // Line segment is a point
      return this.calculateDistance(point, lineStart);
    }
    
    let param = dot / lenSq;
    
    // Clamp parameter to line segment
    param = Math.max(0, Math.min(1, param));
    
    const xx = lineStart.latitude + param * C;
    const yy = lineStart.longitude + param * D;
    
    const closestPoint = { latitude: xx, longitude: yy };
    
    return this.calculateDistance(point, closestPoint);
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
   * Generate POI markers for visualization
   */
  private generatePOIMarkers(
    route: POIRoutingResult['route'],
    theme: VisualizationTheme,
    options: POIRouteVisualizationOptions
  ): POIRouteVisualization['poiMarkers'] {
    return route.pois.map((visit, index) => {
      const isRequired = visit.poi.visitPriority?.mustVisit || false;
      const isVisited = visit.visitDuration > 0;
      
      // Get marker style for POI category
      let style = theme.poiMarkerStyles.get(visit.poi.category);
      if (!style) {
        style = theme.poiMarkerStyles.get(POICategory.CUSTOM)!;
      }
      
      // Adjust style based on options
      if (options.highlightRequiredPOIs && isRequired) {
        style = {
          ...style,
          color: theme.highlightColor,
          size: style.size * 1.2
        };
      }
      
      // Create label
      let label = '';
      if (options.showPOILabels) {
        label = visit.poi.name;
        if (options.showVisitOrder) {
          label = `${visit.order}. ${label}`;
        }
      }
      
      // Create icon
      let icon = '';
      if (options.showPOIIcons) {
        icon = style.icon;
      }
      
      // Determine color based on visit status
      let color = style.color;
      if (!isVisited) {
        // Use a more muted color for unvisited POIs
        color = this.adjustColorBrightness(color, -30);
      }
      
      return {
        poi: visit.poi,
        position: visit.poi.coordinate,
        order: visit.order,
        isVisited,
        isRequired,
        label,
        icon,
        color,
        size: style.size,
        borderColor: style.borderColor,
        borderWidth: style.borderWidth,
        opacity: style.opacity
      };
    });
  }

  /**
   * Cluster nearby POI markers
   */
  private clusterPOIMarkers(
    markers: POIRouteVisualization['poiMarkers'],
    clusterRadius: number
  ): POIRouteVisualization['poiMarkers'] {
    const clustered: POIRouteVisualization['poiMarkers'] = [];
    const usedMarkers = new Set<string>();

    for (const marker of markers) {
      if (usedMarkers.has(marker.poi.id)) {
        continue;
      }

      // Find all markers within cluster radius
      const clusterMarkers = markers.filter(m => {
        if (usedMarkers.has(m.poi.id)) {
          return false;
        }
        return this.calculateDistance(marker.position, m.position) <= clusterRadius;
      });

      if (clusterMarkers.length > 1) {
        // Create a cluster
        const clusterCenter = this.calculateClusterCenter(clusterMarkers);
        const clusterCategories = [...new Set(clusterMarkers.map(m => m.poi.category))];
        const clusterRating = this.calculateClusterRating(clusterMarkers);
        
        // Mark markers as used
        clusterMarkers.forEach(m => usedMarkers.add(m.poi.id));
        
        // Create cluster style
        const clusterStyle: POIMarkerStyle = {
          icon: 'cluster',
          size: 32 + Math.min(clusterMarkers.length * 2, 20),
          color: '#2196F3',
          borderColor: '#ffffff',
          borderWidth: 2,
          labelColor: '#212529',
          labelSize: 14,
          labelOffset: 8,
          opacity: 0.9,
          zIndex: 15
        };
        
        clustered.push({
          poi: {
            id: `cluster-${clustered.length}`,
            name: `${clusterMarkers.length} places`,
            category: POICategory.CUSTOM,
            coordinate: clusterCenter,
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
              tags: ['cluster'],
              description: `Cluster of ${clusterMarkers.length} places`,
              images: []
            }
          },
          position: clusterCenter,
          order: 0,
          isVisited: true,
          isRequired: false,
          label: `${clusterMarkers.length} places`,
          icon: clusterStyle.icon,
          color: clusterStyle.color
        });
      } else {
        // Add individual marker
        usedMarkers.add(marker.poi.id);
        clustered.push(marker);
      }
    }

    return clustered;
  }

  /**
   * Calculate cluster center
   */
  private calculateClusterCenter(markers: POIRouteVisualization['poiMarkers']): Coordinate {
    const centerLat = markers.reduce((sum, m) => sum + m.position.latitude, 0) / markers.length;
    const centerLon = markers.reduce((sum, m) => sum + m.position.longitude, 0) / markers.length;
    
    return {
      latitude: centerLat,
      longitude: centerLon
    };
  }

  /**
   * Calculate cluster rating
   */
  private calculateClusterRating(markers: POIRouteVisualization['poiMarkers']): number | undefined {
    const ratings = markers
      .filter(m => m.poi.rating)
      .map(m => m.poi.rating!.average);
    
    return ratings.length > 0 
      ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length 
      : undefined;
  }

  /**
   * Generate route segments for visualization
   */
  private generateRouteSegments(
    route: POIRoutingResult['route'],
    theme: VisualizationTheme,
    options: POIRouteVisualizationOptions
  ): POIRouteVisualization['segments'] {
    if (!options.showRouteSegments) {
      return [];
    }

    return route.segments.map((segment, index) => {
      // Get segment style for transport mode
      let style = theme.routeSegmentStyles.get(segment.mode);
      if (!style) {
        style = {
          color: '#2196F3',
          width: 5,
          opacity: 0.8,
          zIndex: 5
        };
      }
      
      // Create label
      let label = '';
      if (index < route.pois.length) {
        label = `${segment.mode} to ${route.pois[index].poi.name}`;
      } else {
        label = `${segment.mode} to destination`;
      }
      
      return {
        from: segment.from,
        to: segment.to,
        mode: segment.mode,
        color: style.color,
        width: style.width,
        style: 'solid',
        label,
        opacity: style.opacity
      };
    });
  }

  /**
   * Adjust color brightness
   */
  private adjustColorBrightness(color: string, amount: number): string {
    // Convert hex to RGB
    let r = parseInt(color.substring(1, 3), 16);
    let g = parseInt(color.substring(3, 5), 16);
    let b = parseInt(color.substring(5, 7), 16);
    
    // Adjust brightness
    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));
    
    // Convert back to hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Set visualization theme
   */
  setTheme(themeName: string): void {
    if (!this.themes.has(themeName)) {
      throw new Error(`Theme '${themeName}' not found`);
    }
    this.currentTheme = themeName;
  }

  /**
   * Get available themes
   */
  getAvailableThemes(): string[] {
    return Array.from(this.themes.keys());
  }

  /**
   * Get current theme
   */
  getCurrentTheme(): VisualizationTheme {
    const theme = this.themes.get(this.currentTheme);
    if (!theme) {
      throw new Error(`Theme '${this.currentTheme}' not found`);
    }
    return theme;
  }

  /**
   * Add custom theme
   */
  addCustomTheme(theme: VisualizationTheme): void {
    this.themes.set(theme.name, theme);
  }

  /**
   * Generate animation keyframes for route visualization
   */
  generateAnimationKeyframes(
    route: POIRoutingResult['route'],
    options?: POIRouteVisualizationOptions
  ): AnimationKeyframe[] {
    const opts = {
      animationDuration: 1000,
      ...options
    };

    const keyframes: AnimationKeyframe[] = [];
    const totalDuration = route.duration;
    
    // Add keyframe for route start
    keyframes.push({
      time: 0,
      position: route.geometry[0],
      segmentIndex: 0,
      segmentProgress: 0
    });
    
    // Add keyframes for each POI
    let currentTime = 0;
    for (let i = 0; i < route.pois.length; i++) {
      const visit = route.pois[i];
      const segment = route.segments[i];
      
      // Add keyframe for POI arrival
      currentTime += segment.duration;
      const timeRatio = currentTime / totalDuration;
      
      keyframes.push({
        time: timeRatio,
        position: visit.poi.coordinate,
        poi: visit.poi,
        segmentIndex: i,
        segmentProgress: 1
      });
      
      // Add keyframe for POI departure
      currentTime += visit.visitDuration;
      const departureTimeRatio = currentTime / totalDuration;
      
      keyframes.push({
        time: departureTimeRatio,
        position: visit.poi.coordinate,
        poi: visit.poi,
        segmentIndex: i,
        segmentProgress: 1
      });
    }
    
    // Add keyframe for route end
    keyframes.push({
      time: 1,
      position: route.geometry[route.geometry.length - 1],
      segmentIndex: route.segments.length - 1,
      segmentProgress: 1
    });
    
    return keyframes;
  }

  /**
   * Generate printable version of route visualization
   */
  generatePrintableVisualization(
    route: POIRoutingResult['route'],
    options?: POIRouteVisualizationOptions
  ): {
    visualization: POIRouteVisualization;
    summary: {
      title: string;
      description: string;
      statistics: {
        totalDistance: string;
        totalDuration: string;
        totalPOIs: number;
        requiredPOIs: number;
        optionalPOIs: number;
      };
      poiList: {
        name: string;
        category: string;
        order: number;
        visitDuration: string;
        description?: string;
      }[];
    };
  } {
    // Generate visualization data
    const visualization = this.generateVisualizationData(route, {
      ...options,
      interactive: false,
      animationDuration: 0
    });
    
    // Create summary
    const summary = {
      title: 'Points of Interest Route',
      description: `A route visiting ${route.pois.length} points of interest`,
      statistics: {
        totalDistance: `${(route.distance / 1000).toFixed(2)} km`,
        totalDuration: this.formatDuration(route.duration),
        totalPOIs: route.pois.length,
        requiredPOIs: route.pois.filter(p => p.poi.visitPriority?.mustVisit).length,
        optionalPOIs: route.pois.filter(p => !p.poi.visitPriority?.mustVisit).length
      },
      poiList: route.pois.map(visit => ({
        name: visit.poi.name,
        category: visit.poi.category,
        order: visit.order,
        visitDuration: this.formatDuration(visit.visitDuration),
        description: visit.poi.metadata.description
      }))
    };
    
    return {
      visualization,
      summary
    };
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}