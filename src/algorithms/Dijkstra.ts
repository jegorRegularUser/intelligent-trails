/**
 * Dijkstra's algorithm implementation for multi-modal routing
 * Supports weighted shortest path finding with user preferences
 */

import {
  MultiModalGraph,
  GraphNode,
  GraphEdge,
  TransferPoint,
  TransportMode,
  Coordinate,
  AccessibilityInfo
} from '../types/graph';
import {
  MultiModalRoute,
  RouteSegment,
  RouteInstruction,
  UserPreferences,
  RouteConstraints,
  InstructionType,
  Maneuver,
  Landmark
} from '../types/routing';
import { PriorityQueue } from '../data-structures/PriorityQueue';
import { MultiModalGraphImpl } from '../graph/MultiModalGraph';

/**
 * Queue item for Dijkstra's algorithm
 */
interface QueueItem {
  nodeId: string;
  distance: number;
  cost: number;
  modes: TransportMode[];
  path: PathNode[];
}

/**
 * Path node for reconstructing the route
 */
interface PathNode {
  nodeId: string;
  edgeId?: string;
  transferId?: string;
  mode: TransportMode;
  fromNodeId?: string;
  toNodeId?: string;
}

/**
 * Algorithm result
 */
interface AlgorithmResult {
  success: boolean;
  path: PathNode[];
  totalDistance: number;
  totalDuration: number;
  totalCost: number;
  modes: TransportMode[];
}

/**
 * Dijkstra's algorithm implementation for multi-modal routing
 */
export class MultiModalDijkstra {
  private graph: MultiModalGraphImpl;
  private preferences: UserPreferences;
  private constraints: RouteConstraints;

  constructor(
    graph: MultiModalGraphImpl, 
    preferences: UserPreferences, 
    constraints: RouteConstraints
  ) {
    this.graph = graph;
    this.preferences = preferences;
    this.constraints = constraints;
  }

  /**
   * Find the shortest path between two nodes
   */
  findShortestPath(startNodeId: string, endNodeId: string): AlgorithmResult {
    // Priority queue for nodes to visit
    const queue = new PriorityQueue<QueueItem>();
    const distances = new Map<string, number>();
    const costs = new Map<string, number>();
    const previous = new Map<string, PathNode>();
    const visited = new Set<string>();

    // Initialize distances
    distances.set(startNodeId, 0);
    costs.set(startNodeId, 0);
    queue.enqueue({
      nodeId: startNodeId,
      distance: 0,
      cost: 0,
      modes: [],
      path: []
    }, 0);

    while (!queue.isEmpty()) {
      const current = queue.dequeue();
      if (!current) break;

      // Skip if already visited
      if (visited.has(current.nodeId)) continue;
      visited.add(current.nodeId);

      // Found destination
      if (current.nodeId === endNodeId) {
        return {
          success: true,
          path: current.path,
          totalDistance: current.distance,
          totalDuration: current.distance, // Using distance as time for now
          totalCost: current.cost,
          modes: current.modes
        };
      }

      // Explore neighbors
      const neighbors = this.getNeighbors(current.nodeId, current.modes);
      for (const neighbor of neighbors) {
        if (visited.has(neighbor.nodeId)) continue;

        // Calculate weighted distance based on preferences
        const weightedDistance = this.calculateWeightedDistance(
          current.distance,
          neighbor.distance,
          neighbor.mode,
          neighbor.cost,
          current.modes
        );

        // Check if this path is better
        const existingDistance = distances.get(neighbor.nodeId);
        if (existingDistance === undefined || weightedDistance < existingDistance) {
          distances.set(neighbor.nodeId, weightedDistance);
          costs.set(neighbor.nodeId, current.cost + neighbor.cost);

          // Create path node
          const pathNode: PathNode = {
            nodeId: neighbor.nodeId,
            edgeId: neighbor.edgeId,
            transferId: neighbor.transferId,
            mode: neighbor.mode,
            fromNodeId: current.nodeId,
            toNodeId: neighbor.nodeId
          };

          previous.set(neighbor.nodeId, pathNode);

          // Update modes array
          const newModes = [...current.modes];
          if (!newModes.includes(neighbor.mode)) {
            newModes.push(neighbor.mode);
          }

          queue.enqueue({
            nodeId: neighbor.nodeId,
            distance: weightedDistance,
            cost: current.cost + neighbor.cost,
            modes: newModes,
            path: [...current.path, pathNode]
          }, weightedDistance);
        }
      }
    }

    // No path found
    return {
      success: false,
      path: [],
      totalDistance: 0,
      totalDuration: 0,
      totalCost: 0,
      modes: []
    };
  }

