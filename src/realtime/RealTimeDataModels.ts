/**
 * Real-time data models for the multi-modal routing system
 * Provides structured representations of real-time data for routing consumption
 */

import {
  TrafficData,
  PublicTransportData,
  ConstructionData,
  EventData,
  WeatherData,
  RealTimeDataAggregation,
  RealTimeRouteAdjustment,
  RealTimeRouteMonitoring,
  DataQuality,
  ImpactLevel,
  TrafficCondition,
  PublicTransportStatus,
  EventSeverity,
} from '../types/realtime';
import { Coordinate, TransportMode, GraphEdge, RealTimeEdgeData } from '../types/graph';

/**
 * Real-time data model factory
 */
export class RealTimeDataModelFactory {
  /**
   * Create a traffic data model from raw data
   */
  static createTrafficModel(rawData: any): TrafficDataModel {
    return new TrafficDataModel({
      id: rawData.id || '',
      segmentId: rawData.segmentId || '',
      condition: rawData.condition || TrafficCondition.MODERATE,
      currentSpeed: rawData.currentSpeed || 0,
      averageSpeed: rawData.averageSpeed || 0,
      congestionLevel: rawData.congestionLevel || 0,
      delay: rawData.delay || 0,
      travelTime: rawData.travelTime || 0,
      reliability: rawData.reliability || 0,
      lastUpdated: new Date(rawData.lastUpdated || Date.now()),
      quality: rawData.quality || DataQuality.MODERATE_CONFIDENCE,
      source: rawData.source || '',
      coordinates: rawData.coordinates || {
        start: { latitude: 0, longitude: 0 },
        end: { latitude: 0, longitude: 0 }
      }
    });
  }

  /**
   * Create a public transport data model from raw data
   */
  static createPublicTransportModel(rawData: any): PublicTransportDataModel {
    return new PublicTransportDataModel({
      id: rawData.id || '',
      routeId: rawData.routeId || '',
      tripId: rawData.tripId || '',
      vehicleId: rawData.vehicleId,
      status: rawData.status || PublicTransportStatus.SCHEDULED,
      delay: rawData.delay || 0,
      scheduledDeparture: new Date(rawData.scheduledDeparture || Date.now()),
      estimatedDeparture: rawData.estimatedDeparture ? new Date(rawData.estimatedDeparture) : undefined,
      scheduledArrival: new Date(rawData.scheduledArrival || Date.now()),
      estimatedArrival: rawData.estimatedArrival ? new Date(rawData.estimatedArrival) : undefined,
      currentPosition: rawData.currentPosition,
      nextStopId: rawData.nextStopId,
      occupancy: rawData.occupancy,
      reliability: rawData.reliability || 0,
      lastUpdated: new Date(rawData.lastUpdated || Date.now()),
      quality: rawData.quality || DataQuality.MODERATE_CONFIDENCE,
      source: rawData.source || '',
      mode: rawData.mode || TransportMode.BUS
    });
  }

  /**
   * Create a construction data model from raw data
   */
  static createConstructionModel(rawData: any): ConstructionDataModel {
    return new ConstructionDataModel({
      id: rawData.id || '',
      type: rawData.type || 'construction',
      title: rawData.title || '',
      description: rawData.description || '',
      location: rawData.location || {
        coordinate: { latitude: 0, longitude: 0 },
        radius: 0,
        affectedSegments: []
      },
      impact: rawData.impact || ImpactLevel.MINIMAL,
      severity: rawData.severity || EventSeverity.LOW,
      startTime: new Date(rawData.startTime || Date.now()),
      endTime: new Date(rawData.endTime || Date.now()),
      isActive: rawData.isActive || false,
      restrictions: rawData.restrictions,
      detourAvailable: rawData.detourAvailable || false,
      detourRoute: rawData.detourRoute,
      lastUpdated: new Date(rawData.lastUpdated || Date.now()),
      quality: rawData.quality || DataQuality.MODERATE_CONFIDENCE,
      source: rawData.source || ''
    });
  }

  /**
   * Create an event data model from raw data
   */
  static createEventModel(rawData: any): EventDataModel {
    return new EventDataModel({
      id: rawData.id || '',
      type: rawData.type || 'other',
      title: rawData.title || '',
      description: rawData.description || '',
      location: rawData.location || {
        coordinate: { latitude: 0, longitude: 0 },
        radius: 0,
        affectedSegments: []
      },
      impact: rawData.impact || ImpactLevel.MINIMAL,
      severity: rawData.severity || EventSeverity.LOW,
      startTime: new Date(rawData.startTime || Date.now()),
      endTime: rawData.endTime ? new Date(rawData.endTime) : undefined,
      isActive: rawData.isActive || false,
      expectedClearance: rawData.expectedClearance ? new Date(rawData.expectedClearance) : undefined,
      lastUpdated: new Date(rawData.lastUpdated || Date.now()),
      quality: rawData.quality || DataQuality.MODERATE_CONFIDENCE,
      source: rawData.source || ''
    });
  }

