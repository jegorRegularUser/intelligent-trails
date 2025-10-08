/**
 * Test utilities and mock data generators for the multi-modal routing system
 */

import { Coordinate, TransportMode, GraphNode, GraphEdge, AccessibilityInfo, NodeType } from './types/graph';
import { 
  DetailedUserPreferences, 
  UserConstraints, 
  PreferenceCategory,
  MobilityDevice 
} from './types/preferences';
import { PointOfInterest, POICategory } from './types/poi';
import { MultiModalRoute, RouteSegment } from './types/routing';

/**
 * Mock coordinate generator
 */
export const createMockCoordinate = (lat = 52.5200, lng = 13.4050): Coordinate => {
  return {
    latitude: lat + (Math.random() - 0.5) * 0.1,
    longitude: lng + (Math.random() - 0.5) * 0.1
  };
};

/**
 * Mock accessibility info generator
 */
export const createMockAccessibilityInfo = (overrides?: Partial<AccessibilityInfo>): AccessibilityInfo => {
  return {
    wheelchairAccessible: Math.random() > 0.5,
    visuallyImpairedFriendly: Math.random() > 0.5,
    hasElevator: Math.random() > 0.5,
    hasRamp: Math.random() > 0.5,
    audioSignals: Math.random() > 0.5,
    tactilePaving: Math.random() > 0.5,
    ...overrides
  };
};

/**
 * Mock graph node generator
 */
export const createMockGraphNode = (id?: string, overrides?: Partial<GraphNode>): GraphNode => {
  const nodeId = id || `node-${Math.floor(Math.random() * 10000)}`;
  return {
    id: nodeId,
    type: NodeType.INTERSECTION,
    coordinate: createMockCoordinate(),
    modes: [TransportMode.WALKING, TransportMode.BUS],
    accessibility: createMockAccessibilityInfo(),
    amenities: [],
    properties: {},
    ...overrides
  };
};

/**
 * Mock graph edge generator
 */
export const createMockGraphEdge = (from?: string, to?: string, overrides?: Partial<GraphEdge>): GraphEdge => {
  const fromNode = from || `node-${Math.floor(Math.random() * 10000)}`;
  const toNode = to || `node-${Math.floor(Math.random() * 10000)}`;
  return {
    id: `edge-${fromNode}-${toNode}`,
    from: fromNode,
    to: toNode,
    distance: Math.floor(Math.random() * 1000) + 100,
    duration: Math.floor(Math.random() * 600) + 60,
    mode: TransportMode.WALKING,
    cost: 0,
    accessibility: createMockAccessibilityInfo(),
    properties: {},
    ...overrides
  };
};

/**
 * Mock user preferences generator
 */
export const createMockUserPreferences = (overrides?: Partial<DetailedUserPreferences>): DetailedUserPreferences => {
  return {
    weights: {
      speed: 0.3,
      safety: 0.2,
      accessibility: 0.2,
      cost: 0.1,
      environment: 0.1,
      comfort: 0.05,
      scenic: 0.05,
      ...(overrides?.weights || {})
    },
    constraints: {
      mobilityDevice: {
        type: 'none',
        canFold: false,
        requiresElevator: false,
        requiresRamp: false,
        ...(overrides?.constraints?.mobilityDevice || {})
      },
      maxWalkingDistance: 2000,
      maxCyclingDistance: 5000,
      maxStairs: 10,
      requiresFlatSurface: false,
      requiresHandrails: false,
      requiresRestAreas: false,
      requiresAccessibleToilets: false,
      visualImpairment: false,
      hearingImpairment: false,
      cognitiveImpairment: false,
      timeConstraints: {
        maxTotalTime: 3600,
        ...(overrides?.constraints?.timeConstraints || {})
      },
      ...(overrides?.constraints || {})
    },
    transportModes: {
      preferredModes: [TransportMode.WALKING, TransportMode.BUS],
      avoidedModes: [TransportMode.CAR],
      maxTransfers: 3,
      minTransferTime: 120,
      ...(overrides?.transportModes || {})
    },
    avoidTolls: false,
    avoidHighways: false,
    avoidFerries: false,
    avoidUnpavedRoads: false,
    avoidStairs: false,
    minimizeTransfers: false,
    preferScenicRoutes: false,
    preferLessCrowded: false,
    requireBikeLane: false,
    requireSidewalk: false,
    requireWheelchairAccessibility: false,
    lexicographicOrder: [
      PreferenceCategory.SPEED,
      PreferenceCategory.SAFETY,
      PreferenceCategory.ACCESSIBILITY,
      PreferenceCategory.COST,
      PreferenceCategory.ENVIRONMENT,
      PreferenceCategory.COMFORT,
      PreferenceCategory.SCENIC
    ],
    ...(overrides || {})
  };
};

