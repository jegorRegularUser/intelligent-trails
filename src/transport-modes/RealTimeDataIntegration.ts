/**
 * Real-time data integration for transport modes
 * Handles real-time updates and adjustments for transport mode routing
 */

import {
  GraphEdge,
  RealTimeEdgeData,
  TransportMode
} from '../types/graph';
import { TransportModeHandler, RoutingContext } from './TransportModeHandler';
import { MultiModalGraphImpl } from '../graph/MultiModalGraph';

/**
 * Real-time data source interface
 */
export interface RealTimeDataSource {
  id: string;
  name: string;
  type: 'traffic' | 'transit' | 'weather' | 'events' | 'user_reports';
  updateFrequency: number; // in seconds
  lastUpdated: Date;
  isActive: boolean;
  coverage: {
    modes: TransportMode[];
    boundingBox: {
      northEast: { latitude: number; longitude: number };
      southWest: { latitude: number; longitude: number };
    };
  };
}

/**
 * Real-time data provider interface
 */
export interface RealTimeDataProvider {
  id: string;
  name: string;
  sources: RealTimeDataSource[];
  connect(): Promise<boolean>;
  disconnect(): Promise<boolean>;
  fetchData(sourceId: string): Promise<RealTimeEdgeData[]>;
  subscribeToUpdates(callback: (data: RealTimeEdgeData[]) => void): void;
  unsubscribeFromUpdates(callback: (data: RealTimeEdgeData[]) => void): void;
}

/**
 * Real-time data configuration
 */
export interface RealTimeDataConfig {
  providers: RealTimeDataProvider[];
  updateInterval: number; // in seconds
  maxDataAge: number; // in seconds
  enableCache: boolean;
  cacheSize: number;
  enablePredictions: boolean;
  predictionHorizon: number; // in minutes
}

/**
 * Real-time data integration implementation
 */
export class RealTimeDataIntegration {
  private graph: MultiModalGraphImpl;
  private config: RealTimeDataConfig;
  private dataCache: Map<string, { data: RealTimeEdgeData; timestamp: number }>;
  private updateIntervals: Map<string, NodeJS.Timeout>;
  private subscribers: Map<string, ((data: RealTimeEdgeData[]) => void)[]>;

  constructor(graph: MultiModalGraphImpl, config: RealTimeDataConfig) {
    this.graph = graph;
    this.config = config;
    this.dataCache = new Map();
    this.updateIntervals = new Map();
    this.subscribers = new Map();
  }