  /**
   * Create a weather data model from raw data
   */
  static createWeatherModel(rawData: any): WeatherDataModel {
    return new WeatherDataModel({
      id: rawData.id || '',
      location: rawData.location || { latitude: 0, longitude: 0 },
      condition: rawData.condition || 'clear',
      temperature: rawData.temperature || 0,
      windSpeed: rawData.windSpeed || 0,
      windDirection: rawData.windDirection || 0,
      visibility: rawData.visibility || 10000,
      precipitation: rawData.precipitation || 0,
      humidity: rawData.humidity || 0,
      pressure: rawData.pressure || 1013,
      impact: rawData.impact || 0,
      lastUpdated: new Date(rawData.lastUpdated || Date.now()),
      quality: rawData.quality || DataQuality.MODERATE_CONFIDENCE,
      source: rawData.source || '',
      forecast: rawData.forecast
    });
  }

  /**
   * Create a real-time data aggregation model
   */
  static createAggregationModel(rawData: any): RealTimeDataAggregationModel {
    return new RealTimeDataAggregationModel({
      segmentId: rawData.segmentId || '',
      traffic: rawData.traffic,
      publicTransport: rawData.publicTransport || [],
      construction: rawData.construction || [],
      events: rawData.events || [],
      weather: rawData.weather,
      overallImpact: rawData.overallImpact || 0,
      lastUpdated: new Date(rawData.lastUpdated || Date.now()),
      reliability: rawData.reliability || 0
    });
  }

  /**
   * Create a route adjustment model
   */
  static createRouteAdjustmentModel(rawData: any): RealTimeRouteAdjustmentModel {
    return new RealTimeRouteAdjustmentModel({
      segmentId: rawData.segmentId || '',
      originalDuration: rawData.originalDuration || 0,
      adjustedDuration: rawData.adjustedDuration || 0,
      originalCost: rawData.originalCost || 0,
      adjustedCost: rawData.adjustedCost || 0,
      reason: rawData.reason || '',
      confidence: rawData.confidence || 0,
      factors: rawData.factors || {
        traffic: 0,
        weather: 0,
        events: 0,
        construction: 0
      },
      alternativeAvailable: rawData.alternativeAvailable || false,
      alternativeSegmentId: rawData.alternativeSegmentId
    });
  }

  /**
   * Create a route monitoring model
   */
  static createRouteMonitoringModel(rawData: any): RealTimeRouteMonitoringModel {
    return new RealTimeRouteMonitoringModel({
      routeId: rawData.routeId || '',
      status: rawData.status || 'on_track',
      currentPosition: rawData.currentPosition,
      currentSegmentIndex: rawData.currentSegmentIndex || 0,
      progress: rawData.progress || 0,
      estimatedArrival: new Date(rawData.estimatedArrival || Date.now()),
      originalArrival: new Date(rawData.originalArrival || Date.now()),
      delay: rawData.delay || 0,
      deviations: rawData.deviations || [],
      alerts: rawData.alerts || [],
      lastUpdated: new Date(rawData.lastUpdated || Date.now())
    });
  }
}

/**
 * Base class for real-time data models
 */
export abstract class BaseRealTimeDataModel {
  protected data: any;
  protected metadata: {
    createdAt: Date;
    lastAccessed: Date;
    accessCount: number;
    version: number;
  };

  constructor(data: any) {
    this.data = data;
    this.metadata = {
      createdAt: new Date(),
      lastAccessed: new Date(),
      accessCount: 0,
      version: 1
    };
  }

  /**
   * Get the raw data
   */
  getRawData(): any {
    this.updateAccessStats();
    return { ...this.data };
  }

  /**
   * Get the data quality
   */
  getQuality(): DataQuality {
    return this.data.quality;
  }

  /**
   * Get the data source
   */
  getSource(): string {
    return this.data.source;
  }

  /**
   * Get the last update time
   */
  getLastUpdated(): Date {
    return new Date(this.data.lastUpdated);
  }

  /**
   * Check if the data is expired
   */
  isExpired(maxAge: number): boolean {
    const now = Date.now();
    const lastUpdated = this.getLastUpdated().getTime();
    return (now - lastUpdated) > maxAge * 1000;
  }

  /**
   * Get the age of the data in seconds
   */
  getAge(): number {
    const now = Date.now();
    const lastUpdated = this.getLastUpdated().getTime();
    return Math.floor((now - lastUpdated) / 1000);
  }

  /**
   * Update access statistics
   */
  protected updateAccessStats(): void {
    this.metadata.lastAccessed = new Date();
    this.metadata.accessCount++;
  }

  /**
   * Get metadata
   */
  getMetadata() {
    return { ...this.metadata };
  }

  /**
   * Validate the data
   */
  abstract validate(): boolean;

  /**
   * Calculate impact score (0-1)
   */
  abstract calculateImpact(): number;
}

