/**
 * Core graph data structure types for the multi-modal routing system
 */

/**
 * Represents a coordinate point with latitude and longitude
 */
export interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Transport modes supported by the routing system
 */
export enum TransportMode {
  WALKING = "walking",
  BICYCLE = "bicycle",
  CAR = "car",
  BUS = "bus",
  METRO = "metro",
  TRAM = "tram",
  TRAIN = "train",
  FERRY = "ferry",
}

/**
 * Node types in the graph
 */
export enum NodeType {
  INTERSECTION = "intersection",
  TRANSIT_STOP = "transit_stop",
  BIKE_STATION = "bike_station",
  PARKING = "parking",
  POI = "poi",
  TRANSFER = "transfer",
}

/**
 * Accessibility information for nodes and edges
 */
export interface AccessibilityInfo {
  wheelchairAccessible: boolean;
  visuallyImpairedFriendly: boolean;
  hasElevator: boolean;
  hasRamp: boolean;
  audioSignals: boolean;
  tactilePaving: boolean;
}

/**
 * Amenity information available at nodes
 */
export interface Amenity {
  id: string;
  type: string;
  name: string;
  operatingHours?: {
    [key: string]: string; // day -> hours
  };
}

/**
 * Properties specific to nodes
 */
export interface NodeProperties {
  name?: string;
  address?: string;
  elevation?: number;
  isIndoor?: boolean;
  floor?: number;
  buildingId?: string;
}

/**
 * Represents a node in the multi-modal graph
 */
export interface GraphNode {
  id: string;
  coordinate: Coordinate;
  elevation?: number;
  modes: TransportMode[];
  accessibility: AccessibilityInfo;
  amenities: Amenity[];
  type: NodeType;
  properties: NodeProperties;
}

/**
 * Properties specific to edges
 */
export interface EdgeProperties {
  roadClass?: string;
  maxSpeed?: number;
  surface?: string;
  toll?: boolean;
  gradient?: number;
  separatedBikeLane?: boolean;
  publicTransportRoute?: string;
  routeNumber?: string;
}

/**
 * Real-time data for edges
 */
export interface RealTimeEdgeData {
  currentSpeed?: number;
  congestionLevel?: number; // 0-1
  delay?: number; // in seconds
  blocked?: boolean;
  lastUpdated: Date;
}

/**
 * Represents an edge in the multi-modal graph
 */
export interface GraphEdge {
  id: string;
  from: string; // node id
  to: string; // node id
  distance: number; // in meters
  duration: number; // in seconds
  mode: TransportMode;
  cost: number; // monetary cost
  accessibility: AccessibilityInfo;
  properties: EdgeProperties;
  realTimeData?: RealTimeEdgeData;
}

/**
 * Constraints for transfers between transport modes
 */
export interface TransferConstraints {
  maxWalkingDistance?: number;
  maxTransferTime?: number;
  requiresTicket?: boolean;
  paymentRequired?: boolean;
}

/**
 * Facilities available at transfer points
 */
export interface TransferFacility {
  id: string;
  type: string;
  name: string;
  accessibility: AccessibilityInfo;
}

/**
 * Represents a transfer point between different transport modes
 */
export interface TransferPoint {
  id: string;
  coordinate: Coordinate;
  fromMode: TransportMode;
  toMode: TransportMode;
  transferTime: number; // in seconds
  accessibility: AccessibilityInfo;
  constraints: TransferConstraints;
  facilities: TransferFacility[];
}

/**
 * Constraints for the graph
 */
export interface GraphConstraints {
  maxDistance: number;
  maxDuration: number;

  maxCost: number;
  departureTime: any;
  arrivalTime: any;

  avoidFerries: boolean;
  avoidUnpavedRoads: boolean;
  requireBikeLane: boolean;
  requireSidewalk: boolean;
  maxWalkingDistance?: number;
  maxCyclingDistance?: number;
  maxTransfers?: number;
  maxTotalTime?: number;
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  avoidStairs?: boolean;
  requireWheelchairAccessibility?: boolean;
}

/**
 * Metadata for the graph
 */
export interface GraphMetadata {
  version: string;
  lastUpdated: Date;
  boundingBox: {
    northEast: Coordinate;
    southWest: Coordinate;
  };
  nodeCount: number;
  edgeCount: number;
  transferCount: number;
  supportedModes: TransportMode[];
}

/**
 * Represents the complete multi-modal graph
 */
export interface MultiModalGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  transfers: Map<string, TransferPoint>;
  constraints: GraphConstraints;
  metadata: GraphMetadata;
}

/**
 * Represents a spatial index for efficient spatial queries
 */
export interface SpatialIndex {
  /**
   * Find nodes within a given radius of a coordinate
   */
  findNearbyNodes(coordinate: Coordinate, radius: number): GraphNode[];

  /**
   * Find edges that intersect with a given bounding box
   */
  findEdgesInBoundingBox(
    northEast: Coordinate,
    southWest: Coordinate
  ): GraphEdge[];

  /**
   * Add a node to the spatial index
   */
  addNode(node: GraphNode): void;

  /**
   * Add an edge to the spatial index
   */
  addEdge(edge: GraphEdge): void;

  /**
   * Clear the spatial index
   */
  clear(): void;
}

/**
 * Represents a priority queue for algorithm implementation
 */
export interface PriorityQueue<T> {
  /**
   * Add an item to the queue with a priority
   */
  enqueue(item: T, priority: number): void;

  /**
   * Remove and return the item with the highest priority
   */
  dequeue(): T | null;

  /**
   * Check if the queue is empty
   */
  isEmpty(): boolean;

  /**
   * Get the number of items in the queue
   */
  size(): number;

  /**
   * Check if an item is in the queue
   */
  contains(item: T): boolean;

  /**
   * Update the priority of an item
   */
  updatePriority(item: T, newPriority: number): void;

  /**
   * Clear the queue
   */
  clear(): void;
}
