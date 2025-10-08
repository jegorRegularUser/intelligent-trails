/**
 * Walking routing handler implementation
 * Implements pedestrian routing with sidewalk preferences and accessibility considerations
 */

import {
  GraphNode,
  GraphEdge,
  TransportMode,
  RealTimeEdgeData
} from '../types/graph';
import {
  RouteInstruction,
  InstructionType,
  Maneuver,
  UserPreferences,
  RouteConstraints
} from '../types/routing';
import { TransportModeHandler, RoutingContext, TransportModeParameters, EdgeValidationResult, NodeValidationResult } from './TransportModeHandler';

/**
 * Pedestrian infrastructure information
 */
export interface PedestrianInfrastructure {
  hasSidewalk?: boolean;
  sidewalkType?: 'none' | 'both' | 'left' | 'right';
  sidewalkWidth?: number; // in meters
  surfaceType?: 'paved' | 'unpaved' | 'gravel' | 'dirt' | 'cobblestone';
  crossingType?: 'marked' | 'unmarked' | 'traffic_light' | 'crosswalk' | 'overpass' | 'underpass';
  hasRamp?: boolean;
  hasElevator?: boolean;
  hasStairs?: boolean;
  hasHandrail?: boolean;
  tactilePaving?: boolean;
  audioSignals?: boolean;
  lighting?: boolean;
  covered?: boolean;
  seating?: boolean;
  drinkingWater?: boolean;
  publicToilet?: boolean;
  difficulty?: 'easy' | 'moderate' | 'hard';
  elevationGain?: number; // in meters
  elevationLoss?: number; // in meters
  maxGrade?: number; // in percentage
  stepCount?: number;
}

/**
 * Walking-specific routing parameters
 */
export interface WalkingRoutingParameters extends TransportModeParameters {
  avoidStairs?: boolean;
  maxGrade?: number; // maximum grade in percentage
  preferredSurfaceTypes?: string[];
  avoidedSurfaceTypes?: string[];
  requireSidewalk?: boolean;
  avoidBusyRoads?: boolean;
  maxDistance?: number; // maximum walking distance
  walkingSpeed?: 'slow' | 'normal' | 'fast' | 'custom';
  customWalkingSpeed?: number; // in meters per second
  considerElevation?: boolean;
  minimizeEffort?: boolean;
  prioritizeSafety?: boolean;
  prioritizeAccessibility?: boolean;
  usePedestrianInfrastructure?: boolean;
  maxStepCount?: number; // maximum number of stairs
  avoidUnlitAreas?: boolean;
  avoidPoorSurfaces?: boolean;
}

/**
 * Walking routing handler implementation
 */
export class WalkingRoutingHandler extends TransportModeHandler {
  constructor() {
    super(TransportMode.WALKING);
  }

  /**
   * Validate if an edge can be used by walking
   */
  validateEdge(edge: GraphEdge, context: RoutingContext): EdgeValidationResult {
    // Skip if edge is not for walking mode
    if (edge.mode !== TransportMode.WALKING) {
      return { isValid: false, reason: 'Edge not suitable for walking' };
    }

    const parameters = context.preferences as unknown as WalkingRoutingParameters;
    const { constraints } = context;

    // Check distance constraints
    if (edge.distance > constraints.maxWalkingDistance) {
      return { isValid: false, reason: 'Edge exceeds maximum walking distance constraint' };
    }

    // Check sidewalk requirements
    if (parameters.requireSidewalk && !edge.accessibility.hasRamp) {
      return { isValid: false, reason: 'Edge does not have required sidewalk' };
    }

    // Check stairs avoidance
    if (parameters.avoidStairs && !edge.accessibility.hasRamp) {
      return { isValid: false, reason: 'Edge has stairs and user wants to avoid them' };
    }

    // Check surface type preferences
    if (parameters.avoidedSurfaceTypes?.includes(edge.properties.surface || '')) {
      return { isValid: false, reason: 'Edge has avoided surface type' };
    }

    // Check grade/elevation constraints
    if (parameters.maxGrade && edge.properties.gradient) {
      const gradePercentage = Math.abs(edge.properties.gradient) * 100;
      if (gradePercentage > parameters.maxGrade) {
        return { isValid: false, reason: 'Edge exceeds maximum grade constraint' };
      }
    }

    // Check if edge is blocked by real-time data
    if (edge.realTimeData?.blocked) {
      return { isValid: false, reason: 'Edge is blocked due to real-time conditions' };
    }

    // Check cost constraints
    if (edge.cost > constraints.maxCost) {
      return { isValid: false, reason: 'Edge exceeds maximum cost constraint' };
    }

    return { isValid: true };
  }

