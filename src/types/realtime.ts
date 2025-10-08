/**
 * Real-time data types and interfaces for the multi-modal routing system
 * Defines structures for handling dynamic data that affects routing decisions
 */

import { Coordinate, TransportMode } from './graph';
import { MultiModalRoute, RouteSegment } from './routing';

/**
 * Data source types for real-time information
 */
export enum RealTimeDataSourceType {
  TRAFFIC = 'traffic',
  PUBLIC_TRANSPORT = 'public_transport',
  WEATHER = 'weather',
  CONSTRUCTION = 'construction',
  EVENTS = 'events',
  USER_REPORTS = 'user_reports',
  EMERGENCY = 'emergency'
}

/**
 * Data quality levels for real-time information
 */
export enum DataQuality {
  VERIFIED = 'verified',        // Officially verified data
  HIGH_CONFIDENCE = 'high_confidence',  // High confidence in accuracy
  MODERATE_CONFIDENCE = 'moderate_confidence',  // Moderate confidence
  LOW_CONFIDENCE = 'low_confidence',  // Low confidence, use with caution
  UNVERIFIED = 'unverified'    // User-reported or unverified data
}

/**
 * Status of real-time data sources
 */
export enum DataSourceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DEGRADED = 'degraded',
  ERROR = 'error',
  MAINTENANCE = 'maintenance'
}

/**
 * Traffic condition levels
 */
export enum TrafficCondition {
  FREE_FLOW = 'free_flow',        // No congestion
  LIGHT = 'light',               // Minimal congestion
  MODERATE = 'moderate',         // Noticeable congestion
  HEAVY = 'heavy',               // Significant congestion
  SEVERE = 'severe',             // Extreme congestion
  STANDSTILL = 'standstill'      // No movement
}

/**
 * Public transport status
 */
export enum PublicTransportStatus {
  ON_TIME = 'on_time',
  DELAYED = 'delayed',
  EARLY = 'early',
  CANCELLED = 'cancelled',
  DIVERTED = 'diverted',
  SCHEDULED = 'scheduled'
}

/**
 * Event severity levels
 */
export enum EventSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Impact levels for events and disruptions
 */
export enum ImpactLevel {
  MINIMAL = 'minimal',
  LOCAL = 'local',
  SIGNIFICANT = 'significant',
  MAJOR = 'major',
  CRITICAL = 'critical'
}

/**
 * Real-time traffic data
 */
export interface TrafficData {
  id: string;
  segmentId: string;
  condition: TrafficCondition;
  currentSpeed: number;          // in km/h
  averageSpeed: number;          // normal average speed in km/h
  congestionLevel: number;       // 0-1, where 1 is maximum congestion
  delay: number;                 // in seconds
  travelTime: number;            // in seconds
  reliability: number;           // 0-1, confidence in data
  lastUpdated: Date;
  quality: DataQuality;
  source: string;
  coordinates: {
    start: Coordinate;
    end: Coordinate;
  };
}

/**
 * Real-time public transport data
 */
export interface PublicTransportData {
  id: string;
  routeId: string;
  tripId: string;
  vehicleId?: string;
  status: PublicTransportStatus;
  delay: number;                 // in seconds
  scheduledDeparture: Date;
  estimatedDeparture?: Date;
  scheduledArrival: Date;
  estimatedArrival?: Date;
  currentPosition?: Coordinate;
  nextStopId?: string;
  occupancy?: {
    level: 'low' | 'medium' | 'high' | 'full';
    percentage?: number;
  };
  reliability: number;           // 0-1, confidence in data
  lastUpdated: Date;
  quality: DataQuality;
  source: string;
  mode: TransportMode;
}

/**
 * Construction and road closure data
 */
