/**
 * Bicycle routing handler implementation
 * Implements bicycle-specific routing with bike lane preferences and infrastructure considerations
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
 * Bicycle infrastructure information
 */
export interface BicycleInfrastructure {
  hasBikeLane: boolean;
  hasSeparatedBikeLane: boolean;
  bikePathType?: 'lane' | 'path' | 'shared' | 'shared_bus_lane' | 'shoulder';
  surfaceType?: 'asphalt' | 'concrete' | 'gravel' | 'dirt' | 'cobblestone';
  lighting?: boolean;
  covered?: boolean;
  bikeParking?: boolean;
  bikeRepair?: boolean;
  bikeRental?: boolean;
  drinkingWater?: boolean;
  difficulty?: 'easy' | 'moderate' | 'hard' | 'extreme';
  elevationGain?: number; // in meters
  elevationLoss?: number; // in meters
  maxGrade?: number; // in percentage
}

/**
 * Bicycle-specific routing parameters
 */
export interface BicycleRoutingParameters extends TransportModeParameters {
  avoidHills?: boolean;
  maxGrade?: number; // maximum grade in percentage
  preferredSurfaceTypes?: string[];
  avoidedSurfaceTypes?: string[];
  requireBikeLane?: boolean;
  preferSeparatedBikeLanes?: boolean;
  avoidStairs?: boolean;
  avoidHighways?: boolean;
  avoidBusyRoads?: boolean;
  maxDistance?: number; // maximum cycling distance
  bikeType?: 'road' | 'mountain' | 'hybrid' | 'electric' | 'cargo';
  riderFitness?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  considerElevation?: boolean;
  minimizeEffort?: boolean;
  prioritizeSafety?: boolean;
  useBikeInfrastructure?: boolean;
  maxWalkingWithBike?: number; // maximum distance for walking with bike
}

/**
 * Bicycle routing handler implementation
 */
export class BicycleRoutingHandler extends TransportModeHandler {
  constructor() {
    super(TransportMode.BICYCLE);
  }