  /**
   * Validate if a node can be used by walking
   */
  validateNode(node: GraphNode, context: RoutingContext): NodeValidationResult {
    // Skip if node doesn't support walking mode
    if (!node.modes.includes(TransportMode.WALKING)) {
      return { isValid: false, reason: 'Node does not support walking' };
    }

    // Check accessibility requirements
    if (context.preferences.requireWheelchairAccessibility && 
        !node.accessibility.wheelchairAccessible) {
      return { isValid: false, reason: 'Node does not meet wheelchair accessibility requirements' };
    }

    // Check stairs avoidance
    const parameters = context.preferences as unknown as WalkingRoutingParameters;
    if (parameters.avoidStairs && !node.accessibility.hasRamp && !node.accessibility.hasElevator) {
      return { isValid: false, reason: 'Node has stairs and user wants to avoid them' };
    }

    return { isValid: true };
  }

  /**
   * Calculate the cost of traversing an edge by walking
   */
  calculateEdgeCost(
    edge: GraphEdge,
    context: RoutingContext,
    parameters?: WalkingRoutingParameters
  ): number {
    let cost = edge.cost || 0;

    // Base cost is time
    cost = this.calculateEdgeTime(edge, context, parameters);

    // Add effort cost based on elevation
    if (parameters?.considerElevation && edge.properties.gradient) {
      // Uphill requires more effort
      if (edge.properties.gradient > 0) {
        cost *= (1 + edge.properties.gradient * 4);
      }
      // Downhill is easier but requires caution
      else if (edge.properties.gradient < 0) {
        cost *= (1 - edge.properties.gradient * 0.3);
      }
    }

    // Add surface type cost
    if (edge.properties.surface) {
      const surfaceCosts: Record<string, number> = {
        'paved': 1.0,
        'asphalt': 1.0,
        'concrete': 1.0,
        'gravel': 1.4,
        'dirt': 1.6,
        'cobblestone': 2.0
      };
      
      const surfaceCost = surfaceCosts[edge.properties.surface] || 1.2;
      cost *= surfaceCost;
    }

    // Add infrastructure cost
    if (edge.accessibility.hasRamp) {
      cost *= 0.9; // Discount for accessible paths
    } else if (parameters?.requireSidewalk) {
      cost *= 1.3; // Penalty for missing required sidewalk
    }

    // Add stairs cost
    if (!edge.accessibility.hasRamp && !edge.accessibility.hasElevator) {
      if (parameters?.avoidStairs) {
        cost *= 3.0; // High penalty for stairs if avoided
      } else {
        cost *= 1.5; // Moderate penalty for stairs
      }
    }

    // Add safety cost for busy roads
    if (edge.properties.roadClass === 'primary' || edge.properties.roadClass === 'secondary') {
      cost *= 1.5; // Penalty for busy roads
    }

    // Apply real-time adjustments
    if (edge.realTimeData?.congestionLevel) {
      // Higher congestion means more difficult walking
      cost *= (1 + edge.realTimeData.congestionLevel * 0.5);
    }

    return cost;
  }

  /**
   * Calculate the time to traverse an edge by walking
   */
  calculateEdgeTime(
    edge: GraphEdge,
    context: RoutingContext,
    parameters?: WalkingRoutingParameters
  ): number {
    // Get walking speed
    let walkingSpeed = this.getWalkingSpeed(parameters);

    // Base time calculation
    let time = edge.distance / walkingSpeed;

    // Adjust for elevation
    if (parameters?.considerElevation && edge.properties.gradient) {
      // Uphill is slower
      if (edge.properties.gradient > 0) {
        time *= (1 + edge.properties.gradient * 5);
      }
      // Downhill is slightly faster but with caution
      else if (edge.properties.gradient < 0) {
        time *= (1 - edge.properties.gradient * 0.2);
      }
    }

    // Adjust for surface type
    if (edge.properties.surface) {
      const surfaceMultipliers: Record<string, number> = {
        'paved': 1.0,
        'asphalt': 1.0,
        'concrete': 1.0,
        'gravel': 1.5,
        'dirt': 1.8,
        'cobblestone': 2.2
      };
      
      const multiplier = surfaceMultipliers[edge.properties.surface] || 1.2;
      time *= multiplier;
    }

    // Adjust for stairs
    if (!edge.accessibility.hasRamp && !edge.accessibility.hasElevator) {
      time *= 1.5; // Slower on stairs
    }

    // Apply real-time adjustments
    if (edge.realTimeData?.currentSpeed) {
      // Calculate time based on current speed
      time = edge.distance / edge.realTimeData.currentSpeed;
    }

    return time;
  }

