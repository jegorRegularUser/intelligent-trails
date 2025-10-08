/**
 * POI Integration Service
 * Integrates all POI components with the existing routing system
 */

import {
  PointOfInterest,
  POICategory,
  POISearchRequest,
  POISearchResult,
  POIRoutingRequest,
  POIRoutingResult,
  POIRecommendationRequest,
  POIRecommendationResult,
  POIRouteCustomization,
  POIRouteVisualization
} from '../types/poi';
import { Coordinate, TransportMode, AccessibilityInfo } from '../types/graph';
import { MultiModalRoute, RouteConstraints, UserPreferences } from '../types/routing';
import { POIService } from './POIService';
import { POIRoutingPlanner } from './POIRoutingPlanner';
import { MultiModalPOIRouting } from './MultiModalPOIRouting';
import { POIRouteCustomizer } from './POIRouteCustomizer';
import { POIRouteVisualizer } from './POIRouteVisualizer';
import { MultiModalGraphImpl } from '../graph/MultiModalGraph';

/**
 * Integration configuration options
 */
interface POIIntegrationConfig {
  enablePOISearch: boolean;
  enablePOIRouting: boolean;
  enableRouteCustomization: boolean;
  enableRouteVisualization: boolean;
  defaultSearchRadius: number; // in meters
  maxSearchResults: number;
  maxRoutePOIs: number;
  enableRealTimeUpdates: boolean;
  cacheEnabled: boolean;
  cacheExpiration: number; // in seconds
}

/**
 * POI data source configuration
 */
interface POIDataSource {
  id: string;
  name: string;
  type: 'api' | 'file' | 'database';
  url?: string;
  apiKey?: string;
  updateFrequency?: number; // in seconds
  isActive: boolean;
  supportedCategories: POICategory[];
}

/**
 * POI integration event types
 */
enum POIIntegrationEventType {
  POI_ADDED = 'poi_added',
  POI_UPDATED = 'poi_updated',
  POI_REMOVED = 'poi_removed',
  ROUTE_PLANNED = 'route_planned',
  ROUTE_CUSTOMIZED = 'route_customized',
  SEARCH_PERFORMED = 'search_performed',
  VISUALIZATION_GENERATED = 'visualization_generated'
}

/**
 * POI integration event
 */
interface POIIntegrationEvent {
  type: POIIntegrationEventType;
  timestamp: Date;
  data: any;
  userId?: string;
}

/**
 * Event handler function type
 */
type POIIntegrationEventHandler = (event: POIIntegrationEvent) => void;

/**
 * Integration statistics
 */
interface POIIntegrationStatistics {
  totalPOIs: number;
  totalSearches: number;
  totalRoutesPlanned: number;
  totalCustomizations: number;
  totalVisualizations: number;
  averageSearchTime: number; // in milliseconds
  averageRoutePlanningTime: number; // in milliseconds
  cacheHitRate: number; // 0-1
  lastUpdated: Date;
}

/**
 * POI Integration Service implementation
 */
export class POIIntegrationService {
  private poiService: POIService;
  private routingPlanner: POIRoutingPlanner;
  private multiModalRouting: MultiModalPOIRouting;
  private routeCustomizer: POIRouteCustomizer;
  private routeVisualizer: POIRouteVisualizer;
  private config: POIIntegrationConfig;
  private dataSources: Map<string, POIDataSource> = new Map();
  private eventHandlers: Map<POIIntegrationEventType, POIIntegrationEventHandler[]> = new Map();
  private statistics: POIIntegrationStatistics;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();