export interface ConstructionData {
  id: string;
  type: 'construction' | 'maintenance' | 'closure' | 'restriction';
  title: string;
  description: string;
  location: {
    coordinate: Coordinate;
    radius: number;              // in meters
    affectedSegments: string[];  // segment IDs
  };
  impact: ImpactLevel;
  severity: EventSeverity;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
  restrictions?: {
    speedLimit?: number;         // in km/h
    widthRestriction?: number;   // in meters
    heightRestriction?: number;  // in meters
    weightRestriction?: number;  // in tons
    vehicleTypes?: TransportMode[];
  };
  detourAvailable: boolean;
  detourRoute?: string[];        // segment IDs for detour
  lastUpdated: Date;
  quality: DataQuality;
  source: string;
}

/**
 * Event data that affects routing
 */
export interface EventData {
  id: string;
  type: 'accident' | 'event' | 'emergency' | 'weather' | 'other';
  title: string;
  description: string;
  location: {
    coordinate: Coordinate;
    radius: number;              // in meters
    affectedSegments: string[];  // segment IDs
  };
  impact: ImpactLevel;
  severity: EventSeverity;
  startTime: Date;
  endTime?: Date;                // undefined for ongoing events
  isActive: boolean;
  expectedClearance?: Date;
  lastUpdated: Date;
  quality: DataQuality;
  source: string;
}

/**
 * Weather data that affects routing
 */
export interface WeatherData {
  id: string;
  location: Coordinate;
  condition: 'clear' | 'rain' | 'snow' | 'fog' | 'storm' | 'wind' | 'ice';
  temperature: number;           // in Celsius
  windSpeed: number;             // in km/h
  windDirection: number;         // in degrees
  visibility: number;            // in meters
  precipitation: number;        // in mm/h
  humidity: number;              // percentage
  pressure: number;              // in hPa
  impact: ImpactLevel;
  lastUpdated: Date;
  quality: DataQuality;
  source: string;
  forecast?: {
    hourly: Array<{
      time: Date;
      condition: string;
      temperature: number;
      precipitation: number;
      windSpeed: number;
    }>;
  };
}

/**
 * Real-time data source configuration
 */
export interface RealTimeDataSourceConfig {
  id: string;
  name: string;
  type: RealTimeDataSourceType;
  url: string;
  apiKey?: string;
  updateFrequency: number;       // in seconds
  timeout: number;               // in seconds
  retryAttempts: number;
  retryDelay: number;            // in seconds
  isActive: boolean;
  coverage: {
    boundingBox: {
      northEast: Coordinate;
      southWest: Coordinate;
    };
    modes: TransportMode[];
  };
  dataFormat: 'json' | 'xml' | 'protobuf' | 'gtfs-rt';
  authentication?: {
    type: 'none' | 'api-key' | 'oauth' | 'basic';
    credentials?: any;
  };
  rateLimit?: {
    requestsPerMinute: number;
    burstLimit: number;
  };
}

/**
 * Real-time data provider interface
 */
export interface RealTimeDataProvider {
  id: string;
  name: string;
  description: string;
  sources: RealTimeDataSourceConfig[];
  status: DataSourceStatus;
  lastUpdate: Date | null;
  errorCount: number;
  lastError?: string;
  connect(): Promise<boolean>;
  disconnect(): Promise<boolean>;
  fetchData(sourceId: string): Promise<any>;
  subscribeToUpdates(callback: (data: any) => void): void;
  unsubscribeFromUpdates(callback: (data: any) => void): void;
  getStatus(): DataSourceStatus;
  getStatistics(): {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    lastUpdateTime: Date | null;
  };
}

/**
 * Real-time data cache configuration
 */
export interface RealTimeDataCacheConfig {
  enabled: boolean;
  maxSize: number;               // maximum number of items
  ttl: number;                   // time to live in seconds
  cleanupInterval: number;       // cleanup interval in seconds
  strategy: 'lru' | 'fifo' | 'lfu'; // cache eviction strategy
}

/**
 * Real-time data processing configuration
 */
