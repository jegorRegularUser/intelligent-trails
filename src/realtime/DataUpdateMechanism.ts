/**
 * Data update mechanism for real-time routing
 * Handles periodic updating of real-time data from various sources and ensures data freshness
 */

import {
  RealTimeDataSourceType,
  RealTimeDataUpdate,
  DataQuality,
  TrafficCondition,
  PublicTransportStatus,
  ImpactLevel,
  EventSeverity
} from '../types/realtime';
import { RealTimeDataProcessingPipeline } from './DataProcessingPipeline';
import { RealTimeDataModelFactory } from './RealTimeDataModels';
// Placeholder interface for RealTimeDataSourceConnector
// Will be replaced with actual import when the file is created
interface RealTimeDataSourceConnector {
  getSourceId(): string;
  getSourceType(): any;
  fetchData(): Promise<any>;
}

/**
 * Update mechanism configuration
 */
export interface DataUpdateConfig {
  enabled: boolean;
  updateIntervals: {
    [key in RealTimeDataSourceType]: number; // in seconds
  };
  dataFreshness: {
    maxAge: {
      [key in RealTimeDataSourceType]: number; // in seconds
    };
    criticalThreshold: number; // in seconds, after which data is considered stale
  };
  retryPolicy: {
    maxAttempts: number;
    backoffFactor: number; // multiplier for retry delay
    initialDelay: number; // in seconds
  };
  prioritization: {
    enabled: boolean;
    factors: {
      dataAge: number; // 0-1, weight for data age
      dataQuality: number; // 0-1, weight for data quality
      userLocation: number; // 0-1, weight for proximity to user
      routeRelevance: number; // 0-1, weight for relevance to active routes
    };
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number; // in seconds
    alertThresholds: {
      failureRate: number; // 0-1, failure rate before alert
      averageLatency: number; // in ms, average latency before alert
      staleData: number; // in seconds, stale data threshold before alert
    };
  };
}

/**
 * Update task information
 */
export interface UpdateTask {
  id: string;
  sourceType: RealTimeDataSourceType;
  sourceId: string;
  priority: number; // 0-1, higher values are processed first
  scheduledTime: Date;
  lastAttempt?: Date;
  attempts: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: {
    success: boolean;
    recordsUpdated: number;
    error?: string;
    duration: number; // in ms
  };
}

/**
 * Update statistics
 */
export interface UpdateStatistics {
  totalUpdates: number;
  successfulUpdates: number;
  failedUpdates: number;
  averageLatency: number; // in ms
  recordsUpdated: number;
  lastUpdate: Date | null;
  updatesBySource: {
    [key in RealTimeDataSourceType]: {
      total: number;
      successful: number;
      failed: number;
      averageLatency: number;
    };
  };
  errorsByType: Record<string, number>;
}

/**
 * Data update mechanism
 */
