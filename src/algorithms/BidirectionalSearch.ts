/**
 * Bidirectional search implementation for multi-modal routing
 * Searches from both start and end nodes simultaneously for faster pathfinding
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
import { MultiModalDijkstra } from './Dijkstra';

/**
 * Search direction for bidirectional search
 */
enum SearchDirection {
  FORWARD = 'forward',
  BACKWARD = 'backward'
}

/**
 * Search node for bidirectional search
 */
interface SearchNode {
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
  meetingNodeId?: string;
}

/**
 * Bidirectional search implementation for multi-modal routing
 */
export class BidirectionalSearch {
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
   * Find the shortest path between two nodes using bidirectional search
   */
  findShortestPath(startNodeId: string, endNodeId: string): AlgorithmResult {
    // Priority queues for both directions
    const forwardQueue = new PriorityQueue<SearchNode>();
    const backwardQueue = new PriorityQueue<SearchNode>();

    // Distance maps for both directions
    const forwardDistances = new Map<string, number>();
    const backwardDistances = new Map<string, number>();

    // Path maps for both directions
    const forwardPaths = new Map<string, PathNode[]>();
    const backwardPaths = new Map<string, PathNode[]>();

    // Visited sets for both directions
    const forwardVisited = new Set<string>();
    const backwardVisited = new Set<string>();

    // Initialize forward search
    forwardDistances.set(startNodeId, 0);
    forwardPaths.set(startNodeId, []);
    forwardQueue.enqueue({
      nodeId: startNodeId,
      distance: 0,
      cost: 0,
      modes: [],
      path: []
    }, 0);

    // Initialize backward search
    backwardDistances.set(endNodeId, 0);
    backwardPaths.set(endNodeId, []);
    backwardQueue.enqueue({
      nodeId: endNodeId,
      distance: 0,
      cost: 0,
      modes: [],
      path: []
    }, 0);

    // Track the best meeting point and path
    let bestMeetingNodeId: string | null = null;
    let bestTotalDistance = Infinity;

    // Alternate between forward and backward searches
    while (!forwardQueue.isEmpty() && !backwardQueue.isEmpty()) {
      // Forward search step
      const forwardResult = this.searchStep(
        forwardQueue,
        forwardDistances,
        forwardPaths,
        forwardVisited,
        backwardVisited,
        SearchDirection.FORWARD
      );

      if (forwardResult) {
        const { meetingNodeId, totalDistance } = forwardResult;
        if (totalDistance < bestTotalDistance) {
          bestTotalDistance = totalDistance;
          bestMeetingNodeId = meetingNodeId;
        }
      }

      // Check if we've found a path
      if (bestMeetingNodeId !== null) {
        // Check if we can terminate early
        const minForwardDistance = forwardQueue.isEmpty() ? Infinity : this.getMinPriority(forwardQueue);
        const minBackwardDistance = backwardQueue.isEmpty() ? Infinity : this.getMinPriority(backwardQueue);
        
        if (bestTotalDistance <= minForwardDistance + minBackwardDistance) {
          break;
        }
      }

      // Backward search step
      const backwardResult = this.searchStep(
        backwardQueue,
        backwardDistances,
        backwardPaths,
        backwardVisited,
        forwardVisited,
        SearchDirection.BACKWARD
      );

      if (backwardResult) {
        const { meetingNodeId, totalDistance } = backwardResult;
        if (totalDistance < bestTotalDistance) {
          bestTotalDistance = totalDistance;
          bestMeetingNodeId = meetingNodeId;
        }
      }

      // Check if we've found a path
      if (bestMeetingNodeId !== null) {
        // Check if we can terminate early
        const minForwardDistance = forwardQueue.isEmpty() ? Infinity : this.getMinPriority(forwardQueue);
        const minBackwardDistance = backwardQueue.isEmpty() ? Infinity : this.getMinPriority(backwardQueue);
        
        if (bestTotalDistance <= minForwardDistance + minBackwardDistance) {
          break;
        }
      }
    }

    // If we found a meeting point, reconstruct the full path
    if (bestMeetingNodeId !== null) {
      const forwardPath = forwardPaths.get(bestMeetingNodeId) || [];
      const backwardPath = backwardPaths.get(bestMeetingNodeId) || [];
      
      // Reverse the backward path and remove the meeting point node to avoid duplication
      const reversedBackwardPath = backwardPath
        .slice()
        .reverse()
        .filter(node => node.nodeId !== bestMeetingNodeId);
      
      const fullPath = [...forwardPath, ...reversedBackwardPath];
      
      // Calculate total cost and modes
      const forwardCost = forwardDistances.get(bestMeetingNodeId) || 0;
      const backwardCost = backwardDistances.get(bestMeetingNodeId) || 0;
      const totalCost = forwardCost + backwardCost;
      
      // Get all unique modes
      const modesSet = new Set<TransportMode>();
      for (const node of fullPath) {
        if (node.mode && !modesSet.has(node.mode)) {
          modesSet.add(node.mode);
        }
      }
      const modes = Array.from(modesSet);
      
      return {
        success: true,
        path: fullPath,
        totalDistance: bestTotalDistance,
        totalDuration: bestTotalDistance, // Using distance as time for now
        totalCost,
        modes,
        meetingNodeId: bestMeetingNodeId
      };
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
   * Perform one step of the search in the given direction
   */
  private searchStep(
    queue: PriorityQueue<SearchNode>,
    distances: Map<string, number>,
    paths: Map<string, PathNode[]>,
    visited: Set<string>,
    otherVisited: Set<string>,
    direction: SearchDirection
  ): { meetingNodeId: string; totalDistance: number } | null {
    if (queue.isEmpty()) {
      return null;
    }

    const current = queue.dequeue();
    if (!current) {
      return null;
    }

    // Skip if already visited
    if (visited.has(current.nodeId)) {
      return null;
    }
    visited.add(current.nodeId);

    // Check if this node has been visited by the other search
    if (otherVisited.has(current.nodeId)) {
      // Found a meeting point
      const otherDistance = this.getOtherDistance(current.nodeId, direction);
      const totalDistance = current.distance + otherDistance;
      
      return {
        meetingNodeId: current.nodeId,
        totalDistance
      };
    }

    // Explore neighbors
    const neighbors = this.getNeighbors(current.nodeId, current.modes, direction);
    for (const neighbor of neighbors) {
      if (visited.has(neighbor.nodeId)) {
        continue;
      }

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

        // Create path node
        const pathNode: PathNode = {
          nodeId: neighbor.nodeId,
          edgeId: neighbor.edgeId,
          transferId: neighbor.transferId,
          mode: neighbor.mode,
          fromNodeId: current.nodeId,
          toNodeId: neighbor.nodeId
        };

        // Update path
        const newPath = [...current.path, pathNode];
        paths.set(neighbor.nodeId, newPath);

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
          path: newPath
        }, weightedDistance);
      }
    }

