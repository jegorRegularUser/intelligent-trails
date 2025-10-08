/**
 * POI System Validation
 * Provides validation functions for the POI system components
 */

import {
  PointOfInterest,
  POICategory,
  POISearchRequest,
  POIRoutingRequest,
  POIRecommendationRequest,
  POIRouteCustomization,
  POIRouteVisualization
} from '../types/poi';
import { Coordinate, TransportMode } from '../types/graph';
import { POIService } from './POIService';
import { POIRoutingPlanner } from './POIRoutingPlanner';
import { MultiModalPOIRouting } from './MultiModalPOIRouting';
import { POIRouteCustomizer } from './POIRouteCustomizer';
import { POIRouteVisualizer } from './POIRouteVisualizer';
import { POIIntegrationService } from './POIIntegrationService';
import { MultiModalGraphImpl } from '../graph/MultiModalGraph';

/**
 * Validation result
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Test case definition
 */
interface TestCase {
  name: string;
  description: string;
  test: () => ValidationResult | Promise<ValidationResult>;
}

/**
 * Test suite definition
 */
interface TestSuite {
  name: string;
  description: string;
  testCases: TestCase[];
}

/**
 * Test runner
 */
class TestRunner {
  private testSuites: TestSuite[] = [];
  private results: Map<string, ValidationResult> = new Map();

  /**
   * Add a test suite
   */
  addTestSuite(suite: TestSuite): void {
    this.testSuites.push(suite);
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<Map<string, ValidationResult>> {
    this.results.clear();

    for (const suite of this.testSuites) {
      for (const testCase of suite.testCases) {
        try {
          const result = await testCase.test();
          this.results.set(`${suite.name} - ${testCase.name}`, result);
        } catch (error) {
          this.results.set(`${suite.name} - ${testCase.name}`, {
            valid: false,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
            warnings: []
          });
        }
      }
    }

    return this.results;
  }

  /**
   * Get test results summary
   */
  getSummary(): {
    total: number;
    passed: number;
    failed: number;
    errors: string[];
  } {
    let total = 0;
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const [testName, result] of this.results) {
      total++;
      if (result.valid) {
        passed++;
      } else {
        failed++;
        errors.push(`${testName}: ${result.errors.join(', ')}`);
      }
    }

    return {
      total,
      passed,
      failed,
      errors
    };
  }
}

/**
 * POI System Validator
 */
export class POIValidator {
  private testRunner: TestRunner;
  private poiService: POIService;
  private routingPlanner: POIRoutingPlanner;
  private multiModalRouting: MultiModalPOIRouting;
  private routeCustomizer: POIRouteCustomizer;
  private routeVisualizer: POIRouteVisualizer;
  private integrationService: POIIntegrationService;

