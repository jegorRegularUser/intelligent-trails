/**
 * Testing and validation for transport modes
 * Provides utilities for testing transport mode handlers and validating routes
 */

import {
  GraphNode,
  GraphEdge,
  TransportMode,
  Coordinate,
  RealTimeEdgeData
} from '../types/graph';
import {
  MultiModalRoute,
  RouteSegment,
  UserPreferences,
  RouteConstraints
} from '../types/routing';
import { TransportModeHandler, RoutingContext } from './TransportModeHandler';
import { MultiModalGraphImpl } from '../graph/MultiModalGraph';
import { MultiModalRoutingIntegration, MultiModalRoutingRequest } from './MultiModalRoutingIntegration';

/**
 * Test case for a transport mode handler
 */
export interface TransportModeTestCase {
  name: string;
  description: string;
  mode: TransportMode;
  edges: GraphEdge[];
  nodes: GraphNode[];
  context: RoutingContext;
  expectedResults: {
    validEdges: string[];
    invalidEdges: string[];
    validNodes: string[];
    invalidNodes: string[];
    edgeCosts: Record<string, number>;
    edgeTimes: Record<string, number>;
  };
}

/**
 * Test result for a transport mode handler
 */
export interface TransportModeTestResult {
  testCase: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  executionTime: number;
}

/**
 * Validation result for a route
 */
export interface RouteValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  scores: {
    overall: number;
    time: number;
    cost: number;
    distance: number;
    safety: number;
    accessibility: number;
    environmental: number;
    comfort: number;
  };
}

/**
 * Benchmark result for transport mode handlers
 */
export interface BenchmarkResult {
  handler: string;
  mode: TransportMode;
  operation: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  memoryUsage: number;
}

/**
 * Transport mode testing and validation implementation
 */
export class TransportModeTesting {
  private graph: MultiModalGraphImpl;
  private integration: MultiModalRoutingIntegration;

  constructor(graph: MultiModalGraphImpl) {
    this.graph = graph;
    this.integration = new MultiModalRoutingIntegration(graph);
  }

  /**
   * Run a test case for a transport mode handler
   */
  async runTestCase(testCase: TransportModeTestCase): Promise<TransportModeTestResult> {
    const startTime = performance.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let passed = true;

    try {
      // Get the handler for this mode
      const handler = this.integration.getHandler(testCase.mode);
      if (!handler) {
        errors.push(`No handler found for mode: ${testCase.mode}`);
        passed = false;
        return {
          testCase: testCase.name,
          passed,
          errors,
          warnings,
          executionTime: performance.now() - startTime
        };
      }

      // Test edge validation
      for (const edge of testCase.edges) {
        const validationResult = handler.validateEdge(edge, testCase.context);
        const shouldBeValid = testCase.expectedResults.validEdges.includes(edge.id);
        
        if (validationResult.isValid !== shouldBeValid) {
          errors.push(`Edge ${edge.id} validation failed. Expected: ${shouldBeValid}, Actual: ${validationResult.isValid}`);
          passed = false;
        }
      }

      // Test node validation
      for (const node of testCase.nodes) {
        const validationResult = handler.validateNode(node, testCase.context);
        const shouldBeValid = testCase.expectedResults.validNodes.includes(node.id);
        
        if (validationResult.isValid !== shouldBeValid) {
          errors.push(`Node ${node.id} validation failed. Expected: ${shouldBeValid}, Actual: ${validationResult.isValid}`);
          passed = false;
        }
      }

      // Test edge cost calculation
      for (const [edgeId, expectedCost] of Object.entries(testCase.expectedResults.edgeCosts)) {
        const edge = testCase.edges.find(e => e.id === edgeId);
        if (!edge) {
          errors.push(`Edge ${edgeId} not found in test case`);
          passed = false;
          continue;
        }

        const actualCost = handler.calculateEdgeCost(edge, testCase.context);
        if (Math.abs(actualCost - expectedCost) > expectedCost * 0.1) {
          warnings.push(`Edge ${edgeId} cost calculation differs significantly. Expected: ${expectedCost}, Actual: ${actualCost}`);
        }
      }

      // Test edge time calculation
      for (const [edgeId, expectedTime] of Object.entries(testCase.expectedResults.edgeTimes)) {
        const edge = testCase.edges.find(e => e.id === edgeId);
        if (!edge) {
          errors.push(`Edge ${edgeId} not found in test case`);
          passed = false;
          continue;
        }

        const actualTime = handler.calculateEdgeTime(edge, testCase.context);
        if (Math.abs(actualTime - expectedTime) > expectedTime * 0.1) {
          warnings.push(`Edge ${edgeId} time calculation differs significantly. Expected: ${expectedTime}, Actual: ${actualTime}`);
        }
      }

      // Test transfer compatibility
      for (const mode of Object.values(TransportMode)) {
        if (mode === testCase.mode) continue;
        
        for (const node of testCase.nodes) {
          const canTransfer = handler.canTransferTo(testCase.mode, mode, node.id, testCase.context);
          // This is a basic test - in a real implementation, you would have expected results
          if (!canTransfer) {
            warnings.push(`Transfer from ${testCase.mode} to ${mode} not supported at node ${node.id}`);
          }
        }
      }

    } catch (error) {
      errors.push(`Test case execution failed: ${error instanceof Error ? error.message : String(error)}`);
      passed = false;
    }

    return {
      testCase: testCase.name,
      passed,
      errors,
      warnings,
      executionTime: performance.now() - startTime
    };
  }