export class DataUpdateMechanism {
  private config: DataUpdateConfig;
  private pipeline: RealTimeDataProcessingPipeline;
  private connectors: Map<string, RealTimeDataSourceConnector> = new Map();
  private updateQueue: UpdateTask[] = [];
  private activeTasks: Map<string, UpdateTask> = new Map();
  private updateIntervals: Map<RealTimeDataSourceType, NodeJS.Timeout> = new Map();
  private statistics: UpdateStatistics;
  private metricsInterval?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    config: DataUpdateConfig,
    pipeline: RealTimeDataProcessingPipeline,
    connectors: RealTimeDataSourceConnector[]
  ) {
    this.config = config;
    this.pipeline = pipeline;
    
    // Initialize connectors
    for (const connector of connectors) {
      this.connectors.set(connector.getSourceId(), connector);
    }
    
    // Initialize statistics
    this.statistics = {
      totalUpdates: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      averageLatency: 0,
      recordsUpdated: 0,
      lastUpdate: null,
      updatesBySource: {} as any,
      errorsByType: {}
    };
  }

  /**
   * Initialize the data update mechanism
   */
  initialize(): void {
    if (!this.config.enabled) return;
    
    this.isRunning = true;
    
    // Start update intervals for each source type
    for (const sourceType of Object.values(RealTimeDataSourceType)) {
      this.startUpdateInterval(sourceType);
    }
    
    // Start metrics collection if enabled
    if (this.config.monitoring.enabled) {
      this.startMetricsCollection();
    }
    
    // Start processing the update queue
    this.processUpdateQueue();
  }

  /**
   * Start update interval for a specific source type
   */
  private startUpdateInterval(sourceType: RealTimeDataSourceType): void {
    const interval = this.config.updateIntervals[sourceType] * 1000;
    
    const updateInterval = setInterval(() => {
      this.scheduleUpdatesForSourceType(sourceType);
    }, interval);
    
    this.updateIntervals.set(sourceType, updateInterval);
    
    // Schedule initial update
    this.scheduleUpdatesForSourceType(sourceType);
  }

  /**
   * Schedule updates for a specific source type
   */
  private scheduleUpdatesForSourceType(sourceType: RealTimeDataSourceType): void {
    // Get all connectors for this source type
    const connectorsForType = Array.from(this.connectors.values())
      .filter(connector => connector.getSourceType() === sourceType);
    
    // Create update tasks for each connector
    for (const connector of connectorsForType) {
      // Calculate priority based on data age and other factors
      const priority = this.calculateUpdatePriority(connector);
      
      const task: UpdateTask = {
        id: `${connector.getSourceId()}-${Date.now()}`,
        sourceType,
        sourceId: connector.getSourceId(),
        priority,
        scheduledTime: new Date(),
        attempts: 0,
        status: 'pending'
      };
      
      // Add to update queue
      this.addToUpdateQueue(task);
    }
  }

  /**
   * Calculate update priority for a connector
   */
  private calculateUpdatePriority(connector: RealTimeDataSourceConnector): number {
    const sourceType = connector.getSourceType();
    const sourceId = connector.getSourceId();
    
    // Get last update time for this connector
    const lastUpdate = null; // Would get from pipeline in real implementation
    const now = Date.now();
    const dataAge = lastUpdate ? (now - lastUpdate.getTime()) / 1000 : Infinity;
    
    // Get data quality for this connector
    const cachedData = this.pipeline.getCachedData ? this.pipeline.getCachedData(sourceId) : null;
    const dataQuality = cachedData && (cachedData as any).quality ?
      this.getDataQualityScore((cachedData as any).quality) : 0;
    
    // Calculate base priority from data age
    const maxAge = this.config.dataFreshness.maxAge[sourceType];
    const ageFactor = Math.min(1, dataAge / maxAge);
    
    // Calculate priority using configured factors
    const factors = this.config.prioritization.factors;
    let priority = 0;
    
    if (this.config.prioritization.enabled) {
      priority = 
        (ageFactor * factors.dataAge) +
        (dataQuality * factors.dataQuality);
      
      // In a real implementation, we would also consider:
      // - User location proximity
      // - Relevance to active routes
    } else {
      // Simple priority based on data age
      priority = ageFactor;
    }
    
    return Math.min(1, Math.max(0, priority));
  }

  /**
   * Get data quality score from DataQuality enum
   */
  private getDataQualityScore(quality: DataQuality): number {
    switch (quality) {
      case DataQuality.VERIFIED: return 1.0;
      case DataQuality.HIGH_CONFIDENCE: return 0.9;
      case DataQuality.MODERATE_CONFIDENCE: return 0.7;
      case DataQuality.LOW_CONFIDENCE: return 0.5;
      case DataQuality.UNVERIFIED: return 0.3;
      default: return 0;
    }
  }

  /**
   * Add task to update queue with priority ordering
   */
  private addToUpdateQueue(task: UpdateTask): void {
    // Find position to insert based on priority
    let insertIndex = 0;
    for (let i = 0; i < this.updateQueue.length; i++) {
      if (this.updateQueue[i].priority < task.priority) {
        insertIndex = i;
        break;
      }
      insertIndex = i + 1;
    }
    
    // Insert task at the calculated position
    this.updateQueue.splice(insertIndex, 0, task);
  }

  /**
   * Process the update queue
   */
  private async processUpdateQueue(): Promise<void> {
    if (!this.isRunning) return;
    
    // Process as many tasks as we can concurrently
    while (this.updateQueue.length > 0 && this.activeTasks.size < 5) {
      const task = this.updateQueue.shift();
      if (!task) break;
      
      // Move task to active tasks
      this.activeTasks.set(task.id, task);
      task.status = 'in_progress';
      task.lastAttempt = new Date();
      task.attempts++;
      
      // Process the task
      this.processUpdateTask(task).finally(() => {
        // Remove from active tasks when done
        this.activeTasks.delete(task.id);
      });
    }
    
    // Schedule next queue processing
    setTimeout(() => this.processUpdateQueue(), 100);
  }

  /**
   * Process a single update task
   */
  private async processUpdateTask(task: UpdateTask): Promise<void> {
    const connector = this.connectors.get(task.sourceId);
    if (!connector) {
      task.status = 'failed';
      task.result = {
        success: false,
        recordsUpdated: 0,
        error: `Connector not found: ${task.sourceId}`,
        duration: 0
      };
      this.updateStatistics(task);
      return;
    }
    
    const startTime = Date.now();
    
    try {
      // Fetch data from connector
      const rawData = await connector.fetchData();
      
      // Process data through pipeline
      const update: RealTimeDataUpdate = {
        type: task.sourceType,
        sourceId: task.sourceId,
        data: rawData,
        timestamp: new Date(),
        quality: this.assessDataQuality(rawData)
      };
      
      const processedData = await this.pipeline.processData(task.sourceId, update);
      
      // Calculate duration
      const duration = Date.now() - startTime;
      
      // Update task result
      task.status = 'completed';
      task.result = {
        success: true,
        recordsUpdated: Array.isArray(processedData) ? processedData.length : 1,
        duration
      };
      
      // Update statistics
      this.updateStatistics(task);
      
    } catch (error) {
      // Calculate duration
      const duration = Date.now() - startTime;
      
      // Update task result
      task.status = 'failed';
      task.result = {
        success: false,
        recordsUpdated: 0,
        error: error instanceof Error ? error.message : String(error),
        duration
      };
      
      // Update statistics
      this.updateStatistics(task);
      
      // Retry if we haven't reached max attempts
      if (task.attempts < this.config.retryPolicy.maxAttempts) {
        // Calculate retry delay with exponential backoff
        const delay = this.config.retryPolicy.initialDelay * 
          Math.pow(this.config.retryPolicy.backoffFactor, task.attempts - 1) * 1000;
        
        // Schedule retry
        setTimeout(() => {
          task.status = 'pending';
          task.scheduledTime = new Date(Date.now() + delay);
          this.addToUpdateQueue(task);
        }, delay);
      }
    }
  }

  /**
   * Assess data quality based on raw data
   */
  private assessDataQuality(rawData: any): DataQuality {
    // In a real implementation, this would perform various checks on the data
    // For now, we'll return a default quality
    return DataQuality.MODERATE_CONFIDENCE;
  }

  /**
   * Update statistics with task result
   */
  private updateStatistics(task: UpdateTask): void {
    if (!task.result) return;
    
    const sourceType = task.sourceType;
    
    // Update overall statistics
    this.statistics.totalUpdates++;
    this.statistics.recordsUpdated += task.result.recordsUpdated;
    
    if (task.result.success) {
      this.statistics.successfulUpdates++;
    } else {
      this.statistics.failedUpdates++;
      
      // Track error types
      if (task.result.error) {
        const errorType = task.result.error.split(':')[0];
        if (!this.statistics.errorsByType[errorType]) {
          this.statistics.errorsByType[errorType] = 0;
        }
        this.statistics.errorsByType[errorType]++;
      }
    }
    
    // Update average latency
    const totalLatency = this.statistics.averageLatency * (this.statistics.totalUpdates - 1) + task.result.duration;
    this.statistics.averageLatency = totalLatency / this.statistics.totalUpdates;
    
    // Update source-specific statistics
    const sourceStats = this.statistics.updatesBySource[sourceType];
    sourceStats.total++;
    
    if (task.result.success) {
      sourceStats.successful++;
    } else {
      sourceStats.failed++;
    }
    
    const sourceTotalLatency = sourceStats.averageLatency * (sourceStats.total - 1) + task.result.duration;
    sourceStats.averageLatency = sourceTotalLatency / sourceStats.total;
    
    // Update last update time
    this.statistics.lastUpdate = new Date();
    
    // Check for alerts if monitoring is enabled
    if (this.config.monitoring.enabled) {
      this.checkForAlerts();
    }
  }

  /**
   * Check for alerts based on current statistics
   */
  private checkForAlerts(): void {
    const thresholds = this.config.monitoring.alertThresholds;
    
    // Check failure rate
    const failureRate = this.statistics.failedUpdates / this.statistics.totalUpdates;
    if (failureRate > thresholds.failureRate) {
      console.warn(`Data update failure rate alert: ${failureRate.toFixed(2)} > ${thresholds.failureRate}`);
    }
    
    // Check average latency
    if (this.statistics.averageLatency > thresholds.averageLatency) {
      console.warn(`Data update latency alert: ${this.statistics.averageLatency}ms > ${thresholds.averageLatency}ms`);
    }
    
    // Check for stale data
    const now = Date.now();
    for (const [sourceType, maxAge] of Object.entries(this.config.dataFreshness.maxAge)) {
      const lastUpdate = null; // Would get from pipeline in real implementation
      if (lastUpdate && (now - lastUpdate.getTime()) / 1000 > maxAge + thresholds.staleData) {
        console.warn(`Stale data alert for ${sourceType}: age exceeds threshold`);
      }
    }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoring.metricsInterval * 1000);
  }

  /**
   * Collect and log metrics
   */
  private collectMetrics(): void {
    // In a real implementation, this would send metrics to a monitoring system
    // For now, we'll just log them
    console.log('Data Update Metrics:', {
      timestamp: new Date(),
      statistics: this.statistics,
      queueSize: this.updateQueue.length,
      activeTasks: this.activeTasks.size
    });
  }

  /**
   * Force an immediate update for a specific source
   */
  async forceUpdate(sourceId: string): Promise<boolean> {
    const connector = this.connectors.get(sourceId);
    if (!connector) return false;
    
    // Create high-priority update task
    const task: UpdateTask = {
      id: `${sourceId}-${Date.now()}-forced`,
      sourceType: connector.getSourceType(),
      sourceId,
      priority: 1.0, // Maximum priority
      scheduledTime: new Date(),
      attempts: 0,
      status: 'pending'
    };
    
    // Add to front of queue
    this.updateQueue.unshift(task);
    
    return true;
  }

  /**
   * Get current update statistics
   */
  getStatistics(): UpdateStatistics {
    return { ...this.statistics };
  }

  /**
   * Get current update queue status
   */
  getQueueStatus(): {
    queueSize: number;
    activeTasks: number;
    nextTask?: UpdateTask;
  } {
    return {
      queueSize: this.updateQueue.length,
      activeTasks: this.activeTasks.size,
      nextTask: this.updateQueue[0]
    };
  }

  /**
   * Get data freshness status
   */
  getDataFreshness(): {
    [key in RealTimeDataSourceType]: {
      lastUpdate: Date | null;
      age: number; // in seconds
      isStale: boolean;
    };
  } {
    const now = Date.now();
    const result: any = {};
    
    for (const sourceType of Object.values(RealTimeDataSourceType)) {
      const lastUpdate = null; // Would get from pipeline in real implementation
      const age = lastUpdate ? (now - lastUpdate.getTime()) / 1000 : Infinity;
      const maxAge = this.config.dataFreshness.maxAge[sourceType];
      
      result[sourceType] = {
        lastUpdate,
        age,
        isStale: age > maxAge
      };
    }
    
    return result;
  }

  /**
   * Shutdown the data update mechanism
   */
  shutdown(): void {
    this.isRunning = false;
    
    // Clear update intervals
    for (const interval of this.updateIntervals.values()) {
      clearInterval(interval);
    }
    this.updateIntervals.clear();
    
    // Clear metrics interval
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    // Clear queues and tasks
    this.updateQueue = [];
    this.activeTasks.clear();
  }
}