export interface RealTimeDataProcessingConfig {
  validation: {
    enabled: boolean;
    strictMode: boolean;
    requiredFields: string[];
  };
  normalization: {
    enabled: boolean;
    coordinatePrecision: number;
    timePrecision: number;
  };
  quality: {
    enabled: boolean;
    minimumReliability: number;
    ageThreshold: number;        // in seconds
  };
  deduplication: {
    enabled: boolean;
    windowSize: number;          // in seconds
    keyFields: string[];
  };
}

/**
 * Real-time data system configuration
 */
export interface RealTimeDataSystemConfig {
  providers: RealTimeDataProvider[];
  cache: RealTimeDataCacheConfig;
  processing: RealTimeDataProcessingConfig;
  updates: {
    enabled: boolean;
    mode: 'polling' | 'webhook' | 'websocket';
    interval: number;            // in seconds
    batchSize: number;
    maxConcurrentRequests: number;
  };
  alerts: {
    enabled: boolean;
    thresholds: {
      dataAge: number;           // in seconds
      errorRate: number;         // percentage
      responseTime: number;      // in seconds
    };
  };
}

/**
 * Real-time data update notification
 */
export interface RealTimeDataUpdate {
  type: RealTimeDataSourceType;
  sourceId: string;
  data: any;
  timestamp: Date;
  quality: DataQuality;
  metadata?: {
    processingTime: number;
    sourceLatency: number;
    dataSize: number;
  };
}

/**
 * Real-time data aggregation result
 */
export interface RealTimeDataAggregation {
  segmentId: string;
  traffic?: TrafficData;
  publicTransport?: PublicTransportData[];
  construction?: ConstructionData[];
  events?: EventData[];
  weather?: WeatherData;
  overallImpact: number;         // 0-1, overall impact on routing
  lastUpdated: Date;
  reliability: number;           // 0-1, overall reliability
}

/**
 * Real-time route adjustment
 */
export interface RealTimeRouteAdjustment {
  segmentId: string;
  originalDuration: number;      // in seconds
  adjustedDuration: number;     // in seconds
  originalCost: number;
  adjustedCost: number;
  reason: string;
  confidence: number;           // 0-1
  factors: {
    traffic: number;            // 0-1 impact
    weather: number;            // 0-1 impact
    events: number;             // 0-1 impact
    construction: number;       // 0-1 impact
  };
  alternativeAvailable: boolean;
  alternativeSegmentId?: string;
}

/**
 * Real-time route monitoring data
 */
export interface RealTimeRouteMonitoring {
  routeId: string;
  status: 'on_track' | 'delayed' | 'ahead' | 'diverted' | 'failed';
  currentPosition?: Coordinate;
  currentSegmentIndex: number;
  progress: number;             // 0-1
  estimatedArrival: Date;
  originalArrival: Date;
  delay: number;                 // in seconds
  deviations: {
    segmentId: string;
    type: 'time' | 'route' | 'mode';
    severity: 'low' | 'medium' | 'high';
    description: string;
    timestamp: Date;
  }[];
  alerts: {
    id: string;
    type: 'delay' | 'closure' | 'recommendation';
    severity: EventSeverity;
    message: string;
    timestamp: Date;
    acknowledged: boolean;
  }[];
  lastUpdated: Date;
}

/**
 * Real-time data statistics
 */
export interface RealTimeDataStatistics {
  totalDataPoints: number;
  dataByType: {
    [key in RealTimeDataSourceType]: number;
  };
  dataByQuality: {
    [key in DataQuality]: number;
  };
  averageAge: number;            // in seconds
  oldestData: number;           // in seconds
  newestData: number;           // in seconds
  providerStatus: {
    [providerId: string]: {
      status: DataSourceStatus;
      lastUpdate: Date | null;
      errorCount: number;
      successRate: number;
    };
  };
  coverage: {
    totalSegments: number;
    segmentsWithData: number;
    coveragePercentage: number;
  };
  systemLoad: {
    cpuUsage: number;
    memoryUsage: number;
    requestRate: number;
  };
}