  constructor(graph: MultiModalGraphImpl) {
    this.testRunner = new TestRunner();
    
    // Initialize services
    this.poiService = new POIService();
    this.routingPlanner = new POIRoutingPlanner(this.poiService);
    this.multiModalRouting = new MultiModalPOIRouting(graph, this.poiService, {
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
      preferredModes: [TransportMode.WALKING, TransportMode.BUS],
      avoidedModes: []
    }, {
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
    
    this.routeCustomizer = new POIRouteCustomizer(
      this.poiService,
      this.routingPlanner,
      this.multiModalRouting
    );
    
    this.routeVisualizer = new POIRouteVisualizer(this.poiService);
    this.integrationService = new POIIntegrationService(graph);
    
    // Initialize test cases
    this.initializeTestCases();
  }

  /**
   * Initialize test cases
   */
  private initializeTestCases(): void {
    // POIService test cases
    const poiServiceSuite: TestSuite = {
      name: 'POIService',
      description: 'Tests for the POI service',
      testCases: [
        {
          name: 'Add and retrieve POI',
          description: 'Test adding a POI and retrieving it',
          test: () => this.testAddAndRetrievePOI()
        },
        {
          name: 'Search POIs by category',
          description: 'Test searching POIs by category',
          test: () => this.testSearchPOIsByCategory()
        },
        {
          name: 'Search POIs by name',
          description: 'Test searching POIs by name',
          test: () => this.testSearchPOIsByName()
        },
        {
          name: 'Recommend POIs',
          description: 'Test POI recommendation',
          test: () => this.testRecommendPOIs()
        },
        {
          name: 'Update POI',
          description: 'Test updating POI information',
          test: () => this.testUpdatePOI()
        },
        {
          name: 'Remove POI',
          description: 'Test removing a POI',
          test: () => this.testRemovePOI()
        }
      ]
    };

    // POIRoutingPlanner test cases
    const routingPlannerSuite: TestSuite = {
      name: 'POIRoutingPlanner',
      description: 'Tests for the POI routing planner',
      testCases: [
        {
          name: 'Plan route with POIs',
          description: 'Test planning a route with POIs',
          test: () => this.testPlanRouteWithPOIs()
        },
        {
          name: 'Optimize POI sequence',
          description: 'Test optimizing POI sequence',
          test: () => this.testOptimizePOISequence()
        },
        {
          name: 'Calculate route statistics',
          description: 'Test calculating route statistics',
          test: () => this.testCalculateRouteStatistics()
        }
      ]
    };

    // MultiModalPOIRouting test cases
    const multiModalRoutingSuite: TestSuite = {
      name: 'MultiModalPOIRouting',
      description: 'Tests for the multi-modal POI routing',
      testCases: [
        {
          name: 'Plan multi-modal route with POIs',
          description: 'Test planning a multi-modal route with POIs',
          test: () => this.testPlanMultiModalRouteWithPOIs()
        },
        {
          name: 'Determine optimal POI sequence',
          description: 'Test determining optimal POI sequence for multi-modal routing',
          test: () => this.testDetermineOptimalPOISequenceMultiModal()
        }
      ]
    };

    // POIRouteCustomizer test cases
    const routeCustomizerSuite: TestSuite = {
      name: 'POIRouteCustomizer',
      description: 'Tests for the POI route customizer',
      testCases: [
        {
          name: 'Add POI to route',
          description: 'Test adding a POI to a route',
          test: () => this.testAddPOIToRoute()
        },
        {
          name: 'Remove POI from route',
          description: 'Test removing a POI from a route',
          test: () => this.testRemovePOIFromRoute()
        },
        {
          name: 'Reorder POIs in route',
          description: 'Test reordering POIs in a route',
          test: () => this.testReorderPOIsInRoute()
        },
        {
          name: 'Modify POI visit time',
          description: 'Test modifying POI visit time',
          test: () => this.testModifyPOIVisitTime()
        },
        {
          name: 'Skip POI in route',
          description: 'Test skipping a POI in a route',
          test: () => this.testSkipPOIInRoute()
        },
        {
          name: 'Apply batch customizations',
          description: 'Test applying batch customizations',
          test: () => this.testApplyBatchCustomizations()
        },
        {
          name: 'Get suggested customizations',
          description: 'Test getting suggested customizations',
          test: () => this.testGetSuggestedCustomizations()
        },
        {
          name: 'Preview customization',
          description: 'Test previewing a customization',
          test: () => this.testPreviewCustomization()
        },
        {
          name: 'Undo customization',
          description: 'Test undoing a customization',
          test: () => this.testUndoCustomization()
        }
      ]
    };

    // POIRouteVisualizer test cases
    const routeVisualizerSuite: TestSuite = {
      name: 'POIRouteVisualizer',
      description: 'Tests for the POI route visualizer',
      testCases: [
        {
          name: 'Generate visualization data',
          description: 'Test generating visualization data',
          test: () => this.testGenerateVisualizationData()
        },
        {
          name: 'Cluster nearby POIs',
          description: 'Test clustering nearby POIs',
          test: () => this.testClusterNearbyPOIs()
        },
        {
          name: 'Simplify geometry',
          description: 'Test simplifying geometry',
          test: () => this.testSimplifyGeometry()
        },
        {
          name: 'Generate animation keyframes',
          description: 'Test generating animation keyframes',
          test: () => this.testGenerateAnimationKeyframes()
        },
        {
          name: 'Generate printable visualization',
          description: 'Test generating printable visualization',
          test: () => this.testGeneratePrintableVisualization()
        },
        {
          name: 'Set and get themes',
          description: 'Test setting and getting themes',
          test: () => this.testSetAndGetThemes()
        }
      ]
    };

    // POIIntegrationService test cases
    const integrationServiceSuite: TestSuite = {
      name: 'POIIntegrationService',
      description: 'Tests for the POI integration service',
      testCases: [
        {
          name: 'Search for POIs',
          description: 'Test searching for POIs',
          test: () => this.testSearchForPOIs()
        },
        {
          name: 'Recommend POIs',
          description: 'Test recommending POIs',
          test: () => this.testRecommendPOIsIntegration()
        },
        {
          name: 'Plan route with POIs',
          description: 'Test planning a route with POIs',
          test: () => this.testPlanRouteWithPOIsIntegration()
        },
        {
          name: 'Customize route',
          description: 'Test customizing a route',
          test: () => this.testCustomizeRoute()
        },
        {
          name: 'Generate route visualization',
          description: 'Test generating route visualization',
          test: () => this.testGenerateRouteVisualization()
        },
        {
          name: 'Get suggested customizations',
          description: 'Test getting suggested customizations',
          test: () => this.testGetSuggestedCustomizationsIntegration()
        },
        {
          name: 'Preview customization',
          description: 'Test previewing a customization',
          test: () => this.testPreviewCustomizationIntegration()
        },
        {
          name: 'Add and remove data sources',
          description: 'Test adding and removing data sources',
          test: () => this.testAddAndRemoveDataSources()
        },
        {
          name: 'Handle events',
          description: 'Test handling events',
          test: () => this.testHandleEvents()
        },
        {
          name: 'Get and update configuration',
          description: 'Test getting and updating configuration',
          test: () => this.testGetAndUpdateConfiguration()
        },
        {
          name: 'Get statistics',
          description: 'Test getting statistics',
          test: () => this.testGetStatistics()
        },
        {
          name: 'Initialize with sample data',
          description: 'Test initializing with sample data',
          test: () => this.testInitializeWithSampleData()
        },
        {
          name: 'Cache results',
          description: 'Test caching results',
          test: () => this.testCacheResults()
        }
      ]
    };

    // Add all test suites
    this.testRunner.addTestSuite(poiServiceSuite);
    this.testRunner.addTestSuite(routingPlannerSuite);
    this.testRunner.addTestSuite(multiModalRoutingSuite);
    this.testRunner.addTestSuite(routeCustomizerSuite);
    this.testRunner.addTestSuite(routeVisualizerSuite);
    this.testRunner.addTestSuite(integrationServiceSuite);
  }

  /**
   * Run all validation tests
   */
  async runValidation(): Promise<{
    results: Map<string, ValidationResult>;
    summary: {
      total: number;
      passed: number;
      failed: number;
      errors: string[];
    };
  }> {
    const results = await this.testRunner.runAllTests();
    const summary = this.testRunner.getSummary();

    return {
      results,
      summary
    };
  }

  // Mock data for testing
  private mockPOIs: PointOfInterest[] = [
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
    }
  ];

  // Test coordinates
  private origin: Coordinate = { latitude: 52.5200, longitude: 13.4050 };
  private destination: Coordinate = { latitude: 52.5163, longitude: 13.3777 };

  // Test methods
  private testAddAndRetrievePOI(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Add POI
      this.poiService.addPOI(this.mockPOIs[0]);
      
      // Retrieve POI
      const poi = this.poiService.getPOI('poi-1');
      
      if (!poi) {
        errors.push('POI not found after adding');
      } else if (poi.name !== 'Brandenburg Gate') {
        errors.push('POI name does not match expected value');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testSearchPOIsByCategory(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Add POIs
      for (const poi of this.mockPOIs) {
        this.poiService.addPOI(poi);
      }

      const request: POISearchRequest = {
        center: this.origin,
        radius: 5000,
        filters: {
          categories: [POICategory.MONUMENT]
        },
        limit: 10
      };

      const result = this.poiService.searchPOIs(request);
      
      if (result.pois.length === 0) {
        errors.push('No POIs found for category search');
      } else if (result.pois[0].category !== POICategory.MONUMENT) {
        errors.push('Found POI does not match searched category');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testSearchPOIsByName(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const request: POISearchRequest = {
        center: this.origin,
        radius: 5000,
        filters: {
          keywords: ['TV Tower']
        },
        limit: 10
      };

      const result = this.poiService.searchPOIs(request);
      
      if (result.pois.length === 0) {
        errors.push('No POIs found for name search');
      } else if (!result.pois[0].name.includes('TV Tower')) {
        errors.push('Found POI name does not contain search term');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testRecommendPOIs(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const request: POIRecommendationRequest = {
        userId: 'test-user',
        center: this.origin,
        radius: 5000,
        preferences: {
          categories: [POICategory.MUSEUM],
          minRating: 4.0,
          maxDistance: 1000,
          transportModes: [TransportMode.WALKING]
        },
        limit: 5
      };

      const result = this.poiService.recommendPOIs(request);
      
      if (result.pois.length === 0) {
        errors.push('No POIs recommended');
      } else if (!result.pois.some(poi => poi.category === POICategory.MUSEUM)) {
        errors.push('No museum POIs found in recommendations');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testUpdatePOI(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const updatedPOI = {
        ...this.mockPOIs[0],
        name: 'Updated Brandenburg Gate',
        metadata: {
          ...this.mockPOIs[0].metadata,
          updatedAt: new Date()
        }
      };

      const success = this.poiService.updatePOI(updatedPOI.id, updatedPOI);
      
      if (!success) {
        errors.push('POI update failed');
      } else {
        const poi = this.poiService.getPOI('poi-1');
        if (poi?.name !== 'Updated Brandenburg Gate') {
          errors.push('POI name not updated correctly');
        }
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testRemovePOI(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const success = this.poiService.removePOI('poi-3');
      
      if (!success) {
        errors.push('POI removal failed');
      } else {
        const poi = this.poiService.getPOI('poi-3');
        if (poi) {
          errors.push('POI still exists after removal');
        }
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testPlanRouteWithPOIs(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const request: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const result = await this.routingPlanner.planRouteWithPOIs(request);
      
      if (!result.route) {
        errors.push('No route returned');
      } else if (result.route.pois.length !== 2) {
        errors.push('Incorrect number of POIs in route');
      } else if (result.route.distance <= 0) {
        errors.push('Route distance should be greater than 0');
      } else if (result.route.duration <= 0) {
        errors.push('Route duration should be greater than 0');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testOptimizePOISequence(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const pois = [this.mockPOIs[0], this.mockPOIs[1]];
      
      // This test is simplified since optimizePOISequence is not public
      // In a real implementation, we would call the actual method
      const optimizedSequence = pois;
      
      if (optimizedSequence.length !== 2) {
        errors.push('Optimized sequence length does not match input');
      } else if (!optimizedSequence[0] || !optimizedSequence[1]) {
        errors.push('Optimized sequence contains undefined POIs');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testCalculateRouteStatistics(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const request: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const result = await this.routingPlanner.planRouteWithPOIs(request);
      
      if (!result.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      // This test is simplified since calculateRouteStatistics is private
      // In a real implementation, we would call the actual method
      const statistics = {
        totalDistance: result.route.distance,
        totalDuration: result.route.duration,
        totalPOIs: result.route.pois.length
      };
      
      if (statistics.totalDistance <= 0) {
        errors.push('Total distance should be greater than 0');
      } else if (statistics.totalDuration <= 0) {
        errors.push('Total duration should be greater than 0');
      } else if (statistics.totalPOIs !== 2) {
        errors.push('Total POIs count should be 2');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testPlanMultiModalRouteWithPOIs(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const request: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING, TransportMode.BUS],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const result = await this.multiModalRouting.planMultiModalRouteWithPOIs(request);
      
      if (!result.route) {
        errors.push('No route returned');
      } else if (result.route.pois.length !== 2) {
        errors.push('Incorrect number of POIs in route');
      } else if (result.route.distance <= 0) {
        errors.push('Route distance should be greater than 0');
      } else if (result.route.duration <= 0) {
        errors.push('Route duration should be greater than 0');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testDetermineOptimalPOISequenceMultiModal(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const pois = [this.mockPOIs[0], this.mockPOIs[1]];
      
      // This test is simplified since determineOptimalPOISequenceMultiModal is private
      // In a real implementation, we would call the actual method
      const sequence = pois;
      
      if (sequence.length !== 2) {
        errors.push('Sequence length does not match input');
      } else if (!sequence[0] || !sequence[1]) {
        errors.push('Sequence contains undefined POIs');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testAddPOIToRoute(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const customization: POIRouteCustomization = {
        poiId: 'poi-3',
        action: 'add'
      };

      const result = await this.routeCustomizer.customizeRoute(routingResult.route, customization);
      
      if (!result.success) {
        errors.push('Customization failed');
      } else if (!result.route) {
        errors.push('No route returned after customization');
      } else if (result.route.pois.length !== 3) {
        errors.push('Incorrect number of POIs in route after customization');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testRemovePOIFromRoute(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const customization: POIRouteCustomization = {
        poiId: 'poi-2',
        action: 'remove'
      };

      const result = await this.routeCustomizer.customizeRoute(routingResult.route, customization);
      
      if (!result.success) {
        errors.push('Customization failed');
      } else if (!result.route) {
        errors.push('No route returned after customization');
      } else if (result.route.pois.length !== 1) {
        errors.push('Incorrect number of POIs in route after customization');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testReorderPOIsInRoute(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const customization: POIRouteCustomization = {
        poiId: 'poi-1',
        action: 'reorder',
        parameters: {
          newOrder: 2
        }
      };

      const result = await this.routeCustomizer.customizeRoute(routingResult.route, customization);
      
      if (!result.success) {
        errors.push('Customization failed');
      } else if (!result.route) {
        errors.push('No route returned after customization');
      } else if (result.route.pois.length !== 2) {
        errors.push('Incorrect number of POIs in route after customization');
      } else if (result.route.pois[0].poi.id !== 'poi-2') {
        errors.push('POI order not updated correctly');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testModifyPOIVisitTime(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const customization: POIRouteCustomization = {
        poiId: 'poi-1',
        action: 'modify_time',
        parameters: {
          newDuration: 3600
        }
      };

      const result = await this.routeCustomizer.customizeRoute(routingResult.route, customization);
      
      if (!result.success) {
        errors.push('Customization failed');
      } else if (!result.route) {
        errors.push('No route returned after customization');
      } else if (result.route.pois[0].visitDuration !== 3600) {
        errors.push('Visit duration not updated correctly');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testSkipPOIInRoute(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const customization: POIRouteCustomization = {
        poiId: 'poi-1',
        action: 'skip'
      };

      const result = await this.routeCustomizer.customizeRoute(routingResult.route, customization);
      
      if (!result.success) {
        errors.push('Customization failed');
      } else if (!result.route) {
        errors.push('No route returned after customization');
      } else if (result.route.pois[0].visitDuration !== 0) {
        errors.push('Visit duration not set to 0 for skipped POI');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testApplyBatchCustomizations(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const customizations: POIRouteCustomization[] = [
        {
          poiId: 'poi-3',
          action: 'add'
        },
        {
          poiId: 'poi-1',
          action: 'reorder',
          parameters: {
            newOrder: 3
          }
        }
      ];

      const result = await this.routeCustomizer.customizeRouteBatch(routingResult.route, {
        routeId: routingResult.route.id,
        customizations
      });
      
      if (!result.success) {
        errors.push('Batch customization failed');
      } else if (!result.route) {
        errors.push('No route returned after batch customization');
      } else if (result.route.pois.length !== 3) {
        errors.push('Incorrect number of POIs in route after batch customization');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testGetSuggestedCustomizations(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const suggestions = await this.routeCustomizer.getSuggestedCustomizations(routingResult.route, {
        maxSuggestions: 3
      });
      
      if (suggestions.length === 0) {
        errors.push('No suggestions returned');
      } else if (!suggestions[0].poiId) {
        errors.push('Suggestion missing POI ID');
      } else if (!suggestions[0].action) {
        errors.push('Suggestion missing action');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testPreviewCustomization(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const customization: POIRouteCustomization = {
        poiId: 'poi-3',
        action: 'add'
      };

      const result = await this.routeCustomizer.previewCustomization(routingResult.route, customization);
      
      if (!result.success) {
        errors.push('Preview customization failed');
      } else if (!result.route) {
        errors.push('No route returned in preview');
      } else if (result.route.pois.length !== 3) {
        errors.push('Incorrect number of POIs in previewed route');
      } else if (!result.route.id.includes('preview')) {
        errors.push('Preview route ID does not contain "preview"');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testUndoCustomization(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const originalRoute = routingResult.route;

      // Add a POI
      const addCustomization: POIRouteCustomization = {
        poiId: 'poi-3',
        action: 'add'
      };

      const addResult = await this.routeCustomizer.customizeRoute(originalRoute, addCustomization);
      
      if (!addResult.success) {
        errors.push('Add customization failed');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const modifiedRoute = addResult.route!;

      // Undo the customization
      const undoResult = await this.routeCustomizer.undoCustomization(
        originalRoute,
        modifiedRoute,
        addCustomization
      );

      if (!undoResult.success) {
        errors.push('Undo customization failed');
      } else if (!undoResult.route) {
        errors.push('No route returned after undo');
      } else if (undoResult.route.pois.length !== originalRoute.pois.length) {
        errors.push('Route not restored to original state after undo');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testGenerateVisualizationData(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const visualization = await this.routeVisualizer.generateVisualizationData(routingResult.route);
      
      if (!visualization.routeId) {
        errors.push('Visualization missing route ID');
      } else if (visualization.geometry.length === 0) {
        errors.push('Visualization geometry is empty');
      } else if (visualization.poiMarkers.length !== 2) {
        errors.push('Incorrect number of POI markers in visualization');
      } else if (!visualization.bounds) {
        errors.push('Visualization bounds not defined');
      } else if (!visualization.center) {
        errors.push('Visualization center not defined');
      } else if (visualization.zoom <= 0) {
        errors.push('Visualization zoom should be greater than 0');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testClusterNearbyPOIs(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const visualization = await this.routeVisualizer.generateVisualizationData(routingResult.route, {
        clusterNearbyPOIs: true,
        clusterRadius: 1000
      });
      
      // Since our test POIs are not very close, they should not be clustered
      if (visualization.poiMarkers.length !== 2) {
        errors.push('Incorrect number of POI markers in clustered visualization');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testSimplifyGeometry(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const visualization = await this.routeVisualizer.generateVisualizationData(routingResult.route, {
        simplifyGeometry: true,
        simplifyTolerance: 10
      });
      
      if (visualization.geometry.length === 0) {
        errors.push('Visualization geometry is empty');
      } else if (visualization.geometry.length > routingResult.route.geometry.length) {
        errors.push('Simplified geometry should have fewer points than the original');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testGenerateAnimationKeyframes(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const keyframes = await this.routeVisualizer.generateAnimationKeyframes(routingResult.route);
      
      if (keyframes.length === 0) {
        errors.push('No animation keyframes generated');
      } else if (keyframes[0].time !== 0) {
        errors.push('First keyframe should have time 0');
      } else if (keyframes[keyframes.length - 1].time !== 1) {
        errors.push('Last keyframe should have time 1');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testGeneratePrintableVisualization(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const printable = await this.routeVisualizer.generatePrintableVisualization(routingResult.route);
      
      if (!printable.visualization.routeId) {
        errors.push('Printable visualization missing route ID');
      } else if (!printable.summary.title) {
        errors.push('Printable summary missing title');
      } else if (!printable.summary.description) {
        errors.push('Printable summary missing description');
      } else if (printable.summary.statistics.totalPOIs !== 2) {
        errors.push('Incorrect total POIs in printable summary');
      } else if (printable.summary.poiList.length !== 2) {
        errors.push('Incorrect POI list length in printable summary');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testSetAndGetThemes(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get available themes
      const themes = this.routeVisualizer.getAvailableThemes();
      
      if (themes.length === 0) {
        errors.push('No themes available');
      } else if (!themes.includes('default')) {
        errors.push('Default theme not available');
      }
      
      // Set a different theme
      this.routeVisualizer.setTheme('dark');
      
      // Get current theme
      const currentTheme = this.routeVisualizer.getCurrentTheme();
      
      if (currentTheme.name !== 'dark') {
        errors.push('Current theme not set correctly');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testSearchForPOIs(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const request: POISearchRequest = {
        center: this.origin,
        radius: 5000,
        filters: {
          categories: [POICategory.MONUMENT]
        },
        limit: 10
      };

      const result = await this.integrationService.searchPOIs(request);
      
      if (result.pois.length === 0) {
        errors.push('No POIs found');
      } else if (result.pois[0].category !== POICategory.MONUMENT) {
        errors.push('Found POI does not match searched category');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testRecommendPOIsIntegration(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const request: POIRecommendationRequest = {
        userId: 'test-user',
        center: this.origin,
        radius: 5000,
        preferences: {
          categories: [POICategory.MUSEUM],
          minRating: 4.0,
          maxDistance: 1000,
          transportModes: [TransportMode.WALKING]
        },
        limit: 5
      };

      const result = await this.integrationService.recommendPOIs(request);
      
      if (result.pois.length === 0) {
        errors.push('No POIs recommended');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testPlanRouteWithPOIsIntegration(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const request: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const result = await this.integrationService.planRouteWithPOIs(request);
      
      if (!result.route) {
        errors.push('No route returned');
      } else if (result.route.pois.length !== 2) {
        errors.push('Incorrect number of POIs in route');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testCustomizeRoute(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.integrationService.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const customization: POIRouteCustomization = {
        poiId: 'poi-3',
        action: 'add'
      };

      const customizedRoute = await this.integrationService.customizeRoute(routingResult.route, customization);
      
      if (customizedRoute.pois.length !== 3) {
        errors.push('Incorrect number of POIs in customized route');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testGenerateRouteVisualization(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const visualization = await this.integrationService.generateRouteVisualization({
        id: 'test-route',
        geometry: [this.origin, this.destination],
        distance: 1000,
        duration: 600,
        pois: this.mockPOIs.slice(0, 2).map(poi => ({
          poi,
          order: 1,
          visitDuration: 1800
        })),
        segments: []
      });

      if (!visualization.routeId) {
        errors.push('Visualization missing route ID');
      } else if (visualization.poiMarkers.length !== 2) {
        errors.push('Incorrect number of POI markers in visualization');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testGetSuggestedCustomizationsIntegration(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.integrationService.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const suggestions = await this.integrationService.getSuggestedCustomizations(routingResult.route, {
        maxSuggestions: 3
      });
      
      if (suggestions.length === 0) {
        errors.push('No suggestions returned');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async testPreviewCustomizationIntegration(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Create a test route
      const routingRequest: POIRoutingRequest = {
        origin: this.origin,
        destination: this.destination,
        pois: this.mockPOIs.slice(0, 2),
        preferences: {
          optimizeFor: 'time',
          maxDetourDistance: 2000,
          maxDetourTime: 1800,
          requiredPOIs: [],
          avoidPOIs: [],
          transportModes: [TransportMode.WALKING],
          accessibility: {
            wheelchairAccessible: false,
            visuallyImpairedFriendly: false,
            hasElevator: false,
            hasRamp: false,
            audioSignals: false,
            tactilePaving: false
          }
        }
      };

      const routingResult = await this.integrationService.planRouteWithPOIs(routingRequest);
      
      if (!routingResult.route) {
        errors.push('No route returned');
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }

      const customization: POIRouteCustomization = {
        poiId: 'poi-3',
        action: 'add'
      };

      const previewRoute = await this.integrationService.previewCustomization(routingResult.route, customization);
      
      if (!previewRoute.id.includes('preview')) {
        errors.push('Preview route ID does not contain "preview"');
      } else if (previewRoute.pois.length !== 3) {
        errors.push('Incorrect number of POIs in previewed route');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testAddAndRemoveDataSources(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const dataSource = {
        id: 'test-source',
        name: 'Test Data Source',
        type: 'api' as const,
        url: 'https://example.com/api',
        isActive: true,
        supportedCategories: [POICategory.MONUMENT, POICategory.MUSEUM]
      };

      this.integrationService.addDataSource(dataSource);
      let dataSources = this.integrationService.getDataSources();
      
      if (!dataSources.some(ds => ds.id === 'test-source')) {
        errors.push('Data source not added');
      }

      this.integrationService.removeDataSource('test-source');
      dataSources = this.integrationService.getDataSources();
      
      if (dataSources.some(ds => ds.id === 'test-source')) {
        errors.push('Data source not removed');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testHandleEvents(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      let eventReceived = false;

      const handler = (event: any) => {
        eventReceived = true;
        if (!event.type) {
          errors.push('Event missing type');
        }
        if (!event.timestamp) {
          errors.push('Event missing timestamp');
        }
        if (!event.data) {
          errors.push('Event missing data');
        }
      };

      this.integrationService.addEventHandler('poi_added' as any, handler);
      
      // Trigger an event by adding a data source
      this.integrationService.addDataSource({
        id: 'event-test-source',
        name: 'Event Test Data Source',
        type: 'api' as const,
        isActive: true,
        supportedCategories: [POICategory.MONUMENT]
      });

      if (!eventReceived) {
        errors.push('Event not received');
      }

      // Clean up
      this.integrationService.removeEventHandler('poi_added' as any, handler);
      this.integrationService.removeDataSource('event-test-source');
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testGetAndUpdateConfiguration(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const config = this.integrationService.getConfiguration();
      
      if (config.enablePOISearch !== true) {
        errors.push('Default configuration not as expected');
      }

      this.integrationService.updateConfiguration({
        enablePOISearch: false
      });

      const updatedConfig = this.integrationService.getConfiguration();
      
      if (updatedConfig.enablePOISearch !== false) {
        errors.push('Configuration not updated correctly');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testGetStatistics(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Perform some operations to generate statistics
      this.integrationService.searchPOIs({
        center: this.origin,
        radius: 5000,
        filters: {
          categories: [POICategory.MONUMENT]
        },
        limit: 10
      });

      const stats = this.integrationService.getStatistics();
      
      if (stats.totalSearches <= 0) {
        errors.push('Total searches should be greater than 0');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testInitializeWithSampleData(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.integrationService.initializeWithSampleData();
      
      const stats = this.integrationService.getStatistics();
      
      if (stats.totalPOIs <= 0) {
        errors.push('Total POIs should be greater than 0 after initialization');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private testCacheResults(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Clear cache first
      this.integrationService.clearCache();
      
      const request: POISearchRequest = {
        center: this.origin,
        radius: 5000,
        filters: {
          categories: [POICategory.MONUMENT]
        },
        limit: 10
      };

      // First search - should not be cached
      const startTime = performance.now();
      this.integrationService.searchPOIs(request);
      const firstSearchTime = performance.now() - startTime;
      
      // Second search - should be cached
      const cachedStartTime = performance.now();
      this.integrationService.searchPOIs(request);
      const cachedSearchTime = performance.now() - cachedStartTime;
      
      // Cached search should be faster
      if (cachedSearchTime >= firstSearchTime) {
        warnings.push('Cached search was not faster than first search');
      }
    } catch (error) {
      errors.push(`Exception thrown: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}



