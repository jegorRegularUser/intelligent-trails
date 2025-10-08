/**
 * Accessibility Manager for the multi-modal routing application
 * Handles accessibility preferences, constraints, and barrier avoidance
 */

import {
  MobilityDevice,
  UserConstraints,
  DetailedUserPreferences,
  PreferenceCategory
} from '../types/preferences';
import {
  MultiModalRoute,
  RouteSegment,
  RouteInstruction,
  InstructionType
} from '../types/routing';
import {
  MultiModalGraph,
  GraphNode,
  GraphEdge,
  TransportMode,
  AccessibilityInfo,
  Coordinate
} from '../types/graph';

/**
 * Accessibility barrier types
 */
export enum AccessibilityBarrierType {
  STAIRS = 'stairs',
    STEEP_SLOPE = 'steep_slope',
    NARROW_PATH = 'narrow_path',
    UNEVEN_SURFACE = 'uneven_surface',
    MISSING_RAMP = 'missing_ramp',
    MISSING_ELEVATOR = 'missing_elevator',
    NARROW_DOORWAY = 'narrow_doorway',
    HIGH_CURB = 'high_curb',
    MISSING_TACTILE_PAVING = 'missing_tactile_paving',
    MISSING_AUDIO_SIGNALS = 'missing_audio_signals',
    INSUFFICIENT_LIGHTING = 'insufficient_lighting',
    CROWDED_SPACE = 'crowded_space',
    CONSTRUCTION = 'construction',
    TEMPORARY_OBSTACLE = 'temporary_obstacle'
}

/**
 * Accessibility barrier information
 */
export interface AccessibilityBarrier {
  id: string;
  type: AccessibilityBarrierType;
  location: Coordinate;
  radius: number; // in meters
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  temporary?: boolean;
  expiresAt?: Date;
  reportedAt: Date;
  reportedBy?: string; // user ID
  verified?: boolean;
  alternatives?: {
    type: 'detour' | 'elevator' | 'ramp' | 'alternative_path';
    location: Coordinate;
    distance: number; // additional distance in meters
    description: string;
  }[];
}

/**
 * Accessibility requirement levels
 */
export enum AccessibilityRequirementLevel {
  NONE = 'none',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Accessibility requirements for different mobility devices
 */
export interface AccessibilityRequirements {
  deviceType: MobilityDevice['type'];
  requirementLevel: AccessibilityRequirementLevel;
  maxSlope?: number; // in percentage
  minPathWidth?: number; // in cm
  maxStepHeight?: number; // in cm
  minDoorWidth?: number; // in cm
  requiresHandrails?: boolean;
  requiresRestAreas?: boolean;
  maxContinuousDistance?: number; // in meters
  requiresEvenSurface?: boolean;
  requiresGoodLighting?: boolean;
  requiresLowNoise?: boolean;
  requiresTactilePaving?: boolean;
  requiresAudioSignals?: boolean;
  requiresVisualGuidance?: boolean;
  avoidCrowds?: boolean;
}

/**
 * Accessibility validation result for a route segment
 */
export interface AccessibilityValidationResult {
  isValid: boolean;
  barriers: AccessibilityBarrier[];
  violations: {
    type: AccessibilityBarrierType;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }[];
  accessibilityScore: number; // 0-1
  adjustments?: {
    type: 'avoid' | 'detour' | 'alternative_mode';
    description: string;
    additionalDistance?: number; // in meters
    additionalTime?: number; // in seconds
  }[];
}

/**
 * Accessibility-aware route options
 */
export interface AccessibilityRouteOptions {
  prioritizeAccessibility: boolean;
  avoidBarriers: boolean;
  showAlternatives: boolean;
  maxDetourDistance?: number; // in meters
  maxDetourTime?: number; // in seconds
  barrierTolerance: 'none' | 'low' | 'medium' | 'high';
}

/**
 * Accessibility manager class
 */
export class AccessibilityManager {
  private graph: MultiModalGraph;
  private barriers: Map<string, AccessibilityBarrier> = new Map();
  private requirements: Map<MobilityDevice['type'], AccessibilityRequirements> = new Map();
  private accessibilityCache: Map<string, AccessibilityValidationResult> = new Map();

