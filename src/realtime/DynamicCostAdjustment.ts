/**
 * Dynamic cost adjustment system for real-time routing
 * Adjusts routing costs based on real-time data to provide optimal routes
 */

import {
  RealTimeDataAggregation,
  RealTimeRouteAdjustment,
  RealTimeDataSourceType,
  TrafficCondition,
  PublicTransportStatus,
  ImpactLevel,
  EventSeverity,
} from '../types/realtime';
import { GraphEdge, RealTimeEdgeData, TransportMode as GraphTransportMode } from '../types/graph';
type TransportMode = GraphTransportMode;
import { RealTimeDataAggregationModel, RealTimeDataModelFactory } from './RealTimeDataModels';
import { RealTimeDataProcessingPipeline } from './DataProcessingPipeline';

/**
 * Cost adjustment configuration
 */
export interface CostAdjustmentConfig {
  enabled: boolean;
  updateInterval: number; // in seconds
  maxAdjustmentFactor: number; // maximum factor by which costs can be adjusted
  smoothingFactor: number; // 0-1, for smoothing adjustments over time
  thresholds: {
    traffic: {
      light: number; // congestion level threshold for light impact
      moderate: number; // congestion level threshold for moderate impact
      heavy: number; // congestion level threshold for heavy impact
    };
    weather: {
      light: number; // impact threshold for light weather impact
      moderate: number; // impact threshold for moderate weather impact
      severe: number; // impact threshold for severe weather impact
    };
    events: {
      low: number; // severity threshold for low impact
      medium: number; // severity threshold for medium impact
      high: number; // severity threshold for high impact
    };
    construction: {
      minimal: number; // impact threshold for minimal impact
      local: number; // impact threshold for local impact
      significant: number; // impact threshold for significant impact
      major: number; // impact threshold for major impact
      critical: number; // impact threshold for critical impact
    };
  };
  weights: {
    traffic: number; // 0-1, weight for traffic impact
    weather: number; // 0-1, weight for weather impact
    events: number; // 0-1, weight for events impact
    construction: number; // 0-1, weight for construction impact
    publicTransport: number; // 0-1, weight for public transport delays
  };
  modeSpecificSettings: {
    [key in TransportMode]: {
      trafficSensitivity: number; // 0-1, how sensitive this mode is to traffic
      weatherSensitivity: number; // 0-1, how sensitive this mode is to weather
      eventSensitivity: number; // 0-1, how sensitive this mode is to events
      constructionSensitivity: number; // 0-1, how sensitive this mode is to construction
    };
  };
}

/**
 * Adjustment factor for an edge
 */
export interface EdgeAdjustmentFactor {
  edgeId: string;
  durationFactor: number; // multiplier for duration
  costFactor: number; // multiplier for cost
  reliabilityFactor: number; // 0-1, reliability score
  confidence: number; // 0-1, confidence in adjustment
  reasons: string[]; // reasons for adjustment
  lastUpdated: Date;
}

/**
 * Dynamic cost adjustment system
 */
export class DynamicCostAdjustmentSystem {
  private config: CostAdjustmentConfig;
  private pipeline: RealTimeDataProcessingPipeline;
  private adjustmentFactors: Map<string, EdgeAdjustmentFactor> = new Map();
  private updateInterval?: NodeJS.Timeout;
  private statistics = {
    totalAdjustments: 0,
    averageAdjustment: 0,
    maxAdjustment: 0,
    minAdjustment: 1,
    adjustmentsByReason: {} as Record<string, number>,
    lastUpdate: null as Date | null
  };

  constructor(config: CostAdjustmentConfig, pipeline: RealTimeDataProcessingPipeline) {
    this.config = config;
    this.pipeline = pipeline;
  }

  /**
   * Initialize the cost adjustment system
   */
  initialize(): void {
    if (this.config.enabled) {
      this.startUpdateInterval();
    }
  }