/**
 * Traffic data model
 */
export class TrafficDataModel extends BaseRealTimeDataModel {
  constructor(data: TrafficData) {
    super(data);
  }

  /**
   * Get segment ID
   */
  getSegmentId(): string {
    return this.data.segmentId;
  }

  /**
   * Get traffic condition
   */
  getCondition(): TrafficCondition {
    return this.data.condition;
  }

  /**
   * Get current speed
   */
  getCurrentSpeed(): number {
    return this.data.currentSpeed;
  }

  /**
   * Get average speed
   */
  getAverageSpeed(): number {
    return this.data.averageSpeed;
  }

  /**
   * Get congestion level (0-1)
   */
  getCongestionLevel(): number {
    return this.data.congestionLevel;
  }

  /**
   * Get delay in seconds
   */
  getDelay(): number {
    return this.data.delay;
  }

  /**
   * Get travel time in seconds
   */
  getTravelTime(): number {
    return this.data.travelTime;
  }

  /**
   * Get reliability score (0-1)
   */
  getReliability(): number {
    return this.data.reliability;
  }

  /**
   * Get coordinates
   */
  getCoordinates(): { start: Coordinate; end: Coordinate } {
    return this.data.coordinates;
  }

  /**
   * Calculate speed ratio (current/average)
   */
  getSpeedRatio(): number {
    if (this.data.averageSpeed === 0) return 0;
    return this.data.currentSpeed / this.data.averageSpeed;
  }

  /**
   * Calculate additional time due to traffic
   */
  calculateAdditionalTime(): number {
    if (this.data.averageSpeed === 0) return 0;
    const expectedTime = this.data.travelTime * (this.data.averageSpeed / this.data.currentSpeed);
    return Math.max(0, expectedTime - this.data.travelTime);
  }

  /**
   * Validate traffic data
   */
  validate(): boolean {
    return (
      this.data.segmentId !== '' &&
      this.data.currentSpeed >= 0 &&
      this.data.averageSpeed >= 0 &&
      this.data.congestionLevel >= 0 &&
      this.data.congestionLevel <= 1 &&
      this.data.delay >= 0 &&
      this.data.travelTime >= 0 &&
      this.data.reliability >= 0 &&
      this.data.reliability <= 1
    );
  }

  /**
   * Calculate impact score (0-1)
   */
  calculateImpact(): number {
    // Impact is primarily based on congestion level and delay
    const congestionImpact = this.data.congestionLevel;
    const delayImpact = Math.min(1, this.data.delay / 600); // Normalize to 10 minutes max
    
    return Math.max(congestionImpact, delayImpact);
  }

  /**
   * Convert to edge data format
   */
  toEdgeData(): RealTimeEdgeData {
    return {
      currentSpeed: this.data.currentSpeed,
      congestionLevel: this.data.congestionLevel,
      delay: this.data.delay,
      blocked: this.data.condition === TrafficCondition.STANDSTILL,
      lastUpdated: this.getLastUpdated()
    };
  }
}

/**
 * Public transport data model
 */
export class PublicTransportDataModel extends BaseRealTimeDataModel {
  constructor(data: PublicTransportData) {
    super(data);
  }

  /**
   * Get route ID
   */
  getRouteId(): string {
    return this.data.routeId;
  }

  /**
   * Get trip ID
   */
  getTripId(): string {
    return this.data.tripId;
  }

  /**
   * Get vehicle ID
   */
  getVehicleId(): string | undefined {
    return this.data.vehicleId;
  }

  /**
   * Get transport status
   */
  getStatus(): PublicTransportStatus {
    return this.data.status;
  }

  /**
   * Get delay in seconds
   */
  getDelay(): number {
    return this.data.delay;
  }

  /**
   * Get scheduled departure time
   */
  getScheduledDeparture(): Date {
    return new Date(this.data.scheduledDeparture);
  }

  /**
   * Get estimated departure time
   */
  getEstimatedDeparture(): Date | undefined {
    return this.data.estimatedDeparture ? new Date(this.data.estimatedDeparture) : undefined;
  }

  /**
   * Get scheduled arrival time
   */
  getScheduledArrival(): Date {
    return new Date(this.data.scheduledArrival);
  }

  /**
   * Get estimated arrival time
   */
  getEstimatedArrival(): Date | undefined {
    return this.data.estimatedArrival ? new Date(this.data.estimatedArrival) : undefined;
  }

  /**
   * Get current position
   */
  getCurrentPosition(): Coordinate | undefined {
    return this.data.currentPosition;
  }

  /**
   * Get next stop ID
   */
  getNextStopId(): string | undefined {
    return this.data.nextStopId;
  }

  /**
   * Get occupancy information
   */
  getOccupancy(): { level: 'low' | 'medium' | 'high' | 'full'; percentage?: number } | undefined {
    return this.data.occupancy;
  }

  /**
   * Get transport mode
   */
  getMode(): TransportMode {
    return this.data.mode;
  }