  constructor(graph: MultiModalGraph) {
    this.graph = graph;
    this.initializeRequirements();
    this.loadBarriers();
  }

  /**
   * Initialize accessibility requirements for different mobility devices
   */
  private initializeRequirements(): void {
    // Wheelchair requirements
    this.requirements.set('wheelchair', {
      deviceType: 'wheelchair',
      requirementLevel: AccessibilityRequirementLevel.HIGH,
      maxSlope: 6, // 6% maximum slope
      minPathWidth: 90, // 90cm minimum path width
      maxStepHeight: 2, // 2cm maximum step height
      minDoorWidth: 80, // 80cm minimum door width
      requiresHandrails: true,
      requiresRestAreas: true,
      maxContinuousDistance: 1000, // 1km maximum continuous distance
      requiresEvenSurface: true,
      requiresGoodLighting: false,
      requiresLowNoise: false,
      requiresTactilePaving: true,
      requiresAudioSignals: false,
      requiresVisualGuidance: false,
      avoidCrowds: true
    });

    // Scooter requirements
    this.requirements.set('scooter', {
      deviceType: 'scooter',
      requirementLevel: AccessibilityRequirementLevel.MEDIUM,
      maxSlope: 8, // 8% maximum slope
      minPathWidth: 80, // 80cm minimum path width
      maxStepHeight: 3, // 3cm maximum step height
      minDoorWidth: 75, // 75cm minimum door width
      requiresHandrails: false,
      requiresRestAreas: true,
      maxContinuousDistance: 2000, // 2km maximum continuous distance
      requiresEvenSurface: true,
      requiresGoodLighting: false,
      requiresLowNoise: false,
      requiresTactilePaving: false,
      requiresAudioSignals: false,
      requiresVisualGuidance: false,
      avoidCrowds: true
    });

    // Walker requirements
    this.requirements.set('walker', {
      deviceType: 'walker',
      requirementLevel: AccessibilityRequirementLevel.MEDIUM,
      maxSlope: 8, // 8% maximum slope
      minPathWidth: 70, // 70cm minimum path width
      maxStepHeight: 5, // 5cm maximum step height
      minDoorWidth: 70, // 70cm minimum door width
      requiresHandrails: true,
      requiresRestAreas: true,
      maxContinuousDistance: 500, // 500m maximum continuous distance
      requiresEvenSurface: true,
      requiresGoodLighting: true,
      requiresLowNoise: false,
      requiresTactilePaving: false,
      requiresAudioSignals: false,
      requiresVisualGuidance: false,
      avoidCrowds: false
    });

    // Stroller requirements
    this.requirements.set('stroller', {
      deviceType: 'stroller',
      requirementLevel: AccessibilityRequirementLevel.LOW,
      maxSlope: 10, // 10% maximum slope
      minPathWidth: 75, // 75cm minimum path width
      maxStepHeight: 10, // 10cm maximum step height
      minDoorWidth: 75, // 75cm minimum door width
      requiresHandrails: false,
      requiresRestAreas: false,
      maxContinuousDistance: 2000, // 2km maximum continuous distance
      requiresEvenSurface: false,
      requiresGoodLighting: false,
      requiresLowNoise: false,
      requiresTactilePaving: false,
      requiresAudioSignals: false,
      requiresVisualGuidance: false,
      avoidCrowds: false
    });

    // No device requirements
    this.requirements.set('none', {
      deviceType: 'none',
      requirementLevel: AccessibilityRequirementLevel.NONE,
      maxSlope: 15, // 15% maximum slope
      minPathWidth: 60, // 60cm minimum path width
      maxStepHeight: 20, // 20cm maximum step height
      minDoorWidth: 60, // 60cm minimum door width
      requiresHandrails: false,
      requiresRestAreas: false,
      maxContinuousDistance: 5000, // 5km maximum continuous distance
      requiresEvenSurface: false,
      requiresGoodLighting: false,
      requiresLowNoise: false,
      requiresTactilePaving: false,
      requiresAudioSignals: false,
      requiresVisualGuidance: false,
      avoidCrowds: false
    });
  }

