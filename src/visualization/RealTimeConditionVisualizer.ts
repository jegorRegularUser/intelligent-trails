/**
 * Real-Time Condition Visualizer implementation
 * Handles visualization of real-time conditions affecting routes such as traffic,
 * weather, events, and other dynamic factors.
 */

import {
  TrafficCondition,
  VisualRouteSegment,
  VisualizationTheme,
  VisualizationEvent,
  VisualizationEventType
} from '../types/visualization';

import { RealTimeConditions } from '../types/routing';
import { Coordinate } from '../types/graph';
import { TransportMode } from '../types/graph';

/**
 * Weather condition types
 */
export enum WeatherCondition {
  CLEAR = 'clear',
  CLOUDY = 'cloudy',
  RAIN = 'rain',
  SNOW = 'snow',
  FOG = 'fog',
  STORM = 'storm',
  DRIZZLE = 'drizzle'
}

/**
 * Event impact levels
 */
export enum EventImpact {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Visual representation of weather conditions
 */
export interface VisualWeatherCondition {
  condition: WeatherCondition;
  temperature: number; // in celsius
  windSpeed: number; // in km/h
  visibility: number; // in meters
  icon: string;
  color: string;
  description: string;
}

/**
 * Visual representation of traffic events
 */
export interface VisualTrafficEvent {
  id: string;
  type: 'construction' | 'accident' | 'event' | 'closure' | 'hazard';
  position: Coordinate;
  radius: number; // in meters
  impact: EventImpact;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  style: {
    color: string;
    borderColor: string;
    borderWidth: number;
    opacity: number;
    zIndex: number;
  };
}

/**
 * Visual representation of congestion levels
 */
export interface VisualCongestionLevel {
  level: number; // 0-1
  color: string;
  label: string;
  description: string;
  animationSpeed: number; // for animated indicators
}

/**
 * Real-time condition visualization options
 */
export interface RealTimeVisualizationOptions {
  showTrafficConditions: boolean;
  showWeatherConditions: boolean;
  showEvents: boolean;
  animateCongestion: boolean;
  showSpeedIndicators: boolean;
  showDelayIndicators: boolean;
  autoRefresh: boolean;
  refreshInterval: number; // in seconds
  opacity: number;
  zIndex: number;
}

/**
 * Real-time condition visualization data
 */
export interface RealTimeVisualization {
  trafficConditions: Map<string, TrafficCondition>;
  congestionLevels: Map<string, VisualCongestionLevel>;
  weatherConditions: VisualWeatherCondition;
  events: VisualTrafficEvent[];
  lastUpdated: Date;
  options: RealTimeVisualizationOptions;
}

/**
 * Real-Time Condition Visualizer class
 */
export class RealTimeConditionVisualizer {
  private currentVisualization: RealTimeVisualization | null = null;
  private theme: VisualizationTheme | null = null;
  private refreshTimer: number | null = null;
  private eventListeners: Map<VisualizationEventType, Function[]> = new Map();

  constructor(theme?: VisualizationTheme) {
    this.theme = theme || null;
    this.initializeCongestionLevels();
  }

  /**
   * Initialize congestion level definitions
   */
  private initializeCongestionLevels(): void {
    this.congestionLevels = new Map([
      [0, { level: 0, color: '#4CAF50', label: 'Clear', description: 'Free flowing traffic', animationSpeed: 0 }],
      [0.3, { level: 0.3, color: '#FFC107', label: 'Slow', description: 'Light traffic', animationSpeed: 0.5 }],
      [0.6, { level: 0.6, color: '#FF9800', label: 'Congested', description: 'Heavy traffic', animationSpeed: 1 }],
      [1, { level: 1, color: '#F44336', label: 'Blocked', description: 'Traffic blocked', animationSpeed: 2 }]
    ]);
  }

  private congestionLevels: Map<number, VisualCongestionLevel>;

  /**
   * Set visualization theme
   */
  setTheme(theme: VisualizationTheme): void {
    this.theme = theme;
  }

