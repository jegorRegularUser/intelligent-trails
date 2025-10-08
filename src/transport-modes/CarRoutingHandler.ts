/**
 * Car routing handler implementation
 * Implements car-specific routing logic with road network constraints
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
 * Car-specific routing parameters
 */
export interface CarRoutingParameters extends TransportModeParameters {
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  avoidFerries?: boolean;
  avoidUnpavedRoads?: boolean;
  vehicleType?: 'car' | 'truck' | 'motorcycle' | 'rv';
  fuelConsumption?: number; // liters per 100km
  fuelPrice?: number; // price per liter
  engineType?: 'gasoline' | 'diesel' | 'electric' | 'hybrid';
  maxWeight?: number; // in kg
  maxHeight?: number; // in meters
  maxWidth?: number; // in meters
  maxLength?: number; // in meters
  hasTrailer?: boolean;
  avoidLowEmissionZones?: boolean;
  avoidCongestionZones?: boolean;
}

/**
 * Car routing handler implementation
 */
export class CarRoutingHandler extends TransportModeHandler {
  constructor() {
    super(TransportMode.CAR);
  }

  /**
   * Validate if an edge can be used by car
   */
  validateEdge(edge: GraphEdge, context: RoutingContext): EdgeValidationResult {
    // Skip if edge is not for car mode
    if (edge.mode !== TransportMode.CAR) {
      return { isValid: false, reason: 'Edge not suitable for car travel' };
    }

    // Check user constraints
    const { constraints } = context;
    const parameters = context.preferences as unknown as CarRoutingParameters;

    // Check toll avoidance
    if (edge.properties.toll && (constraints.avoidTolls || parameters.avoidTolls)) {
      return { isValid: false, reason: 'Edge has tolls and user wants to avoid them' };
    }

    // Check highway avoidance
    if (edge.properties.roadClass === 'highway' && (constraints.avoidHighways || parameters.avoidHighways)) {
      return { isValid: false, reason: 'Edge is a highway and user wants to avoid them' };
    }

    // Check unpaved road avoidance
    if (edge.properties.surface === 'unpaved' && (constraints.avoidUnpavedRoads || parameters.avoidUnpavedRoads)) {
      return { isValid: false, reason: 'Edge is unpaved and user wants to avoid unpaved roads' };
    }

    // Check vehicle restrictions
    if (parameters.maxWeight && edge.properties.maxSpeed) {
      // This is a simplified check - in a real implementation, you'd have specific weight limits
      if (parameters.maxWeight > 3500 && edge.properties.roadClass === 'residential') {
        return { isValid: false, reason: 'Vehicle too heavy for residential road' };
      }
    }

    // Check if edge is blocked by real-time data
    if (edge.realTimeData?.blocked) {
      return { isValid: false, reason: 'Edge is blocked due to real-time conditions' };
    }

    // Check distance constraints
    if (edge.distance > constraints.maxDistance) {
      return { isValid: false, reason: 'Edge exceeds maximum distance constraint' };
    }

    // Check cost constraints
    if (edge.cost > constraints.maxCost) {
      return { isValid: false, reason: 'Edge exceeds maximum cost constraint' };
    }

    return { isValid: true };
  }

  /**
   * Validate if a node can be used by car
   */
  validateNode(node: GraphNode, context: RoutingContext): NodeValidationResult {
    // Skip if node doesn't support car mode
    if (!node.modes.includes(TransportMode.CAR)) {
      return { isValid: false, reason: 'Node does not support car travel' };
    }

    // Check accessibility requirements
    if (context.preferences.requireWheelchairAccessibility && 
        !node.accessibility.wheelchairAccessible) {
      return { isValid: false, reason: 'Node does not meet wheelchair accessibility requirements' };
    }

    return { isValid: true };
  }

  /**
   * Calculate the cost of traversing an edge by car
   */
  calculateEdgeCost(
    edge: GraphEdge,
    context: RoutingContext,
    parameters?: CarRoutingParameters
  ): number {
    let cost = edge.cost || 0;

    // Add toll cost if applicable
    if (edge.properties.toll) {
      cost += 5; // Base toll cost
    }

    // Add fuel cost
    const fuelConsumption = parameters?.fuelConsumption || 8; // liters per 100km
    const fuelPrice = parameters?.fuelPrice || 1.5; // price per liter
    const distanceInKm = edge.distance / 1000;
    const fuelCost = (fuelConsumption * distanceInKm / 100) * fuelPrice;
    cost += fuelCost;

    // Apply real-time adjustments
    if (edge.realTimeData?.congestionLevel) {
      // Higher congestion means higher fuel consumption and time cost
      cost *= (1 + edge.realTimeData.congestionLevel * 0.5);
    }

    return cost;
  }