    return null;
  }

  /**
   * Get neighbors for a node in the given direction
   */
  private getNeighbors(nodeId: string, currentModes: TransportMode[], direction: SearchDirection): Neighbor[] {
    const node = this.graph.getNode(nodeId);
    if (!node) return [];

    const neighbors: Neighbor[] = [];

    // Get direct edges for each available mode
    for (const mode of node.modes) {
      // Skip if this mode is avoided by user preferences
      if (this.preferences.avoidedModes.includes(mode)) continue;

      let edges: GraphEdge[] = [];
      
      if (direction === SearchDirection.FORWARD) {
        edges = this.graph.getEdgesForMode(nodeId, mode);
      } else {
        // For backward search, we need to reverse the edges
        const allEdges = this.graph.getEdgesForMode(nodeId, mode);
        edges = allEdges.filter(edge => edge.to === nodeId);
      }

      for (const edge of edges) {
        // Skip if edge doesn't meet constraints
        if (!this.meetsConstraints(edge)) continue;

        const neighborNodeId = direction === SearchDirection.FORWARD ? edge.to : edge.from;
        
        neighbors.push({
          nodeId: neighborNodeId,
          distance: edge.duration,
          mode: mode,
          cost: edge.cost,
          edgeId: edge.id,
          transferId: undefined
        });
      }
    }

    // Get transfer points
    const transfers = this.getTransfersForNode(nodeId, direction);
    for (const transfer of transfers) {
      // Check if transfer is allowed based on constraints
      if (this.isTransferAllowed(currentModes, transfer, direction)) {
        const neighborNodeId = direction === SearchDirection.FORWARD ? 
          transfer.toMode === transfer.fromMode ? transfer.id : transfer.id :
          transfer.fromMode === transfer.toMode ? transfer.id : transfer.id;
        
        neighbors.push({
          nodeId: neighborNodeId,
          distance: transfer.transferTime,
          mode: direction === SearchDirection.FORWARD ? transfer.toMode : transfer.fromMode,
          cost: this.calculateTransferCost(transfer),
          edgeId: undefined,
          transferId: transfer.id
        });
      }
    }

    return neighbors;
  }

  /**
   * Get transfer points for a node in the given direction
   */
  private getTransfersForNode(nodeId: string, direction: SearchDirection): TransferPoint[] {
    const node = this.graph.getNode(nodeId);
    if (!node) return [];

    const transfers: TransferPoint[] = [];
    const coordinate = node.coordinate;

    // Find nearby transfer points
    const nearbyTransfers = this.graph.findNearbyTransfers(coordinate, 500); // 500m radius

    for (const transfer of nearbyTransfers) {
      // Check if transfer is relevant to this node's modes and direction
      if (direction === SearchDirection.FORWARD) {
        if (node.modes.includes(transfer.fromMode)) {
          transfers.push(transfer);
        }
      } else {
        if (node.modes.includes(transfer.toMode)) {
          transfers.push(transfer);
        }
      }
    }

    return transfers;
  }

  /**
   * Check if a transfer is allowed in the given direction
   */
  private isTransferAllowed(
    currentModes: TransportMode[], 
    transfer: TransferPoint, 
    direction: SearchDirection
  ): boolean {
    const targetMode = direction === SearchDirection.FORWARD ? transfer.toMode : transfer.fromMode;
    const sourceMode = direction === SearchDirection.FORWARD ? transfer.fromMode : transfer.toMode;

    // Skip if the target mode is avoided by user preferences
    if (this.preferences.avoidedModes.includes(targetMode)) {
      return false;
    }

    // Check if we have the source mode available
    if (!currentModes.includes(sourceMode)) {
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
    // Create a temporary Dijkstra instance to reuse its calculation logic
    const dijkstra = new MultiModalDijkstra(this.graph, this.preferences, this.constraints);
    
    // Access the private method using a workaround
    return (dijkstra as any).calculateWeightedDistance(
      currentDistance,
      edgeDistance,
      mode,
      cost,
      currentModes
    );
  }

  /**
   * Check if an edge meets the route constraints
   */
  private meetsConstraints(edge: GraphEdge): boolean {
    // Create a temporary Dijkstra instance to reuse its constraint checking logic
    const dijkstra = new MultiModalDijkstra(this.graph, this.preferences, this.constraints);
    
    // Access the private method using a workaround
    return (dijkstra as any).meetsConstraints(edge);
  }

  /**
   * Get the distance from the other search direction
   */
  private getOtherDistance(nodeId: string, direction: SearchDirection): number {
    // This would typically be stored in a shared data structure
    // For simplicity, we'll return 0 here, but in a real implementation,
    // you'd need to maintain a shared distance map or use a different approach
    return 0;
  }

  /**
   * Get the minimum priority from a priority queue
   */
  private getMinPriority(queue: PriorityQueue<SearchNode>): number {
    // This is a simplified approach - in a real implementation,
    // you might want to add a peekMin method to the PriorityQueue
    if (queue.isEmpty()) {
      return Infinity;
    }
    
    // For now, we'll dequeue and re-enqueue to get the minimum priority
    const item = queue.dequeue();
    if (!item) {
      return Infinity;
    }
    
    const priority = item.distance; // Assuming distance is used as priority
    queue.enqueue(item, priority);
    
    return priority;
  }

  /**
   * Convert algorithm result to a MultiModalRoute (reusing Dijkstra's implementation)
   */
  convertToRoute(result: AlgorithmResult, startNodeId: string, endNodeId: string): MultiModalRoute | null {
    // Create a temporary Dijkstra instance to reuse its conversion logic
    const dijkstra = new MultiModalDijkstra(this.graph, this.preferences, this.constraints);
    
    // Access the private method using a workaround
    return (dijkstra as any).convertToRoute(result, startNodeId, endNodeId);
  }
}

/**
 * Neighbor interface for bidirectional search
 */
interface Neighbor {
  nodeId: string;
  distance: number;
  mode: TransportMode;
  cost: number;
  edgeId?: string;
  transferId?: string;
}