  /**
   * Create real-time visualization from conditions data
   */
  createVisualization(conditions: RealTimeConditions, options?: Partial<RealTimeVisualizationOptions>): RealTimeVisualization {
    const mergedOptions: RealTimeVisualizationOptions = {
      showTrafficConditions: true,
      showWeatherConditions: true,
      showEvents: true,
      animateCongestion: true,
      showSpeedIndicators: true,
      showDelayIndicators: true,
      autoRefresh: true,
      refreshInterval: 30,
      opacity: 0.8,
      zIndex: 10,
      ...options
    };

    // Create traffic conditions map
    const trafficConditions = new Map<string, TrafficCondition>();
    conditions.traffic.forEach(traffic => {
      trafficConditions.set(traffic.segmentId, this.mapDelayToCondition(traffic.delay));
    });

    // Create congestion levels map
    const congestionLevels = new Map<string, VisualCongestionLevel>();
    conditions.traffic.forEach(traffic => {
      const level = this.getCongestionLevelFromValue(traffic.delay > 0 ? 0.5 : 0);
      congestionLevels.set(traffic.segmentId, level);
    });

    // Create weather condition visualization
    const weatherCondition = this.createWeatherCondition(conditions.weather);

    // Create visual events
    const events = conditions.events.map(event => this.createVisualEvent(event));

    const visualization: RealTimeVisualization = {
      trafficConditions,
      congestionLevels,
      weatherConditions: weatherCondition,
      events,
      lastUpdated: new Date(),
      options: mergedOptions
    };

    this.currentVisualization = visualization;

    // Set up auto-refresh if enabled
    if (mergedOptions.autoRefresh) {
      this.startAutoRefresh(mergedOptions.refreshInterval);
    }

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { visualization },
      source: 'RealTimeConditionVisualizer'
    });

