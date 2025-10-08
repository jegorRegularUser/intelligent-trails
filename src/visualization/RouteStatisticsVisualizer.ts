/**
 * Route Statistics Visualizer implementation
 * Handles visualization of route metrics, performance indicators, comparison charts,
 * and accessibility information in an interactive dashboard format.
 */

import {
  RouteStatistics,
  VisualizationTheme,
  VisualizationEvent,
  VisualizationEventType
} from '../types/visualization';

import { MultiModalRoute, RouteSegment } from '../types/routing';
import { TransportMode } from '../types/graph';

/**
 * Statistics display types
 */
export enum StatisticsDisplayType {
  SUMMARY = 'summary',
  DETAILED = 'detailed',
  COMPARISON = 'comparison',
  HISTORICAL = 'historical'
}

/**
 * Chart types for statistics visualization
 */
export enum ChartType {
  BAR = 'bar',
  PIE = 'pie',
  LINE = 'line',
  RADAR = 'radar',
  GAUGE = 'gauge'
}

/**
 * Metric category types
 */
export enum MetricCategory {
  TIME = 'time',
  DISTANCE = 'distance',
  COST = 'cost',
  ACCESSIBILITY = 'accessibility',
  COMFORT = 'comfort',
  ENVIRONMENTAL = 'environmental',
  SAFETY = 'safety'
}

/**
 * Visual representation of a metric
 */
export interface VisualMetric {
  id: string;
  category: MetricCategory;
  label: string;
  value: number;
  unit: string;
  formattedValue: string;
  target?: number;
  trend?: 'up' | 'down' | 'stable';
  change?: number; // percentage change
  chartType?: ChartType;
  color: string;
  icon: string;
  description: string;
}

/**
 * Visual representation of a statistics chart
 */
export interface StatisticsChart {
  id: string;
  title: string;
  type: ChartType;
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor: string | string[];
      borderColor: string;
      borderWidth?: number;
    }[];
  };
  options: {
    responsive: boolean;
    maintainAspectRatio: boolean;
    plugins?: {
      legend?: {
        display: boolean;
        position?: 'top' | 'bottom' | 'left' | 'right';
      };
      tooltip?: {
        enabled: boolean;
        callbacks?: any;
      };
    };
    scales?: any;
  };
}

/**
 * Statistics dashboard configuration
 */
export interface StatisticsDashboardConfig {
  displayType: StatisticsDisplayType;
  showCharts: boolean;
  showMetrics: boolean;
  showAccessibility: boolean;
  showComparison: boolean;
  showHistorical: boolean;
  chartTypes: ChartType[];
  metricCategories: MetricCategory[];
  refreshInterval: number; // in seconds
  autoRefresh: boolean;
}

/**
 * Statistics visualization data
 */
export interface StatisticsVisualization {
  id: string;
  route: MultiModalRoute;
  statistics: RouteStatistics;
  metrics: VisualMetric[];
  charts: StatisticsChart[];
  config: StatisticsDashboardConfig;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    calculationTime: number; // in milliseconds
  };
}

/**
 * Route Statistics Visualizer class
 */
export class RouteStatisticsVisualizer {
  private currentVisualization: StatisticsVisualization | null = null;
  private theme: VisualizationTheme | null = null;
  private eventListeners: Map<VisualizationEventType, Function[]> = new Map();
  private refreshTimer: number | null = null;

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
   * Create statistics visualization from route data
   */
  createVisualization(
    route: MultiModalRoute,
    config?: Partial<StatisticsDashboardConfig>
  ): StatisticsVisualization {
    const mergedConfig: StatisticsDashboardConfig = {
      displayType: StatisticsDisplayType.SUMMARY,
      showCharts: true,
      showMetrics: true,
      showAccessibility: true,
      showComparison: false,
      showHistorical: false,
      chartTypes: [ChartType.BAR, ChartType.PIE, ChartType.RADAR],
      metricCategories: [
        MetricCategory.TIME,
        MetricCategory.DISTANCE,
        MetricCategory.COST,
        MetricCategory.ACCESSIBILITY,
        MetricCategory.COMFORT,
        MetricCategory.ENVIRONMENTAL,
        MetricCategory.SAFETY
      ],
      refreshInterval: 30,
      autoRefresh: false,
      ...config
    };

    // Calculate route statistics
    const statistics = this.calculateRouteStatistics(route);

    // Create visual metrics
    const metrics = this.createVisualMetrics(statistics, mergedConfig.metricCategories);

    // Create charts
    const charts = mergedConfig.showCharts 
      ? this.createStatisticsCharts(statistics, mergedConfig.chartTypes)
      : [];

    const visualization: StatisticsVisualization = {
      id: `stats-viz-${Date.now()}`,
      route,
      statistics,
      metrics,
      charts,
      config: mergedConfig,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        calculationTime: 0 // Will be set below
      }
    };

    // Set calculation time
    visualization.metadata.calculationTime = Date.now() - visualization.metadata.createdAt.getTime();
    this.currentVisualization = visualization;