  /**
   * Get all neighbors of a node
   */
  private getNeighbors(nodeId: string, currentModes: TransportMode[]): Neighbor[] {
    const node = this.graph.getNode(nodeId);
    if (!node) return [];

    const neighbors: Neighbor[] = [];

    // Get direct edges for each available mode
    for (const mode of node.modes) {
      // Skip if this mode is avoided by user preferences
      if (this.preferences.avoidedModes.includes(mode)) continue;

      const edges = this.graph.getEdgesForMode(nodeId, mode);
      for (const edge of edges) {
        // Skip if edge doesn't meet constraints
        if (!this.meetsConstraints(edge)) continue;

        neighbors.push({
          nodeId: edge.to === nodeId ? edge.from : edge.to,
          distance: edge.duration,
          mode: mode,
          cost: edge.cost,
          edgeId: edge.id,
          transferId: undefined
        });
      }
    }

    // Get transfer points
    const transfers = this.getTransfersForNode(nodeId);
    for (const transfer of transfers) {
      // Check if transfer is allowed based on constraints
      if (this.isTransferAllowed(currentModes, transfer)) {
        neighbors.push({
          nodeId: transfer.id,
          distance: transfer.transferTime,
          mode: transfer.toMode,
          cost: this.calculateTransferCost(transfer),
          edgeId: undefined,
          transferId: transfer.id
        });
      }
    }

    return neighbors;
  }

  /**
   * Get transfer points for a node
   */
  private getTransfersForNode(nodeId: string): TransferPoint[] {
    const node = this.graph.getNode(nodeId);
    if (!node) return [];

    const transfers: TransferPoint[] = [];
    const coordinate = node.coordinate;

    // Find nearby transfer points
    const nearbyTransfers = this.graph.findNearbyTransfers(coordinate, 500); // 500m radius

    for (const transfer of nearbyTransfers) {
      // Check if transfer is relevant to this node's modes
      if (node.modes.includes(transfer.fromMode)) {
        transfers.push(transfer);
      }
    }

    return transfers;
  }

  /**
   * Check if a transfer is allowed
   */
  private isTransferAllowed(currentModes: TransportMode[], transfer: TransferPoint): boolean {
    // Skip if the target mode is avoided by user preferences
    if (this.preferences.avoidedModes.includes(transfer.toMode)) {
      return false;
    }

    // Check if we have the source mode available
    if (!currentModes.includes(transfer.fromMode)) {
      return false;
    }

    // Check transfer constraints
    if (transfer.constraints.maxWalkingDistance && 
        transfer.transferTime > transfer.constraints.maxWalkingDistance / 60) {
      return false;
    }

    return true;
  }

  /**
   * Calculate the cost of a transfer
   */
  private calculateTransferCost(transfer: TransferPoint): number {
    let cost = 0;

    // Base time cost
    cost += transfer.transferTime;

    // Monetary cost if required
    if (transfer.constraints.paymentRequired) {
      cost += 300; // 5 minutes equivalent
    }

    // Penalty for transfers if user wants to minimize them
    if (this.preferences.minimizeTransfers) {
      cost += 600; // 10 minutes penalty
    }

    return cost;
  }

