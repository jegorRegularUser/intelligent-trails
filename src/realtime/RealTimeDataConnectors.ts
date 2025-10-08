/**
 * Real-time data source connectors for the multi-modal routing system
 * Implements connectors for various real-time data providers
 */

import {
  RealTimeDataSourceConfig,
  RealTimeDataProvider,
  DataSourceStatus,
  RealTimeDataSourceType,
  TrafficData,
  PublicTransportData,
  ConstructionData,
  EventData,
  WeatherData,
  DataQuality
} from '../types/realtime';
import { Coordinate, TransportMode } from '../types/graph';

/**
 * Base connector class for real-time data providers
 */
export abstract class BaseRealTimeConnector implements RealTimeDataProvider {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract sources: RealTimeDataSourceConfig[];
  public status: DataSourceStatus = DataSourceStatus.INACTIVE;
  public lastUpdate: Date | null = null;
  public errorCount = 0;
  public lastError?: string;
  protected subscribers: Set<(data: any) => void> = new Set();
  protected statistics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    responseTimes: [] as number[],
    lastUpdateTime: null as Date | null
  };

  /**
   * Connect to the data provider
   */
  abstract connect(): Promise<boolean>;

  /**
   * Disconnect from the data provider
   */
  abstract disconnect(): Promise<boolean>;

  /**
   * Fetch data from a specific source
   */
  abstract fetchData(sourceId: string): Promise<any>;

  /**
   * Subscribe to real-time updates
   */
  subscribeToUpdates(callback: (data: any) => void): void {
    this.subscribers.add(callback);
  }

  /**
   * Unsubscribe from real-time updates
   */
  unsubscribeFromUpdates(callback: (data: any) => void): void {
    this.subscribers.delete(callback);
  }

  /**
   * Get current status
   */
  getStatus(): DataSourceStatus {
    return this.status;
  }

  /**
   * Get provider statistics
   */
  getStatistics() {
    const avgResponseTime = this.statistics.responseTimes.length > 0
      ? this.statistics.responseTimes.reduce((sum, time) => sum + time, 0) / this.statistics.responseTimes.length
      : 0;

    return {
      totalRequests: this.statistics.totalRequests,
      successfulRequests: this.statistics.successfulRequests,
      failedRequests: this.statistics.failedRequests,
      averageResponseTime: avgResponseTime,
      lastUpdateTime: this.statistics.lastUpdateTime
    };
  }

  /**
   * Notify subscribers of new data
   */
  protected notifySubscribers(data: any): void {
    for (const callback of this.subscribers) {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in subscriber callback:', error);
      }
    }
  }

  /**
   * Update statistics after a request
   */
  protected updateStatistics(success: boolean, responseTime: number): void {
    this.statistics.totalRequests++;
    this.statistics.responseTimes.push(responseTime);
    
    // Keep only the last 100 response times
    if (this.statistics.responseTimes.length > 100) {
      this.statistics.responseTimes = this.statistics.responseTimes.slice(-100);
    }

    if (success) {
      this.statistics.successfulRequests++;
      this.statistics.lastUpdateTime = new Date();
    } else {
      this.statistics.failedRequests++;
    }
  }

  /**
   * Handle errors
   */
  protected handleError(error: Error, context: string): void {
    this.errorCount++;
    this.lastError = `${context}: ${error.message}`;
    console.error(`Error in ${this.name} - ${context}:`, error);
    
    // Update status based on error count
    if (this.errorCount > 10) {
      this.status = DataSourceStatus.ERROR;
    } else if (this.errorCount > 5) {
      this.status = DataSourceStatus.DEGRADED;
    }
  }

  /**
   * Reset error count on successful operation
   */
  protected resetErrors(): void {
    this.errorCount = 0;
    this.lastError = undefined;
    this.status = DataSourceStatus.ACTIVE;
  }
}

/**
 * HTTP-based connector for REST APIs
 */
export abstract class HttpRealTimeConnector extends BaseRealTimeConnector {
  protected headers: Record<string, string> = {};
  protected timeout: number = 30000; // 30 seconds default