  /**
   * Initialize real-time data integration
   */
  async initialize(): Promise<boolean> {
    try {
      // Connect to all providers
      for (const provider of this.config.providers) {
        const connected = await provider.connect();
        if (!connected) {
          console.warn(`Failed to connect to provider: ${provider.name}`);
          continue;
        }

        // Set up update intervals for each source
        for (const source of provider.sources) {
          if (source.isActive) {
            this.setupSourceUpdates(provider, source);
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize real-time data integration:', error);
      return false;
    }
  }

  /**
   * Set up updates for a data source
   */
  private setupSourceUpdates(provider: RealTimeDataProvider, source: RealTimeDataSource): void {
    const interval = setInterval(async () => {
      try {
        const data = await provider.fetchData(source.id);
        if (data && data.length > 0) {
          this.updateDataCache(data);
          this.notifySubscribers(provider.id, data);
        }
      } catch (error) {
        console.error(`Failed to fetch data from source ${source.id}:`, error);
      }
    }, source.updateFrequency * 1000);

    this.updateIntervals.set(`${provider.id}-${source.id}`, interval);
  }

  /**
   * Update the data cache with new data
   */
  private updateDataCache(data: RealTimeEdgeData[]): void {
    const now = Date.now();
    
    for (const edgeData of data) {
      // Create a unique key for this edge data
      const edgeKey = `${edgeData.lastUpdated.getTime()}-${Math.random()}`;
      this.dataCache.set(edgeKey, {
        data: edgeData,
        timestamp: now
      });
    }

    // Clean up old data if cache is enabled
    if (this.config.enableCache) {
      this.cleanupOldData();
    }
  }

  /**
   * Clean up old data from the cache
   */
  private cleanupOldData(): void {
    const now = Date.now();
    const maxAge = this.config.maxDataAge * 1000;
    
    for (const [edgeId, { timestamp }] of this.dataCache.entries()) {
      if (now - timestamp > maxAge) {
        this.dataCache.delete(edgeId);
      }
    }

    // Limit cache size
    if (this.dataCache.size > this.config.cacheSize) {
      // Sort by timestamp and remove oldest entries
      const entries = Array.from(this.dataCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const entriesToRemove = entries.slice(0, entries.length - this.config.cacheSize);
      for (const [edgeId] of entriesToRemove) {
        this.dataCache.delete(edgeId);
      }
    }
  }

  /**
   * Notify subscribers of new data
   */
  private notifySubscribers(providerId: string, data: RealTimeEdgeData[]): void {
    const callbacks = this.subscribers.get(providerId);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in subscriber callback:', error);
        }
      }
    }
  }

  /**
   * Get real-time data for an edge
   */
  getRealTimeData(edgeId: string): RealTimeEdgeData | null {
    const cached = this.dataCache.get(edgeId);
    if (!cached) return null;

    // Check if data is still fresh
    const now = Date.now();
    const maxAge = this.config.maxDataAge * 1000;
    
    if (now - cached.timestamp > maxAge) {
      this.dataCache.delete(edgeId);
      return null;
    }

    return cached.data;
  }

  /**
   * Get all real-time data
   */
  getAllRealTimeData(): RealTimeEdgeData[] {
    const now = Date.now();
    const maxAge = this.config.maxDataAge * 1000;
    const result: RealTimeEdgeData[] = [];

    for (const [edgeId, { data, timestamp }] of this.dataCache.entries()) {
      if (now - timestamp <= maxAge) {
        result.push(data);
      } else {
        this.dataCache.delete(edgeId);
      }
    }

    return result;
  }

  /**
   * Subscribe to real-time updates from a provider
   */
  subscribeToProviderUpdates(providerId: string, callback: (data: RealTimeEdgeData[]) => void): void {
    if (!this.subscribers.has(providerId)) {
      this.subscribers.set(providerId, []);
    }
    
    this.subscribers.get(providerId)!.push(callback);
  }

  /**
   * Unsubscribe from real-time updates from a provider
   */
  unsubscribeFromProviderUpdates(providerId: string, callback: (data: RealTimeEdgeData[]) => void): void {
    const callbacks = this.subscribers.get(providerId);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Apply real-time adjustments to an edge using a transport mode handler
   */
  applyRealTimeAdjustments(
    edge: GraphEdge,
    handler: TransportModeHandler,
    context: RoutingContext
  ): GraphEdge {
    const realTimeData = this.getRealTimeData(edge.id);
    if (!realTimeData) return edge;

    return handler.applyRealTimeAdjustments(edge, realTimeData);
  }

  /**
   * Get predicted conditions for an edge
   */
  getPredictedConditions(edgeId: string, timeAhead: number): RealTimeEdgeData | null {
    if (!this.config.enablePredictions) return null;

    const currentData = this.getRealTimeData(edgeId);
    if (!currentData) return null;

    // Simple prediction based on current conditions and time of day
    const predictedData = { ...currentData };
    
    // Adjust for time of day patterns
    const hour = new Date().getHours();
    const futureHour = (hour + Math.floor(timeAhead / 60)) % 24;
    
    // Rush hour predictions
    if ((futureHour >= 7 && futureHour <= 9) || (futureHour >= 17 && futureHour <= 19)) {
      if (predictedData.congestionLevel !== undefined) {
        predictedData.congestionLevel = Math.min(1, predictedData.congestionLevel + 0.3);
      }
    }
    // Off-peak predictions
    else if (futureHour >= 22 || futureHour <= 5) {
      if (predictedData.congestionLevel !== undefined) {
        predictedData.congestionLevel = Math.max(0, predictedData.congestionLevel - 0.3);
      }
    }
    
    return predictedData;
  }

  /**
   * Get real-time data statistics
   */
  getStatistics(): {
    totalEdges: number;
    edgesWithRealTimeData: number;
    dataFreshness: {
      average: number;
      min: number;
      max: number;
    };
    providerStatus: {
      [providerId: string]: {
        isActive: boolean;
        lastUpdate: Date | null;
        sourceCount: number;
      };
    };
  } {
    const now = Date.now();
    const edgesWithRealTimeData = new Set<string>();
    const freshnessValues: number[] = [];
    const providerStatus: { [providerId: string]: any } = {};

    // Calculate statistics
    for (const [edgeId, { timestamp }] of this.dataCache.entries()) {
      edgesWithRealTimeData.add(edgeId);
      freshnessValues.push(now - timestamp);
    }

    // Provider status
    for (const provider of this.config.providers) {
      providerStatus[provider.id] = {
        isActive: provider.sources.some(s => s.isActive),
        lastUpdate: null,
        sourceCount: provider.sources.length
      };
    }

    return {
      totalEdges: this.graph.getEdgeCount(),
      edgesWithRealTimeData: edgesWithRealTimeData.size,
      dataFreshness: {
        average: freshnessValues.length > 0 
          ? freshnessValues.reduce((sum, val) => sum + val, 0) / freshnessValues.length 
          : 0,
        min: freshnessValues.length > 0 ? Math.min(...freshnessValues) : 0,
        max: freshnessValues.length > 0 ? Math.max(...freshnessValues) : 0
      },
      providerStatus
    };
  }

  /**
   * Shutdown real-time data integration
   */
  async shutdown(): Promise<void> {
    // Clear update intervals
    for (const interval of this.updateIntervals.values()) {
      clearInterval(interval);
    }
    this.updateIntervals.clear();

    // Disconnect from all providers
    for (const provider of this.config.providers) {
      try {
        await provider.disconnect();
      } catch (error) {
        console.error(`Failed to disconnect from provider ${provider.name}:`, error);
      }
    }

    // Clear data cache
    this.dataCache.clear();
    this.subscribers.clear();
  }

  /**
   * Manually update real-time data for an edge
   */
  updateEdgeData(edgeId: string, data: Partial<RealTimeEdgeData>): void {
    // Note: This method is a placeholder since RealTimeEdgeData doesn't have edgeId
    // In a real implementation, you would need to track which edge each data item belongs to
    console.warn('updateEdgeData is not fully implemented due to interface limitations');
  }

  /**
   * Get real-time data for multiple edges
   */
  getRealTimeDataForEdges(edgeIds: string[]): RealTimeEdgeData[] {
    const result: RealTimeEdgeData[] = [];
    
    for (const edgeId of edgeIds) {
      const data = this.getRealTimeData(edgeId);
      if (data) {
        result.push(data);
      }
    }
    
    return result;
  }

  /**
   * Check if real-time data is available for a transport mode
   */
  isRealTimeDataAvailableForMode(mode: TransportMode): boolean {
    for (const provider of this.config.providers) {
      for (const source of provider.sources) {
        if (source.isActive && source.coverage.modes.includes(mode)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get real-time data sources for a transport mode
   */
  getDataSourcesForMode(mode: TransportMode): RealTimeDataSource[] {
    const sources: RealTimeDataSource[] = [];
    
    for (const provider of this.config.providers) {
      for (const source of provider.sources) {
        if (source.isActive && source.coverage.modes.includes(mode)) {
          sources.push(source);
        }
      }
    }
    
    return sources;
  }
}