  /**
   * Run multiple test cases
   */
  async runTestCases(testCases: TransportModeTestCase[]): Promise<TransportModeTestResult[]> {
    const results: TransportModeTestResult[] = [];
    
    for (const testCase of testCases) {
      const result = await this.runTestCase(testCase);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Validate a route
   */
  validateRoute(route: MultiModalRoute): RouteValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let isValid = true;

    // Check if route has segments
    if (!route.segments || route.segments.length === 0) {
      errors.push('Route has no segments');
      isValid = false;
    }

    // Check segment continuity
    if (route.segments && route.segments.length > 1) {
      for (let i = 0; i < route.segments.length - 1; i++) {
        const currentSegment = route.segments[i];
        const nextSegment = route.segments[i + 1];
        
        if (currentSegment.to !== nextSegment.from) {
          errors.push(`Segment discontinuity at index ${i}: ${currentSegment.to} != ${nextSegment.from}`);
          isValid = false;
        }
      }
    }

    // Check if total distance matches sum of segment distances
    if (route.segments) {
      const calculatedDistance = route.segments.reduce((sum, segment) => sum + segment.distance, 0);
      if (Math.abs(route.totalDistance - calculatedDistance) > calculatedDistance * 0.01) {
        warnings.push(`Total distance differs from sum of segment distances: ${route.totalDistance} vs ${calculatedDistance}`);
      }
    }

    // Check if total duration matches sum of segment durations
    if (route.segments) {
      const calculatedDuration = route.segments.reduce((sum, segment) => sum + segment.duration, 0);
      if (Math.abs(route.totalDuration - calculatedDuration) > calculatedDuration * 0.01) {
        warnings.push(`Total duration differs from sum of segment durations: ${route.totalDuration} vs ${calculatedDuration}`);
      }
    }

    // Check if total cost matches sum of segment costs
    if (route.segments) {
      const calculatedCost = route.segments.reduce((sum, segment) => sum + segment.cost, 0);
      if (Math.abs(route.totalCost - calculatedCost) > calculatedCost * 0.01) {
        warnings.push(`Total cost differs from sum of segment costs: ${route.totalCost} vs ${calculatedCost}`);
      }
    }

    // Check if geometry is consistent
    if (route.geometry && route.geometry.length > 0) {
      if (route.geometry[0].latitude !== route.segments?.[0]?.fromCoordinate.latitude ||
          route.geometry[0].longitude !== route.segments?.[0]?.fromCoordinate.longitude) {
        errors.push('Route geometry does not start at the first segment\'s start point');
        isValid = false;
      }

      if (route.geometry[route.geometry.length - 1].latitude !== route.segments?.[route.segments.length - 1]?.toCoordinate.latitude ||
          route.geometry[route.geometry.length - 1].longitude !== route.segments?.[route.segments.length - 1]?.toCoordinate.longitude) {
        errors.push('Route geometry does not end at the last segment\'s end point');
        isValid = false;
      }
    }

    // Calculate scores
    const scores = this.calculateRouteScores(route);

    return {
      isValid,
      errors,
      warnings,
      scores
    };
  }

  /**
   * Calculate scores for a route
   */
  private calculateRouteScores(route: MultiModalRoute): RouteValidationResult['scores'] {
    // Normalize scores to 0-1 range
    const normalize = (value: number, min: number, max: number, invert = false) => {
      const normalized = (value - min) / (max - min);
      return invert ? 1 - Math.max(0, Math.min(1, normalized)) : Math.max(0, Math.min(1, normalized));
    };

    // Time score (lower is better)
    const timeScore = normalize(route.totalDuration, 0, 3600, true); // 0-1 hour range

    // Cost score (lower is better)
    const costScore = normalize(route.totalCost, 0, 100, true); // 0-100 currency units range

    // Distance score (lower is better)
    const distanceScore = normalize(route.totalDistance, 0, 100000, true); // 0-100km range

    // Safety score (higher is better)
    const safetyScore = route.safetyScore;

    // Accessibility score (higher is better)
    const accessibilityScore = route.accessibilityScore;

    // Environmental score (higher is better)
    const environmentalScore = route.environmentalScore;

    // Comfort score (higher is better)
    const comfortScore = route.comfortScore;

    // Overall score (weighted average)
    const overallScore = (
      timeScore * 0.2 +
      costScore * 0.15 +
      distanceScore * 0.1 +
      safetyScore * 0.2 +
      accessibilityScore * 0.15 +
      environmentalScore * 0.1 +
      comfortScore * 0.1
    );

    return {
      overall: overallScore,
      time: timeScore,
      cost: costScore,
      distance: distanceScore,
      safety: safetyScore,
      accessibility: accessibilityScore,
      environmental: environmentalScore,
      comfort: comfortScore
    };
  }

  /**
   * Benchmark transport mode handlers
   */
  async benchmarkHandlers(
    handlers: TransportModeHandler[],
    iterations: number = 100
  ): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // Create test data
    const testEdges = this.createTestEdges();
    const testNodes = this.createTestNodes();
    const testContext = this.createTestContext();

    for (const handler of handlers) {
      const mode = handler.getTransportMode();
      
      // Benchmark edge validation
      const edgeValidationResult = await this.benchmarkOperation(
        `${mode}-edge-validation`,
        () => {
          for (const edge of testEdges) {
            handler.validateEdge(edge, testContext);
          }
        },
        iterations
      );
      results.push({
        handler: handler.constructor.name,
        mode,
        operation: 'edge-validation',
        iterations,
        ...edgeValidationResult
      });

      // Benchmark node validation
      const nodeValidationResult = await this.benchmarkOperation(
        `${mode}-node-validation`,
        () => {
          for (const node of testNodes) {
            handler.validateNode(node, testContext);
          }
        },
        iterations
      );
      results.push({
        handler: handler.constructor.name,
        mode,
        operation: 'node-validation',
        iterations,
        ...nodeValidationResult
      });

      // Benchmark edge cost calculation
      const edgeCostResult = await this.benchmarkOperation(
        `${mode}-edge-cost`,
        () => {
          for (const edge of testEdges) {
            handler.calculateEdgeCost(edge, testContext);
          }
        },
        iterations
      );
      results.push({
        handler: handler.constructor.name,
        mode,
        operation: 'edge-cost',
        iterations,
        ...edgeCostResult
      });

      // Benchmark edge time calculation
      const edgeTimeResult = await this.benchmarkOperation(
        `${mode}-edge-time`,
        () => {
          for (const edge of testEdges) {
            handler.calculateEdgeTime(edge, testContext);
          }
        },
        iterations
      );
      results.push({
        handler: handler.constructor.name,
        mode,
        operation: 'edge-time',
        iterations,
        ...edgeTimeResult
      });
    }

    return results;
  }