  /**
   * Make HTTP request
   */
  protected async makeRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<any> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
          ...options.headers
        },
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const responseTime = Date.now() - startTime;
      
      this.updateStatistics(true, responseTime);
      this.resetErrors();
      
      return data;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateStatistics(false, responseTime);
      this.handleError(error as Error, 'HTTP request');
      throw error;
    }
  }

  /**
   * Set authentication headers
   */
  protected setAuthentication(config: RealTimeDataSourceConfig): void {
    if (!config.authentication) return;

    switch (config.authentication.type) {
      case 'api-key':
        this.headers['X-API-Key'] = config.authentication.credentials.apiKey;
        break;
      case 'oauth':
        this.headers['Authorization'] = `Bearer ${config.authentication.credentials.accessToken}`;
        break;
      case 'basic':
        const credentials = btoa(
          `${config.authentication.credentials.username}:${config.authentication.credentials.password}`
        );
        this.headers['Authorization'] = `Basic ${credentials}`;
        break;
    }
  }
}

/**
 * Traffic data connector
 */
export class TrafficDataConnector extends HttpRealTimeConnector {
  id = 'traffic-data-provider';
  name = 'Traffic Data Provider';
  description = 'Provides real-time traffic information';
  sources: RealTimeDataSourceConfig[] = [];

  async connect(): Promise<boolean> {
    try {
      // Test connection with each source
      for (const source of this.sources) {
        this.setAuthentication(source);
        await this.makeRequest(source.url);
      }
      
      this.status = DataSourceStatus.ACTIVE;
      this.lastUpdate = new Date();
      return true;
    } catch (error) {
      this.handleError(error as Error, 'connect');
      return false;
    }
  }

  async disconnect(): Promise<boolean> {
    this.status = DataSourceStatus.INACTIVE;
    this.subscribers.clear();
    return true;
  }

  async fetchData(sourceId: string): Promise<TrafficData[]> {
    const source = this.sources.find(s => s.id === sourceId);
    if (!source) {
      throw new Error(`Source ${sourceId} not found`);
    }

    try {
      const rawData = await this.makeRequest(source.url);
      return this.transformTrafficData(rawData, source);
    } catch (error) {
      this.handleError(error as Error, `fetchData for source ${sourceId}`);
      throw error;
    }
  }

  /**
   * Transform raw traffic data into standardized format
   */
  private transformTrafficData(rawData: any, source: RealTimeDataSourceConfig): TrafficData[] {
    // This is a simplified transformation - in a real implementation,
    // this would be adapted to the specific API response format
    const trafficData: TrafficData[] = [];

    if (!rawData.items || !Array.isArray(rawData.items)) {
      return trafficData;
    }

    for (const item of rawData.items) {
      const traffic: TrafficData = {
        id: item.id || `${source.id}-${Date.now()}`,
        segmentId: item.segmentId || item.roadId,
        condition: this.mapTrafficCondition(item.condition || item.flow),
        currentSpeed: item.currentSpeed || item.speed,
        averageSpeed: item.averageSpeed || item.freeFlowSpeed,
        congestionLevel: this.calculateCongestionLevel(
          item.currentSpeed || item.speed,
          item.averageSpeed || item.freeFlowSpeed
        ),
        delay: item.delay || 0,
        travelTime: item.travelTime || 0,
        reliability: item.reliability || 0.8,
        lastUpdated: new Date(item.timestamp || Date.now()),
        quality: this.mapDataQuality(item.confidence || 'medium'),
        source: source.id,
        coordinates: {
          start: {
            latitude: item.startLat || item.from?.lat,
            longitude: item.startLon || item.from?.lon
          },
          end: {
            latitude: item.endLat || item.to?.lat,
            longitude: item.endLon || item.to?.lon
          }
        }
      };

      trafficData.push(traffic);
    }

    return trafficData;
  }

  /**
   * Map traffic condition from API response
   */
  private mapTrafficCondition(condition: string): any {
    const conditionMap: Record<string, any> = {
      'free': 'free_flow',
      'light': 'light',
      'moderate': 'moderate',
      'heavy': 'heavy',
      'severe': 'severe',
      'standstill': 'standstill'
    };

    return conditionMap[condition.toLowerCase()] || 'moderate';
  }

  /**
   * Calculate congestion level
   */
  private calculateCongestionLevel(currentSpeed: number, averageSpeed: number): number {
    if (!averageSpeed || averageSpeed === 0) return 0;
    const ratio = currentSpeed / averageSpeed;
    return Math.max(0, Math.min(1, 1 - ratio));
  }