  /**
   * Check if the transport is on time
   */
  isOnTime(): boolean {
    return Math.abs(this.data.delay) < 60; // Within 1 minute
  }

  /**
   * Check if the transport is delayed
   */
  isDelayed(): boolean {
    return this.data.delay > 60;
  }

  /**
   * Check if the transport is early
   */
  isEarly(): boolean {
    return this.data.delay < -60;
  }

  /**
   * Check if the transport is cancelled
   */
  isCancelled(): boolean {
    return this.data.status === PublicTransportStatus.CANCELLED;
  }

  /**
   * Validate public transport data
   */
  validate(): boolean {
    return (
      this.data.routeId !== '' &&
      this.data.tripId !== '' &&
      Object.values(PublicTransportStatus).includes(this.data.status) &&
      !isNaN(this.data.scheduledDeparture.getTime()) &&
      !isNaN(this.data.scheduledArrival.getTime()) &&
      this.data.reliability >= 0 &&
      this.data.reliability <= 1
    );
  }

  /**
   * Calculate impact score (0-1)
   */
  calculateImpact(): number {
    // Impact based on delay and status
    if (this.data.status === PublicTransportStatus.CANCELLED) return 1;
    if (this.data.status === PublicTransportStatus.DIVERTED) return 0.8;
    
    // Normalize delay to impact (max impact at 30 minutes delay)
    const delayImpact = Math.min(1, Math.abs(this.data.delay) / 1800);
    
    return delayImpact;
  }
}

/**
 * Construction data model
 */
export class ConstructionDataModel extends BaseRealTimeDataModel {
  constructor(data: ConstructionData) {
    super(data);
  }

  /**
   * Get construction type
   */
  getType(): string {
    return this.data.type;
  }

  /**
   * Get title
   */
  getTitle(): string {
    return this.data.title;
  }

  /**
   * Get description
   */
  getDescription(): string {
    return this.data.description;
  }

  /**
   * Get location information
   */
  getLocation(): {
    coordinate: Coordinate;
    radius: number;
    affectedSegments: string[];
  } {
    return this.data.location;
  }

  /**
   * Get impact level
   */
  getImpact(): ImpactLevel {
    return this.data.impact;
  }

  /**
   * Get severity
   */
  getSeverity(): EventSeverity {
    return this.data.severity;
  }

  /**
   * Get start time
   */
  getStartTime(): Date {
    return new Date(this.data.startTime);
  }

  /**
   * Get end time
   */
  getEndTime(): Date {
    return new Date(this.data.endTime);
  }

  /**
   * Check if construction is active
   */
  isActive(): boolean {
    return this.data.isActive;
  }

  /**
   * Get restrictions
   */
  getRestrictions(): any {
    return this.data.restrictions;
  }

  /**
   * Check if detour is available
   */
  isDetourAvailable(): boolean {
    return this.data.detourAvailable;
  }

  /**
   * Get detour route
   */
  getDetourRoute(): string[] | undefined {
    return this.data.detourRoute;
  }

  /**
   * Check if construction affects a specific segment
   */
  affectsSegment(segmentId: string): boolean {
    return this.data.location.affectedSegments.includes(segmentId);
  }

  /**
   * Check if construction is currently active based on time
   */
  isCurrentlyActive(): boolean {
    const now = new Date();
    const start = this.getStartTime();
    const end = this.getEndTime();
    return now >= start && now <= end && this.isActive();
  }

  /**
   * Validate construction data
   */
  validate(): boolean {
    return (
      this.data.id !== '' &&
      this.data.title !== '' &&
      this.data.location.coordinate.latitude !== 0 &&
      this.data.location.coordinate.longitude !== 0 &&
      this.data.location.radius > 0 &&
      !isNaN(this.data.startTime.getTime()) &&
      !isNaN(this.data.endTime.getTime()) &&
      this.data.startTime <= this.data.endTime &&
      Object.values(ImpactLevel).includes(this.data.impact) &&
      Object.values(EventSeverity).includes(this.data.severity)
    );
  }

  /**
   * Calculate impact score (0-1)
   */
  calculateImpact(): number {
    // Impact based on impact level and whether it's currently active
    const levelMap = {
      [ImpactLevel.MINIMAL]: 0.2,
      [ImpactLevel.LOCAL]: 0.4,
      [ImpactLevel.SIGNIFICANT]: 0.6,
      [ImpactLevel.MAJOR]: 0.8,
      [ImpactLevel.CRITICAL]: 1.0
    };
    
    let impact = levelMap[this.data.impact];
    
    // Reduce impact if not currently active
    if (!this.isCurrentlyActive()) {
      impact *= 0.3;
    }
    
    return impact;
  }
}

/**
 * Event data model
 */
export class EventDataModel extends BaseRealTimeDataModel {
  constructor(data: EventData) {
    super(data);
  }

  /**
   * Get event type
   */
  getType(): string {
    return this.data.type;
  }