  /**
   * Benchmark an operation
   */
  private async benchmarkOperation(
    name: string,
    operation: () => void,
    iterations: number
  ): Promise<{
    totalTime: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
    memoryUsage: number;
  }> {
    const times: number[] = [];
    
    // Warm up
    for (let i = 0; i < 10; i++) {
      operation();
    }
    
    // Run benchmark
    for (let i = 0; i < iterations; i++) {
      const startMemory = process.memoryUsage ? process.memoryUsage().heapUsed : 0;
      const startTime = performance.now();
      
      operation();
      
      const endTime = performance.now();
      const endMemory = process.memoryUsage ? process.memoryUsage().heapUsed : 0;
      
      times.push(endTime - startTime);
    }
    
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const memoryUsage = process.memoryUsage ? process.memoryUsage().heapUsed : 0;
    
    return {
      totalTime,
      averageTime,
      minTime,
      maxTime,
      memoryUsage
    };
  }

  /**
   * Create test edges for benchmarking
   */
  private createTestEdges(): GraphEdge[] {
    const edges: GraphEdge[] = [];
    
    for (let i = 0; i < 100; i++) {
      edges.push({
        id: `edge-${i}`,
        from: `node-${i}`,
        to: `node-${(i + 1) % 100}`,
        distance: 100 + Math.random() * 900,
        duration: 60 + Math.random() * 300,
        mode: Object.values(TransportMode)[Math.floor(Math.random() * Object.values(TransportMode).length)],
        cost: Math.random() * 10,
        accessibility: {
          wheelchairAccessible: Math.random() > 0.5,
          visuallyImpairedFriendly: Math.random() > 0.5,
          hasElevator: Math.random() > 0.5,
          hasRamp: Math.random() > 0.5,
          audioSignals: Math.random() > 0.5,
          tactilePaving: Math.random() > 0.5
        },
        properties: {
          roadClass: 'residential',
          maxSpeed: 50,
          surface: 'asphalt'
        }
      });
    }
    
    return edges;
  }

