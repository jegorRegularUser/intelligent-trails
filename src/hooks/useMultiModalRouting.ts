/**
 * Comprehensive multi-modal routing hook
 * Integrates all routing algorithms, visualization, and real-time data
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  MultiModalRoute,
  RouteSegment,
  UserPreferences,
  RouteConstraints,
  RouteComparison,
  RealTimeConditions
} from '../types/routing';
import {
  Coordinate,
  TransportMode,
  GraphConstraints
} from '../types/graph';
import {
  RouteVisualization,
  RouteVisualizationOptions,
  VisualizationTheme,
  VisualizationEvent,
  VisualizationEventType
} from '../types/visualization';

// Import core systems
import { MultiModalGraphImpl } from '../graph/MultiModalGraph';
import { MultiCriteriaOptimizer, OptimizationCriteria } from '../algorithms/MultiCriteriaOptimizer';
import { EnhancedRouteVisualizer } from '../visualization/EnhancedRouteVisualizer';
import { RouteScorer } from '../algorithms/RouteScorer';
import { RealTimeRoutingManager } from '../realtime/RealTimeRoutingManager';

export interface MultiModalRoutingState {
  isCalculating: boolean;
  isInitialized: boolean;
  currentRoute: MultiModalRoute | null;
  alternativeRoutes: MultiModalRoute[];
  routeComparison: RouteComparison | null;
  visualization: RouteVisualization | null;
  realTimeConditions: RealTimeConditions | null;
  error: string | null;
  lastCalculationTime: number;
}

export interface RoutingOptions {
  algorithm: 'dijkstra' | 'astar' | 'bidirectional' | 'multicriteria';
  optimizeFor: OptimizationCriteria[];
  returnAlternatives: boolean;
  maxAlternatives: number;
  useRealTimeData: boolean;
  visualize: boolean;
}

export interface RouteRequest {
  origin: Coordinate;
  destination: Coordinate;
  waypoints?: Coordinate[];
  preferences: UserPreferences;
  constraints: RouteConstraints;
  options?: Partial<RoutingOptions>;
}

export const useMultiModalRouting = () => {
  const [state, setState] = useState<MultiModalRoutingState>({
    isCalculating: false,
    isInitialized: false,
    currentRoute: null,
    alternativeRoutes: [],
    routeComparison: null,
    visualization: null,
    realTimeConditions: null,
    error: null,
    lastCalculationTime: 0
  });

  // Core system instances
  const graphRef = useRef<MultiModalGraphImpl | null>(null);
  const visualizerRef = useRef<EnhancedRouteVisualizer | null>(null);
  const realTimeManagerRef = useRef<RealTimeRoutingManager | null>(null);
  const optimizerRef = useRef<MultiCriteriaOptimizer | null>(null);

  // Initialize the routing system
  const initialize = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isCalculating: true, error: null }));

      // Initialize graph
      const constraints: GraphConstraints = {
        maxDistance: 100000,
        maxDuration: 10800,
        maxTransfers: 5,
        maxWalkingDistance: 2000,
        maxCyclingDistance: 15000,
        maxCost: 1000,
        departureTime: undefined,
        arrivalTime: undefined,
        avoidTolls: false,
        avoidHighways: false,
        avoidFerries: false,
        avoidUnpavedRoads: false,
        requireBikeLane: false,
        requireSidewalk: false
      };

      graphRef.current = new MultiModalGraphImpl(constraints);
      
      // Initialize with some basic nodes for testing
      await initializeBasicGraph(graphRef.current);

      // Initialize visualizer
      visualizerRef.current = new EnhancedRouteVisualizer();
      await visualizerRef.current.initialize({
        themes: [],
        defaultTheme: 'default',
        options: {
          showRouteSegments: true,
          showPOIMarkers: true,
          showTransfers: true,
          showRealTimeConditions: true,
          showAccessibilityInfo: true,
          colorByMode: true,
          colorByCondition: true,
          animateRoute: false,
          clusterNearbyPOIs: false,
          clusterRadius: 100,
          simplifyGeometry: false,
          simplifyTolerance: 10,
          interactive: true,
          animation: {
            enabled: false,
            duration: 5000,
            easing: 'linear',
            loop: false,
            speed: 1
          }
        },
        tooltip: {
          enabled: true,
          content: (element) => element.data.name || 'Route element',
          position: 'auto',
          offset: 10,
          delay: 200
        },
        popup: {
          enabled: true,
          content: (element) => `<div>${element.data.name || 'Route element'}</div>`,
          position: { latitude: 0, longitude: 0 },
          offset: 20,
          closeButton: true,
          draggable: false
        },
        interactions: {
          enabled: true,
          dragEnabled: true,
          scrollEnabled: true,
          doubleClickZoom: true,
          touchEnabled: true
        },
        performance: {
          simplifyGeometry: false,
          simplifyTolerance: 10,
          clusterPOIs: false,
          clusterRadius: 100,
          maxMarkers: 1000,
          maxSegments: 500
        }
      });

      // Initialize real-time manager
      realTimeManagerRef.current = new RealTimeRoutingManager(graphRef.current);

      setState(prev => ({
        ...prev,
        isCalculating: false,
        isInitialized: true,
        error: null
      }));

    } catch (error) {
      setState(prev => ({
        ...prev,
        isCalculating: false,
        error: error instanceof Error ? error.message : 'Initialization failed'
      }));
    }
  }, []);

  // Calculate route with full multi-modal support
  const calculateRoute = useCallback(async (request: RouteRequest): Promise<{
    success: boolean;
    route: MultiModalRoute | null;
    alternatives: MultiModalRoute[];
    comparison: RouteComparison | null;
    visualization: RouteVisualization | null;
    error: string | null;
  }> => {
    if (!state.isInitialized || !graphRef.current || !visualizerRef.current) {
      return {
        success: false,
        route: null,
        alternatives: [],
        comparison: null,
        visualization: null,
        error: 'System not initialized'
      };
    }

    setState(prev => ({ ...prev, isCalculating: true, error: null }));
    const startTime = performance.now();

    try {
      const options: RoutingOptions = {
        algorithm: 'multicriteria',
        optimizeFor: [OptimizationCriteria.TIME, OptimizationCriteria.COST],
        returnAlternatives: true,
        maxAlternatives: 3,
        useRealTimeData: true,
        visualize: true,
        ...request.options
      };

      // Initialize optimizer with current preferences
      optimizerRef.current = new MultiCriteriaOptimizer(
        graphRef.current,
        request.preferences,
        request.constraints
      );

      // Find nearby nodes for origin and destination
      let originNodes = graphRef.current.findNearbyNodes(request.origin, 500);
      let destinationNodes = graphRef.current.findNearbyNodes(request.destination, 500);

      // If no nodes found, create temporary nodes for routing
      if (originNodes.length === 0) {
        const originNode = {
          id: `temp_origin_${Date.now()}`,
          coordinate: request.origin,
          modes: request.preferences.preferredModes.length > 0 ? request.preferences.preferredModes : [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: true,
            hasElevator: false,
            hasRamp: false,
            tactilePaving: false,
            visuallyImpairedFriendly: false,
            hearingImpairedFriendly: false
          },
          amenities: [],
          type: 'STOP' as any,
          properties: {}
        };
        graphRef.current.addNode(originNode);
        originNodes = [originNode];
      }

      if (destinationNodes.length === 0) {
        const destinationNode = {
          id: `temp_destination_${Date.now()}`,
          coordinate: request.destination,
          modes: request.preferences.preferredModes.length > 0 ? request.preferences.preferredModes : [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: true,
            hasElevator: false,
            hasRamp: false,
            tactilePaving: false,
            visuallyImpairedFriendly: false,
            hearingImpairedFriendly: false
          },
          amenities: [],
          type: 'STOP' as any,
          properties: {}
        };
        graphRef.current.addNode(destinationNode);
        destinationNodes = [destinationNode];
      }

      // Calculate routes using multi-criteria optimization
      const routes = await optimizerRef.current.findParetoOptimalRoutes(
        originNodes[0].id,
        destinationNodes[0].id
      );

      if (routes.length === 0) {
        throw new Error('No routes found');
      }

      // Limit alternatives
      const limitedRoutes = routes.slice(0, options.maxAlternatives);
      const primaryRoute = limitedRoutes[0];
      const alternativeRoutes = limitedRoutes.slice(1);

      // Generate route comparison
      let comparison: RouteComparison | null = null;
      if (limitedRoutes.length > 1) {
        comparison = optimizerRef.current.compareRoutes(limitedRoutes);
      }

      // Create visualization if requested
      let visualization: RouteVisualization | null = null;
      if (options.visualize) {
        const visualizationOptions: Partial<RouteVisualizationOptions> = {
          showRouteSegments: true,
          showPOIMarkers: true,
          showTransfers: true,
          showRealTimeConditions: options.useRealTimeData,
          colorByMode: true,
          colorByCondition: options.useRealTimeData
        };

        visualization = await visualizerRef.current.loadRoute(primaryRoute, visualizationOptions);
      }

      // Update real-time data if enabled
      if (options.useRealTimeData && realTimeManagerRef.current) {
        const conditions = await realTimeManagerRef.current.getCurrentConditions();
        if (visualization) {
          visualizerRef.current.updateRealTimeData(conditions);
        }
        setState(prev => ({ ...prev, realTimeConditions: conditions }));
      }

      const calculationTime = performance.now() - startTime;

      setState(prev => ({
        ...prev,
        isCalculating: false,
        currentRoute: primaryRoute,
        alternativeRoutes,
        routeComparison: comparison,
        visualization,
        lastCalculationTime: calculationTime,
        error: null
      }));

      return {
        success: true,
        route: primaryRoute,
        alternatives: alternativeRoutes,
        comparison,
        visualization,
        error: null
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Route calculation failed';
      
      setState(prev => ({
        ...prev,
        isCalculating: false,
        error: errorMessage
      }));

      return {
        success: false,
        route: null,
        alternatives: [],
        comparison: null,
        visualization: null,
        error: errorMessage
      };
    }
  }, [state.isInitialized]);

  // Update route with real-time conditions
  const updateRealTimeConditions = useCallback(async () => {
    if (!realTimeManagerRef.current || !state.currentRoute) {
      return;
    }

    try {
      const conditions = await realTimeManagerRef.current.getCurrentConditions();
      
      if (visualizerRef.current && state.visualization) {
        visualizerRef.current.updateRealTimeData(conditions);
      }

      setState(prev => ({ ...prev, realTimeConditions: conditions }));
    } catch (error) {
      console.error('Failed to update real-time conditions:', error);
    }
  }, [state.currentRoute, state.visualization]);

  // Select alternative route
  const selectAlternativeRoute = useCallback(async (routeId: string) => {
    const route = state.alternativeRoutes.find(r => r.id === routeId);
    if (!route || !visualizerRef.current) {
      return;
    }

    try {
      const visualization = await visualizerRef.current.loadRoute(route);
      
      setState(prev => ({
        ...prev,
        currentRoute: route,
        alternativeRoutes: [prev.currentRoute, ...prev.alternativeRoutes.filter(r => r.id !== routeId)].filter(Boolean) as MultiModalRoute[],
        visualization
      }));
    } catch (error) {
      console.error('Failed to select alternative route:', error);
    }
  }, [state.alternativeRoutes, state.currentRoute]);

  // Set visualization theme
  const setVisualizationTheme = useCallback((themeId: string) => {
    if (visualizerRef.current) {
      visualizerRef.current.setTheme(themeId);
    }
  }, []);

  // Start route animation
  const startRouteAnimation = useCallback(() => {
    if (visualizerRef.current) {
      visualizerRef.current.startAnimation();
    }
  }, []);

  // Pause route animation
  const pauseRouteAnimation = useCallback(() => {
    if (visualizerRef.current) {
      visualizerRef.current.pauseAnimation();
    }
  }, []);

  // Resume route animation
  const resumeRouteAnimation = useCallback(() => {
    if (visualizerRef.current) {
      visualizerRef.current.resumeAnimation();
    }
  }, []);

  // Stop route animation
  const stopRouteAnimation = useCallback(() => {
    if (visualizerRef.current) {
      visualizerRef.current.stopAnimation();
    }
  }, []);

  // Get route statistics
  const getRouteStatistics = useCallback(() => {
    if (visualizerRef.current) {
      return visualizerRef.current.getStatistics();
    }
    return null;
  }, []);

  // Add visualization event listener
  const addEventListener = useCallback((type: VisualizationEventType, handler: (event: VisualizationEvent) => void) => {
    if (visualizerRef.current) {
      visualizerRef.current.addEventListener(type, handler);
    }
  }, []);

  // Remove visualization event listener
  const removeEventListener = useCallback((type: VisualizationEventType, handler: (event: VisualizationEvent) => void) => {
    if (visualizerRef.current) {
      visualizerRef.current.removeEventListener(type, handler);
    }
  }, []);

  // Clear current route
  const clearRoute = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentRoute: null,
      alternativeRoutes: [],
      routeComparison: null,
      visualization: null,
      realTimeConditions: null
    }));
  }, []);

  // Cleanup
  const cleanup = useCallback(() => {
    if (visualizerRef.current) {
      visualizerRef.current.dispose();
    }
    if (realTimeManagerRef.current) {
      realTimeManagerRef.current.dispose();
    }
    
    graphRef.current = null;
    visualizerRef.current = null;
    realTimeManagerRef.current = null;
    optimizerRef.current = null;
  }, []);

  // Initialize basic graph with sample data
  const initializeBasicGraph = async (graph: MultiModalGraphImpl) => {
    // Add some basic nodes in a grid pattern around Moscow center
    const centerLat = 55.7558;
    const centerLon = 37.6176;
    const gridSize = 0.01; // ~1km
    
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const nodeId = `node_${i}_${j}`;
        const node = {
          id: nodeId,
          coordinate: {
            latitude: centerLat + i * gridSize,
            longitude: centerLon + j * gridSize
          },
          modes: [TransportMode.WALKING, TransportMode.BUS, TransportMode.METRO],
          accessibility: {
            wheelchairAccessible: true,
            hasElevator: false,
            hasRamp: true,
            tactilePaving: false,
            visuallyImpairedFriendly: false,
            hearingImpairedFriendly: false
          },
          amenities: [],
          type: 'STOP' as any,
          properties: {}
        };
        graph.addNode(node);
        
        // Add edges to adjacent nodes
        if (i > -2) {
          const fromNodeId = `node_${i-1}_${j}`;
          const edgeId = `edge_${fromNodeId}_${nodeId}`;
          const edge = {
            id: edgeId,
            from: fromNodeId,
            to: nodeId,
            mode: TransportMode.WALKING,
            distance: 1000, // 1km
            duration: 720, // 12 minutes walking
            cost: 0,
            accessibility: {
              wheelchairAccessible: true,
              hasElevator: false,
              hasRamp: true,
              tactilePaving: false,
              visuallyImpairedFriendly: false,
              hearingImpairedFriendly: false
            },
            properties: {
              roadClass: 'residential',
              surface: 'paved',
              maxSpeed: 50,
              lanes: 2,
              oneway: false,
              toll: false,
              bridge: false,
              tunnel: false,
              separatedBikeLane: false
            }
          };
          graph.addEdge(edge);
        }
        
        if (j > -2) {
          const fromNodeId = `node_${i}_${j-1}`;
          const edgeId = `edge_${fromNodeId}_${nodeId}`;
          const edge = {
            id: edgeId,
            from: fromNodeId,
            to: nodeId,
            mode: TransportMode.WALKING,
            distance: 1000, // 1km
            duration: 720, // 12 minutes walking
            cost: 0,
            accessibility: {
              wheelchairAccessible: true,
              hasElevator: false,
              hasRamp: true,
              tactilePaving: false,
              visuallyImpairedFriendly: false,
              hearingImpairedFriendly: false
            },
            properties: {
              roadClass: 'residential',
              surface: 'paved',
              maxSpeed: 50,
              lanes: 2,
              oneway: false,
              toll: false,
              bridge: false,
              tunnel: false,
              separatedBikeLane: false
            }
          };
          graph.addEdge(edge);
        }
      }
    }
  };

  // Initialize on mount
  useEffect(() => {
    initialize();
    return cleanup;
  }, [initialize, cleanup]);

  // Auto-update real-time conditions
  useEffect(() => {
    if (!state.currentRoute) return;

    const interval = setInterval(updateRealTimeConditions, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [state.currentRoute, updateRealTimeConditions]);

  return {
    // State
    ...state,

    // Core functions
    initialize,
    calculateRoute,
    clearRoute,

    // Route management
    selectAlternativeRoute,
    updateRealTimeConditions,

    // Visualization
    setVisualizationTheme,
    startRouteAnimation,
    pauseRouteAnimation,
    resumeRouteAnimation,
    stopRouteAnimation,
    getRouteStatistics,

    // Events
    addEventListener,
    removeEventListener,

    // Cleanup
    cleanup
  };
};