  /**
   * Map data quality from API response
   */
  private mapDataQuality(confidence: string): DataQuality {
    const qualityMap: Record<string, DataQuality> = {
      'high': DataQuality.HIGH_CONFIDENCE,
      'medium': DataQuality.MODERATE_CONFIDENCE,
      'low': DataQuality.LOW_CONFIDENCE,
      'verified': DataQuality.VERIFIED
    };

    return qualityMap[confidence.toLowerCase()] || DataQuality.MODERATE_CONFIDENCE;
  }
}

/**
 * Public transport data connector
 */
export class PublicTransportConnector extends HttpRealTimeConnector {
  id = 'public-transport-provider';
  name = 'Public Transport Provider';
  description = 'Provides real-time public transport information';
  sources: RealTimeDataSourceConfig[] = [];

  async connect(): Promise<boolean> {
    try {
      for (const source of this.sources) {
        this.setAuthentication(source);
        await this.makeRequest(source.url);
      }
      
      this.status = DataSourceStatus.ACTIVE;
      this.lastUpdate = new Date();
      return true;
    } catch (error) {
      this.handleError(error as Error, 'connect');
      return false;
    }
  }

  async disconnect(): Promise<boolean> {
    this.status = DataSourceStatus.INACTIVE;
    this.subscribers.clear();
    return true;
  }

  async fetchData(sourceId: string): Promise<PublicTransportData[]> {
    const source = this.sources.find(s => s.id === sourceId);
    if (!source) {
      throw new Error(`Source ${sourceId} not found`);
    }

    try {
      const rawData = await this.makeRequest(source.url);
      return this.transformPublicTransportData(rawData, source);
    } catch (error) {
      this.handleError(error as Error, `fetchData for source ${sourceId}`);
      throw error;
    }
  }

  /**
   * Transform raw public transport data into standardized format
   */
  private transformPublicTransportData(rawData: any, source: RealTimeDataSourceConfig): PublicTransportData[] {
    const transportData: PublicTransportData[] = [];

    if (!rawData.items && !rawData.entity) {
      return transportData;
    }

    // Handle GTFS-RT format
    const items = rawData.items || (rawData.entity ? rawData.entity.map((e: any) => e.vehicle || e.tripUpdate) : []);

    for (const item of items) {
      const transport: PublicTransportData = {
        id: item.id || `${source.id}-${Date.now()}`,
        routeId: item.routeId || item.trip?.routeId,
        tripId: item.tripId || item.trip?.tripId,
        vehicleId: item.vehicle?.id || item.vehicleId,
        status: this.mapTransportStatus(item.status || item.tripUpdate?.stopTimeUpdate?.[0]?.arrival?.delay),
        delay: item.delay || item.tripUpdate?.stopTimeUpdate?.[0]?.arrival?.delay || 0,
        scheduledDeparture: new Date(item.scheduledDeparture || item.tripUpdate?.stopTimeUpdate?.[0]?.arrival?.time),
        estimatedDeparture: item.estimatedDeparture ? new Date(item.estimatedDeparture) : undefined,
        scheduledArrival: new Date(item.scheduledArrival || item.tripUpdate?.stopTimeUpdate?.[0]?.arrival?.time),
        estimatedArrival: item.estimatedArrival ? new Date(item.estimatedArrival) : undefined,
        currentPosition: item.position ? {
          latitude: item.position.latitude,
          longitude: item.position.longitude
        } : undefined,
        nextStopId: item.nextStopId || item.tripUpdate?.stopTimeUpdate?.[0]?.stopId,
        occupancy: item.occupancy ? {
          level: this.mapOccupancyLevel(item.occupancy.level || item.occupancy.percentage),
          percentage: item.occupancy.percentage
        } : undefined,
        reliability: item.reliability || 0.8,
        lastUpdated: new Date(item.timestamp || Date.now()),
        quality: this.mapDataQuality(item.confidence || 'medium'),
        source: source.id,
        mode: this.mapTransportMode(item.mode || item.routeType)
      };

      transportData.push(transport);
    }

    return transportData;
  }

  /**
   * Map data quality from API response
   */
  private mapDataQuality(confidence: string): DataQuality {
    const qualityMap: Record<string, DataQuality> = {
      'high': DataQuality.HIGH_CONFIDENCE,
      'medium': DataQuality.MODERATE_CONFIDENCE,
      'low': DataQuality.LOW_CONFIDENCE,
      'verified': DataQuality.VERIFIED
    };

    return qualityMap[confidence.toLowerCase()] || DataQuality.MODERATE_CONFIDENCE;
  }