  /**
   * Start the update interval
   */
  private startUpdateInterval(): void {
    this.updateInterval = setInterval(() => {
      this.updateAllAdjustments();
    }, this.config.updateInterval * 1000);
  }

  /**
   * Update adjustment factors for all edges
   */
  private updateAllAdjustments(): void {
    // This would typically get all edge IDs from the graph
    // For now, we'll work with the edges that have cached data
    const edgeIds = this.getEdgeIdsWithRealTimeData();
    
    for (const edgeId of edgeIds) {
      this.updateEdgeAdjustment(edgeId);
    }
    
    this.statistics.lastUpdate = new Date();
  }

  /**
   * Get edge IDs that have real-time data
   */
  private getEdgeIdsWithRealTimeData(): string[] {
    // In a real implementation, this would query the graph for all edge IDs
    // For now, we'll extract edge IDs from cached data
    const edgeIds = new Set<string>();
    
    // Get traffic data edge IDs
    const trafficData = this.pipeline.getCachedDataByType<any>(RealTimeDataSourceType.TRAFFIC);
    trafficData.forEach(data => {
      if (data.segmentId) edgeIds.add(data.segmentId);
    });
    
    // Get construction affected edge IDs
    const constructionData = this.pipeline.getCachedDataByType<any>(RealTimeDataSourceType.CONSTRUCTION);
    constructionData.forEach(data => {
      if (data.location?.affectedSegments) {
        data.location.affectedSegments.forEach((segmentId: string) => {
          edgeIds.add(segmentId);
        });
      }
    });
    
    // Get event affected edge IDs
    const eventData = this.pipeline.getCachedDataByType<any>(RealTimeDataSourceType.EVENTS);
    eventData.forEach(data => {
      if (data.location?.affectedSegments) {
        data.location.affectedSegments.forEach((segmentId: string) => {
          edgeIds.add(segmentId);
        });
      }
    });
    
    return Array.from(edgeIds);
  }

  /**
   * Update adjustment factor for a specific edge
   */
  private updateEdgeAdjustment(edgeId: string): void {
    const aggregation = this.pipeline.getAggregatedData(edgeId);
    if (!aggregation) {
      // No real-time data for this edge, use default factors
      this.setDefaultAdjustment(edgeId);
      return;
    }
    
    const aggregationModel = RealTimeDataModelFactory.createAggregationModel(aggregation);
    const adjustment = this.calculateEdgeAdjustment(edgeId, aggregationModel);
    
    // Apply smoothing if previous adjustment exists
    const previousAdjustment = this.adjustmentFactors.get(edgeId);
    if (previousAdjustment) {
      adjustment.durationFactor = this.smoothAdjustment(
        previousAdjustment.durationFactor,
        adjustment.durationFactor,
        this.config.smoothingFactor
      );
      adjustment.costFactor = this.smoothAdjustment(
        previousAdjustment.costFactor,
        adjustment.costFactor,
        this.config.smoothingFactor
      );
    }
    
    this.adjustmentFactors.set(edgeId, adjustment);
    this.updateStatistics(adjustment);
  }