    return visualization;
  }

  /**
   * Map delay to traffic condition
   */
  private mapDelayToCondition(delay: number): TrafficCondition {
    if (delay === 0) {
      return TrafficCondition.CLEAR;
    } else if (delay < 60) {
      return TrafficCondition.SLOW;
    } else if (delay < 300) {
      return TrafficCondition.CONGESTED;
    } else {
      return TrafficCondition.BLOCKED;
    }
  }

  /**
   * Get congestion level visualization
   */
  private getCongestionLevelFromValue(congestionLevel: number): VisualCongestionLevel {
    // Find the closest defined level
    const levels = Array.from(this.congestionLevels.keys()).sort((a, b) => a - b);
    let closestLevel = levels[0];
    
    for (const level of levels) {
      if (congestionLevel >= level) {
        closestLevel = level;
      } else {
        break;
      }
    }
    
    return this.congestionLevels.get(closestLevel)!;
  }

  /**
   * Create weather condition visualization
   */
  private createWeatherCondition(weather: RealTimeConditions['weather']): VisualWeatherCondition {
    const condition = this.mapWeatherCondition(weather.condition);
    
    return {
      condition,
      temperature: weather.temperature,
      windSpeed: weather.windSpeed,
      visibility: weather.visibility,
      icon: this.getWeatherIcon(condition),
      color: this.getWeatherColor(condition),
      description: this.getWeatherDescription(condition, weather.temperature)
    };
  }

  /**
   * Map weather condition string to enum
   */
  private mapWeatherCondition(condition: string): WeatherCondition {
    switch (condition.toLowerCase()) {
      case 'clear':
        return WeatherCondition.CLEAR;
      case 'rain':
        return WeatherCondition.RAIN;
      case 'snow':
        return WeatherCondition.SNOW;
      case 'fog':
        return WeatherCondition.FOG;
      case 'storm':
        return WeatherCondition.STORM;
      case 'drizzle':
        return WeatherCondition.DRIZZLE;
      default:
        return WeatherCondition.CLOUDY;
    }
  }

  /**
   * Get weather icon for condition
   */
  private getWeatherIcon(condition: WeatherCondition): string {
    const icons = {
      [WeatherCondition.CLEAR]: '☀️',
      [WeatherCondition.CLOUDY]: '☁️',
      [WeatherCondition.RAIN]: '🌧️',
      [WeatherCondition.SNOW]: '❄️',
      [WeatherCondition.FOG]: '🌫️',
      [WeatherCondition.STORM]: '⛈️',
      [WeatherCondition.DRIZZLE]: '🌦️'
    };
    
    return icons[condition] || '☁️';
  }

  /**
   * Get weather color for condition
   */
  private getWeatherColor(condition: WeatherCondition): string {
    const colors = {
      [WeatherCondition.CLEAR]: '#FFC107',
      [WeatherCondition.CLOUDY]: '#9E9E9E',
      [WeatherCondition.RAIN]: '#2196F3',
      [WeatherCondition.SNOW]: '#E3F2FD',
      [WeatherCondition.FOG]: '#B0BEC5',
      [WeatherCondition.STORM]: '#673AB7',
      [WeatherCondition.DRIZZLE]: '#03A9F4'
    };
    
    return colors[condition] || '#9E9E9E';
  }

  /**
   * Get weather description
   */
  private getWeatherDescription(condition: WeatherCondition, temperature: number): string {
    const descriptions = {
      [WeatherCondition.CLEAR]: `Clear sky, ${temperature}°C`,
      [WeatherCondition.CLOUDY]: `Cloudy, ${temperature}°C`,
      [WeatherCondition.RAIN]: `Rainy, ${temperature}°C`,
      [WeatherCondition.SNOW]: `Snowy, ${temperature}°C`,
      [WeatherCondition.FOG]: `Foggy, ${temperature}°C`,
      [WeatherCondition.STORM]: `Stormy, ${temperature}°C`,
      [WeatherCondition.DRIZZLE]: `Drizzle, ${temperature}°C`
    };
    
    return descriptions[condition] || `Weather conditions, ${temperature}°C`;
  }

  /**
   * Create visual event
   */
  private createVisualEvent(event: RealTimeConditions['events'][0]): VisualTrafficEvent {
    const impactColors = {
      [EventImpact.LOW]: '#4CAF50',
      [EventImpact.MEDIUM]: '#FFC107',
      [EventImpact.HIGH]: '#FF9800',
      [EventImpact.CRITICAL]: '#F44336'
    };

    return {
      id: event.id,
      type: event.type,
      position: event.location.coordinate,
      radius: event.location.radius,
      impact: event.impact as EventImpact,
      title: this.getEventTitle(event.type),
      description: this.getEventDescription(event.type),
      startTime: event.startTime,
      endTime: event.endTime,
      style: {
        color: impactColors[event.impact],
        borderColor: '#FFFFFF',
        borderWidth: 2,
        opacity: 0.8,
        zIndex: 15
      }
    };
  }

  /**
   * Get event title
   */
  private getEventTitle(type: string): string {
    const titles = {
      construction: 'Construction Work',
      accident: 'Traffic Accident',
      event: 'Public Event',
      closure: 'Road Closure',
      hazard: 'Road Hazard'
    };
    
    return titles[type as keyof typeof titles] || 'Traffic Event';
  }

  /**
   * Get event description
   */
  private getEventDescription(type: string): string {
    const descriptions = {
      construction: 'Road construction work in progress',
      accident: 'Traffic accident reported',
      event: 'Public event affecting traffic',
      closure: 'Road closure in effect',
      hazard: 'Road hazard ahead'
    };
    
    return descriptions[type as keyof typeof descriptions] || 'Traffic event';
  }

  /**
   * Update route segment styles based on real-time conditions
   */
  updateSegmentStyles(segments: VisualRouteSegment[]): VisualRouteSegment[] {
    if (!this.currentVisualization) {
      return segments;
    }

    return segments.map(segment => {
      const condition = this.currentVisualization!.trafficConditions.get(segment.id);
      const congestionLevel = this.currentVisualization!.congestionLevels.get(segment.id);
      
      if (condition && this.currentVisualization!.options.showTrafficConditions) {
        // Update style based on condition
        const conditionStyle = this.theme?.trafficConditions.get(condition);
        if (conditionStyle) {
          segment.style = {
            ...segment.style,
            color: conditionStyle.color,
            opacity: conditionStyle.opacity
          };
        }
      }

      if (congestionLevel && this.currentVisualization!.options.animateCongestion) {
        // Add animation data for congestion
        segment.realTimeData = {
          ...segment.realTimeData!,
          congestionLevel: congestionLevel.level
        };
      }

      return segment;
    });
  }

  /**
   * Start auto-refresh timer
   */
  private startAutoRefresh(interval: number): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = window.setInterval(() => {
      this.emitEvent({
        type: VisualizationEventType.INTERACTION,
        timestamp: new Date(),
        data: { action: 'refresh' },
        source: 'RealTimeConditionVisualizer'
      });
    }, interval * 1000);
  }

  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Get current visualization
   */
  getCurrentVisualization(): RealTimeVisualization | null {
    return this.currentVisualization;
  }

  /**
   * Get weather conditions
   */
  getWeatherConditions(): VisualWeatherCondition | null {
    return this.currentVisualization?.weatherConditions || null;
  }

  /**
   * Get traffic events
   */
  getTrafficEvents(): VisualTrafficEvent[] {
    return this.currentVisualization?.events || [];
  }

  /**
   * Get traffic condition for a segment
   */
  getTrafficCondition(segmentId: string): TrafficCondition | null {
    return this.currentVisualization?.trafficConditions.get(segmentId) || null;
  }

  /**
   * Get congestion level for a segment
   */
  getCongestionLevelForSegment(segmentId: string): VisualCongestionLevel | null {
    return this.currentVisualization?.congestionLevels.get(segmentId) || null;
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
    this.stopAutoRefresh();
    this.eventListeners.clear();
    this.currentVisualization = null;
  }
}