  /**
   * Calculate weighted distance based on preferences
   */
  private calculateWeightedDistance(
    currentDistance: number,
    edgeDistance: number,
    mode: TransportMode,
    cost: number,
    currentModes: TransportMode[]
  ): number {
    // Base distance
    let weightedDistance = currentDistance + edgeDistance;

    // Apply preference weights
    const speedWeight = this.preferences.speed / 5;
    const costWeight = this.preferences.cost / 5;
    const safetyWeight = this.preferences.safety / 5;
    const environmentalWeight = this.preferences.environmental / 5;
    const comfortWeight = this.preferences.comfort / 5;

    // Mode-specific adjustments
    switch (mode) {
      case TransportMode.WALKING:
        weightedDistance *= (2 - speedWeight); // Slower but more environmentally friendly
        weightedDistance *= (1 + environmentalWeight * 0.5);
        if (this.preferences.avoidWalking) weightedDistance *= 2;
        break;
      case TransportMode.BICYCLE:
        weightedDistance *= (1.5 - speedWeight * 0.5);
        weightedDistance *= (1 + environmentalWeight * 0.7);
        if (this.preferences.avoidCycling) weightedDistance *= 2;
        break;
      case TransportMode.CAR:
        weightedDistance *= (1 + speedWeight * 0.5);
        weightedDistance *= (1 + costWeight * cost / 10);
        weightedDistance *= (1 - environmentalWeight * 0.5);
        break;
      case TransportMode.METRO:
        weightedDistance *= (1.2 - speedWeight * 0.3);
        weightedDistance *= (1 + safetyWeight * 0.3);
        break;
      case TransportMode.BUS:
        weightedDistance *= (1.3 - speedWeight * 0.2);
        weightedDistance *= (1 + costWeight * 0.2);
        break;
      default:
        weightedDistance *= (1.5 - speedWeight * 0.3);
    }

    // Add cost penalty
    weightedDistance += cost * costWeight;

    // Add transfer penalty if this is a new mode
    if (!currentModes.includes(mode)) {
      weightedDistance += this.preferences.minimizeTransfers ? 300 : 60;
    }

    return weightedDistance;
  }

  /**
   * Check if an edge meets the route constraints
   */
  private meetsConstraints(edge: GraphEdge): boolean {
    // Check distance constraints
    if (edge.distance > this.constraints.maxDistance) {
      return false;
    }

    // Check cost constraints
    if (edge.cost > this.constraints.maxCost) {
      return false;
    }

    // Check toll constraints
    if (this.constraints.avoidTolls && edge.properties.toll) {
      return false;
    }

    // Check accessibility constraints
    if (this.preferences.requireWheelchairAccessibility &&
        !edge.accessibility.wheelchairAccessible) {
      return false;
    }

    // Check bike lane constraints
    if (this.constraints.requireBikeLane && 
        edge.mode === TransportMode.BICYCLE && 
        !edge.properties.separatedBikeLane) {
      return false;
    }

    return true;
  }