  /**
   * Calculate adjustment factor for an edge based on real-time data
   */
  private calculateEdgeAdjustment(edgeId: string, aggregation: RealTimeDataAggregationModel): EdgeAdjustmentFactor {
    const reasons: string[] = [];
    let durationFactor = 1.0;
    let costFactor = 1.0;
    let reliabilityFactor = 1.0;
    let confidence = 1.0;
    
    // Get the base edge information (would come from graph in real implementation)
    const edgeMode = this.getEdgeMode(edgeId);
    
    // Traffic impact
    const trafficImpact = this.calculateTrafficImpact(aggregation, edgeMode);
    if (trafficImpact.factor > 1) {
      durationFactor *= trafficImpact.factor;
      costFactor *= trafficImpact.factor;
      reliabilityFactor *= trafficImpact.reliability;
      confidence *= trafficImpact.confidence;
      reasons.push(trafficImpact.reason);
    }
    
    // Weather impact
    const weatherImpact = this.calculateWeatherImpact(aggregation, edgeMode);
    if (weatherImpact.factor > 1) {
      durationFactor *= weatherImpact.factor;
      costFactor *= weatherImpact.factor;
      reliabilityFactor *= weatherImpact.reliability;
      confidence *= weatherImpact.confidence;
      reasons.push(weatherImpact.reason);
    }
    
    // Events impact
    const eventsImpact = this.calculateEventsImpact(aggregation, edgeMode);
    if (eventsImpact.factor > 1) {
      durationFactor *= eventsImpact.factor;
      costFactor *= eventsImpact.factor;
      reliabilityFactor *= eventsImpact.reliability;
      confidence *= eventsImpact.confidence;
      reasons.push(eventsImpact.reason);
    }
    
    // Construction impact
    const constructionImpact = this.calculateConstructionImpact(aggregation, edgeMode);
    if (constructionImpact.factor > 1) {
      durationFactor *= constructionImpact.factor;
      costFactor *= constructionImpact.factor;
      reliabilityFactor *= constructionImpact.reliability;
      confidence *= constructionImpact.confidence;
      reasons.push(constructionImpact.reason);
    }
    
    // Public transport impact
    const publicTransportImpact = this.calculatePublicTransportImpact(aggregation, edgeMode);
    if (publicTransportImpact.factor > 1) {
      durationFactor *= publicTransportImpact.factor;
      costFactor *= publicTransportImpact.factor;
      reliabilityFactor *= publicTransportImpact.reliability;
      confidence *= publicTransportImpact.confidence;
      reasons.push(publicTransportImpact.reason);
    }
    
    // Apply maximum adjustment factor
    durationFactor = Math.min(durationFactor, this.config.maxAdjustmentFactor);
    costFactor = Math.min(costFactor, this.config.maxAdjustmentFactor);
    
    return {
      edgeId,
      durationFactor,
      costFactor,
      reliabilityFactor,
      confidence,
      reasons,
      lastUpdated: new Date()
    };
  }

  /**
   * Calculate traffic impact on an edge
   */
  private calculateTrafficImpact(
    aggregation: RealTimeDataAggregationModel,
    mode: TransportMode
  ): { factor: number; reliability: number; confidence: number; reason: string } {
    const traffic = aggregation.getTraffic();
    if (!traffic) {
      return { factor: 1, reliability: 1, confidence: 1, reason: '' };
    }
    
    const congestionLevel = traffic.getCongestionLevel();
    const modeSettings = this.config.modeSpecificSettings[mode];
    const trafficSensitivity = modeSettings.trafficSensitivity;
    const weight = this.config.weights.traffic;
    
    let factor = 1.0;
    let reason = '';
    
    if (congestionLevel >= this.config.thresholds.traffic.heavy) {
      factor = 1.0 + (2.0 * weight * trafficSensitivity);
      reason = 'Heavy traffic';
    } else if (congestionLevel >= this.config.thresholds.traffic.moderate) {
      factor = 1.0 + (1.0 * weight * trafficSensitivity);
      reason = 'Moderate traffic';
    } else if (congestionLevel >= this.config.thresholds.traffic.light) {
      factor = 1.0 + (0.5 * weight * trafficSensitivity);
      reason = 'Light traffic';
    }
    
    return {
      factor,
      reliability: traffic.getReliability(),
      confidence: aggregation.getReliability(),
      reason
    };
  }