  constructor(
    graph: MultiModalGraphImpl,
    config?: Partial<POIIntegrationConfig>
  ) {
    // Initialize services
    this.poiService = new POIService();
    this.routingPlanner = new POIRoutingPlanner(this.poiService);
    
    // Create default preferences and constraints
    const defaultPreferences: UserPreferences = {
      speed: 3,
      safety: 3,
      accessibility: 3,
      cost: 3,
      comfort: 3,
      environmental: 3,
      scenic: false,
      minimizeTransfers: false,
      avoidWalking: false,
      avoidCycling: false,
      avoidStairs: false,
      requireWheelchairAccessibility: false,
      preferredModes: [
        TransportMode.WALKING,
        TransportMode.BICYCLE,
        TransportMode.BUS,
        TransportMode.METRO,
        TransportMode.TRAM
      ],
      avoidedModes: []
    };

    const defaultConstraints: RouteConstraints = {
      maxDistance: 20000,
      maxDuration: 7200,
      maxTransfers: 3,
      maxWalkingDistance: 1000,
      maxCyclingDistance: 5000,
      maxCost: 50,
      avoidTolls: false,
      avoidHighways: false,
      avoidFerries: false,
      avoidUnpavedRoads: false,
      requireBikeLane: false,
      requireSidewalk: false
    };

    this.multiModalRouting = new MultiModalPOIRouting(
      graph,
      this.poiService,
      defaultPreferences,
      defaultConstraints
    );
    
    this.routeCustomizer = new POIRouteCustomizer(
      this.poiService,
      this.routingPlanner,
      this.multiModalRouting
    );
    
    this.routeVisualizer = new POIRouteVisualizer(this.poiService);
    
    // Set default configuration
    this.config = {
      enablePOISearch: true,
      enablePOIRouting: true,
      enableRouteCustomization: true,
      enableRouteVisualization: true,
      defaultSearchRadius: 5000, // 5km
      maxSearchResults: 50,
      maxRoutePOIs: 10,
      enableRealTimeUpdates: false,
      cacheEnabled: true,
      cacheExpiration: 3600, // 1 hour
      ...config
    };
    
    // Initialize statistics
    this.statistics = {
      totalPOIs: 0,
      totalSearches: 0,
      totalRoutesPlanned: 0,
      totalCustomizations: 0,
      totalVisualizations: 0,
      averageSearchTime: 0,
      averageRoutePlanningTime: 0,
      cacheHitRate: 0,
      lastUpdated: new Date()
    };
    
    // Initialize event handlers
    this.initializeEventHandlers();
  }

  /**
   * Initialize event handlers
   */
  private initializeEventHandlers(): void {
    for (const eventType of Object.values(POIIntegrationEventType)) {
      this.eventHandlers.set(eventType, []);
    }
  }

  /**
   * Add a POI data source
   */
  addDataSource(dataSource: POIDataSource): void {
    this.dataSources.set(dataSource.id, dataSource);
    this.emitEvent({
      type: POIIntegrationEventType.POI_ADDED,
      timestamp: new Date(),
      data: { dataSource }
    });
  }

  /**
   * Remove a POI data source
   */
  removeDataSource(dataSourceId: string): boolean {
    const removed = this.dataSources.delete(dataSourceId);
    if (removed) {
      this.emitEvent({
        type: POIIntegrationEventType.POI_REMOVED,
        timestamp: new Date(),
        data: { dataSourceId }
      });
    }
    return removed;
  }

  /**
   * Get all data sources
   */
  getDataSources(): POIDataSource[] {
    return Array.from(this.dataSources.values());
  }

  /**
   * Search for POIs
   */
  async searchPOIs(request: POISearchRequest): Promise<POISearchResult> {
    if (!this.config.enablePOISearch) {
      throw new Error('POI search is disabled');
    }

    const startTime = performance.now();
    
    // Check cache first
    const cacheKey = `search-${JSON.stringify(request)}`;
    const cachedResult = this.getFromCache<POISearchResult>(cacheKey);
    if (cachedResult) {
      this.statistics.cacheHitRate = 
        (this.statistics.cacheHitRate * this.statistics.totalSearches + 1) / 
        (this.statistics.totalSearches + 1);
      
      this.statistics.totalSearches++;
      this.statistics.averageSearchTime = 
        (this.statistics.averageSearchTime * (this.statistics.totalSearches - 1) + 0) / 
        this.statistics.totalSearches;
      
      this.emitEvent({
        type: POIIntegrationEventType.SEARCH_PERFORMED,
        timestamp: new Date(),
        data: { request, cached: true }
      });
      
      return cachedResult;
    }

    // Perform search
    const result = this.poiService.searchPOIs(request);
    
    const endTime = performance.now();
    const searchTime = endTime - startTime;
    
    // Update statistics
    this.statistics.totalSearches++;
    this.statistics.averageSearchTime = 
      (this.statistics.averageSearchTime * (this.statistics.totalSearches - 1) + searchTime) / 
      this.statistics.totalSearches;
    this.statistics.cacheHitRate = 
      (this.statistics.cacheHitRate * (this.statistics.totalSearches - 1)) / 
      this.statistics.totalSearches;
    
    // Cache result
    this.setToCache(cacheKey, result);
    
    this.emitEvent({
      type: POIIntegrationEventType.SEARCH_PERFORMED,
      timestamp: new Date(),
      data: { request, cached: false, searchTime }
    });
    
    return result;
  }