    // Set up auto-refresh if enabled
    if (mergedConfig.autoRefresh) {
      this.startAutoRefresh(mergedConfig.refreshInterval);
    }

    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { visualization },
      source: 'RouteStatisticsVisualizer'
    });

    return visualization;
  }

  /**
   * Calculate route statistics
   */
  private calculateRouteStatistics(route: MultiModalRoute): RouteStatistics {
    // Calculate distances by mode
    const walkingDistance = route.segments
      .filter(s => s.mode === TransportMode.WALKING)
      .reduce((sum, s) => sum + s.distance, 0);

    const cyclingDistance = route.segments
      .filter(s => s.mode === TransportMode.BICYCLE)
      .reduce((sum, s) => sum + s.distance, 0);

    const transitDistance = route.segments
      .filter(s => [TransportMode.BUS, TransportMode.METRO, TransportMode.TRAM, TransportMode.TRAIN, TransportMode.FERRY].includes(s.mode))
      .reduce((sum, s) => sum + s.distance, 0);

    const drivingDistance = route.segments
      .filter(s => s.mode === TransportMode.CAR)
      .reduce((sum, s) => sum + s.distance, 0);

    // Calculate accessibility percentages
    const totalSegments = route.segments.length;
    const wheelchairAccessible = route.segments
      .filter(s => s.accessibility.wheelchairAccessible)
      .length / totalSegments;

    const hasElevator = route.segments
      .filter(s => s.accessibility.hasElevator)
      .length / totalSegments;

    const hasRamp = route.segments
      .filter(s => s.accessibility.hasRamp)
      .length / totalSegments;

    const tactilePaving = route.segments
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
        total: route.waypoints.length,
        visited: route.waypoints.filter(w => w.isStop).length,
        required: route.waypoints.filter(w => w.isStop).length,
        optional: route.waypoints.filter(w => !w.isStop).length
      },
      accessibility: {
        wheelchairAccessible,
        hasElevator,
        hasRamp,
        tactilePaving
      },
      conditions: {
        clearDistance: route.totalDistance * 0.7, // Example values
        slowDistance: route.totalDistance * 0.2,
        congestedDistance: route.totalDistance * 0.08,
        blockedDistance: route.totalDistance * 0.02
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
   * Create visual metrics
   */
  private createVisualMetrics(
    statistics: RouteStatistics,
    categories: MetricCategory[]
  ): VisualMetric[] {
    const metrics: VisualMetric[] = [];

    // Time metrics
    if (categories.includes(MetricCategory.TIME)) {
      metrics.push({
        id: 'total-duration',
        category: MetricCategory.TIME,
        label: 'Total Duration',
        value: statistics.totalDuration,
        unit: 'seconds',
        formattedValue: this.formatDuration(statistics.totalDuration),
        color: '#2196F3',
        icon: '⏱️',
        description: 'Total time for the route'
      });

      metrics.push({
        id: 'walking-duration',
        category: MetricCategory.TIME,
        label: 'Walking Time',
        value: statistics.walkingDistance / 5 * 3600,
        unit: 'seconds',
        formattedValue: this.formatDuration(statistics.walkingDistance / 5 * 3600),
        color: '#4CAF50',
        icon: '🚶',
        description: 'Time spent walking'
      });
    }

    return metrics;
  }

  /**
   * Create statistics charts
   */
  private createStatisticsCharts(
    statistics: RouteStatistics,
    chartTypes: ChartType[]
  ): StatisticsChart[] {
    const charts: StatisticsChart[] = [];

    if (chartTypes.includes(ChartType.PIE)) {
      charts.push({
        id: 'distance-by-mode',
        title: 'Distance by Transport Mode',
        type: ChartType.PIE,
        data: {
          labels: ['Walking', 'Cycling', 'Transit', 'Driving'],
          datasets: [{
            label: 'Distance (km)',
            data: [
              statistics.walkingDistance / 1000,
              statistics.cyclingDistance / 1000,
              statistics.transitDistance / 1000,
              statistics.drivingDistance / 1000
            ],
            backgroundColor: ['#4CAF50', '#2196F3', '#FF9800', '#F44336'],
            borderColor: '#FFFFFF',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false
        }
      });
    }

    return charts;
  }

  /**
   * Format duration in seconds to human readable string
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Start auto-refresh timer
   */
  private startAutoRefresh(intervalSeconds: number): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    this.refreshTimer = window.setInterval(() => {
      if (this.currentVisualization) {
        this.updateVisualization();
      }
    }, intervalSeconds * 1000);
  }

  /**
   * Update current visualization
   */
  private updateVisualization(): void {
    if (!this.currentVisualization) return;
    
    this.currentVisualization.metadata.updatedAt = new Date();
    
    this.emitEvent({
      type: VisualizationEventType.INTERACTION,
      timestamp: new Date(),
      data: { updated: true },
      source: 'RouteStatisticsVisualizer'
    });
  }

  /**
   * Emit event to listeners
   */
  private emitEvent(event: VisualizationEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => listener(event));
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    this.eventListeners.clear();
    this.currentVisualization = null;
  }
}