  /**
   * Calculate weather impact on an edge
   */
  private calculateWeatherImpact(
    aggregation: RealTimeDataAggregationModel,
    mode: TransportMode
  ): { factor: number; reliability: number; confidence: number; reason: string } {
    const weather = aggregation.getWeather();
    if (!weather) {
      return { factor: 1, reliability: 1, confidence: 1, reason: '' };
    }
    
    const impact = weather.getImpactForMode(mode);
    const modeSettings = this.config.modeSpecificSettings[mode];
    const weatherSensitivity = modeSettings.weatherSensitivity;
    const weight = this.config.weights.weather;
    
    let factor = 1.0;
    let reason = '';
    
    if (impact >= this.config.thresholds.weather.severe) {
      factor = 1.0 + (1.5 * weight * weatherSensitivity);
      reason = 'Severe weather conditions';
    } else if (impact >= this.config.thresholds.weather.moderate) {
      factor = 1.0 + (0.8 * weight * weatherSensitivity);
      reason = 'Moderate weather conditions';
    } else if (impact >= this.config.thresholds.weather.light) {
      factor = 1.0 + (0.3 * weight * weatherSensitivity);
      reason = 'Light weather conditions';
    }
    
    return {
      factor,
      reliability: 1.0, // Weather data reliability is already factored into impact
      confidence: aggregation.getReliability(),
      reason
    };
  }

  /**
   * Calculate events impact on an edge
   */
  private calculateEventsImpact(
    aggregation: RealTimeDataAggregationModel,
    mode: TransportMode
  ): { factor: number; reliability: number; confidence: number; reason: string } {
    const events = aggregation.getEvents();
    if (events.length === 0) {
      return { factor: 1, reliability: 1, confidence: 1, reason: '' };
    }
    
    const modeSettings = this.config.modeSpecificSettings[mode];
    const eventSensitivity = modeSettings.eventSensitivity;
    const weight = this.config.weights.events;
    
    // Find the highest impact event
    let maxImpact = 0;
    let maxSeverity = EventSeverity.LOW;
    let reason = '';
    
    for (const event of events) {
      if (event.isCurrentlyActive()) {
        const impact = event.calculateImpact();
        const severity = event.getSeverity();
        
        if (impact > maxImpact) {
          maxImpact = impact;
          maxSeverity = severity;
          reason = `${event.getType()} event: ${event.getTitle()}`;
        }
      }
    }
    
    let factor = 1.0;
    
    const severityValue = this.severityToNumber(maxSeverity);
    if (severityValue >= this.config.thresholds.events.high) {
      factor = 1.0 + (2.0 * weight * eventSensitivity * maxImpact);
    } else if (severityValue >= this.config.thresholds.events.medium) {
      factor = 1.0 + (1.0 * weight * eventSensitivity * maxImpact);
    } else if (severityValue >= this.config.thresholds.events.low) {
      factor = 1.0 + (0.5 * weight * eventSensitivity * maxImpact);
    }
    
    return {
      factor,
      reliability: 1.0 - (maxImpact * 0.3), // Events reduce reliability
      confidence: aggregation.getReliability(),
      reason
    };
  }

  /**
   * Calculate construction impact on an edge
   */
  private calculateConstructionImpact(
    aggregation: RealTimeDataAggregationModel,
    mode: TransportMode
  ): { factor: number; reliability: number; confidence: number; reason: string } {
    const construction = aggregation.getConstruction();
    if (construction.length === 0) {
      return { factor: 1, reliability: 1, confidence: 1, reason: '' };
    }
    
    const modeSettings = this.config.modeSpecificSettings[mode];
    const constructionSensitivity = modeSettings.constructionSensitivity;
    const weight = this.config.weights.construction;
    
    // Find the highest impact construction
    let maxImpact = 0;
    let maxImpactLevel = ImpactLevel.MINIMAL;
    let reason = '';
    
    for (const c of construction) {
      if (c.isCurrentlyActive()) {
        const impact = c.calculateImpact();
        const impactLevel = c.getImpact();
        
        if (impact > maxImpact) {
          maxImpact = impact;
          maxImpactLevel = impactLevel;
          reason = `${c.getType()}: ${c.getTitle()}`;
        }
      }
    }
    
    let factor = 1.0;
    
    const impactValue = this.impactToNumber(maxImpactLevel);
    if (impactValue >= this.config.thresholds.construction.critical) {
      factor = 1.0 + (3.0 * weight * constructionSensitivity * maxImpact);
    } else if (impactValue >= this.config.thresholds.construction.major) {
      factor = 1.0 + (2.0 * weight * constructionSensitivity * maxImpact);
    } else if (impactValue >= this.config.thresholds.construction.significant) {
      factor = 1.0 + (1.5 * weight * constructionSensitivity * maxImpact);
    } else if (impactValue >= this.config.thresholds.construction.local) {
      factor = 1.0 + (1.0 * weight * constructionSensitivity * maxImpact);
    } else if (impactValue >= this.config.thresholds.construction.minimal) {
      factor = 1.0 + (0.5 * weight * constructionSensitivity * maxImpact);
    }
    
    return {
      factor,
      reliability: 1.0 - (maxImpact * 0.5), // Construction significantly reduces reliability
      confidence: aggregation.getReliability(),
      reason
    };
  }