  /**
   * Get title
   */
  getTitle(): string {
    return this.data.title;
  }

  /**
   * Get description
   */
  getDescription(): string {
    return this.data.description;
  }

  /**
   * Get location information
   */
  getLocation(): {
    coordinate: Coordinate;
    radius: number;
    affectedSegments: string[];
  } {
    return this.data.location;
  }

  /**
   * Get impact level
   */
  getImpact(): ImpactLevel {
    return this.data.impact;
  }

  /**
   * Get severity
   */
  getSeverity(): EventSeverity {
    return this.data.severity;
  }

  /**
   * Get start time
   */
  getStartTime(): Date {
    return new Date(this.data.startTime);
  }

  /**
   * Get end time
   */
  getEndTime(): Date | undefined {
    return this.data.endTime ? new Date(this.data.endTime) : undefined;
  }

  /**
   * Check if event is active
   */
  isActive(): boolean {
    return this.data.isActive;
  }

  /**
   * Get expected clearance time
   */
  getExpectedClearance(): Date | undefined {
    return this.data.expectedClearance ? new Date(this.data.expectedClearance) : undefined;
  }

  /**
   * Check if event affects a specific segment
   */
  affectsSegment(segmentId: string): boolean {
    return this.data.location.affectedSegments.includes(segmentId);
  }

  /**
   * Check if event is currently active based on time
   */
  isCurrentlyActive(): boolean {
    const now = new Date();
    const start = this.getStartTime();
    const end = this.getEndTime();
    
    // If no end time, event is ongoing
    if (!end) return now >= start && this.isActive();
    
    return now >= start && now <= end && this.isActive();
  }

  /**
   * Validate event data
   */
  validate(): boolean {
    return (
      this.data.id !== '' &&
      this.data.title !== '' &&
      this.data.location.coordinate.latitude !== 0 &&
      this.data.location.coordinate.longitude !== 0 &&
      this.data.location.radius > 0 &&
      !isNaN(this.data.startTime.getTime()) &&
      (this.data.endTime === undefined || !isNaN(this.data.endTime.getTime())) &&
      (this.data.endTime === undefined || this.data.startTime <= this.data.endTime) &&
      Object.values(ImpactLevel).includes(this.data.impact) &&
      Object.values(EventSeverity).includes(this.data.severity)
    );
  }

  /**
   * Calculate impact score (0-1)
   */
  calculateImpact(): number {
    // Impact based on impact level and whether it's currently active
    const levelMap = {
      [ImpactLevel.MINIMAL]: 0.2,
      [ImpactLevel.LOCAL]: 0.4,
      [ImpactLevel.SIGNIFICANT]: 0.6,
      [ImpactLevel.MAJOR]: 0.8,
      [ImpactLevel.CRITICAL]: 1.0
    };
    
    let impact = levelMap[this.data.impact];
    
    // Reduce impact if not currently active
    if (!this.isCurrentlyActive()) {
      impact *= 0.5;
    }
    
    // Accidents have higher impact
    if (this.data.type === 'accident') {
      impact = Math.min(1, impact * 1.5);
    }
    
    return impact;
  }
}

/**
 * Weather data model
 */
export class WeatherDataModel extends BaseRealTimeDataModel {
  constructor(data: WeatherData) {
    super(data);
  }

  /**
   * Get location
   */
  getLocation(): Coordinate {
    return this.data.location;
  }

  /**
   * Get weather condition
   */
  getCondition(): string {
    return this.data.condition;
  }

  /**
   * Get temperature in Celsius
   */
  getTemperature(): number {
    return this.data.temperature;
  }

  /**
   * Get wind speed in km/h
   */
  getWindSpeed(): number {
    return this.data.windSpeed;
  }

  /**
   * Get wind direction in degrees
   */
  getWindDirection(): number {
    return this.data.windDirection;
  }

  /**
   * Get visibility in meters
   */
  getVisibility(): number {
    return this.data.visibility;
  }

  /**
   * Get precipitation in mm/h
   */
  getPrecipitation(): number {
    return this.data.precipitation;
  }

  /**
   * Get humidity percentage
   */
  getHumidity(): number {
    return this.data.humidity;
  }

  /**
   * Get pressure in hPa
   */
  getPressure(): number {
    return this.data.pressure;
  }

  /**
   * Get impact score
   */
  getImpact(): number {
    return this.data.impact;
  }

  /**
   * Get forecast data
   */
  getForecast(): any {
    return this.data.forecast;
  }

  /**
   * Check if weather conditions are severe
   */
  isSevere(): boolean {
    return (
      this.data.condition === 'storm' ||
      this.data.condition === 'snow' ||
      this.data.condition === 'ice' ||
      this.data.windSpeed > 80 ||
      this.data.visibility < 1000 ||
      this.data.precipitation > 20
    );
  }