  /**
   * Load accessibility barriers from storage
   */
  private loadBarriers(): void {
    try {
      const storage = typeof window !== 'undefined' ? window.localStorage : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null
      };

      const barriersData = storage.getItem('accessibilityBarriers');
      if (barriersData) {
        const barriers: AccessibilityBarrier[] = JSON.parse(barriersData);
        barriers.forEach(barrier => {
          barrier.reportedAt = new Date(barrier.reportedAt);
          if (barrier.expiresAt) {
            barrier.expiresAt = new Date(barrier.expiresAt);
          }
          this.barriers.set(barrier.id, barrier);
        });
      }
    } catch (error) {
      console.error('Failed to load accessibility barriers:', error);
    }
  }

  /**
   * Save accessibility barriers to storage
   */
  private saveBarriers(): void {
    try {
      const storage = typeof window !== 'undefined' ? window.localStorage : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null
      };

      const barriers = Array.from(this.barriers.values());
      storage.setItem('accessibilityBarriers', JSON.stringify(barriers));
    } catch (error) {
      console.error('Failed to save accessibility barriers:', error);
    }
  }

  /**
   * Get accessibility requirements for a mobility device
   */
  public getAccessibilityRequirements(deviceType: MobilityDevice['type']): AccessibilityRequirements | null {
    return this.requirements.get(deviceType) || null;
  }

  /**
   * Add a new accessibility barrier
   */
  public addBarrier(barrier: Omit<AccessibilityBarrier, 'id' | 'reportedAt'>): string {
    const newBarrier: AccessibilityBarrier = {
      ...barrier,
      id: `barrier-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      reportedAt: new Date()
    };

    this.barriers.set(newBarrier.id, newBarrier);
    this.saveBarriers();
    
    // Clear accessibility cache as barriers have changed
    this.accessibilityCache.clear();

    return newBarrier.id;
  }

  /**
   * Update an accessibility barrier
   */
  public updateBarrier(barrierId: string, updates: Partial<AccessibilityBarrier>): boolean {
    const barrier = this.barriers.get(barrierId);
    if (!barrier) return false;

    Object.assign(barrier, updates);
    this.barriers.set(barrierId, barrier);
    this.saveBarriers();
    
    // Clear accessibility cache as barriers have changed
    this.accessibilityCache.clear();

    return true;
  }

  /**
   * Remove an accessibility barrier
   */
  public removeBarrier(barrierId: string): boolean {
    const removed = this.barriers.delete(barrierId);
    if (removed) {
      this.saveBarriers();
      
      // Clear accessibility cache as barriers have changed
      this.accessibilityCache.clear();
    }
    return removed;
  }

  /**
   * Get all accessibility barriers
   */
  public getBarriers(): AccessibilityBarrier[] {
    // Filter out expired barriers
    const now = new Date();
    const activeBarriers = Array.from(this.barriers.values()).filter(barrier => {
      if (barrier.temporary && barrier.expiresAt) {
        return barrier.expiresAt > now;
      }
      return true;
    });

    // Update barriers map to remove expired barriers
    const expiredCount = this.barriers.size - activeBarriers.length;
    if (expiredCount > 0) {
      this.barriers.clear();
      activeBarriers.forEach(barrier => {
        this.barriers.set(barrier.id, barrier);
      });
      this.saveBarriers();
    }

    return activeBarriers;
  }

  /**
   * Get barriers in a specific area
   */
  public getBarriersInArea(center: Coordinate, radius: number): AccessibilityBarrier[] {
    const allBarriers = this.getBarriers();
    
    return allBarriers.filter(barrier => {
      const distance = this.calculateDistance(center, barrier.location);
      return distance <= radius + barrier.radius;
    });
  }

  /**
   * Calculate distance between two coordinates
   */
  private calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
    const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000; // Return distance in meters
  }

  /**
   * Validate route segment for accessibility
   */
  public validateSegmentAccessibility(
    segment: RouteSegment,
    constraints: UserConstraints
  ): AccessibilityValidationResult {
    // Check cache first
    const cacheKey = `${segment.id}-${JSON.stringify(constraints.mobilityDevice)}`;
    const cachedResult = this.accessibilityCache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    const requirements = this.getAccessibilityRequirements(constraints.mobilityDevice.type);
    if (!requirements) {
      return {
        isValid: true,
        barriers: [],
        violations: [],
        accessibilityScore: 1.0
      };
    }

    const barriers: AccessibilityBarrier[] = [];
    const violations: AccessibilityValidationResult['violations'] = [];
    let accessibilityScore = 1.0;

    // Get barriers that affect this segment
    const segmentBarriers = this.getBarriersInSegment(segment);
    barriers.push(...segmentBarriers);

    // Check for violations based on requirements
    const edge = this.graph.edges.get(segment.id);
    if (edge) {
      // Check slope
      if (requirements.maxSlope && edge.properties.gradient && Math.abs(edge.properties.gradient) > requirements.maxSlope) {
        violations.push({
          type: AccessibilityBarrierType.STEEP_SLOPE,
          severity: 'high',
          description: `Slope of ${Math.abs(edge.properties.gradient)}% exceeds maximum of ${requirements.maxSlope}%`
        });
        accessibilityScore -= 0.2;
      }

      // Check surface
      if (requirements.requiresEvenSurface && edge.properties.surface === 'unpaved') {
        violations.push({
          type: AccessibilityBarrierType.UNEVEN_SURFACE,
          severity: 'medium',
          description: 'Uneven surface not suitable for mobility device'
        });
        accessibilityScore -= 0.15;
      }

      // Check for stairs (inferred from lack of accessibility features)
      if (!segment.accessibility.hasElevator && !segment.accessibility.hasRamp) {
        violations.push({
          type: AccessibilityBarrierType.STAIRS,
          severity: 'critical',
          description: 'Stairs detected without elevator or ramp access'
        });
        accessibilityScore -= 0.3;
      }

      // Check width requirements
      if (requirements.minPathWidth) {
        // This would require additional data about path width
        // For now, we'll assume it's adequate unless there's a narrow path barrier
        const hasNarrowPath = segmentBarriers.some(b => b.type === AccessibilityBarrierType.NARROW_PATH);
        if (hasNarrowPath) {
          violations.push({
            type: AccessibilityBarrierType.NARROW_PATH,
            severity: 'high',
            description: `Path width less than minimum required ${requirements.minPathWidth}cm`
          });
          accessibilityScore -= 0.2;
        }
      }
    }

    // Check accessibility features
    if (requirements.requiresTactilePaving && !segment.accessibility.tactilePaving) {
      violations.push({
        type: AccessibilityBarrierType.MISSING_TACTILE_PAVING,
        severity: 'medium',
        description: 'Tactile paving missing for visually impaired users'
      });
      accessibilityScore -= 0.1;
    }

    if (requirements.requiresAudioSignals && !segment.accessibility.audioSignals) {
      violations.push({
        type: AccessibilityBarrierType.MISSING_AUDIO_SIGNALS,
        severity: 'medium',
        description: 'Audio signals missing for visually impaired users'
      });
      accessibilityScore -= 0.1;
    }

    // Check for barriers that affect accessibility
    segmentBarriers.forEach(barrier => {
      switch (barrier.type) {
        case AccessibilityBarrierType.STAIRS:
          if (requirements.deviceType !== 'none') {
            accessibilityScore -= 0.3;
          }
          break;
        case AccessibilityBarrierType.STEEP_SLOPE:
          if (requirements.maxSlope) {
            accessibilityScore -= 0.2;
          }
          break;
        case AccessibilityBarrierType.NARROW_PATH:
          if (requirements.minPathWidth) {
            accessibilityScore -= 0.2;
          }
          break;
        case AccessibilityBarrierType.UNEVEN_SURFACE:
          if (requirements.requiresEvenSurface) {
            accessibilityScore -= 0.15;
          }
          break;
        case AccessibilityBarrierType.MISSING_RAMP:
          if (requirements.deviceType === 'wheelchair' || requirements.deviceType === 'scooter') {
            accessibilityScore -= 0.25;
          }
          break;
        case AccessibilityBarrierType.MISSING_ELEVATOR:
          if (requirements.deviceType === 'wheelchair') {
            accessibilityScore -= 0.25;
          }
          break;
        case AccessibilityBarrierType.CROWDED_SPACE:
          if (requirements.avoidCrowds) {
            accessibilityScore -= 0.1;
          }
          break;
        case AccessibilityBarrierType.CONSTRUCTION:
          accessibilityScore -= 0.2;
          break;
      }
    });

    // Ensure accessibility score is within bounds
    accessibilityScore = Math.max(0, Math.min(1, accessibilityScore));

    // Generate adjustments if needed
    const adjustments: AccessibilityValidationResult['adjustments'] = [];
    if (violations.length > 0) {
      // Generate detour suggestions for critical violations
      const criticalViolations = violations.filter(v => v.severity === 'critical');
      if (criticalViolations.length > 0) {
        adjustments.push({
          type: 'detour',
          description: 'Consider taking an alternative route to avoid critical barriers',
          additionalDistance: 200, // Estimated additional distance
          additionalTime: 300 // Estimated additional time in seconds
        });
      }

      // Generate mode change suggestions
      if (requirements.deviceType === 'wheelchair' && segment.mode === TransportMode.WALKING) {
        adjustments.push({
          type: 'alternative_mode',
          description: 'Consider using public transport for this segment',
          additionalTime: 120 // Estimated additional time for transfers
        });
      }
    }

    const result: AccessibilityValidationResult = {
      isValid: violations.length === 0,
      barriers,
      violations,
      accessibilityScore,
      adjustments: adjustments.length > 0 ? adjustments : undefined
    };

    // Cache the result
    this.accessibilityCache.set(cacheKey, result);

    return result;
  }

  /**
   * Get barriers that affect a route segment
   */
  private getBarriersInSegment(segment: RouteSegment): AccessibilityBarrier[] {
    const barriers: AccessibilityBarrier[] = [];
    
    // Check barriers along the segment path
    // For simplicity, we'll check barriers near the start, middle, and end of the segment
    const pointsToCheck = [
      segment.fromCoordinate,
      {
        latitude: (segment.fromCoordinate.latitude + segment.toCoordinate.latitude) / 2,
        longitude: (segment.fromCoordinate.longitude + segment.toCoordinate.longitude) / 2
      },
      segment.toCoordinate
    ];

    const allBarriers = this.getBarriers();
    
    pointsToCheck.forEach(point => {
      allBarriers.forEach(barrier => {
        const distance = this.calculateDistance(point, barrier.location);
        if (distance <= barrier.radius + 20) { // 20m buffer around the segment
          barriers.push(barrier);
        }
      });
    });

    // Remove duplicates
    const uniqueBarriers = barriers.filter((barrier, index, self) =>
      index === self.findIndex(b => b.id === barrier.id)
    );

    return uniqueBarriers;
  }

  /**
   * Validate entire route for accessibility
   */
  public validateRouteAccessibility(
    route: MultiModalRoute,
    constraints: UserConstraints
  ): {
    isValid: boolean;
    segmentResults: Map<string, AccessibilityValidationResult>;
    overallScore: number;
    criticalBarriers: AccessibilityBarrier[];
    recommendations: string[];
  } {
    const segmentResults = new Map<string, AccessibilityValidationResult>();
    let totalScore = 0;
    const criticalBarriers: AccessibilityBarrier[] = [];
    const recommendations: string[] = [];

    // Validate each segment
    route.segments.forEach(segment => {
      const result = this.validateSegmentAccessibility(segment, constraints);
      segmentResults.set(segment.id, result);
      totalScore += result.accessibilityScore;

      // Collect critical barriers
      result.barriers.forEach(barrier => {
        if (barrier.severity === 'critical') {
          criticalBarriers.push(barrier);
        }
      });

      // Collect recommendations
      if (result.adjustments) {
        result.adjustments.forEach(adjustment => {
          if (!recommendations.includes(adjustment.description)) {
            recommendations.push(adjustment.description);
          }
        });
      }
    });

    // Calculate overall score
    const overallScore = route.segments.length > 0 ? totalScore / route.segments.length : 1;

    // Generate additional recommendations based on overall route
    if (overallScore < 0.5) {
      recommendations.push('This route has significant accessibility challenges. Consider an alternative route.');
    }

    if (criticalBarriers.length > 0) {
      recommendations.push('Critical accessibility barriers detected. Route may not be suitable for your mobility device.');
    }

    if (constraints.maxWalkingDistance && route.totalWalkingDistance > constraints.maxWalkingDistance) {
      recommendations.push(`Total walking distance exceeds your maximum of ${constraints.maxWalkingDistance}m.`);
    }

    return {
      isValid: overallScore >= 0.7 && criticalBarriers.length === 0,
      segmentResults,
      overallScore,
      criticalBarriers,
      recommendations
    };
  }

  /**
   * Generate accessibility-aware route instructions
   */
  public generateAccessibilityInstructions(
    segment: RouteSegment,
    constraints: UserConstraints
  ): RouteInstruction[] {
    const baseInstructions = segment.instructions;
    const accessibilityResult = this.validateSegmentAccessibility(segment, constraints);
    const enhancedInstructions: RouteInstruction[] = [];

    // Enhance existing instructions with accessibility information
    baseInstructions.forEach(instruction => {
      const enhancedInstruction = { ...instruction };

      // Add accessibility-specific guidance
      if (accessibilityResult.violations.length > 0) {
        const accessibilityNotes: string[] = [];

        accessibilityResult.violations.forEach(violation => {
          switch (violation.type) {
            case AccessibilityBarrierType.STAIRS:
              accessibilityNotes.push('Caution: Stairs ahead');
              break;
            case AccessibilityBarrierType.STEEP_SLOPE:
              accessibilityNotes.push('Caution: Steep slope ahead');
              break;
            case AccessibilityBarrierType.NARROW_PATH:
              accessibilityNotes.push('Caution: Narrow path ahead');
              break;
            case AccessibilityBarrierType.UNEVEN_SURFACE:
              accessibilityNotes.push('Caution: Uneven surface ahead');
              break;
          }
        });

        if (accessibilityNotes.length > 0) {
          enhancedInstruction.text += ` (${accessibilityNotes.join(', ')})`;
        }
      }

      // Add accessibility-specific instructions
      if (constraints.mobilityDevice.type === 'wheelchair') {
        if (instruction.type === InstructionType.USE_ELEVATOR) {
          enhancedInstruction.text += ' Use elevator for wheelchair access';
        } else if (instruction.type === InstructionType.USE_RAMP) {
          enhancedInstruction.text += ' Use ramp for wheelchair access';
        }
      }

      enhancedInstructions.push(enhancedInstruction);
    });

    // Add additional instructions for barriers
    accessibilityResult.barriers.forEach(barrier => {
      if (barrier.alternatives) {
        barrier.alternatives.forEach(alternative => {
          enhancedInstructions.push({
            id: `alt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: InstructionType.CONTINUE_STRAIGHT,
            text: `Alternative: ${alternative.description}`,
            distance: alternative.distance,
            duration: 60, // Estimated time for alternative
            maneuver: {
              type: InstructionType.CONTINUE_STRAIGHT
            },
            landmarks: [],
            accessibilityInfo: segment.accessibility,
            coordinate: alternative.location,
            streetName: segment.properties.routeName
          });
        });
      }
    });

    return enhancedInstructions;
  }

  /**
   * Optimize user preferences for accessibility
   */
  public optimizePreferencesForAccessibility(
    preferences: DetailedUserPreferences,
    constraints: UserConstraints
  ): DetailedUserPreferences {
    const optimizedPreferences = { ...preferences };

    // Adjust weights based on mobility device
    if (constraints.mobilityDevice.type !== 'none') {
      // Increase accessibility weight
      optimizedPreferences.weights.accessibility = Math.max(
        optimizedPreferences.weights.accessibility,
        0.4
      );

      // Increase safety weight
      optimizedPreferences.weights.safety = Math.max(
        optimizedPreferences.weights.safety,
        0.3
      );

      // Decrease speed weight
      optimizedPreferences.weights.speed = Math.min(
        optimizedPreferences.weights.speed,
        0.2
      );

      // Ensure accessibility constraints are set
      optimizedPreferences.requireWheelchairAccessibility = 
        constraints.mobilityDevice.type === 'wheelchair';
      optimizedPreferences.avoidStairs = true;

      // Adjust transport mode preferences
      if (constraints.mobilityDevice.type === 'wheelchair') {
        optimizedPreferences.transportModes.preferredModes = [
          TransportMode.BUS,
          TransportMode.METRO,
          TransportMode.TRAM,
          TransportMode.TRAIN
        ];
        optimizedPreferences.transportModes.avoidedModes = [
          TransportMode.WALKING,
          TransportMode.BICYCLE
        ];
      }
    }

    // Normalize weights to ensure they sum to 1
    const totalWeight = Object.values(optimizedPreferences.weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      const scale = 1.0 / totalWeight;
      Object.keys(optimizedPreferences.weights).forEach(key => {
        optimizedPreferences.weights[key as keyof typeof optimizedPreferences.weights] *= scale;
      });
    }

    return optimizedPreferences;
  }

  /**
   * Get accessibility score for a transport mode
   */
  public getTransportModeAccessibilityScore(mode: TransportMode, deviceType: MobilityDevice['type']): number {
    if (deviceType === 'none') {
      return 1.0; // No accessibility constraints
    }

    // Accessibility scores for different transport modes (0-1, higher is better)
    const scores: Record<TransportMode, Record<MobilityDevice['type'], number>> = {
      [TransportMode.WALKING]: {
        wheelchair: 0.3,
        scooter: 0.4,
        walker: 0.6,
        stroller: 0.7,
        none: 1.0
      },
      [TransportMode.BICYCLE]: {
        wheelchair: 0.1,
        scooter: 0.2,
        walker: 0.2,
        stroller: 0.3,
        none: 1.0
      },
      [TransportMode.CAR]: {
        wheelchair: 0.9,
        scooter: 0.9,
        walker: 0.9,
        stroller: 0.9,
        none: 1.0
      },
      [TransportMode.BUS]: {
        wheelchair: 0.7,
        scooter: 0.8,
        walker: 0.8,
        stroller: 0.8,
        none: 1.0
      },
      [TransportMode.METRO]: {
        wheelchair: 0.8,
        scooter: 0.8,
        walker: 0.8,
        stroller: 0.8,
        none: 1.0
      },
      [TransportMode.TRAM]: {
        wheelchair: 0.6,
        scooter: 0.7,
        walker: 0.7,
        stroller: 0.7,
        none: 1.0
      },
      [TransportMode.TRAIN]: {
        wheelchair: 0.8,
        scooter: 0.8,
        walker: 0.8,
        stroller: 0.8,
        none: 1.0
      },
      [TransportMode.FERRY]: {
        wheelchair: 0.7,
        scooter: 0.7,
        walker: 0.7,
        stroller: 0.7,
        none: 1.0
      }
    };

    return scores[mode]?.[deviceType] || 0.5;
  }

  /**
   * Clear accessibility cache
   */
  public clearCache(): void {
    this.accessibilityCache.clear();
  }
}