  /**
   * Calculate public transport impact on an edge
   */
  private calculatePublicTransportImpact(
    aggregation: RealTimeDataAggregationModel,
    mode: TransportMode
  ): { factor: number; reliability: number; confidence: number; reason: string } {
    // Only apply to public transport modes
    if (![
      'BUS',
      'TRAM',
      'METRO',
      'TRAIN',
      'FERRY'
    ].includes(mode)) {
      return { factor: 1, reliability: 1, confidence: 1, reason: '' };
    }
    
    const publicTransport = aggregation.getPublicTransport();
    if (publicTransport.length === 0) {
      return { factor: 1, reliability: 1, confidence: 1, reason: '' };
    }
    
    const weight = this.config.weights.publicTransport;
    
    // Find the most delayed transport
    let maxDelay = 0;
    let worstStatus = PublicTransportStatus.ON_TIME;
    let reason = '';
    
    for (const pt of publicTransport) {
      const delay = Math.abs(pt.getDelay());
      const status = pt.getStatus();
      
      if (delay > maxDelay) {
        maxDelay = delay;
        worstStatus = status;
        reason = `${pt.getMode()} ${pt.getRouteId()}: ${status}`;
      }
    }
    
    let factor = 1.0;
    
    if (worstStatus === PublicTransportStatus.CANCELLED) {
      factor = 10.0; // Very high factor for cancelled services
    } else if (worstStatus === PublicTransportStatus.DIVERTED) {
      factor = 1.0 + (2.0 * weight);
    } else if (maxDelay > 600) { // More than 10 minutes delay
      factor = 1.0 + (1.5 * weight);
    } else if (maxDelay > 300) { // More than 5 minutes delay
      factor = 1.0 + (1.0 * weight);
    } else if (maxDelay > 120) { // More than 2 minutes delay
      factor = 1.0 + (0.5 * weight);
    }
    
    return {
      factor,
      reliability: worstStatus === PublicTransportStatus.ON_TIME ? 1.0 : 0.8,
      confidence: aggregation.getReliability(),
      reason
    };
  }

  /**
   * Get the transport mode for an edge
   */
  private getEdgeMode(edgeId: string): TransportMode {
    // In a real implementation, this would query the graph for the edge's mode
    // For now, we'll default to CAR
    return GraphTransportMode.CAR as TransportMode;
  }

  /**
   * Set default adjustment for an edge
   */
  private setDefaultAdjustment(edgeId: string): void {
    this.adjustmentFactors.set(edgeId, {
      edgeId,
      durationFactor: 1.0,
      costFactor: 1.0,
      reliabilityFactor: 1.0,
      confidence: 0.5,
      reasons: ['No real-time data available'],
      lastUpdated: new Date()
    });
  }

  /**
   * Smooth adjustment between previous and new values
   */
  private smoothAdjustment(previous: number, current: number, factor: number): number {
    return previous * (1 - factor) + current * factor;
  }