  /**
   * Map transport status from API response
   */
  private mapTransportStatus(status: string | number): any {
    if (typeof status === 'number') {
      if (status === 0) return 'on_time';
      if (status > 0) return 'delayed';
      if (status < 0) return 'early';
    }

    const statusMap: Record<string, any> = {
      'on_time': 'on_time',
      'delayed': 'delayed',
      'early': 'early',
      'cancelled': 'cancelled',
      'diverted': 'diverted',
      'scheduled': 'scheduled'
    };

    return statusMap[typeof status === 'string' ? status.toLowerCase() : 'scheduled'] || 'scheduled';
  }

  /**
   * Map occupancy level
   */
  private mapOccupancyLevel(level: string | number): 'low' | 'medium' | 'high' | 'full' {
    if (typeof level === 'number') {
      if (level < 0.3) return 'low';
      if (level < 0.7) return 'medium';
      if (level < 0.95) return 'high';
      return 'full';
    }

    const levelMap: Record<string, 'low' | 'medium' | 'high' | 'full'> = {
      'low': 'low',
      'medium': 'medium',
      'high': 'high',
      'full': 'full',
      'empty': 'low',
      'many_seats': 'low',
      'few_seats': 'medium',
      'standing_room_only': 'high',
      'crushed_standing_room_only': 'full'
    };

    return levelMap[level?.toLowerCase()] || 'medium';
  }

  /**
   * Map transport mode
   */
  private mapTransportMode(mode: string | number): TransportMode {
    if (typeof mode === 'number') {
      // GTFS route type mapping
      const modeMap: Record<number, TransportMode> = {
        0: TransportMode.TRAM,
        1: TransportMode.METRO,
        2: TransportMode.TRAIN,
        3: TransportMode.BUS,
        4: TransportMode.FERRY,
        5: TransportMode.CAR,
        6: TransportMode.CAR,
        7: TransportMode.BICYCLE,
        11: TransportMode.BICYCLE,
        12: TransportMode.BUS
      };

      return modeMap[mode] || TransportMode.BUS;
    }

    const modeMap: Record<string, TransportMode> = {
      'bus': TransportMode.BUS,
      'metro': TransportMode.METRO,
      'subway': TransportMode.METRO,
      'tram': TransportMode.TRAM,
      'train': TransportMode.TRAIN,
      'ferry': TransportMode.FERRY,
      'walk': TransportMode.WALKING,
      'bike': TransportMode.BICYCLE,
      'car': TransportMode.CAR
    };

    return modeMap[mode?.toLowerCase()] || TransportMode.BUS;
  }
}

/**
 * Weather data connector
 */
export class WeatherDataConnector extends HttpRealTimeConnector {
  id = 'weather-data-provider';
  name = 'Weather Data Provider';
  description = 'Provides real-time weather information';
  sources: RealTimeDataSourceConfig[] = [];

  async connect(): Promise<boolean> {
    try {
      for (const source of this.sources) {
        this.setAuthentication(source);
        await this.makeRequest(source.url);
      }
      
      this.status = DataSourceStatus.ACTIVE;
      this.lastUpdate = new Date();
      return true;
    } catch (error) {
      this.handleError(error as Error, 'connect');
      return false;
    }
  }

  async disconnect(): Promise<boolean> {
    this.status = DataSourceStatus.INACTIVE;
    this.subscribers.clear();
    return true;
  }

  async fetchData(sourceId: string): Promise<WeatherData[]> {
    const source = this.sources.find(s => s.id === sourceId);
    if (!source) {
      throw new Error(`Source ${sourceId} not found`);
    }

    try {
      const rawData = await this.makeRequest(source.url);
      return this.transformWeatherData(rawData, source);
    } catch (error) {
      this.handleError(error as Error, `fetchData for source ${sourceId}`);
      throw error;
    }
  }