/**
 * Mock user constraints generator
 */
export const createMockUserConstraints = (overrides?: Partial<UserConstraints>): UserConstraints => {
  return {
    mobilityDevice: {
      type: 'none',
      canFold: false,
      requiresElevator: false,
      requiresRamp: false,
      ...(overrides?.mobilityDevice || {})
    },
    maxWalkingDistance: 2000,
    maxCyclingDistance: 5000,
    maxStairs: 10,
    requiresFlatSurface: false,
    requiresHandrails: false,
    requiresRestAreas: false,
    requiresAccessibleToilets: false,
    visualImpairment: false,
    hearingImpairment: false,
    cognitiveImpairment: false,
    timeConstraints: {
      maxTotalTime: 3600,
      ...(overrides?.timeConstraints || {})
    },
    ...(overrides || {})
  };
};

/**
 * Mock point of interest generator
 */
export const createMockPOI = (id?: string, overrides?: Partial<PointOfInterest>): PointOfInterest => {
  const poiId = id || `poi-${Math.floor(Math.random() * 10000)}`;
  const categories = Object.values(POICategory);
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  
  return {
    id: poiId,
    name: `POI ${poiId}`,
    category: randomCategory,
    coordinate: createMockCoordinate(),
    address: `Address ${poiId}`,
    rating: {
      average: Math.random() * 2 + 3, // 3-5
      count: Math.floor(Math.random() * 1000) + 100,
      distribution: { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 }
    },
    accessibility: createMockAccessibilityInfo(),
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      verified: Math.random() > 0.5,
      popularity: Math.random(),
      tags: ['test', 'mock'],
      description: `Mock POI ${poiId}`,
      ...(overrides?.metadata || {})
    },
    visitPriority: {
      priority: Math.floor(Math.random() * 10) + 1,
      flexibility: Math.random(),
      mustVisit: Math.random() > 0.5,
      reason: `Test reason for ${poiId}`,
      ...(overrides?.visitPriority || {})
    },
    ...(overrides || {})
  };
};

/**
 * Mock route segment generator
 */
export const createMockRouteSegment = (from?: string, to?: string, overrides?: Partial<RouteSegment>): RouteSegment => {
  const fromNode = from || `node-${Math.floor(Math.random() * 10000)}`;
  const toNode = to || `node-${Math.floor(Math.random() * 10000)}`;
  
  return {
    id: `segment-${fromNode}-${toNode}`,
    from: fromNode,
    to: toNode,
    fromCoordinate: createMockCoordinate(),
    toCoordinate: createMockCoordinate(),
    mode: TransportMode.WALKING,
    distance: Math.floor(Math.random() * 1000) + 100,
    duration: Math.floor(Math.random() * 600) + 60,
    cost: 0,
    accessibility: createMockAccessibilityInfo(),
    instructions: [],
    properties: {
      routeName: `Test Route ${fromNode}-${toNode}`,
      ...(overrides?.properties || {})
    },
    geometry: [
      createMockCoordinate(),
      createMockCoordinate()
    ],
    ...(overrides || {})
  };
};