  /**
   * Update statistics with a new adjustment
   */
  private updateStatistics(adjustment: EdgeAdjustmentFactor): void {
    this.statistics.totalAdjustments++;
    
    const adjustmentValue = adjustment.durationFactor;
    this.statistics.averageAdjustment = 
      (this.statistics.averageAdjustment * (this.statistics.totalAdjustments - 1) + adjustmentValue) / 
      this.statistics.totalAdjustments;
    
    this.statistics.maxAdjustment = Math.max(this.statistics.maxAdjustment, adjustmentValue);
    this.statistics.minAdjustment = Math.min(this.statistics.minAdjustment, adjustmentValue);
    
    for (const reason of adjustment.reasons) {
      if (!this.statistics.adjustmentsByReason[reason]) {
        this.statistics.adjustmentsByReason[reason] = 0;
      }
      this.statistics.adjustmentsByReason[reason]++;
    }
  }

  /**
   * Get adjustment factor for an edge
   */
  getEdgeAdjustment(edgeId: string): EdgeAdjustmentFactor | null {
    return this.adjustmentFactors.get(edgeId) || null;
  }

  /**
   * Get adjusted duration for an edge
   */
  getAdjustedDuration(edgeId: string, baseDuration: number): number {
    const adjustment = this.getEdgeAdjustment(edgeId);
    if (!adjustment) return baseDuration;
    
    return baseDuration * adjustment.durationFactor;
  }

  /**
   * Get adjusted cost for an edge
   */
  getAdjustedCost(edgeId: string, baseCost: number): number {
    const adjustment = this.getEdgeAdjustment(edgeId);
    if (!adjustment) return baseCost;
    
    return baseCost * adjustment.costFactor;
  }

  /**
   * Get reliability score for an edge
   */
  getEdgeReliability(edgeId: string): number {
    const adjustment = this.getEdgeAdjustment(edgeId);
    if (!adjustment) return 1.0;
    
    return adjustment.reliabilityFactor;
  }

  /**
   * Apply real-time adjustments to a graph edge
   */
  applyAdjustmentsToEdge(edge: GraphEdge): GraphEdge {
    const adjustment = this.getEdgeAdjustment(edge.id);
    if (!adjustment) return edge;
    
    return {
      ...edge,
      duration: this.getAdjustedDuration(edge.id, edge.duration),
      cost: this.getAdjustedCost(edge.id, edge.cost),
      realTimeData: {
        currentSpeed: edge.realTimeData?.currentSpeed,
        congestionLevel: edge.realTimeData?.congestionLevel,
        delay: edge.realTimeData?.delay,
        blocked: edge.realTimeData?.blocked,
        lastUpdated: new Date()
      }
    };
  }

  /**
   * Get all current adjustment factors
   */
  getAllAdjustments(): EdgeAdjustmentFactor[] {
    return Array.from(this.adjustmentFactors.values());
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return { ...this.statistics };
  }

  /**
   * Shutdown the cost adjustment system
   */
  shutdown(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    this.adjustmentFactors.clear();
  }

  /**
   * Convert EventSeverity to number
   */
  private severityToNumber(severity: EventSeverity): number {
    switch (severity) {
      case EventSeverity.CRITICAL: return 3;
      case EventSeverity.HIGH: return 2;
      case EventSeverity.MEDIUM: return 1;
      case EventSeverity.LOW: return 0;
      default: return 0;
    }
  }

  /**
   * Convert ImpactLevel to number
   */
  private impactToNumber(impact: ImpactLevel): number {
    switch (impact) {
      case ImpactLevel.CRITICAL: return 4;
      case ImpactLevel.MAJOR: return 3;
      case ImpactLevel.SIGNIFICANT: return 2;
      case ImpactLevel.LOCAL: return 1;
      case ImpactLevel.MINIMAL: return 0;
      default: return 0;
    }
  }
}