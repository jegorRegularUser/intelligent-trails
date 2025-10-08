/**
 * Route representation types for the multi-modal routing system
 */

import { Coordinate, TransportMode, AccessibilityInfo } from './graph';

/**
 * Instruction types for route guidance
 */
export enum InstructionType {
  DEPART = 'depart',
  TURN_LEFT = 'turn_left',
  TURN_RIGHT = 'turn_right',
  TURN_SLIGHT_LEFT = 'turn_slight_left',
  TURN_SLIGHT_RIGHT = 'turn_slight_right',
  CONTINUE_STRAIGHT = 'continue_straight',
  U_TURN = 'u_turn',
  ENTER_ROUNDABOUT = 'enter_roundabout',
  EXIT_ROUNDABOUT = 'exit_roundabout',
  MERGE = 'merge',
  TAKE_EXIT = 'take_exit',
  BOARD_VEHICLE = 'board_vehicle',
  EXIT_VEHICLE = 'exit_vehicle',
  TRANSFER = 'transfer',
  ENTER_BUILDING = 'enter_building',
  EXIT_BUILDING = 'exit_building',
  USE_ELEVATOR = 'use_elevator',
  USE_STAIRS = 'use_stairs',
  USE_RAMP = 'use_ramp',
  ARRIVE = 'arrive'
}

/**
 * Maneuver information for route instructions
 */
export interface Maneuver {
  type: InstructionType;
  bearing?: number; // in degrees
  exitNumber?: number;
  roundaboutExit?: number;
  modifier?: 'left' | 'right' | 'straight' | 'slight_left' | 'slight_right';
}

/**
 * Landmark information for route instructions
 */
export interface Landmark {
  id: string;
  name: string;
  type: string;
  coordinate: Coordinate;
  bearing?: number; // bearing from the route
  distance?: number; // distance from the route
  side?: 'left' | 'right';
}

/**
 * Detailed instruction for route guidance
 */
export interface RouteInstruction {
  id: string;
  type: InstructionType;
  text: string;
  distance: number; // in meters
  duration: number; // in seconds
  maneuver: Maneuver;
  landmarks: Landmark[];
  accessibilityInfo: AccessibilityInfo;
  coordinate: Coordinate;
  streetName?: string;
  exitName?: string;
  signpost?: string;
}

/**
 * Real-time data for route segments
 */
export interface RealTimeSegmentData {
  currentSpeed?: number;
  congestionLevel?: number; // 0-1
  delay?: number; // in seconds
  blocked?: boolean;
  alternativeAvailable?: boolean;
  lastUpdated: Date;
}

/**
 * Represents a segment of a route
 */
export interface RouteSegment {
  id: string;
  mode: TransportMode;
  from: string; // node id
  to: string; // node id
  fromCoordinate: Coordinate;
  toCoordinate: Coordinate;
  distance: number; // in meters
  duration: number; // in seconds
  cost: number; // monetary cost
  instructions: RouteInstruction[];
  realTimeData?: RealTimeSegmentData;
  geometry: Coordinate[]; // polyline
  accessibility: AccessibilityInfo;
  properties: {
    routeNumber?: string;
    routeName?: string;
    agency?: string;
    headsign?: string;
    platform?: string;
    track?: string;
    vehicleType?: string;
    occupancyLevel?: 'low' | 'medium' | 'high';
  };
}

/**
 * Types of route segments
 */
export enum RouteSegmentType {
  WALKING = 'walking',
  CYCLING = 'cycling',
  DRIVING = 'driving',
  TRANSIT = 'transit',
  TRANSFER = 'transfer',
  WAITING = 'waiting'
}

/**
 * Represents a waypoint in a route
 */
export interface Waypoint {
  id: string;
  coordinate: Coordinate;
  name?: string;
  isStop?: boolean;
  duration?: number; // time to spend at waypoint
  properties: {
    poiId?: string;
    address?: string;
    type?: string;
  };
}

/**
 * User preferences for route calculation
 */
export interface UserPreferences {
  speed: number; // 1-5 priority
  safety: number; // 1-5 priority
  accessibility: number; // 1-5 priority
  cost: number; // 1-5 priority
  comfort: number; // 1-5 priority
  environmental: number; // 1-5 priority
  scenic: boolean;
  minimizeTransfers: boolean;
  avoidWalking: boolean;
  avoidCycling: boolean;
  avoidStairs: boolean;
  requireWheelchairAccessibility: boolean;
  preferredModes: TransportMode[];
  avoidedModes: TransportMode[];
}