  /**
   * Recommend POIs for a user
   */
  async recommendPOIs(request: POIRecommendationRequest): Promise<POIRecommendationResult> {
    if (!this.config.enablePOISearch) {
      throw new Error('POI search is disabled');
    }

    // Check cache first
    const cacheKey = `recommend-${JSON.stringify(request)}`;
    const cachedResult = this.getFromCache<POIRecommendationResult>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // Perform recommendation
    const result = this.poiService.recommendPOIs(request);
    
    // Cache result
    this.setToCache(cacheKey, result);
    
    return result;
  }

  /**
   * Plan a route with POIs
   */
  async planRouteWithPOIs(request: POIRoutingRequest): Promise<POIRoutingResult> {
    if (!this.config.enablePOIRouting) {
      throw new Error('POI routing is disabled');
    }

    // Validate request
    if (request.pois.length > this.config.maxRoutePOIs) {
      throw new Error(`Maximum ${this.config.maxRoutePOIs} POIs allowed in a route`);
    }

    const startTime = performance.now();
    
    // Plan route
    const result = await this.multiModalRouting.planMultiModalRouteWithPOIs(request);
    
    const endTime = performance.now();
    const planningTime = endTime - startTime;
    
    // Update statistics
    this.statistics.totalRoutesPlanned++;
    this.statistics.averageRoutePlanningTime = 
      (this.statistics.averageRoutePlanningTime * (this.statistics.totalRoutesPlanned - 1) + planningTime) / 
      this.statistics.totalRoutesPlanned;
    
    this.emitEvent({
      type: POIIntegrationEventType.ROUTE_PLANNED,
      timestamp: new Date(),
      data: { request, planningTime }
    });
    
    return result;
  }

  /**
   * Customize a route
   */
  async customizeRoute(
    route: POIRoutingResult['route'],
    customizations: POIRouteCustomization | POIRouteCustomization[]
  ): Promise<POIRoutingResult['route']> {
    if (!this.config.enableRouteCustomization) {
      throw new Error('Route customization is disabled');
    }

    // Normalize customizations to array
    const customizationArray = Array.isArray(customizations) ? customizations : [customizations];
    
    // Apply customizations
    const result = await this.routeCustomizer.customizeRouteBatch(route, {
      routeId: route.id,
      customizations: customizationArray
    });
    
    if (!result.success) {
      throw new Error(`Failed to customize route: ${result.error}`);
    }
    
    if (!result.route) {
      throw new Error('Customization succeeded but no route was returned');
    }
    
    // Update statistics
    this.statistics.totalCustomizations++;
    
    this.emitEvent({
      type: POIIntegrationEventType.ROUTE_CUSTOMIZED,
      timestamp: new Date(),
      data: { routeId: route.id, customizations: customizationArray }
    });
    
    return result.route;
  }

  /**
   * Generate visualization for a route
   */
  generateRouteVisualization(
    route: POIRoutingResult['route'],
    options?: any
  ): POIRouteVisualization {
    if (!this.config.enableRouteVisualization) {
      throw new Error('Route visualization is disabled');
    }

    // Generate visualization
    const visualization = this.routeVisualizer.generateVisualizationData(route, options);
    
    // Update statistics
    this.statistics.totalVisualizations++;
    
    this.emitEvent({
      type: POIIntegrationEventType.VISUALIZATION_GENERATED,
      timestamp: new Date(),
      data: { routeId: route.id, options }
    });
    
    return visualization;
  }

  /**
   * Get suggested customizations for a route
   */
  async getSuggestedCustomizations(
    route: POIRoutingResult['route'],
    options?: {
      maxSuggestions?: number;
      considerOperatingHours?: boolean;
      considerUserPreferences?: boolean;
      userId?: string;
    }
  ): Promise<POIRouteCustomization[]> {
    if (!this.config.enableRouteCustomization) {
      throw new Error('Route customization is disabled');
    }

    return this.routeCustomizer.getSuggestedCustomizations(route, options);
  }

  /**
   * Preview a customization without applying it
   */
  async previewCustomization(
    route: POIRoutingResult['route'],
    customization: POIRouteCustomization,
    options?: {
      allowDetour?: boolean;
      maxDetourDistance?: number;
      maxDetourTime?: number;
      maxDetourCost?: number;
      preserveRequiredPOIs?: boolean;
      autoAdjustTiming?: boolean;
      considerOperatingHours?: boolean;
      optimizeAfterCustomization?: boolean;
    }
  ): Promise<POIRoutingResult['route']> {
    if (!this.config.enableRouteCustomization) {
      throw new Error('Route customization is disabled');
    }

    const result = await this.routeCustomizer.previewCustomization(route, customization, options);
    
    if (!result.success) {
      throw new Error(`Failed to preview customization: ${result.error}`);
    }
    
    if (!result.route) {
      throw new Error('Preview succeeded but no route was returned');
    }
    
    return result.route;
  }