  /**
   * Generate route instructions for traversing an edge by walking
   */
  generateInstructions(
    fromNode: GraphNode,
    toNode: GraphNode,
    edge: GraphEdge,
    context: RoutingContext
  ): RouteInstruction[] {
    const instructions: RouteInstruction[] = [];
    const parameters = context.preferences as unknown as WalkingRoutingParameters;

    // Determine instruction type based on infrastructure
    let instructionType: InstructionType = InstructionType.CONTINUE_STRAIGHT;
    let text = `Continue on ${edge.properties.roadClass || 'path'}`;

    // Generate more specific instructions based on infrastructure
    if (edge.accessibility.hasRamp) {
      instructionType = InstructionType.USE_RAMP;
      text = 'Use ramp';
    } else if (!edge.accessibility.hasRamp && !edge.accessibility.hasElevator) {
      instructionType = InstructionType.USE_STAIRS;
      text = 'Use stairs';
    } else if (edge.accessibility.hasElevator) {
      instructionType = InstructionType.USE_ELEVATOR;
      text = 'Use elevator';
    } else if (edge.properties.roadClass === 'highway') {
      instructionType = InstructionType.CONTINUE_STRAIGHT;
      text = 'Continue on highway path - use caution';
    } else if (edge.properties.roadClass === 'residential') {
      instructionType = InstructionType.CONTINUE_STRAIGHT;
      text = 'Continue on residential street';
    } else if (edge.properties.surface === 'gravel' || edge.properties.surface === 'dirt') {
      instructionType = InstructionType.CONTINUE_STRAIGHT;
      text = `Continue on ${edge.properties.surface} path`;
    }

    // Add elevation information if significant
    if (parameters.considerElevation && edge.properties.gradient) {
      const gradePercentage = Math.abs(edge.properties.gradient) * 100;
      if (gradePercentage > 5) {
        if (edge.properties.gradient > 0) {
          text += ` - uphill ${gradePercentage.toFixed(1)}% grade`;
        } else {
          text += ` - downhill ${gradePercentage.toFixed(1)}% grade`;
        }
      }
    }

    // Create maneuver
    const maneuver: Maneuver = {
      type: instructionType,
      modifier: 'straight'
    };

    // Create instruction
    instructions.push({
      id: `walk-${Date.now()}-${Math.random()}`,
      type: instructionType,
      text,
      distance: edge.distance,
      duration: edge.duration,
      maneuver,
      landmarks: [],
      accessibilityInfo: edge.accessibility,
      coordinate: fromNode.coordinate,
      streetName: edge.properties.roadClass
    });

    return instructions;
  }

  /**
   * Check if a transfer from walking to another mode is possible
   */
  canTransferTo(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): boolean {
    // Can transfer from walking to any other mode
    return true;
  }

  /**
   * Calculate the cost of transferring from walking to another mode
   */
  calculateTransferCost(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): number {
    // Base cost for transferring from walking
    let cost = 30; // 30 seconds equivalent

    // Additional costs based on target mode
    switch (toMode) {
      case TransportMode.BICYCLE:
        cost += 60; // Time to unlock and prepare bicycle
        break;
      case TransportMode.BUS:
      case TransportMode.METRO:
      case TransportMode.TRAM:
      case TransportMode.TRAIN:
        cost += 120; // Time to walk to platform and wait
        break;
      case TransportMode.CAR:
        cost += 90; // Time to walk to car and prepare
        break;
    }

    return cost;
  }