  /**
   * Convert algorithm result to a MultiModalRoute
   */
  convertToRoute(result: AlgorithmResult, startNodeId: string, endNodeId: string): MultiModalRoute | null {
    if (!result.success) {
      return null;
    }

    const segments: RouteSegment[] = [];
    let totalDistance = 0;
    let totalDuration = 0;
    let totalCost = 0;
    let totalWalkingDistance = 0;
    let totalCyclingDistance = 0;
    let totalTransfers = 0;
    const geometry: Coordinate[] = [];

    // Get start and end nodes
    const startNode = this.graph.getNode(startNodeId);
    const endNode = this.graph.getNode(endNodeId);

    if (!startNode || !endNode) {
      return null;
    }

    // Add start coordinate to geometry
    geometry.push(startNode.coordinate);

    // Process path nodes to create segments
    for (let i = 0; i < result.path.length; i++) {
      const pathNode = result.path[i];
      const fromNode = this.graph.getNode(pathNode.fromNodeId || startNodeId);
      const toNode = this.graph.getNode(pathNode.toNodeId || pathNode.nodeId);

      if (!fromNode || !toNode) {
        continue;
      }

      let edge: GraphEdge | undefined;
      let isTransfer = false;

      // Get edge or transfer
      if (pathNode.edgeId) {
        edge = this.graph.getEdge(pathNode.edgeId);
      } else if (pathNode.transferId) {
        const transfer = this.graph.getTransfer(pathNode.transferId);
        if (transfer) {
          isTransfer = true;
          // Create a virtual edge for the transfer
          edge = {
            id: `transfer-${pathNode.transferId}`,
            from: fromNode.id,
            to: toNode.id,
            distance: this.calculateDistance(fromNode.coordinate, toNode.coordinate),
            duration: transfer.transferTime,
            mode: transfer.toMode,
            cost: this.calculateTransferCost(transfer),
            accessibility: transfer.accessibility,
            properties: {},
            realTimeData: undefined
          };
        }
      }

      if (!edge) {
        continue;
      }

      // Create segment
      const segment: RouteSegment = {
        id: `segment-${i}`,
        mode: pathNode.mode,
        from: fromNode.id,
        to: toNode.id,
        fromCoordinate: fromNode.coordinate,
        toCoordinate: toNode.coordinate,
        distance: edge.distance,
        duration: edge.duration,
        cost: edge.cost,
        instructions: this.generateInstructions(fromNode, toNode, edge, isTransfer),
        realTimeData: edge.realTimeData,
        geometry: [fromNode.coordinate, toNode.coordinate],
        accessibility: edge.accessibility,
        properties: {}
      };

      segments.push(segment);

      // Update totals
      totalDistance += edge.distance;
      totalDuration += edge.duration;
      totalCost += edge.cost;

      if (pathNode.mode === TransportMode.WALKING) {
        totalWalkingDistance += edge.distance;
      } else if (pathNode.mode === TransportMode.BICYCLE) {
        totalCyclingDistance += edge.distance;
      }

      if (isTransfer) {
        totalTransfers++;
      }

      // Add to geometry (skip the first coordinate to avoid duplicates)
      if (i > 0) {
        geometry.push(toNode.coordinate);
      }
    }

    // Calculate scores
    const accessibilityScore = this.calculateAccessibilityScore(segments);
    const environmentalScore = this.calculateEnvironmentalScore(segments);
    const safetyScore = this.calculateSafetyScore(segments);
    const comfortScore = this.calculateComfortScore(segments);

    return {
      id: `route-${Date.now()}-${Math.random()}`,
      segments,
      totalDistance,
      totalDuration,
      totalCost,
      totalWalkingDistance,
      totalCyclingDistance,
      totalTransfers,
      accessibilityScore,
      environmentalScore,
      safetyScore,
      comfortScore,
      waypoints: [],
      alternatives: [],
      geometry,
      bounds: this.calculateBounds(geometry),
      summary: {},
      metadata: {
        algorithm: 'dijkstra',
        calculationTime: 0, // Would be measured in actual implementation
        createdAt: new Date(),
        isOptimal: true,
        hasRealTimeData: segments.some(s => s.realTimeData !== undefined)
      }
    };
  }

  /**
   * Generate route instructions for a segment
   */
  private generateInstructions(
    fromNode: GraphNode, 
    toNode: GraphNode, 
    edge: GraphEdge, 
    isTransfer: boolean
  ): RouteInstruction[] {
    const instructions: RouteInstruction[] = [];

    if (isTransfer) {
      instructions.push({
        id: `transfer-${Date.now()}`,
        type: InstructionType.TRANSFER,
        text: `Transfer to ${edge.mode}`,
        distance: edge.distance,
        duration: edge.duration,
        maneuver: {
          type: InstructionType.TRANSFER
        },
        landmarks: [],
        accessibilityInfo: edge.accessibility,
        coordinate: fromNode.coordinate
      });
    } else {
      instructions.push({
        id: `depart-${Date.now()}`,
        type: InstructionType.DEPART,
        text: `Depart from ${fromNode.properties.name || 'location'}`,
        distance: 0,
        duration: 0,
        maneuver: {
          type: InstructionType.DEPART
        },
        landmarks: [],
        accessibilityInfo: edge.accessibility,
        coordinate: fromNode.coordinate
      });

      instructions.push({
        id: `continue-${Date.now()}`,
        type: InstructionType.CONTINUE_STRAIGHT,
        text: `Continue on ${edge.properties.roadClass || 'path'}`,
        distance: edge.distance,
        duration: edge.duration,
        maneuver: {
          type: InstructionType.CONTINUE_STRAIGHT
        },
        landmarks: [],
        accessibilityInfo: edge.accessibility,
        coordinate: toNode.coordinate
      });
    }

    return instructions;
  }