  /**
   * Check if weather affects driving conditions
   */
  affectsDriving(): boolean {
    return (
      this.data.condition === 'rain' ||
      this.data.condition === 'snow' ||
      this.data.condition === 'ice' ||
      this.data.condition === 'fog' ||
      this.data.condition === 'storm' ||
      this.data.visibility < 1000 ||
      this.data.windSpeed > 60
    );
  }

  /**
   * Check if weather affects cycling conditions
   */
  affectsCycling(): boolean {
    return (
      this.data.condition === 'rain' ||
      this.data.condition === 'snow' ||
      this.data.condition === 'ice' ||
      this.data.condition === 'storm' ||
      this.data.windSpeed > 40
    );
  }

  /**
   * Check if weather affects walking conditions
   */
  affectsWalking(): boolean {
    return (
      this.data.condition === 'rain' ||
      this.data.condition === 'snow' ||
      this.data.condition === 'ice' ||
      this.data.condition === 'storm' ||
      this.data.temperature < -10 ||
      this.data.temperature > 35
    );
  }

  /**
   * Validate weather data
   */
  validate(): boolean {
    return (
      this.data.id !== '' &&
      this.data.location.latitude !== 0 &&
      this.data.location.longitude !== 0 &&
      this.data.temperature >= -50 &&
      this.data.temperature <= 60 &&
      this.data.windSpeed >= 0 &&
      this.data.visibility >= 0 &&
      this.data.precipitation >= 0 &&
      this.data.humidity >= 0 &&
      this.data.humidity <= 100 &&
      this.data.pressure >= 800 &&
      this.data.pressure <= 1200 &&
      this.data.impact >= 0 &&
      this.data.impact <= 1
    );
  }

  /**
   * Calculate impact score (0-1)
   */
  calculateImpact(): number {
    // Weather already has an impact score, but we can adjust it based on conditions
    let impact = this.data.impact;
    
    // Increase impact for severe weather
    if (this.isSevere()) {
      impact = Math.min(1, impact * 1.5);
    }
    
    return impact;
  }

  /**
   * Get weather impact for specific transport mode
   */
  getImpactForMode(mode: TransportMode): number {
    let impact = this.calculateImpact();
    
    switch (mode) {
      case TransportMode.WALKING:
        return this.affectsWalking() ? impact : 0;
      case TransportMode.BICYCLE:
        return this.affectsCycling() ? impact : 0;
      case TransportMode.CAR:
        return this.affectsDriving() ? impact * 0.7 : 0;
      case TransportMode.BUS:
      case TransportMode.TRAM:
      case TransportMode.METRO:
      case TransportMode.TRAIN:
        return this.affectsDriving() ? impact * 0.5 : 0;
      default:
        return impact;
    }
  }
}

/**
 * Real-time data aggregation model
 */
export class RealTimeDataAggregationModel extends BaseRealTimeDataModel {
  private trafficModel?: TrafficDataModel;
  private publicTransportModels: PublicTransportDataModel[] = [];
  private constructionModels: ConstructionDataModel[] = [];
  private eventModels: EventDataModel[] = [];
  private weatherModel?: WeatherDataModel;

  constructor(data: RealTimeDataAggregation) {
    super(data);
    
    if (data.traffic) {
      this.trafficModel = RealTimeDataModelFactory.createTrafficModel(data.traffic);
    }
    
    if (data.publicTransport) {
      this.publicTransportModels = data.publicTransport.map(pt => 
        RealTimeDataModelFactory.createPublicTransportModel(pt)
      );
    }
    
    if (data.construction) {
      this.constructionModels = data.construction.map(c => 
        RealTimeDataModelFactory.createConstructionModel(c)
      );
    }
    
    if (data.events) {
      this.eventModels = data.events.map(e => 
        RealTimeDataModelFactory.createEventModel(e)
      );
    }
    
    if (data.weather) {
      this.weatherModel = RealTimeDataModelFactory.createWeatherModel(data.weather);
    }
  }

  /**
   * Get segment ID
   */
  getSegmentId(): string {
    return this.data.segmentId;
  }

  /**
   * Get traffic data
   */
  getTraffic(): TrafficDataModel | undefined {
    return this.trafficModel;
  }

  /**
   * Get public transport data
   */
  getPublicTransport(): PublicTransportDataModel[] {
    return [...this.publicTransportModels];
  }

  /**
   * Get construction data
   */
  getConstruction(): ConstructionDataModel[] {
    return [...this.constructionModels];
  }

  /**
   * Get event data
   */
  getEvents(): EventDataModel[] {
    return [...this.eventModels];
  }

  /**
   * Get weather data
   */
  getWeather(): WeatherDataModel | undefined {
    return this.weatherModel;
  }

  /**
   * Get overall impact score
   */
  getOverallImpact(): number {
    return this.data.overallImpact;
  }

  /**
   * Get overall reliability score
   */
  getReliability(): number {
    return this.data.reliability;
  }

