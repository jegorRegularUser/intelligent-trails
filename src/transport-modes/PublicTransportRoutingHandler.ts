/**
 * Public transport routing handler implementation
 * Implements multi-modal public transport routing with schedule-based routing
 */

import {
  GraphNode,
  GraphEdge,
  TransportMode,
  RealTimeEdgeData,
  TransferPoint
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
 * Public transport schedule information
 */
export interface TransitSchedule {
  routeId: string;
  routeName: string;
  agency: string;
  type: 'bus' | 'metro' | 'tram' | 'train' | 'ferry';
  headway: number; // minutes between vehicles
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  serviceDays: number[]; // 0 = Sunday, 1 = Monday, etc.
  exceptions: {
    date: Date;
    isService: boolean;
  }[];
}

/**
 * Real-time transit information
 */
export interface RealTimeTransitInfo {
  routeId: string;
  vehicleId: string;
  nextStopId: string;
  arrivalTime: Date;
  departureTime: Date;
  delay: number; // seconds
  status: 'on_time' | 'delayed' | 'early' | 'cancelled';
  occupancy: 'low' | 'medium' | 'high' | 'full';
  accessibility: boolean;
};

/**
 * Public transport-specific routing parameters
 */
export interface PublicTransportRoutingParameters extends TransportModeParameters {
  maxWalkingDistance?: number; // maximum walking distance to/from stops
  maxTransferTime?: number; // maximum time allowed for transfers
  maxTotalTransfers?: number; // maximum number of transfers in journey
  preferredRoutes?: string[]; // preferred route IDs
  avoidedRoutes?: string[]; // avoided route IDs
  preferredAgencies?: string[]; // preferred transport agencies
  avoidedAgencies?: string[]; // avoided transport agencies
  requireWheelchairAccessible?: boolean;
  requireLowFloor?: boolean;
  requireAirConditioning?: boolean;
  avoidTransfers?: boolean;
  minimizeWalking?: boolean;
  maxWaitTime?: number; // maximum wait time at stops
  considerRealTime?: boolean; // whether to consider real-time information
  schedules?: TransitSchedule[]; // transit schedules
  realTimeInfo?: RealTimeTransitInfo[]; // real-time transit information
}

/**
 * Public transport routing handler implementation
 */
export class PublicTransportRoutingHandler extends TransportModeHandler {
  private readonly supportedModes: TransportMode[] = [
    TransportMode.BUS,
    TransportMode.METRO,
    TransportMode.TRAM,
    TransportMode.TRAIN,
    TransportMode.FERRY
  ];

  constructor() {
    // Use BUS as the primary mode, but this handler will handle all public transport modes
    super(TransportMode.BUS);
  }

  /**
   * Check if this handler supports a given transport mode
   */
  supportsMode(mode: TransportMode): boolean {
    return this.supportedModes.includes(mode);
  }

  /**
   * Validate if an edge can be used by public transport
   */
  validateEdge(edge: GraphEdge, context: RoutingContext): EdgeValidationResult {
    // Skip if edge is not a supported public transport mode
    if (!this.supportsMode(edge.mode)) {
      return { isValid: false, reason: 'Edge not suitable for public transport' };
    }

    const parameters = context.preferences as unknown as PublicTransportRoutingParameters;

    // Check if route is in avoided list
    if (parameters.avoidedRoutes?.includes(edge.properties.publicTransportRoute || '')) {
      return { isValid: false, reason: 'Route is in avoided list' };
    }

    // Check if agency is in avoided list
    if (parameters.avoidedAgencies?.includes(edge.properties.routeNumber || '')) {
      return { isValid: false, reason: 'Agency is in avoided list' };
    }

    // Check accessibility requirements
    if (parameters.requireWheelchairAccessible && 
        !edge.accessibility.wheelchairAccessible) {
      return { isValid: false, reason: 'Edge does not meet wheelchair accessibility requirements' };
    }

    // Check if service is running based on schedule
    if (parameters.schedules) {
      const schedule = parameters.schedules.find(s => s.routeId === edge.properties.publicTransportRoute);
      if (schedule && !this.isServiceRunning(schedule, context.departureTime || new Date())) {
        return { isValid: false, reason: 'Service is not running at this time' };
      }
    }

    // Check real-time status
    if (parameters.considerRealTime && parameters.realTimeInfo) {
      const realTimeInfo = parameters.realTimeInfo.find(info => info.routeId === edge.properties.publicTransportRoute);
      if (realTimeInfo && realTimeInfo.status === 'cancelled') {
        return { isValid: false, reason: 'Service is cancelled' };
      }
    }

    // Check distance constraints
    if (edge.distance > context.constraints.maxDistance) {
      return { isValid: false, reason: 'Edge exceeds maximum distance constraint' };
    }

    // Check cost constraints
    if (edge.cost > context.constraints.maxCost) {
      return { isValid: false, reason: 'Edge exceeds maximum cost constraint' };
    }

    return { isValid: true };
  }

  /**
   * Validate if a node can be used by public transport
   */
  validateNode(node: GraphNode, context: RoutingContext): NodeValidationResult {
    // Skip if node doesn't support any public transport mode
    if (!this.supportedModes.some(mode => node.modes.includes(mode))) {
      return { isValid: false, reason: 'Node does not support public transport' };
    }

    // Check if node is a transit stop
    if (node.type !== 'transit_stop' && node.type !== 'transfer') {
      return { isValid: false, reason: 'Node is not a transit stop or transfer point' };
    }

    // Check accessibility requirements
    const parameters = context.preferences as unknown as PublicTransportRoutingParameters;
    if (parameters.requireWheelchairAccessible && 
        !node.accessibility.wheelchairAccessible) {
      return { isValid: false, reason: 'Node does not meet wheelchair accessibility requirements' };
    }

    return { isValid: true };
  }

  /**
   * Calculate the cost of traversing an edge by public transport
   */
  calculateEdgeCost(
    edge: GraphEdge,
    context: RoutingContext,
    parameters?: PublicTransportRoutingParameters
  ): number {
    let cost = edge.cost || 0;

    // Base fare for the route
    const baseFare = this.getBaseFare(edge.mode);
    cost += baseFare;

    // Add transfer penalty if applicable
    if (parameters?.avoidTransfers) {
      cost += 2; // Penalty for transfers
    }

    // Adjust for preferred routes
    if (parameters?.preferredRoutes?.includes(edge.properties.publicTransportRoute || '')) {
      cost *= 0.8; // Discount for preferred routes
    }

    // Adjust for preferred agencies
    if (parameters?.preferredAgencies?.includes(edge.properties.routeNumber || '')) {
      cost *= 0.9; // Discount for preferred agencies
    }

    // Adjust for real-time delays
    if (parameters?.considerRealTime && parameters?.realTimeInfo) {
      const realTimeInfo = parameters.realTimeInfo.find(info => info.routeId === edge.properties.publicTransportRoute);
      if (realTimeInfo && realTimeInfo.delay > 0) {
        cost += realTimeInfo.delay / 60; // Add cost for delays
      }
    }

    return cost;
  }

  /**
   * Calculate the time to traverse an edge by public transport
   */
  calculateEdgeTime(
    edge: GraphEdge,
    context: RoutingContext,
    parameters?: PublicTransportRoutingParameters
  ): number {
    let time = edge.duration;

    // Add waiting time at the stop
    const waitingTime = this.calculateWaitingTime(edge, context, parameters);
    time += waitingTime;

    // Adjust for real-time delays
    if (parameters?.considerRealTime && parameters?.realTimeInfo) {
      const realTimeInfo = parameters.realTimeInfo.find(info => info.routeId === edge.properties.publicTransportRoute);
      if (realTimeInfo) {
        time += realTimeInfo.delay;
      }
    }

    // Adjust for mode-specific factors
    switch (edge.mode) {
      case TransportMode.BUS:
        // Buses can be affected by traffic
        if (edge.realTimeData?.congestionLevel) {
          time *= (1 + edge.realTimeData.congestionLevel * 0.5);
        }
        break;
      case TransportMode.METRO:
      case TransportMode.TRAIN:
        // Rail transport is generally more reliable
        time *= 0.95;
        break;
      case TransportMode.TRAM:
        // Trams can be affected by traffic
        if (edge.realTimeData?.congestionLevel) {
          time *= (1 + edge.realTimeData.congestionLevel * 0.3);
        }
        break;
      case TransportMode.FERRY:
        // Ferries can be affected by weather
        time *= 1.1;
        break;
    }

    return time;
  }

  /**
   * Generate route instructions for traversing an edge by public transport
   */
  generateInstructions(
    fromNode: GraphNode,
    toNode: GraphNode,
    edge: GraphEdge,
    context: RoutingContext
  ): RouteInstruction[] {
    const instructions: RouteInstruction[] = [];
    const parameters = context.preferences as unknown as PublicTransportRoutingParameters;

    // Board instruction
    instructions.push({
      id: `board-${Date.now()}-${Math.random()}`,
      type: InstructionType.BOARD_VEHICLE,
      text: `Board ${this.getModeName(edge.mode)} ${edge.properties.routeNumber || ''}`,
      distance: 0,
      duration: 0,
      maneuver: {
        type: InstructionType.BOARD_VEHICLE
      },
      landmarks: [],
      accessibilityInfo: edge.accessibility,
      coordinate: fromNode.coordinate,
      streetName: fromNode.properties.name
    });

    // Travel instruction
    instructions.push({
      id: `travel-${Date.now()}-${Math.random()}`,
      type: InstructionType.CONTINUE_STRAIGHT,
      text: `Take ${this.getModeName(edge.mode)} to ${toNode.properties.name || 'next stop'}`,
      distance: edge.distance,
      duration: edge.duration,
      maneuver: {
        type: InstructionType.CONTINUE_STRAIGHT
      },
      landmarks: [],
      accessibilityInfo: edge.accessibility,
      coordinate: toNode.coordinate,
      streetName: edge.properties.routeNumber
    });

    // Exit instruction
    instructions.push({
      id: `exit-${Date.now()}-${Math.random()}`,
      type: InstructionType.EXIT_VEHICLE,
      text: `Exit ${this.getModeName(edge.mode)} at ${toNode.properties.name || 'stop'}`,
      distance: 0,
      duration: 0,
      maneuver: {
        type: InstructionType.EXIT_VEHICLE
      },
      landmarks: [],
      accessibilityInfo: edge.accessibility,
      coordinate: toNode.coordinate,
      streetName: toNode.properties.name
    });

    return instructions;
  }

  /**
   * Check if a transfer between public transport modes is possible
   */
  canTransferTo(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): boolean {
    // Can transfer between any public transport modes
    if (this.supportsMode(fromMode) && this.supportsMode(toMode)) {
      return true;
    }

    // Can transfer from public transport to walking or bicycle
    if (this.supportsMode(fromMode) && 
        (toMode === TransportMode.WALKING || toMode === TransportMode.BICYCLE)) {
      return true;
    }

    return false;
  }

  /**
   * Calculate the cost of transferring between public transport modes
   */
  calculateTransferCost(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): number {
    const parameters = context.preferences as unknown as PublicTransportRoutingParameters;
    let cost = 0;

    // Base transfer cost
    cost += 1; // Base transfer cost

    // Additional cost if transfers should be minimized
    if (parameters.avoidTransfers) {
      cost += 3; // Penalty for transfers
    }

    // Additional cost for transferring between different agencies
    // In a real implementation, you would check the agencies of the routes
    cost += 0.5;

    return cost;
  }

  /**
   * Calculate the time required for transferring between public transport modes
   */
  calculateTransferTime(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): number {
    const parameters = context.preferences as unknown as PublicTransportRoutingParameters;
    let time = 180; // 3 minutes base transfer time

    // Adjust for mode-specific transfer times
    if (fromMode === TransportMode.METRO && toMode === TransportMode.BUS) {
      time = 240; // 4 minutes for metro to bus
    } else if (fromMode === TransportMode.BUS && toMode === TransportMode.METRO) {
      time = 240; // 4 minutes for bus to metro
    } else if (fromMode === TransportMode.TRAIN && toMode === TransportMode.METRO) {
      time = 300; // 5 minutes for train to metro
    }

    // Adjust for accessibility requirements
    if (parameters.requireWheelchairAccessible) {
      time += 120; // Additional 2 minutes for accessible transfers
    }

    // Respect maximum transfer time constraint
    if (parameters.maxTransferTime && time > parameters.maxTransferTime) {
      time = parameters.maxTransferTime;
    }

    return time;
  }

  /**
   * Check if public transport is available at a given time
   */
  isAvailableAt(time: Date, context: RoutingContext): boolean {
    const parameters = context.preferences as unknown as PublicTransportRoutingParameters;

    // Check if there are any schedules defined
    if (!parameters.schedules || parameters.schedules.length === 0) {
      // If no schedules, assume 24/7 service
      return true;
    }

    // Check if any service is running at this time
    for (const schedule of parameters.schedules) {
      if (this.isServiceRunning(schedule, time)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the average speed for public transport
   */
  getAverageSpeed(context: RoutingContext): number {
    // Use an average speed across all public transport modes
    // In a real implementation, you would calculate this based on the specific modes being used
    const speeds = {
      [TransportMode.BUS]: 5.6,    // 20 km/h
      [TransportMode.METRO]: 8.3,   // 30 km/h
      [TransportMode.TRAM]: 6.9,   // 25 km/h
      [TransportMode.TRAIN]: 16.7, // 60 km/h
      [TransportMode.FERRY]: 4.2   // 15 km/h
    };

    // Calculate weighted average
    let totalSpeed = 0;
    let count = 0;

    for (const mode of this.supportedModes) {
      totalSpeed += speeds[mode];
      count++;
    }

    return count > 0 ? totalSpeed / count : 5.6;
  }

  /**
   * Get environmental impact score for public transport
   */
  getEnvironmentalImpact(distance: number, context: RoutingContext): number {
    // Public transport has relatively low environmental impact
    let impact = 0.3;

    // Adjust based on specific mode
    if (context.preferences.preferredModes.includes(TransportMode.METRO) ||
        context.preferences.preferredModes.includes(TransportMode.TRAM) ||
        context.preferences.preferredModes.includes(TransportMode.TRAIN)) {
      // Electric rail transport has even lower impact
      impact = 0.2;
    } else if (context.preferences.preferredModes.includes(TransportMode.BUS)) {
      // Buses have higher impact than rail
      impact = 0.4;
    }

    return impact;
  }

  /**
   * Get comfort score for public transport
   */
  getComfortScore(distance: number, context: RoutingContext): number {
    // Base comfort score for public transport
    let comfort = 0.7;

    // Adjust based on specific mode
    if (context.preferences.preferredModes.includes(TransportMode.METRO) ||
        context.preferences.preferredModes.includes(TransportMode.TRAIN)) {
      // Rail transport is generally more comfortable
      comfort = 0.8;
    } else if (context.preferences.preferredModes.includes(TransportMode.BUS)) {
      // Buses can be less comfortable due to traffic
      comfort = 0.6;
    }

    // Adjust for distance
    if (distance > 20000) { // 20km
      comfort *= 0.9; // Slightly less comfortable on long trips
    }

    return comfort;
  }

  /**
   * Get safety score for public transport
   */
  getSafetyScore(distance: number, context: RoutingContext): number {
    // Public transport is generally safe
    let safety = 0.8;

    // Adjust based on specific mode
    if (context.preferences.preferredModes.includes(TransportMode.METRO) ||
        context.preferences.preferredModes.includes(TransportMode.TRAIN)) {
      // Rail transport is generally very safe
      safety = 0.9;
    }

    return safety;
  }

  /**
   * Get the base fare for a transport mode
   */
  private getBaseFare(mode: TransportMode): number {
    const fares = {
      [TransportMode.BUS]: 2.0,
      [TransportMode.METRO]: 2.5,
      [TransportMode.TRAM]: 2.0,
      [TransportMode.TRAIN]: 3.0,
      [TransportMode.FERRY]: 4.0
    };

    return fares[mode] || 2.0;
  }

  /**
   * Get the display name for a transport mode
   */
  private getModeName(mode: TransportMode): string {
    const names = {
      [TransportMode.BUS]: 'bus',
      [TransportMode.METRO]: 'metro',
      [TransportMode.TRAM]: 'tram',
      [TransportMode.TRAIN]: 'train',
      [TransportMode.FERRY]: 'ferry'
    };

    return names[mode] || 'public transport';
  }

  /**
   * Calculate waiting time at a stop
   */
  private calculateWaitingTime(
    edge: GraphEdge,
    context: RoutingContext,
    parameters?: PublicTransportRoutingParameters
  ): number {
    if (!parameters?.schedules) {
      // If no schedule information, use default waiting time
      return 300; // 5 minutes
    }

    const schedule = parameters.schedules.find(s => s.routeId === edge.properties.publicTransportRoute);
    if (!schedule) {
      return 300; // 5 minutes default
    }

    // Calculate waiting time based on headway
    const headwayInSeconds = schedule.headway * 60;
    
    // If we have real-time information, use it to calculate more accurate waiting time
    if (parameters?.considerRealTime && parameters?.realTimeInfo) {
      const realTimeInfo = parameters.realTimeInfo.find(info => info.routeId === edge.properties.publicTransportRoute);
      if (realTimeInfo) {
        const now = context.departureTime || new Date();
        const departureTime = new Date(realTimeInfo.departureTime);
        const waitingTime = Math.max(0, (departureTime.getTime() - now.getTime()) / 1000);
        
        // Respect maximum wait time constraint
        if (parameters.maxWaitTime && waitingTime > parameters.maxWaitTime) {
          return parameters.maxWaitTime;
        }
        
        return Math.min(waitingTime, headwayInSeconds);
      }
    }

    // Without real-time information, assume half the headway as average waiting time
    const averageWaitingTime = headwayInSeconds / 2;
    
    // Respect maximum wait time constraint
    if (parameters.maxWaitTime && averageWaitingTime > parameters.maxWaitTime) {
      return parameters.maxWaitTime;
    }

    return averageWaitingTime;
  }

  /**
   * Check if a service is running at a given time
   */
  private isServiceRunning(schedule: TransitSchedule, time: Date): boolean {
    // Check day of week
    const dayOfWeek = time.getDay();
    if (!schedule.serviceDays.includes(dayOfWeek)) {
      return false;
    }

    // Check time of day
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const currentTime = hours * 60 + minutes;

    const [startHours, startMinutes] = schedule.startTime.split(':').map(Number);
    const [endHours, endMinutes] = schedule.endTime.split(':').map(Number);

    const startTime = startHours * 60 + startMinutes;
    const endTime = endHours * 60 + endMinutes;

    if (currentTime < startTime || currentTime > endTime) {
      return false;
    }

    // Check exceptions
    for (const exception of schedule.exceptions) {
      if (exception.date.toDateString() === time.toDateString()) {
        return exception.isService;
      }
    }

    return true;
  }
}