  /**
   * Calculate the time to traverse an edge by car
   */
  calculateEdgeTime(
    edge: GraphEdge,
    context: RoutingContext,
    parameters?: CarRoutingParameters
  ): number {
    let time = edge.duration;

    // Adjust for vehicle type
    if (parameters?.vehicleType === 'truck') {
      time *= 1.2; // Trucks are slower
    } else if (parameters?.vehicleType === 'motorcycle') {
      time *= 0.9; // Motorcycles can be faster in traffic
    }

    // Adjust for road class
    switch (edge.properties.roadClass) {
      case 'highway':
        time *= 0.8; // Faster on highways
        break;
      case 'residential':
        time *= 1.3; // Slower on residential roads
        break;
      case 'unpaved':
        time *= 1.5; // Much slower on unpaved roads
        break;
    }

    // Apply real-time adjustments
    if (edge.realTimeData?.currentSpeed) {
      // Calculate time based on current speed
      time = edge.distance / edge.realTimeData.currentSpeed;
    } else if (edge.realTimeData?.congestionLevel) {
      // Adjust time based on congestion level
      time *= (1 + edge.realTimeData.congestionLevel);
    }

    // Adjust for gradient
    if (edge.properties.gradient) {
      // Uphill is slower, downhill is slightly faster
      if (edge.properties.gradient > 0) {
        time *= (1 + edge.properties.gradient * 0.5);
      } else {
        time *= (1 - edge.properties.gradient * 0.2);
      }
    }

    return time;
  }