  /**
   * Calculate the time required for transferring from walking to another mode
   */
  calculateTransferTime(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): number {
    // Base time for transferring from walking
    let time = 30; // 30 seconds

    // Additional time based on target mode
    switch (toMode) {
      case TransportMode.BICYCLE:
        time += 60; // Time to unlock and prepare bicycle
        break;
      case TransportMode.BUS:
      case TransportMode.METRO:
      case TransportMode.TRAM:
      case TransportMode.TRAIN:
        time += 180; // Time to walk to platform and wait
        break;
      case TransportMode.CAR:
        time += 120; // Time to walk to car and prepare
        break;
    }

    return time;
  }

  /**
   * Check if walking is available at a given time
   */
  isAvailableAt(time: Date, context: RoutingContext): boolean {
    // Walking is generally available at all times
    // In a real implementation, you might check for:
    // - Pedestrian zone opening hours
    // - Park closing times
    // - Weather conditions
    // - Safety concerns at night
    
    const parameters = context.preferences as unknown as WalkingRoutingParameters;
    
    // Check for time-based restrictions
    const hour = time.getHours();
    
    // Example: Avoid walking at night in unlit areas if safety is a priority
    if (parameters.prioritizeSafety && parameters.avoidUnlitAreas && (hour < 6 || hour > 22)) {
      return false;
    }
    
    return true;
  }

  /**
   * Get the average speed for walking
   */
  getAverageSpeed(context: RoutingContext): number {
    const parameters = context.preferences as unknown as WalkingRoutingParameters;
    return this.getWalkingSpeed(parameters);
  }

  /**
   * Get environmental impact score for walking
   */
  getEnvironmentalImpact(distance: number, context: RoutingContext): number {
    // Walking has zero environmental impact
    return 0;
  }

  /**
   * Get comfort score for walking
   */
  getComfortScore(distance: number, context: RoutingContext): number {
    const parameters = context.preferences as unknown as WalkingRoutingParameters;
    
    // Base comfort score for walking
    let comfort = 0.7;
    
    // Adjust for distance
    if (distance > 5000) { // 5km
      comfort *= 0.8; // Less comfortable on long walks
    }
    
    if (distance > 10000) { // 10km
      comfort *= 0.6; // Much less comfortable on very long walks
    }
    
    // Adjust for surface preferences
    if (parameters.avoidPoorSurfaces) {
      comfort *= 1.1; // More comfortable if avoiding poor surfaces
    }
    
    // Adjust for time of day
    const hour = new Date().getHours();
    if (hour >= 6 && hour <= 18) {
      comfort *= 1.1; // More comfortable during daylight
    } else if (parameters.avoidUnlitAreas) {
      comfort *= 0.8; // Less comfortable at night if unlit areas are avoided
    }
    
    return Math.min(1, comfort);
  }

  /**
   * Get safety score for walking
   */
  getSafetyScore(distance: number, context: RoutingContext): number {
    const parameters = context.preferences as unknown as WalkingRoutingParameters;
    
    // Base safety score for walking
    let safety = 0.6;
    
    // Adjust for infrastructure preferences
    if (parameters.requireSidewalk) {
      safety *= 1.3; // Safer with sidewalks
    }
    
    // Adjust for time of day
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      safety *= 0.6; // Less safe at night
    }
    
    // Adjust for unlit areas
    if (parameters.avoidUnlitAreas) {
      safety *= 1.2; // Safer if avoiding unlit areas
    }
    
    // Adjust for busy roads
    if (parameters.avoidBusyRoads) {
      safety *= 1.2; // Safer if avoiding busy roads
    }
    
    // Adjust for distance
    if (distance > 10000) { // 10km
      safety *= 0.8; // Less safe on very long walks
    }
    
    return Math.min(1, safety);
  }

  /**
   * Get walking speed based on parameters
   */
  private getWalkingSpeed(parameters?: WalkingRoutingParameters): number {
    // Default walking speed in m/s (5 km/h)
    let speed = 1.4;
    
    if (!parameters) {
      return speed;
    }
    
    // Adjust based on walking speed preference
    if (parameters.walkingSpeed) {
      const speedMap: Record<string, number> = {
        'slow': 1.1,    // 4 km/h
        'normal': 1.4,  // 5 km/h
        'fast': 1.7     // 6 km/h
      };
      
      speed = speedMap[parameters.walkingSpeed] || speed;
    }
    
    // Use custom walking speed if provided
    if (parameters.customWalkingSpeed) {
      speed = parameters.customWalkingSpeed;
    }
    
    return speed;
  }
}