  /**
   * Transform raw weather data into standardized format
   */
  private transformWeatherData(rawData: any, source: RealTimeDataSourceConfig): WeatherData[] {
    const weatherData: WeatherData[] = [];

    if (!rawData.items && !rawData.data) {
      return weatherData;
    }

    const items = rawData.items || [rawData.data];

    for (const item of items) {
      const weather: WeatherData = {
        id: item.id || `${source.id}-${Date.now()}`,
        location: {
          latitude: item.lat || item.location?.lat,
          longitude: item.lon || item.location?.lon
        },
        condition: this.mapWeatherCondition(item.condition || item.weather?.[0]?.main),
        temperature: item.temp || item.main?.temp,
        windSpeed: item.wind_speed || item.wind?.speed,
        windDirection: item.wind_deg || item.wind?.deg,
        visibility: item.visibility || 10000,
        precipitation: item.precipitation || item.rain?.['1h'] || 0,
        humidity: item.humidity || item.main?.humidity,
        pressure: item.pressure || item.main?.pressure,
        impact: this.calculateWeatherImpact(item),
        lastUpdated: new Date(item.timestamp || Date.now()),
        quality: this.mapDataQuality(item.confidence || 'medium'),
        source: source.id,
        forecast: item.forecast ? this.transformForecastData(item.forecast) : undefined
      };

      weatherData.push(weather);
    }

    return weatherData;
  }

  /**
   * Map data quality from API response
   */
  private mapDataQuality(confidence: string): DataQuality {
    const qualityMap: Record<string, DataQuality> = {
      'high': DataQuality.HIGH_CONFIDENCE,
      'medium': DataQuality.MODERATE_CONFIDENCE,
      'low': DataQuality.LOW_CONFIDENCE,
      'verified': DataQuality.VERIFIED
    };

    return qualityMap[confidence.toLowerCase()] || DataQuality.MODERATE_CONFIDENCE;
  }

  /**
   * Map weather condition from API response
   */
  private mapWeatherCondition(condition: string): any {
    const conditionMap: Record<string, any> = {
      'clear': 'clear',
      'clouds': 'clear',
      'rain': 'rain',
      'drizzle': 'rain',
      'snow': 'snow',
      'mist': 'fog',
      'fog': 'fog',
      'thunderstorm': 'storm',
      'wind': 'wind',
      'ice': 'ice'
    };

    return conditionMap[condition?.toLowerCase()] || 'clear';
  }

  /**
   * Calculate weather impact on routing
   */
  private calculateWeatherImpact(item: any): any {
    // Simple impact calculation based on weather conditions
    const condition = item.condition || item.weather?.[0]?.main;
    const visibility = item.visibility || 10000;
    const windSpeed = item.wind_speed || item.wind?.speed;
    const precipitation = item.precipitation || item.rain?.['1h'] || 0;

    let impact = 0; // minimal impact

    if (condition === 'storm' || condition === 'thunderstorm') {
      impact = 0.8; // high impact
    } else if (condition === 'snow' || condition === 'ice') {
      impact = 0.6; // significant impact
    } else if (condition === 'rain' && precipitation > 10) {
      impact = 0.4; // moderate impact
    } else if (condition === 'fog' && visibility < 1000) {
      impact = 0.5; // moderate to high impact
    } else if (windSpeed > 50) {
      impact = 0.3; // low to moderate impact
    }

    return impact;
  }

  /**
   * Transform forecast data
   */
  private transformForecastData(forecast: any): any {
    if (!forecast || !forecast.list) return undefined;

    return {
      hourly: forecast.list.map((item: any) => ({
        time: new Date(item.dt * 1000),
        condition: this.mapWeatherCondition(item.weather?.[0]?.main),
        temperature: item.main.temp,
        precipitation: item.rain?.['1h'] || 0,
        windSpeed: item.wind.speed
      }))
    };
  }
}

/**
 * Factory for creating real-time data connectors
 */
export class RealTimeConnectorFactory {
  /**
   * Create a connector based on data source type
   */
  static createConnector(type: RealTimeDataSourceType): BaseRealTimeConnector {
    switch (type) {
      case RealTimeDataSourceType.TRAFFIC:
        return new TrafficDataConnector();
      case RealTimeDataSourceType.PUBLIC_TRANSPORT:
        return new PublicTransportConnector();
      case RealTimeDataSourceType.WEATHER:
        return new WeatherDataConnector();
      default:
        throw new Error(`Unsupported data source type: ${type}`);
    }
  }

  /**
   * Create multiple connectors for different data source types
   */
  static createConnectors(types: RealTimeDataSourceType[]): BaseRealTimeConnector[] {
    return types.map(type => this.createConnector(type));
  }
}