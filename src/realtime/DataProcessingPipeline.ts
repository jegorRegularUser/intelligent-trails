/**
 * Data processing pipeline for real-time data in the multi-modal routing system
 * Handles data ingestion, normalization, validation, and caching
 */

import {
  RealTimeDataSourceType,
  TrafficData,
  PublicTransportData,
  ConstructionData,
  EventData,
  WeatherData,
  RealTimeDataUpdate,
  RealTimeDataAggregation,
  RealTimeDataCacheConfig,
  RealTimeDataProcessingConfig,
  DataQuality,
  DataSourceStatus
} from '../types/realtime';
import { Coordinate, TransportMode } from '../types/graph';
import { BaseRealTimeConnector } from './RealTimeDataConnectors';

/**
 * Processing result for a data item
 */
export interface ProcessingResult {
  success: boolean;
  data?: any;
  errors?: string[];
  warnings?: string[];
  processingTime: number;
  metadata?: {
    originalSize: number;
    processedSize: number;
    validationScore: number;
  };
}

/**
 * Data validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number; // 0-1, where 1 is fully valid
}

/**
 * Data normalization result
 */
export interface NormalizationResult {
  data: any;
  transformations: string[];
  quality: DataQuality;
  confidence: number; // 0-1
}

/**
 * Cache entry for real-time data
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  quality: DataQuality;
}

/**
 * Data processing pipeline configuration
 */
export interface DataPipelineConfig {
  cache: RealTimeDataCacheConfig;
  processing: RealTimeDataProcessingConfig;
  monitoring: {
    enabled: boolean;
    metricsInterval: number; // in seconds
    alertThresholds: {
      processingTime: number; // in milliseconds
      errorRate: number; // percentage
      dataAge: number; // in seconds
    };
  };
}

/**
 * Data processing pipeline metrics
 */
export interface PipelineMetrics {
  totalProcessed: number;
  successRate: number;
  averageProcessingTime: number;
  cacheHitRate: number;
  dataFreshness: {
    average: number;
    min: number;
    max: number;
  };
  errorDistribution: {
    [errorType: string]: number;
  };
  lastUpdated: Date;
}

/**
 * Real-time data processing pipeline
 */
export class RealTimeDataProcessingPipeline {
  private config: DataPipelineConfig;
  private connectors: Map<string, BaseRealTimeConnector> = new Map();
  private cache: Map<string, CacheEntry<any>> = new Map();
  private metrics: PipelineMetrics;
  private processingStats = {
    totalItems: 0,
    successfulItems: 0,
    failedItems: 0,
    processingTimes: [] as number[],
    cacheHits: 0,
    cacheMisses: 0
  };
  private cleanupInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;

  constructor(config: DataPipelineConfig) {
    this.config = config;
    this.metrics = {
      totalProcessed: 0,
      successRate: 0,
      averageProcessingTime: 0,
      cacheHitRate: 0,
      dataFreshness: {
        average: 0,
        min: 0,
        max: 0
      },
      errorDistribution: {},
      lastUpdated: new Date()
    };

    this.startCleanupInterval();
    this.startMetricsInterval();
  }

  /**
   * Add a data connector to the pipeline
   */
  addConnector(connector: BaseRealTimeConnector): void {
    this.connectors.set(connector.id, connector);
    
    // Subscribe to updates from the connector
    connector.subscribeToUpdates((data) => {
      this.processData(connector.id, data);
    });
  }

  /**
   * Remove a connector from the pipeline
   */
  removeConnector(connectorId: string): void {
    const connector = this.connectors.get(connectorId);
    if (connector) {
      connector.disconnect();
      this.connectors.delete(connectorId);
    }
  }