/**
 * Mock multi-modal route generator
 */
export const createMockRoute = (overrides?: Partial<MultiModalRoute>): MultiModalRoute => {
  const segments = Array.from({ length: Math.floor(Math.random() * 3) + 1 }, () => 
    createMockRouteSegment()
  );
  
  const totalDistance = segments.reduce((sum, segment) => sum + segment.distance, 0);
  const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0);
  const totalCost = segments.reduce((sum, segment) => sum + segment.cost, 0);
  
  const geometry = segments.flatMap(segment => segment.geometry);
  
  const bounds = {
    northEast: {
      latitude: Math.max(...geometry.map(coord => coord.latitude)),
      longitude: Math.max(...geometry.map(coord => coord.longitude))
    },
    southWest: {
      latitude: Math.min(...geometry.map(coord => coord.latitude)),
      longitude: Math.min(...geometry.map(coord => coord.longitude))
    }
  };
  
  return {
    id: `route-${Math.floor(Math.random() * 10000)}`,
    segments,
    totalDistance,
    totalDuration,
    totalCost,
    totalWalkingDistance: segments
      .filter(s => s.mode === TransportMode.WALKING)
      .reduce((sum, segment) => sum + segment.distance, 0),
    totalCyclingDistance: segments
      .filter(s => s.mode === TransportMode.BICYCLE)
      .reduce((sum, segment) => sum + segment.distance, 0),
    waypoints: [],
    alternatives: [],
    geometry,
    bounds,
    summary: {
      startAddress: 'Test Start Address',
      endAddress: 'Test End Address',
      ...(overrides?.summary || {})
    },
    metadata: {
      algorithm: 'test',
      calculationTime: Math.floor(Math.random() * 100) + 10,
      createdAt: new Date(),
      isOptimal: true,
      hasRealTimeData: false,
      ...(overrides?.metadata || {})
    },
    totalTransfers: segments.filter(s => s.mode === TransportMode.BUS || s.mode === TransportMode.TRAIN).length - 1,
    accessibilityScore: Math.random(),
    environmentalScore: Math.random(),
    safetyScore: Math.random(),
    comfortScore: Math.random(),
    ...(overrides || {})
  };
};

/**
 * Create a mock graph with nodes and edges
 */
export const createMockGraph = (nodeCount = 10, edgeCount = 15) => {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  
  // Create nodes
  for (let i = 0; i < nodeCount; i++) {
    const node = createMockGraphNode(`node-${i}`);
    nodes.set(node.id, node);
  }
  
  // Create edges
  for (let i = 0; i < edgeCount; i++) {
    const fromIndex = Math.floor(Math.random() * nodeCount);
    const toIndex = Math.floor(Math.random() * nodeCount);
    
    if (fromIndex !== toIndex) {
      const fromNode = `node-${fromIndex}`;
      const toNode = `node-${toIndex}`;
      const edge = createMockGraphEdge(fromNode, toNode);
      edges.set(edge.id, edge);
    }
  }
  
  return {
    nodes,
    edges,
    transfers: new Map(),
    constraints: {
      maxWalkingDistance: 2000,
      maxCyclingDistance: 5000,
      maxTransfers: 3,
      maxTotalTime: 3600
    },
    metadata: {
      version: '1.0.0',
      lastUpdated: new Date(),
      boundingBox: {
        northEast: { latitude: 55.8, longitude: 37.7 },
        southWest: { latitude: 55.7, longitude: 37.5 }
      },
      nodeCount,
      edgeCount,
      transferCount: 0,
      supportedModes: [TransportMode.WALKING, TransportMode.BUS]
    }
  };
};

/**
 * Create an array of mock POIs
 */
export const createMockPOIs = (count = 10): PointOfInterest[] => {
  return Array.from({ length: count }, () => createMockPOI());
};

/**
 * Create an array of mock routes
 */