  /**
   * Add an event handler
   */
  addEventHandler(
    eventType: POIIntegrationEventType,
    handler: POIIntegrationEventHandler
  ): void {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventType, handlers);
  }

  /**
   * Remove an event handler
   */
  removeEventHandler(
    eventType: POIIntegrationEventType,
    handler: POIIntegrationEventHandler
  ): void {
    const handlers = this.eventHandlers.get(eventType) || [];
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
      this.eventHandlers.set(eventType, handlers);
    }
  }

  /**
   * Emit an event
   */
  private emitEvent(event: POIIntegrationEvent): void {
    const handlers = this.eventHandlers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error(`Error in event handler for ${event.type}:`, error);
      }
    }
  }

  /**
   * Get value from cache
   */
  private getFromCache<T>(key: string): T | undefined {
    if (!this.config.cacheEnabled) {
      return undefined;
    }

    const cached = this.cache.get(key);
    if (!cached) {
      return undefined;
    }

    // Check if cache entry has expired
    if (Date.now() - cached.timestamp > this.config.cacheExpiration * 1000) {
      this.cache.delete(key);
      return undefined;
    }

    return cached.data as T;
  }

  /**
   * Set value in cache
   */
  private setToCache<T>(key: string, data: T): void {
    if (!this.config.cacheEnabled) {
      return;
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get integration statistics
   */
  getStatistics(): POIIntegrationStatistics {
    return { ...this.statistics };
  }

  /**
   * Get configuration
   */
  getConfiguration(): POIIntegrationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfiguration(config: Partial<POIIntegrationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Initialize with sample POI data
   */
  initializeWithSampleData(): void {
    // Create sample POIs
    const samplePOIs = this.createSamplePOIs();
    
    // Add POIs to service
    for (const poi of samplePOIs) {
      this.poiService.addPOI(poi);
    }
    
    // Update statistics
    this.statistics.totalPOIs = samplePOIs.length;
    this.statistics.lastUpdated = new Date();
    
    // Emit event
    this.emitEvent({
      type: POIIntegrationEventType.POI_ADDED,
      timestamp: new Date(),
      data: { count: samplePOIs.length }
    });
  }

  /**
   * Create sample POIs for testing
   */
  private createSamplePOIs(): PointOfInterest[] {
    // Create sample POIs around a central point
    const center: Coordinate = { latitude: 52.5200, longitude: 13.4050 }; // Berlin
    
    return [
      {
        id: 'poi-1',
        name: 'Brandenburg Gate',
        category: POICategory.MONUMENT,
        coordinate: { latitude: 52.5163, longitude: 13.3777 },
        address: 'Pariser Platz, 10117 Berlin',
        rating: {
          average: 4.7,
          count: 12543,
          distribution: { 1: 12, 2: 34, 3: 123, 4: 2341, 5: 10033 }
        },
        accessibility: {
          wheelchairAccessible: true,
          visuallyImpairedFriendly: true,
          hasElevator: false,
          hasRamp: true,
          audioSignals: false,
          tactilePaving: true,
          hasParking: true
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          verified: true,
          popularity: 0.95,
          tags: ['landmark', 'historical', 'tourist'],
          description: 'The Brandenburg Gate is an 18th-century neoclassical monument in Berlin.'
        },
        visitPriority: {
          priority: 9,
          flexibility: 0.2,
          mustVisit: true,
          reason: 'Iconic landmark of Berlin'
        }
      },
      {
        id: 'poi-2',
        name: 'Berlin TV Tower',
        category: POICategory.LANDMARK,
        coordinate: { latitude: 52.5208, longitude: 13.4094 },
        address: 'Panoramastraße 1A, 10178 Berlin',
        rating: {
          average: 4.5,
          count: 8765,
          distribution: { 1: 23, 2: 45, 3: 234, 4: 3456, 5: 5007 }
        },
        accessibility: {
          wheelchairAccessible: true,
          visuallyImpairedFriendly: true,
          hasElevator: true,
          hasRamp: true,
          audioSignals: true,
          tactilePaving: true,
          hasParking: true
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          verified: true,
          popularity: 0.9,
          tags: ['landmark', 'tower', 'viewpoint', 'tourist'],
          description: 'The Berlin TV Tower is a television tower in central Berlin.'
        },
        visitPriority: {
          priority: 8,
          flexibility: 0.3,
          mustVisit: true,
          reason: 'Excellent views of the city'
        }
      },
      {
        id: 'poi-3',
        name: 'Museum Island',
        category: POICategory.MUSEUM,
        coordinate: { latitude: 52.5174, longitude: 13.3982 },
        address: 'Bodestraße 1-3, 10178 Berlin',
        rating: {
          average: 4.6,
          count: 9876,
          distribution: { 1: 15, 2: 32, 3: 198, 4: 3987, 5: 5644 }
        },
        accessibility: {
          wheelchairAccessible: true,
          visuallyImpairedFriendly: true,
          hasElevator: true,
          hasRamp: true,
          audioSignals: true,
          tactilePaving: true,
          hasParking: true
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          verified: true,
          popularity: 0.92,
          tags: ['museum', 'culture', 'UNESCO', 'tourist'],
          description: 'Museum Island is the name of the northern half of an island in the Spree river.'
        },
        visitPriority: {
          priority: 8,
          flexibility: 0.4,
          mustVisit: true,
          reason: 'UNESCO World Heritage site'
        }
      },
      {
        id: 'poi-4',
        name: 'Tiergarten Park',
        category: POICategory.PARK,
        coordinate: { latitude: 52.5143, longitude: 13.3501 },
        address: 'Tiergarten, 10557 Berlin',
        rating: {
          average: 4.4,
          count: 6543,
          distribution: { 1: 21, 2: 43, 3: 321, 4: 2876, 5: 3282 }
        },
        accessibility: {
          wheelchairAccessible: true,
          visuallyImpairedFriendly: true,
          hasElevator: false,
          hasRamp: true,
          audioSignals: false,
          tactilePaving: true,
          hasParking: true
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          verified: true,
          popularity: 0.85,
          tags: ['park', 'nature', 'recreation', 'tourist'],
          description: 'Tiergarten is Berlin most popular inner-city park.'
        },
        visitPriority: {
          priority: 6,
          flexibility: 0.6,
          mustVisit: false,
          reason: 'Large park for relaxation'
        }
      },
      {
        id: 'poi-5',
        name: 'Checkpoint Charlie',
        category: POICategory.MONUMENT,
        coordinate: { latitude: 52.5075, longitude: 13.3903 },
        address: 'Friedrichstraße 43-45, 10969 Berlin',
        rating: {
          average: 4.2,
          count: 7654,
          distribution: { 1: 34, 2: 76, 3: 456, 4: 3456, 5: 3632 }
        },
        accessibility: {
          wheelchairAccessible: true,
          visuallyImpairedFriendly: true,
          hasElevator: false,
          hasRamp: true,
          audioSignals: false,
          tactilePaving: true,
          hasParking: false
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          verified: true,
          popularity: 0.88,
          tags: ['landmark', 'historical', 'cold-war', 'tourist'],
          description: 'Checkpoint Charlie was the name given by the Western Allies to the best-known Berlin Wall crossing point.'
        },
        visitPriority: {
          priority: 7,
          flexibility: 0.5,
          mustVisit: false,
          reason: 'Historical significance'
        }
      }
    ];
  }

  /**
   * Update user preferences
   */
  updateUserPreferences(preferences: UserPreferences, constraints?: RouteConstraints): void {
    this.multiModalRouting.updateUserPreferences(preferences, constraints || {
      maxDistance: 20000,
      maxDuration: 7200,
      maxTransfers: 3,
      maxWalkingDistance: 1000,
      maxCyclingDistance: 5000,
      maxCost: 50,
      avoidTolls: false,
      avoidHighways: false,
      avoidFerries: false,
      avoidUnpavedRoads: false,
      requireBikeLane: false,
      requireSidewalk: false
    });
  }

  /**
   * Set visualization theme
   */
  setVisualizationTheme(themeName: string): void {
    this.routeVisualizer.setTheme(themeName);
  }

  /**
   * Get available visualization themes
   */
  getAvailableVisualizationThemes(): string[] {
    return this.routeVisualizer.getAvailableThemes();
  }

  /**
   * Add custom visualization theme
   */
  addCustomVisualizationTheme(theme: any): void {
    this.routeVisualizer.addCustomTheme(theme);
  }
}