  /**
   * Validate if an edge can be used by bicycle
   */
  validateEdge(edge: GraphEdge, context: RoutingContext): EdgeValidationResult {
    // Skip if edge is not for bicycle mode
    if (edge.mode !== TransportMode.BICYCLE) {
      return { isValid: false, reason: 'Edge not suitable for bicycle travel' };
    }

    const parameters = context.preferences as unknown as BicycleRoutingParameters;
    const { constraints } = context;

    // Check distance constraints
    if (edge.distance > constraints.maxCyclingDistance) {
      return { isValid: false, reason: 'Edge exceeds maximum cycling distance constraint' };
    }

    // Check bike lane requirements
    if (parameters.requireBikeLane && !edge.properties.separatedBikeLane) {
      return { isValid: false, reason: 'Edge does not have required bike lane' };
    }

    // Check highway avoidance
    if (edge.properties.roadClass === 'highway' && parameters.avoidHighways) {
      return { isValid: false, reason: 'Edge is a highway and user wants to avoid them' };
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
   * Validate if a node can be used by bicycle
   */
  validateNode(node: GraphNode, context: RoutingContext): NodeValidationResult {
    // Skip if node doesn't support bicycle mode
    if (!node.modes.includes(TransportMode.BICYCLE)) {
      return { isValid: false, reason: 'Node does not support bicycle travel' };
    }

    // Check if node is a bike station or transfer point
    if (node.type !== 'bike_station' && node.type !== 'transfer' && node.type !== 'intersection') {
      return { isValid: false, reason: 'Node is not suitable for bicycle travel' };
    }

    // Check accessibility requirements
    if (context.preferences.requireWheelchairAccessibility && 
        !node.accessibility.wheelchairAccessible) {
      return { isValid: false, reason: 'Node does not meet wheelchair accessibility requirements' };
    }

    return { isValid: true };
  }

  /**
   * Calculate the cost of traversing an edge by bicycle
   */
  calculateEdgeCost(
    edge: GraphEdge,
    context: RoutingContext,
    parameters?: BicycleRoutingParameters
  ): number {
    let cost = edge.cost || 0;

    // Base cost is time
    cost = this.calculateEdgeTime(edge, context, parameters);

    // Add effort cost based on elevation
    if (parameters?.considerElevation && edge.properties.gradient) {
      // Uphill requires more effort
      if (edge.properties.gradient > 0) {
        cost *= (1 + edge.properties.gradient * 2);
      }
      // Downhill is easier but requires caution
      else if (edge.properties.gradient < 0) {
        cost *= (1 - edge.properties.gradient * 0.5);
      }
    }

    // Add surface type cost
    if (edge.properties.surface) {
      const surfaceCosts: Record<string, number> = {
        'asphalt': 1.0,
        'concrete': 1.0,
        'gravel': 1.3,
        'dirt': 1.5,
        'cobblestone': 1.8
      };
      
      const surfaceCost = surfaceCosts[edge.properties.surface] || 1.2;
      cost *= surfaceCost;
    }

    // Add infrastructure cost
    if (edge.properties.separatedBikeLane) {
      cost *= 0.8; // Discount for separated bike lanes
    } else if (parameters?.requireBikeLane) {
      cost *= 1.5; // Penalty for missing required bike lane
    }

    // Add safety cost for busy roads
    if (edge.properties.roadClass === 'primary' || edge.properties.roadClass === 'secondary') {
      cost *= 1.3; // Penalty for busy roads
    }

    // Apply real-time adjustments
    if (edge.realTimeData?.congestionLevel) {
      // Higher congestion means more difficult cycling
      cost *= (1 + edge.realTimeData.congestionLevel * 0.3);
    }

    return cost;
  }

  /**
   * Calculate the time to traverse an edge by bicycle
   */
  calculateEdgeTime(
    edge: GraphEdge,
    context: RoutingContext,
    parameters?: BicycleRoutingParameters
  ): number {
    // Base time calculation
    let time = edge.duration;

    // Adjust for bike type
    if (parameters?.bikeType) {
      const bikeTypeMultipliers: Record<string, number> = {
        'road': 0.8,
        'mountain': 1.2,
        'hybrid': 1.0,
        'electric': 0.7,
        'cargo': 1.4
      };
      
      const multiplier = bikeTypeMultipliers[parameters.bikeType] || 1.0;
      time *= multiplier;
    }

    // Adjust for rider fitness
    if (parameters?.riderFitness) {
      const fitnessMultipliers: Record<string, number> = {
        'beginner': 1.3,
        'intermediate': 1.0,
        'advanced': 0.8,
        'expert': 0.7
      };
      
      const multiplier = fitnessMultipliers[parameters.riderFitness] || 1.0;
      time *= multiplier;
    }

    // Adjust for elevation
    if (parameters?.considerElevation && edge.properties.gradient) {
      // Uphill is slower
      if (edge.properties.gradient > 0) {
        time *= (1 + edge.properties.gradient * 3);
      }
      // Downhill is faster but with caution
      else if (edge.properties.gradient < 0) {
        time *= (1 - edge.properties.gradient * 0.8);
      }
    }

    // Adjust for surface type
    if (edge.properties.surface) {
      const surfaceMultipliers: Record<string, number> = {
        'asphalt': 1.0,
        'concrete': 1.0,
        'gravel': 1.4,
        'dirt': 1.7,
        'cobblestone': 2.0
      };
      
      const multiplier = surfaceMultipliers[edge.properties.surface] || 1.2;
      time *= multiplier;
    }

    // Adjust for infrastructure
    if (edge.properties.separatedBikeLane) {
      time *= 0.9; // Faster on separated bike lanes
    }

    // Apply real-time adjustments
    if (edge.realTimeData?.currentSpeed) {
      // Calculate time based on current speed
      time = edge.distance / edge.realTimeData.currentSpeed;
    }

    return time;
  }

  /**
   * Generate route instructions for traversing an edge by bicycle
   */
  generateInstructions(
    fromNode: GraphNode,
    toNode: GraphNode,
    edge: GraphEdge,
    context: RoutingContext
  ): RouteInstruction[] {
    const instructions: RouteInstruction[] = [];
    const parameters = context.preferences as unknown as BicycleRoutingParameters;

    // Determine instruction type based on road class and infrastructure
    let instructionType: InstructionType = InstructionType.CONTINUE_STRAIGHT;
    let text = `Continue on ${edge.properties.roadClass || 'path'}`;

    // Generate more specific instructions based on road class and infrastructure
    if (edge.properties.separatedBikeLane) {
      instructionType = InstructionType.CONTINUE_STRAIGHT;
      text = 'Continue on separated bike lane';
    } else if (edge.properties.roadClass === 'highway') {
      instructionType = InstructionType.MERGE;
      text = 'Merge onto highway - use caution';
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
      id: `bike-${Date.now()}-${Math.random()}`,
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
   * Check if a transfer from bicycle to another mode is possible
   */
  canTransferTo(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): boolean {
    // Can transfer from bicycle to walking, public transport, or car
    const validTransfers = [
      TransportMode.WALKING,
      TransportMode.BUS,
      TransportMode.METRO,
      TransportMode.TRAM,
      TransportMode.TRAIN,
      TransportMode.CAR
    ];

    return validTransfers.includes(toMode);
  }

  /**
   * Calculate the cost of transferring from bicycle to another mode
   */
  calculateTransferCost(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): number {
    // Base cost for transferring from bicycle
    let cost = 60; // 1 minute equivalent

    // Additional costs based on target mode
    switch (toMode) {
      case TransportMode.WALKING:
        cost += 30; // Time to dismount and start walking
        break;
      case TransportMode.BUS:
      case TransportMode.METRO:
      case TransportMode.TRAM:
      case TransportMode.TRAIN:
        cost += 180; // Time to dismount, lock bike, and wait for transport
        break;
      case TransportMode.CAR:
        cost += 120; // Time to load bike onto car
        break;
    }

    return cost;
  }

  /**
   * Calculate the time required for transferring from bicycle to another mode
   */
  calculateTransferTime(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): number {
    // Base time for transferring from bicycle
    let time = 60; // 1 minute

    // Additional time based on target mode
    switch (toMode) {
      case TransportMode.WALKING:
        time += 30; // Time to dismount and start walking
        break;
      case TransportMode.BUS:
      case TransportMode.METRO:
      case TransportMode.TRAM:
      case TransportMode.TRAIN:
        time += 300; // Time to dismount, lock bike, and wait for transport
        break;
      case TransportMode.CAR:
        time += 180; // Time to load bike onto car
        break;
    }

    return time;
  }

  /**
   * Check if bicycle travel is available at a given time
   */
  isAvailableAt(time: Date, context: RoutingContext): boolean {
    // Bicycle travel is generally available at all times
    // In a real implementation, you might check for:
    // - Bike path opening hours
    // - Seasonal restrictions
    // - Weather conditions
    
    const parameters = context.preferences as unknown as BicycleRoutingParameters;
    
    // Check for time-based restrictions
    const hour = time.getHours();
    
    // Example: Avoid cycling at night if safety is a priority
    if (parameters.prioritizeSafety && (hour < 6 || hour > 22)) {
      return false;
    }
    
    return true;
  }

  /**
   * Get the average speed for bicycle travel
   */
  getAverageSpeed(context: RoutingContext): number {
    // Default bicycle speed in m/s (15 km/h)
    let speed = 4.2;
    
    const parameters = context.preferences as unknown as BicycleRoutingParameters;
    
    // Adjust based on bike type
    if (parameters.bikeType) {
      const bikeTypeSpeeds: Record<string, number> = {
        'road': 5.6,      // 20 km/h
        'mountain': 3.3,  // 12 km/h
        'hybrid': 4.2,    // 15 km/h
        'electric': 6.9,  // 25 km/h
        'cargo': 2.8      // 10 km/h
      };
      
      speed = bikeTypeSpeeds[parameters.bikeType] || speed;
    }
    
    // Adjust based on rider fitness
    if (parameters.riderFitness) {
      const fitnessMultipliers: Record<string, number> = {
        'beginner': 0.7,
        'intermediate': 1.0,
        'advanced': 1.3,
        'expert': 1.5
      };
      
      speed *= fitnessMultipliers[parameters.riderFitness] || 1.0;
    }
    
    return speed;
  }

  /**
   * Get environmental impact score for bicycle travel
   */
  getEnvironmentalImpact(distance: number, context: RoutingContext): number {
    // Bicycles have very low environmental impact
    let impact = 0.1;
    
    const parameters = context.preferences as unknown as BicycleRoutingParameters;
    
    // Electric bikes have slightly higher impact due to battery
    if (parameters.bikeType === 'electric') {
      impact = 0.2;
    }
    
    return impact;
  }

  /**
   * Get comfort score for bicycle travel
   */
  getComfortScore(distance: number, context: RoutingContext): number {
    const parameters = context.preferences as unknown as BicycleRoutingParameters;
    
    // Base comfort score for bicycle
    let comfort = 0.6;
    
    // Adjust based on bike type
    if (parameters.bikeType === 'electric') {
      comfort = 0.8; // Electric bikes are more comfortable, especially for hills
    } else if (parameters.bikeType === 'road') {
      comfort = 0.7; // Road bikes are comfortable on good surfaces
    } else if (parameters.bikeType === 'mountain') {
      comfort = 0.5; // Mountain bikes are less comfortable on roads
    }
    
    // Adjust for distance
    if (distance > 20000) { // 20km
      comfort *= 0.8; // Less comfortable on long trips
    }
    
    // Adjust for rider fitness
    if (parameters.riderFitness === 'beginner') {
      comfort *= 0.8; // Less comfortable for beginners
    } else if (parameters.riderFitness === 'expert') {
      comfort *= 1.2; // More comfortable for experts
    }
    
    return Math.min(1, comfort);
  }

  /**
   * Get safety score for bicycle travel
   */
  getSafetyScore(distance: number, context: RoutingContext): number {
    const parameters = context.preferences as unknown as BicycleRoutingParameters;
    
    // Base safety score for bicycle
    let safety = 0.5;
    
    // Adjust based on infrastructure preferences
    if (parameters.requireBikeLane || parameters.preferSeparatedBikeLanes) {
      safety *= 1.3; // Safer with bike lanes
    }
    
    // Adjust for bike type
    if (parameters.bikeType === 'electric') {
      safety *= 0.9; // Slightly less safe due to higher speeds
    }
    
    // Adjust for time of day
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      safety *= 0.7; // Less safe at night
    }
    
    // Adjust for rider fitness
    if (parameters.riderFitness === 'beginner') {
      safety *= 0.8; // Less safe for beginners
    } else if (parameters.riderFitness === 'expert') {
      safety *= 1.2; // Safer for experts
    }
    
    return Math.min(1, safety);
  }
}