export const createMockRoutes = (count = 5): MultiModalRoute[] => {
  return Array.from({ length: count }, () => createMockRoute());
};

/**
 * Performance test utilities
 */
export const performanceTestUtils = {
  /**
   * Measure the execution time of a function
   */
  measureTime: async <T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> => {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    return { result, timeMs: end - start };
  },
  
  /**
   * Run a function multiple times and return average execution time
   */
  measureAverageTime: async <T>(fn: () => Promise<T>, iterations = 10): Promise<{ averageTimeMs: number; results: T[] }> => {
    const results: T[] = [];
    let totalTime = 0;
    
    for (let i = 0; i < iterations; i++) {
      const { result, timeMs } = await performanceTestUtils.measureTime(fn);
      results.push(result);
      totalTime += timeMs;
    }
    
    return {
      averageTimeMs: totalTime / iterations,
      results
    };
  },
  
  /**
   * Test memory usage before and after a function
   */
  measureMemory: <T>(fn: () => T): { result: T; memoryUsedMB: number } => {
    const before = process.memoryUsage();
    const result = fn();
    const after = process.memoryUsage();
    
    return {
      result,
      memoryUsedMB: (after.heapUsed - before.heapUsed) / 1024 / 1024
    };
  }
};

/**
 * Mock data generators for specific test scenarios
 */
export const scenarioTestUtils = {
  /**
   * Create a scenario with many POIs in a small area
   */
  createDensePOIScenario: (count = 50, centerLat = 52.5200, centerLng = 13.4050, radius = 0.01) => {
    return Array.from({ length: count }, (_, i) => {
      const lat = centerLat + (Math.random() - 0.5) * radius;
      const lng = centerLng + (Math.random() - 0.5) * radius;
      
      return createMockPOI(`dense-poi-${i}`, {
        coordinate: { latitude: lat, longitude: lng }
      });
    });
  },
  
  /**
   * Create a scenario with a long route with many segments
   */
  createLongRouteScenario: (segmentCount = 20) => {
    const segments: RouteSegment[] = [];
    let currentCoord = createMockCoordinate();
    
    for (let i = 0; i < segmentCount; i++) {
      const nextCoord = createMockCoordinate(
        currentCoord.latitude + (Math.random() - 0.5) * 0.05,
        currentCoord.longitude + (Math.random() - 0.5) * 0.05
      );
      
      segments.push(createMockRouteSegment(`node-${i}`, `node-${i + 1}`, {
        fromCoordinate: currentCoord,
        toCoordinate: nextCoord,
        distance: Math.floor(Math.random() * 2000) + 500,
        duration: Math.floor(Math.random() * 1200) + 300
      }));
      
      currentCoord = nextCoord;
    }
    
    const totalDistance = segments.reduce((sum, segment) => sum + segment.distance, 0);
    const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0);
    
    return createMockRoute({
      segments,
      totalDistance,
      totalDuration,
      geometry: segments.flatMap(segment => segment.geometry)
    });
  },
  
  /**
   * Create a scenario with accessibility constraints
   */
  createAccessibilityScenario: (deviceType: MobilityDevice['type'] = 'wheelchair') => {
    const constraints = createMockUserConstraints({
      mobilityDevice: {
        type: deviceType,
        canFold: false,
        requiresElevator: true,
        requiresRamp: true,
        maxSlope: 6,
        minDoorWidth: 80
      },
      maxWalkingDistance: 500,
      maxStairs: 0,
      requiresFlatSurface: true,
      requiresHandrails: true
    });
    
    const preferences = createMockUserPreferences({
      constraints,
      weights: {
        speed: 0.2,
        safety: 0.2,
        accessibility: 0.5,
        cost: 0.05,
        environment: 0.02,
        comfort: 0.02,
        scenic: 0.01
      },
      requireWheelchairAccessibility: true,
      avoidStairs: true
    });
    
    return { constraints, preferences };
  }
};