  /**
   * Create test nodes for benchmarking
   */
  private createTestNodes(): GraphNode[] {
    const nodes: GraphNode[] = [];
    
    for (let i = 0; i < 100; i++) {
      nodes.push({
        id: `node-${i}`,
        coordinate: {
          latitude: 40 + Math.random() * 10,
          longitude: -70 + Math.random() * 10
        },
        modes: Object.values(TransportMode),
        accessibility: {
          wheelchairAccessible: Math.random() > 0.5,
          visuallyImpairedFriendly: Math.random() > 0.5,
          hasElevator: Math.random() > 0.5,
          hasRamp: Math.random() > 0.5,
          audioSignals: Math.random() > 0.5,
          tactilePaving: Math.random() > 0.5
        },
        amenities: [],
        type: 'intersection' as any,
        properties: {
          name: `Node ${i}`
        }
      });
    }
    
    return nodes;
  }

  /**
   * Create test context for benchmarking
   */
  private createTestContext(): RoutingContext {
    return {
      graph: this.graph,
      preferences: {
        speed: 0.5,
        safety: 0.5,
        accessibility: 0.5,
        cost: 0.5,
        comfort: 0.5,
        environmental: 0.5,
        scenic: false,
        avoidWalking: false,
        avoidCycling: false,
        avoidStairs: false,
        preferredModes: Object.values(TransportMode),
        avoidedModes: [],
        minimizeTransfers: false,
        requireWheelchairAccessibility: false
      } as any,
      constraints: {
        maxDistance: 100000,
        maxDuration: 3600,
        maxTransfers: 5,
        maxWalkingDistance: 2000,
        maxCyclingDistance: 15000,
        maxCost: 100,
        avoidTolls: false,
        avoidHighways: false,
        avoidFerries: false,
        avoidUnpavedRoads: false,
        requireBikeLane: false,
        requireSidewalk: false
      }
    };
  }

  /**
   * Generate a test report
   */
  generateTestReport(
    testResults: TransportModeTestResult[],
    validationResults: RouteValidationResult[],
    benchmarkResults: BenchmarkResult[]
  ): string {
    let report = '# Transport Mode Testing Report\n\n';
    
    // Test Results Summary
    report += '## Test Results Summary\n\n';
    const passedTests = testResults.filter(r => r.passed).length;
    const totalTests = testResults.length;
    report += '- Passed: ' + passedTests + '/' + totalTests + ' (' + (passedTests / totalTests * 100).toFixed(1) + '%)\n\n';
    
    // Failed Tests
    const failedTests = testResults.filter(r => !r.passed);
    if (failedTests.length > 0) {
      report += '### Failed Tests\n\n';
      for (const test of failedTests) {
        report += '#### ' + test.testCase.replace(/\$/g, '\\$') + '\n';
        report += '- Errors: ' + test.errors.join(', ') + '\n\n';
      }
    }
    
    // Validation Results Summary
    report += '## Route Validation Summary\n\n';
    const validRoutes = validationResults.filter(r => r.isValid).length;
    const totalRoutes = validationResults.length;
    report += '- Valid: ' + validRoutes + '/' + totalRoutes + ' (' + (validRoutes / totalRoutes * 100).toFixed(1) + '%)\n\n';
    
    // Benchmark Results Summary
    report += '## Benchmark Results Summary\n\n';
    const benchmarkByOperation = new Map<string, BenchmarkResult[]>();
    for (const result of benchmarkResults) {
      if (!benchmarkByOperation.has(result.operation)) {
        benchmarkByOperation.set(result.operation, []);
      }
      benchmarkByOperation.get(result.operation)!.push(result);
    }
    
    for (const [operation, results] of benchmarkByOperation.entries()) {
      report += '### ' + operation.replace(/\$/g, '\\$') + '\n\n';
      const avgTimes = results.map(r => r.averageTime);
      const minAvgTime = Math.min(...avgTimes);
      const maxAvgTime = Math.max(...avgTimes);
      
      report += '| Handler | Mode | Avg Time (ms) | Min Time (ms) | Max Time (ms) |\n';
      report += '|---------|------|---------------|---------------|---------------|\n';
      
      for (const result of results) {
        const isFastest = result.averageTime === minAvgTime;
        const isSlowest = result.averageTime === maxAvgTime;
        const timeStr = isFastest ? '**' + result.averageTime.toFixed(2) + '**' : 
                      isSlowest ? '*' + result.averageTime.toFixed(2) + '*' : 
                      result.averageTime.toFixed(2);
        
        report += '| ' + result.handler + ' | ' + result.mode + ' | ' + timeStr + ' | ' + result.minTime.toFixed(2) + ' | ' + result.maxTime.toFixed(2) + ' |\n';
      }
      report += '\n';
    }
    
    return report;
  }
}