  /**
   * Calculate adjusted impact for a specific transport mode
   */
  calculateImpactForMode(mode: TransportMode): number {
    const impacts: number[] = [];
    
    // Traffic impact (for road-based modes)
    if ([TransportMode.CAR, TransportMode.BUS, TransportMode.BICYCLE].includes(mode) && this.trafficModel) {
      impacts.push(this.trafficModel.calculateImpact());
    }
    
    // Weather impact
    if (this.weatherModel) {
      impacts.push(this.weatherModel.getImpactForMode(mode));
    }
    
    // Construction impact
    for (const construction of this.constructionModels) {
      if (construction.isCurrentlyActive()) {
        impacts.push(construction.calculateImpact());
      }
    }
    
    // Event impact
    for (const event of this.eventModels) {
      if (event.isCurrentlyActive()) {
        impacts.push(event.calculateImpact());
      }
    }
    
    // Return the maximum impact
    return impacts.length > 0 ? Math.max(...impacts) : 0;
  }

  /**
   * Calculate adjusted travel time for a segment
   */
  calculateAdjustedTravelTime(baseTime: number, mode: TransportMode): number {
    let adjustedTime = baseTime;
    
    // Adjust for traffic
    if ([TransportMode.CAR, TransportMode.BUS].includes(mode) && this.trafficModel) {
      const speedRatio = this.trafficModel.getSpeedRatio();
      if (speedRatio > 0) {
        adjustedTime = baseTime / speedRatio;
      }
    }
    
    // Adjust for weather
    if (this.weatherModel) {
      const weatherImpact = this.weatherModel.getImpactForMode(mode);
      adjustedTime *= (1 + weatherImpact * 0.5); // Weather can increase travel time by up to 50%
    }
    
    // Adjust for construction (significant impact)
    for (const construction of this.constructionModels) {
      if (construction.isCurrentlyActive()) {
        const constructionImpact = construction.calculateImpact();
        adjustedTime *= (1 + constructionImpact * 0.8); // Construction can increase travel time by up to 80%
      }
    }
    
    return adjustedTime;
  }