  /**
   * Generate route instructions for traversing an edge by car
   */
  generateInstructions(
    fromNode: GraphNode,
    toNode: GraphNode,
    edge: GraphEdge,
    context: RoutingContext
  ): RouteInstruction[] {
    const instructions: RouteInstruction[] = [];

    // Determine instruction type based on road class
    let instructionType: InstructionType = InstructionType.CONTINUE_STRAIGHT;
    let text = `Continue on ${edge.properties.roadClass || 'road'}`;

    // Generate more specific instructions based on road class
    switch (edge.properties.roadClass) {
      case 'highway':
        instructionType = InstructionType.MERGE;
        text = 'Merge onto highway';
        break;
      case 'motorway_link':
        instructionType = InstructionType.TAKE_EXIT;
        text = 'Take the exit';
        break;
      case 'residential':
        instructionType = InstructionType.CONTINUE_STRAIGHT;
        text = 'Continue on residential road';
        break;
      case 'unpaved':
        instructionType = InstructionType.CONTINUE_STRAIGHT;
        text = 'Continue on unpaved road';
        break;
    }

    // Create maneuver
    const maneuver: Maneuver = {
      type: instructionType,
      modifier: 'straight'
    };

    // Create instruction
    instructions.push({
      id: `car-${Date.now()}-${Math.random()}`,
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
   * Check if a transfer from car to another mode is possible
   */
  canTransferTo(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): boolean {
    // Can transfer from car to walking, bicycle, or public transport
    const validTransfers = [
      TransportMode.WALKING,
      TransportMode.BICYCLE,
      TransportMode.BUS,
      TransportMode.METRO,
      TransportMode.TRAM,
      TransportMode.TRAIN
    ];

    return validTransfers.includes(toMode);
  }

  /**
   * Calculate the cost of transferring from car to another mode
   */
  calculateTransferCost(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): number {
    // Base cost for transferring from car
    let cost = 60; // 1 minute equivalent

    // Additional costs based on target mode
    switch (toMode) {
      case TransportMode.WALKING:
        cost += 30; // Time to park and get out
        break;
      case TransportMode.BICYCLE:
        cost += 120; // Time to park and get bicycle
        break;
      case TransportMode.BUS:
      case TransportMode.METRO:
      case TransportMode.TRAM:
      case TransportMode.TRAIN:
        cost += 180; // Time to park, walk to station, and wait
        break;
    }

    return cost;
  }

  /**
   * Calculate the time required for transferring from car to another mode
   */
  calculateTransferTime(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): number {
    // Base time for transferring from car
    let time = 60; // 1 minute

    // Additional time based on target mode
    switch (toMode) {
      case TransportMode.WALKING:
        time += 30; // Time to park and get out
        break;
      case TransportMode.BICYCLE:
        time += 120; // Time to park and get bicycle
        break;
      case TransportMode.BUS:
      case TransportMode.METRO:
      case TransportMode.TRAM:
      case TransportMode.TRAIN:
        time += 300; // Time to park, walk to station, and wait
        break;
    }

    return time;
  }

  /**
   * Check if car travel is available at a given time
   */
  isAvailableAt(time: Date, context: RoutingContext): boolean {
    // Car travel is generally available at all times
    // In a real implementation, you might check for:
    // - Car-free days or zones
    // - Low emission zone restrictions
    // - Congestion charge times
    
    const parameters = context.preferences as unknown as CarRoutingParameters;
    
    // Check for time-based restrictions
    const hour = time.getHours();
    const dayOfWeek = time.getDay();
    
    // Example: Avoid city center during rush hours if specified
    if (parameters.avoidCongestionZones) {
      const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
      
      if (isRushHour && isWeekday) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get the average speed for car travel
   */
  getAverageSpeed(context: RoutingContext): number {
    // Default car speed in m/s (40 km/h)
    let speed = 11.1;
    
    const parameters = context.preferences as unknown as CarRoutingParameters;
    
    // Adjust based on vehicle type
    if (parameters.vehicleType === 'truck') {
      speed = 8.3; // 30 km/h
    } else if (parameters.vehicleType === 'motorcycle') {
      speed = 13.9; // 50 km/h
    }
    
    // Adjust based on road preferences
    if (parameters.avoidHighways) {
      speed *= 0.8; // Slower if avoiding highways
    }
    
    return speed;
  }

  /**
   * Get environmental impact score for car travel
   */
  getEnvironmentalImpact(distance: number, context: RoutingContext): number {
    const parameters = context.preferences as unknown as CarRoutingParameters;
    
    // Base impact score for car (high impact)
    let impact = 0.8;
    
    // Adjust based on engine type
    if (parameters.engineType === 'electric') {
      impact = 0.3; // Lower impact for electric vehicles
    } else if (parameters.engineType === 'hybrid') {
      impact = 0.5; // Medium impact for hybrid vehicles
    } else if (parameters.engineType === 'diesel') {
      impact = 0.9; // Higher impact for diesel vehicles
    }
    
    // Adjust based on vehicle type
    if (parameters.vehicleType === 'motorcycle') {
      impact *= 0.7; // Lower impact than cars
    } else if (parameters.vehicleType === 'truck') {
      impact *= 1.5; // Higher impact for trucks
    }
    
    return Math.min(1, impact);
  }

  /**
   * Get comfort score for car travel
   */
  getComfortScore(distance: number, context: RoutingContext): number {
    const parameters = context.preferences as unknown as CarRoutingParameters;
    
    // Base comfort score for car (high comfort)
    let comfort = 0.8;
    
    // Adjust based on vehicle type
    if (parameters.vehicleType === 'truck') {
      comfort = 0.5; // Lower comfort for trucks
    } else if (parameters.vehicleType === 'motorcycle') {
      comfort = 0.6; // Medium comfort for motorcycles
    } else if (parameters.vehicleType === 'rv') {
      comfort = 0.9; // High comfort for RVs
    }
    
    // Adjust for long distances
    if (distance > 50000) { // 50km
      comfort *= 0.9; // Slightly less comfortable on long trips
    }
    
    return comfort;
  }

  /**
   * Get safety score for car travel
   */
  getSafetyScore(distance: number, context: RoutingContext): number {
    const parameters = context.preferences as unknown as CarRoutingParameters;
    
    // Base safety score for car (medium safety)
    let safety = 0.6;
    
    // Adjust based on vehicle type
    if (parameters.vehicleType === 'truck') {
      safety = 0.5; // Lower safety for trucks (harder to maneuver)
    } else if (parameters.vehicleType === 'motorcycle') {
      safety = 0.4; // Lower safety for motorcycles
    }
    
    // Adjust for road preferences
    if (parameters.avoidHighways) {
      safety *= 1.1; // Slightly safer if avoiding highways
    }
    
    if (parameters.avoidUnpavedRoads) {
      safety *= 1.1; // Slightly safer if avoiding unpaved roads
    }
    
    return Math.min(1, safety);
  }
}