  /**
   * Process incoming data from a connector
   */
  async processData(connectorId: string, rawData: any): Promise<ProcessingResult> {
    const startTime = Date.now();
    this.processingStats.totalItems++;

    try {
      // Step 1: Validate the raw data
      const validation = this.validateData(rawData);
      if (!validation.isValid && this.config.processing.validation.strictMode) {
        this.processingStats.failedItems++;
        return {
          success: false,
          errors: validation.errors,
          processingTime: Date.now() - startTime
        };
      }

      // Step 2: Normalize the data
      const normalization = this.normalizeData(rawData, connectorId);
      
      // Step 3: Apply quality filters
      if (this.config.processing.quality.enabled) {
        const qualityResult = this.applyQualityFilters(normalization);
        if (!qualityResult.passed) {
          this.processingStats.failedItems++;
          return {
            success: false,
            errors: qualityResult.reasons,
            processingTime: Date.now() - startTime
          };
        }
      }

      // Step 4: Apply deduplication
      if (this.config.processing.deduplication.enabled) {
        const deduplicationResult = this.applyDeduplication(normalization.data);
        if (deduplicationResult.isDuplicate) {
          return {
            success: true,
            data: deduplicationResult.existingData,
            warnings: ['Duplicate data detected'],
            processingTime: Date.now() - startTime
          };
        }
      }

      // Step 5: Cache the processed data
      if (this.config.cache.enabled) {
        this.cacheData(normalization.data, normalization.quality);
      }

      // Step 6: Update metrics
      this.processingStats.successfulItems++;
      this.processingStats.processingTimes.push(Date.now() - startTime);
      this.updateMetrics();

      return {
        success: true,
        data: normalization.data,
        warnings: validation.warnings,
        processingTime: Date.now() - startTime,
        metadata: {
          originalSize: JSON.stringify(rawData).length,
          processedSize: JSON.stringify(normalization.data).length,
          validationScore: validation.score
        }
      };
    } catch (error) {
      this.processingStats.failedItems++;
      this.recordError('processing', error instanceof Error ? error.message : String(error));
      
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Validate incoming data
   */
  private validateData(data: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let score = 1.0;

    if (!data || typeof data !== 'object') {
      errors.push('Data is not an object');
      score = 0;
      return { isValid: false, errors, warnings, score };
    }

    // Check required fields based on data type
    const requiredFields = this.config.processing.validation.requiredFields;
    for (const field of requiredFields) {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`);
        score -= 0.2;
      }
    }

    // Validate data structure
    if (Array.isArray(data.items) && data.items.length === 0) {
      warnings.push('Empty data array received');
      score -= 0.1;
    }

    // Validate timestamps
    if (data.timestamp) {
      const timestamp = new Date(data.timestamp);
      if (isNaN(timestamp.getTime())) {
        errors.push('Invalid timestamp format');
        score -= 0.3;
      } else {
        const age = Date.now() - timestamp.getTime();
        if (age > this.config.processing.quality.ageThreshold * 1000) {
          warnings.push('Data is older than threshold');
          score -= 0.1;
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: Math.max(0, Math.min(1, score))
    };
  }

  /**
   * Normalize data to standard format
   */
  private normalizeData(rawData: any, connectorId: string): NormalizationResult {
    const transformations: string[] = [];
    let quality = DataQuality.MODERATE_CONFIDENCE;
    let confidence = 0.8;

    // Create a deep copy to avoid modifying the original
    const data = JSON.parse(JSON.stringify(rawData));

    // Normalize coordinates
    if (data.coordinates) {
      if (data.coordinates.start) {
        data.coordinates.start.latitude = Number(data.coordinates.start.latitude).toFixed(
          this.config.processing.normalization.coordinatePrecision
        );
        data.coordinates.start.longitude = Number(data.coordinates.start.longitude).toFixed(
          this.config.processing.normalization.coordinatePrecision
        );
      }
      if (data.coordinates.end) {
        data.coordinates.end.latitude = Number(data.coordinates.end.latitude).toFixed(
          this.config.processing.normalization.coordinatePrecision
        );
        data.coordinates.end.longitude = Number(data.coordinates.end.longitude).toFixed(
          this.config.processing.normalization.coordinatePrecision
        );
      }
      transformations.push('Normalized coordinates');
    }

    // Normalize timestamps
    if (data.timestamp) {
      data.timestamp = new Date(data.timestamp).toISOString();
      transformations.push('Normalized timestamp');
    }

    // Add metadata
    data.processedAt = new Date().toISOString();
    data.processedBy = connectorId;
    transformations.push('Added processing metadata');

    // Determine quality based on source and transformations
    if (data.confidence) {
      confidence = Math.min(1, Math.max(0, data.confidence));
    }

    if (confidence > 0.8) {
      quality = DataQuality.HIGH_CONFIDENCE;
    } else if (confidence > 0.5) {
      quality = DataQuality.MODERATE_CONFIDENCE;
    } else {
      quality = DataQuality.LOW_CONFIDENCE;
    }

    return {
      data,
      transformations,
      quality,
      confidence
    };
  }

  /**
   * Apply quality filters to normalized data
   */
  private applyQualityFilters(normalization: NormalizationResult): { passed: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Check minimum reliability threshold
    if (normalization.confidence < this.config.processing.quality.minimumReliability) {
      reasons.push(`Data confidence ${normalization.confidence} below threshold ${this.config.processing.quality.minimumReliability}`);
    }

    // Check data age
    if (normalization.data.timestamp) {
      const timestamp = new Date(normalization.data.timestamp);
      const age = Date.now() - timestamp.getTime();
      if (age > this.config.processing.quality.ageThreshold * 1000) {
        reasons.push(`Data age ${age}ms exceeds threshold ${this.config.processing.quality.ageThreshold * 1000}ms`);
      }
    }

    return {
      passed: reasons.length === 0,
      reasons
    };
  }

  /**
   * Apply deduplication to data
   */
  private applyDeduplication(data: any): { isDuplicate: boolean; existingData?: any } {
    // Create a hash key based on configured key fields
    const keyFields = this.config.processing.deduplication.keyFields;
    const keyParts = keyFields.map(field => {
      const value = data[field];
      return value !== undefined ? String(value) : '';
    });
    const dedupeKey = keyParts.join('|');

    // Check if we have recent data with the same key
    const windowSize = this.config.processing.deduplication.windowSize * 1000;
    const now = Date.now();

    for (const [cacheKey, entry] of this.cache.entries()) {
      if (cacheKey.startsWith(dedupeKey) && (now - entry.timestamp) < windowSize) {
        return { isDuplicate: true, existingData: entry.data };
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Cache processed data
   */
  private cacheData(data: any, quality: DataQuality): void {
    // Create cache key
    const key = `${data.id || 'unknown'}-${Date.now()}-${Math.random()}`;
    
    const entry: CacheEntry<any> = {
      data,
      timestamp: Date.now(),
      ttl: this.config.cache.ttl * 1000,
      accessCount: 0,
      lastAccessed: Date.now(),
      quality
    };

    this.cache.set(key, entry);

    // Enforce cache size limit
    if (this.cache.size > this.config.cache.maxSize) {
      this.evictCacheEntries();
    }
  }

  /**
   * Evict cache entries based on configured strategy
   */
  private evictCacheEntries(): void {
    const entries = Array.from(this.cache.entries());
    
    switch (this.config.cache.strategy) {
      case 'lru': // Least Recently Used
        entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
        break;
      case 'lfu': // Least Frequently Used
        entries.sort((a, b) => a[1].accessCount - b[1].accessCount);
        break;
      case 'fifo': // First In First Out
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        break;
    }

    // Remove 10% of entries
    const toRemove = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Get cached data
   */
  getCachedData<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.processingStats.cacheMisses++;
      return null;
    }

    // Check if entry is expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.processingStats.cacheMisses++;
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = now;
    this.processingStats.cacheHits++;

    return entry.data as T;
  }

  /**
   * Get all cached data of a specific type
   */
  getCachedDataByType<T>(type: RealTimeDataSourceType): T[] {
    const results: T[] = [];
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp <= entry.ttl && this.isDataType(entry.data, type)) {
        results.push(entry.data as T);
      }
    }

    return results;
  }

  /**
   * Check if cached data matches a specific type
   */
  private isDataType(data: any, type: RealTimeDataSourceType): boolean {
    switch (type) {
      case RealTimeDataSourceType.TRAFFIC:
        return data.condition !== undefined && data.currentSpeed !== undefined;
      case RealTimeDataSourceType.PUBLIC_TRANSPORT:
        return data.routeId !== undefined && data.status !== undefined;
      case RealTimeDataSourceType.WEATHER:
        return data.condition !== undefined && data.temperature !== undefined;
      case RealTimeDataSourceType.CONSTRUCTION:
        return data.type !== undefined && data.impact !== undefined;
      case RealTimeDataSourceType.EVENTS:
        return data.type !== undefined && data.severity !== undefined;
      default:
        return false;
    }
  }

  /**
   * Start cache cleanup interval
   */
  private startCleanupInterval(): void {
    if (!this.config.cache.enabled) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanupCache();
    }, this.config.cache.cleanupInterval * 1000);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Start metrics collection interval
   */
  private startMetricsInterval(): void {
    if (!this.config.monitoring.enabled) return;

    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, this.config.monitoring.metricsInterval * 1000);
  }

  /**
   * Update pipeline metrics
   */
  private updateMetrics(): void {
    const totalItems = this.processingStats.totalItems;
    const successRate = totalItems > 0 ? this.processingStats.successfulItems / totalItems : 0;
    
    const avgProcessingTime = this.processingStats.processingTimes.length > 0
      ? this.processingStats.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingStats.processingTimes.length
      : 0;
    
    const cacheHitRate = (this.processingStats.cacheHits + this.processingStats.cacheMisses) > 0
      ? this.processingStats.cacheHits / (this.processingStats.cacheHits + this.processingStats.cacheMisses)
      : 0;

    // Calculate data freshness
    const now = Date.now();
    const ages: number[] = [];
    for (const entry of this.cache.values()) {
      ages.push(now - entry.timestamp);
    }
    
    const dataFreshness = {
      average: ages.length > 0 ? ages.reduce((sum, age) => sum + age, 0) / ages.length : 0,
      min: ages.length > 0 ? Math.min(...ages) : 0,
      max: ages.length > 0 ? Math.max(...ages) : 0
    };

    this.metrics = {
      totalProcessed: totalItems,
      successRate,
      averageProcessingTime: avgProcessingTime,
      cacheHitRate,
      dataFreshness,
      errorDistribution: { ...this.metrics.errorDistribution },
      lastUpdated: new Date()
    };
  }

  /**
   * Record an error for metrics
   */
  private recordError(type: string, message: string): void {
    if (!this.metrics.errorDistribution[type]) {
      this.metrics.errorDistribution[type] = 0;
    }
    this.metrics.errorDistribution[type]++;
  }

  /**
   * Get current pipeline metrics
   */
  getMetrics(): PipelineMetrics {
    return { ...this.metrics };
  }

  /**
   * Get aggregated real-time data
   */
  getAggregatedData(segmentId: string): RealTimeDataAggregation | null {
    const traffic = this.getCachedDataByType<TrafficData>(RealTimeDataSourceType.TRAFFIC)
      .find(t => t.segmentId === segmentId);
    
    const publicTransport = this.getCachedDataByType<PublicTransportData>(RealTimeDataSourceType.PUBLIC_TRANSPORT)
      .filter(pt => pt.routeId === segmentId);
    
    const construction = this.getCachedDataByType<ConstructionData>(RealTimeDataSourceType.CONSTRUCTION)
      .filter(c => c.location.affectedSegments.includes(segmentId));
    
    const events = this.getCachedDataByType<EventData>(RealTimeDataSourceType.EVENTS)
      .filter(e => e.location.affectedSegments.includes(segmentId));
    
    const weather = this.getCachedDataByType<WeatherData>(RealTimeDataSourceType.WEATHER)[0];

    if (!traffic && !publicTransport.length && !construction.length && !events.length && !weather) {
      return null;
    }

    // Calculate overall impact
    let overallImpact = 0;
    if (traffic) overallImpact = Math.max(overallImpact, traffic.congestionLevel);
    if (construction.length > 0) overallImpact = Math.max(overallImpact, ...construction.map(c => this.impactLevelToNumber(c.impact)));
    if (events.length > 0) overallImpact = Math.max(overallImpact, ...events.map(e => this.impactLevelToNumber(e.impact)));
    if (weather) overallImpact = Math.max(overallImpact, this.impactLevelToNumber(weather.impact));

    // Calculate overall reliability
    const reliabilityScores = [];
    if (traffic) reliabilityScores.push(traffic.reliability);
    if (publicTransport.length > 0) reliabilityScores.push(...publicTransport.map(pt => pt.reliability));
    if (construction.length > 0) reliabilityScores.push(...construction.map(c => c.quality === 'verified' ? 1 : c.quality === 'high_confidence' ? 0.9 : c.quality === 'moderate_confidence' ? 0.7 : c.quality === 'low_confidence' ? 0.5 : 0.3));
    if (events.length > 0) reliabilityScores.push(...events.map(e => e.quality === 'verified' ? 1 : e.quality === 'high_confidence' ? 0.9 : e.quality === 'moderate_confidence' ? 0.7 : e.quality === 'low_confidence' ? 0.5 : 0.3));
    if (weather) reliabilityScores.push(weather.quality === 'verified' ? 1 : weather.quality === 'high_confidence' ? 0.9 : weather.quality === 'moderate_confidence' ? 0.7 : weather.quality === 'low_confidence' ? 0.5 : 0.3);
    
    const overallReliability = reliabilityScores.length > 0 
      ? reliabilityScores.reduce((sum, score) => sum + score, 0) / reliabilityScores.length 
      : 0;

    return {
      segmentId,
      traffic,
      publicTransport,
      construction,
      events,
      weather,
      overallImpact,
      lastUpdated: new Date(),
      reliability: overallReliability
    };
  }

  /**
   * Convert ImpactLevel to numeric value
   */
  private impactLevelToNumber(impact: any): number {
    switch (impact) {
      case 'critical': return 1;
      case 'major': return 0.8;
      case 'significant': return 0.6;
      case 'local': return 0.4;
      case 'minimal': return 0.2;
      default: return 0;
    }
  }

  /**
   * Shutdown the pipeline
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Disconnect all connectors
    for (const connector of this.connectors.values()) {
      connector.disconnect();
    }
    
    this.connectors.clear();
    this.cache.clear();
  }
}