  /**
   * Check if segment is blocked
   */
  isBlocked(): boolean {
    // Check for standstill traffic
    if (this.trafficModel && this.trafficModel.getCondition() === TrafficCondition.STANDSTILL) {
      return true;
    }
    
    // Check for critical construction or events
    for (const construction of this.constructionModels) {
      if (construction.isCurrentlyActive() && construction.getImpact() === ImpactLevel.CRITICAL) {
        return true;
      }
    }
    
    for (const event of this.eventModels) {
      if (event.isCurrentlyActive() && event.getImpact() === ImpactLevel.CRITICAL) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Validate aggregation data
   */
  validate(): boolean {
    return (
      this.data.segmentId !== '' &&
      this.data.overallImpact >= 0 &&
      this.data.overallImpact <= 1 &&
      this.data.reliability >= 0 &&
      this.data.reliability <= 1 &&
      (!this.trafficModel || this.trafficModel.validate()) &&
      this.publicTransportModels.every(pt => pt.validate()) &&
      this.constructionModels.every(c => c.validate()) &&
      this.eventModels.every(e => e.validate()) &&
      (!this.weatherModel || this.weatherModel.validate())
    );
  }

  /**
   * Calculate impact score (0-1)
   */
  calculateImpact(): number {
    return this.data.overallImpact;
  }

  /**
   * Convert to edge data format
   */
  toEdgeData(): RealTimeEdgeData {
    const trafficData = this.trafficModel?.toEdgeData();
    
    return {
      currentSpeed: trafficData?.currentSpeed,
      congestionLevel: trafficData?.congestionLevel || 0,
      delay: trafficData?.delay || 0,
      blocked: this.isBlocked(),
      lastUpdated: this.getLastUpdated()
    };
  }
}

/**
 * Real-time route adjustment model
 */
export class RealTimeRouteAdjustmentModel extends BaseRealTimeDataModel {
  constructor(data: RealTimeRouteAdjustment) {
    super(data);
  }

  /**
   * Get segment ID
   */
  getSegmentId(): string {
    return this.data.segmentId;
  }

  /**
   * Get original duration
   */
  getOriginalDuration(): number {
    return this.data.originalDuration;
  }

  /**
   * Get adjusted duration
   */
  getAdjustedDuration(): number {
    return this.data.adjustedDuration;
  }

  /**
   * Get original cost
   */
  getOriginalCost(): number {
    return this.data.originalCost;
  }

  /**
   * Get adjusted cost
   */
  getAdjustedCost(): number {
    return this.data.adjustedCost;
  }

  /**
   * Get adjustment reason
   */
  getReason(): string {
    return this.data.reason;
  }

  /**
   * Get confidence score
   */
  getConfidence(): number {
    return this.data.confidence;
  }

  /**
   * Get impact factors
   */
  getFactors(): {
    traffic: number;
    weather: number;
    events: number;
    construction: number;
  } {
    return this.data.factors;
  }

  /**
   * Check if alternative is available
   */
  isAlternativeAvailable(): boolean {
    return this.data.alternativeAvailable;
  }

  /**
   * Get alternative segment ID
   */
  getAlternativeSegmentId(): string | undefined {
    return this.data.alternativeSegmentId;
  }

  /**
   * Calculate time difference
   */
  getTimeDifference(): number {
    return this.data.adjustedDuration - this.data.originalDuration;
  }

  /**
   * Calculate cost difference
   */
  getCostDifference(): number {
    return this.data.adjustedCost - this.data.originalCost;
  }

  /**
   * Validate route adjustment data
   */
  validate(): boolean {
    return (
      this.data.segmentId !== '' &&
      this.data.originalDuration >= 0 &&
      this.data.adjustedDuration >= 0 &&
      this.data.originalCost >= 0 &&
      this.data.adjustedCost >= 0 &&
      this.data.confidence >= 0 &&
      this.data.confidence <= 1
    );
  }

  /**
   * Calculate impact score (0-1)
   */
  calculateImpact(): number {
    // Impact based on time difference and confidence
    const timeImpact = Math.min(1, Math.abs(this.getTimeDifference()) / 1800); // Normalize to 30 minutes
    return timeImpact * this.data.confidence;
  }
}

/**
 * Real-time route monitoring model
 */
export class RealTimeRouteMonitoringModel extends BaseRealTimeDataModel {
  constructor(data: RealTimeRouteMonitoring) {
    super(data);
  }

  /**
   * Get route ID
   */
  getRouteId(): string {
    return this.data.routeId;
  }

  /**
   * Get route status
   */
  getStatus(): string {
    return this.data.status;
  }

  /**
   * Get current position
   */
  getCurrentPosition(): Coordinate | undefined {
    return this.data.currentPosition;
  }

  /**
   * Get current segment index
   */
  getCurrentSegmentIndex(): number {
    return this.data.currentSegmentIndex;
  }

  /**
   * Get progress (0-1)
   */
  getProgress(): number {
    return this.data.progress;
  }

  /**
   * Get estimated arrival time
   */
  getEstimatedArrival(): Date {
    return new Date(this.data.estimatedArrival);
  }

  /**
   * Get original arrival time
   */
  getOriginalArrival(): Date {
    return new Date(this.data.originalArrival);
  }

  /**
   * Get delay in seconds
   */
  getDelay(): number {
    return this.data.delay;
  }

  /**
   * Get deviations
   */
  getDeviations(): Array<{
    segmentId: string;
    type: 'time' | 'route' | 'mode';
    severity: 'low' | 'medium' | 'high';
    description: string;
    timestamp: Date;
  }> {
    return this.data.deviations.map(d => ({
      ...d,
      timestamp: new Date(d.timestamp)
    }));
  }

  /**
   * Get alerts
   */
  getAlerts(): Array<{
    id: string;
    type: 'delay' | 'closure' | 'recommendation';
    severity: EventSeverity;
    message: string;
    timestamp: Date;
    acknowledged: boolean;
  }> {
    return this.data.alerts.map(a => ({
      ...a,
      timestamp: new Date(a.timestamp)
    }));
  }

  /**
   * Check if route is on time
   */
  isOnTime(): boolean {
    return this.data.status === 'on_track' || this.data.status === 'ahead';
  }

  /**
   * Check if route is delayed
   */
  isDelayed(): boolean {
    return this.data.status === 'delayed';
  }

  /**
   * Check if route is ahead of schedule
   */
  isAhead(): boolean {
    return this.data.status === 'ahead';
  }

  /**
   * Check if route has been diverted
   */
  isDiverted(): boolean {
    return this.data.status === 'diverted';
  }

  /**
   * Check if route has failed
   */
  isFailed(): boolean {
    return this.data.status === 'failed';
  }

  /**
   * Get unacknowledged alerts
   */
  getUnacknowledgedAlerts(): any[] {
    return this.data.alerts.filter(a => !a.acknowledged);
  }

  /**
   * Get high severity deviations
   */
  getHighSeverityDeviations(): any[] {
    return this.data.deviations.filter(d => d.severity === 'high');
  }

  /**
   * Validate route monitoring data
   */
  validate(): boolean {
    return (
      this.data.routeId !== '' &&
      this.data.currentSegmentIndex >= 0 &&
      this.data.progress >= 0 &&
      this.data.progress <= 1 &&
      !isNaN(this.data.estimatedArrival.getTime()) &&
      !isNaN(this.data.originalArrival.getTime())
    );
  }

  /**
   * Calculate impact score (0-1)
   */
  calculateImpact(): number {
    // Impact based on delay and status
    if (this.data.status === 'failed') return 1;
    if (this.data.status === 'diverted') return 0.8;
    
    // Normalize delay to impact (max impact at 30 minutes delay)
    const delayImpact = Math.min(1, Math.abs(this.data.delay) / 1800);
    
    return delayImpact;
  }
}