/**
 * Constraints for route calculation
 */
export interface RouteConstraints {
  maxDistance: number; // in meters
  maxDuration: number; // in seconds
  maxTransfers: number;
  maxWalkingDistance: number; // in meters
  maxCyclingDistance: number; // in meters
  maxCost: number; // monetary
  departureTime?: Date;
  arrivalTime?: Date;
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidFerries: boolean;
  avoidUnpavedRoads: boolean;
  requireBikeLane: boolean;
  requireSidewalk: boolean;
}

/**
 * Request for route calculation
 */
export interface RouteRequest {
  origin: Coordinate;
  destination: Coordinate;
  transportModes: TransportMode[];
  preferences: UserPreferences;
  constraints: RouteConstraints;
  waypoints?: Coordinate[];
}

/**
 * Request for route calculation with waypoints
 */
export interface WaypointRouteRequest extends Omit<RouteRequest, 'waypoints'> {
  waypoints: Waypoint[];
}

/**
 * Represents a complete multi-modal route
 */
export interface MultiModalRoute {
  id: string;
  segments: RouteSegment[];
  totalDistance: number; // in meters
  totalDuration: number; // in seconds
  totalCost: number; // monetary
  totalWalkingDistance: number; // in meters
  totalCyclingDistance: number; // in meters
  totalTransfers: number;
  accessibilityScore: number; // 0-1
  environmentalScore: number; // 0-1
  safetyScore: number; // 0-1
  comfortScore: number; // 0-1
  waypoints: Waypoint[];
  alternatives: MultiModalRoute[];
  geometry: Coordinate[]; // complete route polyline
  bounds: {
    northEast: Coordinate;
    southWest: Coordinate;
  };
  summary: {
    startAddress?: string;
    endAddress?: string;
    viaAddresses?: string[];
    totalFare?: string;
    currency?: string;
  };
  metadata: {
    algorithm: string;
    calculationTime: number; // in milliseconds
    createdAt: Date;
    isOptimal: boolean;
    hasRealTimeData: boolean;
  };
}

/**
 * Route score for comparison
 */
export interface RouteScore {
  time: number; // normalized 0-1
  cost: number; // normalized 0-1
  distance: number; // normalized 0-1
  safety: number; // normalized 0-1
  accessibility: number; // normalized 0-1
  environmental: number; // normalized 0-1
  comfort: number; // normalized 0-1
  transfers: number; // normalized 0-1
  overall: number; // weighted sum
}

/**
 * Route comparison result
 */
export interface RouteComparison {
  primary: MultiModalRoute;
  alternatives: MultiModalRoute[];
  scores: Map<string, RouteScore>; // route id -> score
  recommendations: {
    fastest: string; // route id
    shortest: string; // route id
    cheapest: string; // route id
    mostAccessible: string; // route id
    mostEcoFriendly: string; // route id
    safest: string; // route id
    mostComfortable: string; // route id
    bestOverall: string; // route id
  };
}

/**
 * Real-time conditions that affect routing
 */
export interface RealTimeConditions {
  traffic: {
    segmentId: string;
    delay: number; // in seconds
    speed: number; // current speed
  }[];
  transit: {
    routeId: string;
    delay: number; // in seconds
    status: 'on_time' | 'delayed' | 'cancelled' | 'early';
  }[];
  weather: {
    condition: 'clear' | 'rain' | 'snow' | 'fog' | 'storm';
    temperature: number; // in celsius
    windSpeed: number; // in km/h
    visibility: number; // in meters
  };
  events: {
    id: string;
    type: 'construction' | 'accident' | 'event' | 'closure';
    location: {
      coordinate: Coordinate;
      radius: number; // in meters
    };
    impact: 'low' | 'medium' | 'high';
    startTime: Date;
    endTime: Date;
  }[];
}

/**
 * Route adaptation result
 */
export interface AdaptedRoute {
  originalRoute: MultiModalRoute;
  adaptedRoute: MultiModalRoute;
  adaptationReason: string;
  adaptationTime: Date;
  confidence: number; // 0-1
  changes: {
    segmentsAdded: number;
    segmentsRemoved: number;
    timeDifference: number; // in seconds
    costDifference: number; // monetary
  };
}