  /**
   * Calculate distance between two coordinates
   */
  private calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (coord2.latitude - coord1.latitude) * Math.PI / 180;
    const dLon = (coord2.longitude - coord1.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(coord1.latitude * Math.PI / 180) * Math.cos(coord2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Calculate accessibility score for a route
   */
  private calculateAccessibilityScore(segments: RouteSegment[]): number {
    if (segments.length === 0) return 0;

    let totalScore = 0;
    for (const segment of segments) {
      let segmentScore = 0;
      const accessibility = segment.accessibility;

      if (accessibility.wheelchairAccessible) segmentScore += 0.25;
      if (accessibility.visuallyImpairedFriendly) segmentScore += 0.25;
      if (accessibility.hasElevator) segmentScore += 0.25;
      if (accessibility.hasRamp) segmentScore += 0.25;

      totalScore += segmentScore;
    }

    return totalScore / segments.length;
  }

  /**
   * Calculate environmental score for a route
   */
  private calculateEnvironmentalScore(segments: RouteSegment[]): number {
    if (segments.length === 0) return 0;

    let totalScore = 0;
    for (const segment of segments) {
      let segmentScore = 0;
      
      switch (segment.mode) {
        case TransportMode.WALKING:
        case TransportMode.BICYCLE:
          segmentScore = 1.0;
          break;
        case TransportMode.BUS:
        case TransportMode.METRO:
        case TransportMode.TRAM:
        case TransportMode.TRAIN:
          segmentScore = 0.8;
          break;
        case TransportMode.FERRY:
          segmentScore = 0.6;
          break;
        case TransportMode.CAR:
          segmentScore = 0.2;
          break;
      }

      totalScore += segmentScore;
    }

    return totalScore / segments.length;
  }

  /**
   * Calculate safety score for a route
   */
  private calculateSafetyScore(segments: RouteSegment[]): number {
    if (segments.length === 0) return 0;

    let totalScore = 0;
    for (const segment of segments) {
      let segmentScore = 0.5; // Base score
      
      // Adjust based on mode and infrastructure
      switch (segment.mode) {
        case TransportMode.METRO:
        case TransportMode.TRAIN:
          segmentScore = 0.9;
          break;
        case TransportMode.BUS:
        case TransportMode.TRAM:
          segmentScore = 0.8;
          break;
        case TransportMode.WALKING:
          segmentScore = segment.accessibility.hasRamp ? 0.8 : 0.6;
          break;
        case TransportMode.BICYCLE:
          segmentScore = segment.accessibility.hasRamp ? 0.8 : 0.5;
          break;
        case TransportMode.CAR:
          segmentScore = 0.4;
          break;
      }

      totalScore += segmentScore;
    }

    return totalScore / segments.length;
  }

  /**
   * Calculate comfort score for a route
   */
  private calculateComfortScore(segments: RouteSegment[]): number {
    if (segments.length === 0) return 0;

    let totalScore = 0;
    for (const segment of segments) {
      let segmentScore = 0.5; // Base score
      
      // Adjust based on mode
      switch (segment.mode) {
        case TransportMode.METRO:
        case TransportMode.TRAIN:
          segmentScore = 0.9;
          break;
        case TransportMode.BUS:
        case TransportMode.TRAM:
          segmentScore = 0.7;
          break;
        case TransportMode.CAR:
          segmentScore = 0.8;
          break;
        case TransportMode.WALKING:
        case TransportMode.BICYCLE:
          segmentScore = 0.6;
          break;
      }

      totalScore += segmentScore;
    }

    return totalScore / segments.length;
  }

  /**
   * Calculate bounds from geometry
   */
  private calculateBounds(geometry: Coordinate[]): { northEast: Coordinate; southWest: Coordinate } {
    if (geometry.length === 0) {
      return {
        northEast: { latitude: 0, longitude: 0 },
        southWest: { latitude: 0, longitude: 0 }
      };
    }

    let minLat = geometry[0].latitude;
    let maxLat = geometry[0].latitude;
    let minLon = geometry[0].longitude;
    let maxLon = geometry[0].longitude;

    for (const coord of geometry) {
      minLat = Math.min(minLat, coord.latitude);
      maxLat = Math.max(maxLat, coord.latitude);
      minLon = Math.min(minLon, coord.longitude);
      maxLon = Math.max(maxLon, coord.longitude);
    }

    return {
      northEast: { latitude: maxLat, longitude: maxLon },
      southWest: { latitude: minLat, longitude: minLon }
    };
  }
}

/**
 * Neighbor interface for Dijkstra's algorithm
 */
interface Neighbor {
  nodeId: string;
  distance: number;
  mode: TransportMode;
  cost: number;
  edgeId?: string;
  transferId?: string;
}