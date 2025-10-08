/**
 * A* algorithm implementation for multi-modal routing
 * Uses heuristics to guide the search toward the destination
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
 * Queue item for A* algorithm
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
 * Neighbor interface for A* algorithm
 */
interface Neighbor {
  nodeId: string;
  distance: number;
  mode: TransportMode;
  cost: number;
  edgeId?: string;
  transferId?: string;
}

/**
 * Heuristic function type for A* algorithm
 */
type HeuristicFunction = (nodeId: string, targetId: string) => number;

/**
 * A* algorithm implementation for multi-modal routing
 */
export class MultiModalAStar {
  private graph: MultiModalGraphImpl;
  private preferences: UserPreferences;
  private constraints: RouteConstraints;
  private heuristic: HeuristicFunction;

  constructor(
    graph: MultiModalGraphImpl, 
    preferences: UserPreferences, 
    constraints: RouteConstraints
  ) {
    this.graph = graph;
    this.preferences = preferences;
    this.constraints = constraints;
    this.heuristic = this.createHeuristic();
  }

  /**
   * Find the shortest path between two nodes using A* algorithm
   */
  findShortestPath(startNodeId: string, endNodeId: string): AlgorithmResult {
    // Priority queue for nodes to visit
    const queue = new PriorityQueue<QueueItem>();
    const gScore = new Map<string, number>(); // Cost from start to current node
    const fScore = new Map<string, number>(); // Estimated total cost from start to goal through current node
    const previous = new Map<string, PathNode>();
    const visited = new Set<string>();

    // Initialize scores
    gScore.set(startNodeId, 0);
    fScore.set(startNodeId, this.heuristic(startNodeId, endNodeId));
    queue.enqueue({
      nodeId: startNodeId,
      distance: 0,
      cost: 0,
      modes: [],
      path: []
    }, fScore.get(startNodeId)!);

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

        // Calculate tentative gScore
        const tentativeGScore = gScore.get(current.nodeId)! + 
          this.calculateWeightedDistance(
            current.distance,
            neighbor.distance,
            neighbor.mode,
            neighbor.cost,
            current.modes
          );

        // Check if this path is better
        const existingGScore = gScore.get(neighbor.nodeId);
        if (existingGScore === undefined || tentativeGScore < existingGScore) {
          // This path to neighbor is better than any previous one
          previous.set(neighbor.nodeId, {
            nodeId: neighbor.nodeId,
            edgeId: neighbor.edgeId,
            transferId: neighbor.transferId,
            mode: neighbor.mode,
            fromNodeId: current.nodeId,
            toNodeId: neighbor.nodeId
          });

          gScore.set(neighbor.nodeId, tentativeGScore);
          
          // Calculate fScore = gScore + heuristic
          const fScoreValue = tentativeGScore + this.heuristic(neighbor.nodeId, endNodeId);
          fScore.set(neighbor.nodeId, fScoreValue);

          // Update modes array
          const newModes = [...current.modes];
          if (!newModes.includes(neighbor.mode)) {
            newModes.push(neighbor.mode);
          }

          queue.enqueue({
            nodeId: neighbor.nodeId,
            distance: tentativeGScore,
            cost: current.cost + neighbor.cost,
            modes: newModes,
            path: [...current.path, previous.get(neighbor.nodeId)!]
          }, fScoreValue);
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
   * Get all neighbors of a node (reusing Dijkstra's implementation)
   */
  private getNeighbors(nodeId: string, currentModes: TransportMode[]): Neighbor[] {
    // Create a temporary Dijkstra instance to reuse its neighbor-finding logic
    const dijkstra = new MultiModalDijkstra(this.graph, this.preferences, this.constraints);
    
    // Access the private method using a workaround
    return (dijkstra as any).getNeighbors(nodeId, currentModes);
  }

  /**
   * Calculate weighted distance based on preferences (reusing Dijkstra's implementation)
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
   * Create a heuristic function for A*
   */
  private createHeuristic(): HeuristicFunction {
    return (nodeId: string, targetId: string): number => {
      const node = this.graph.getNode(nodeId);
      const target = this.graph.getNode(targetId);
      
      if (!node || !target) return Infinity;
      
      // Use Euclidean distance as base heuristic
      const distance = this.calculateDistance(node.coordinate, target.coordinate);
      
      // Adjust based on available transport modes
      const avgSpeed = this.getAverageSpeed(node.modes);
      
      // Convert distance to time (heuristic should be in same units as edge costs)
      return distance / avgSpeed;
    };
  }

  /**
   * Get average speed for a set of transport modes
   */
  private getAverageSpeed(modes: TransportMode[]): number {
    const speeds: Record<TransportMode, number> = {
      [TransportMode.WALKING]: 1.4, // 5 km/h in m/s
      [TransportMode.BICYCLE]: 4.2, // 15 km/h in m/s
      [TransportMode.CAR]: 11.1, // 40 km/h in m/s
      [TransportMode.BUS]: 5.6, // 20 km/h in m/s
      [TransportMode.METRO]: 8.3, // 30 km/h in m/s
      [TransportMode.TRAM]: 6.9, // 25 km/h in m/s
      [TransportMode.TRAIN]: 16.7, // 60 km/h in m/s
      [TransportMode.FERRY]: 4.2 // 15 km/h in m/s
    };
    
    // Calculate weighted average based on user preferences
    let totalSpeed = 0;
    let totalWeight = 0;
    
    for (const mode of modes) {
      const speed = speeds[mode] || 1.4; // Default to walking speed
      
      // Apply preference weights
      let weight = 1;
      if (this.preferences.preferredModes.includes(mode)) {
        weight = 2; // Double weight for preferred modes
      } else if (this.preferences.avoidedModes.includes(mode)) {
        weight = 0.5; // Half weight for avoided modes
      }
      
      totalSpeed += speed * weight;
      totalWeight += weight;
    }
    
    return totalWeight > 0 ? totalSpeed / totalWeight : 1.4;
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
   * Convert algorithm result to a MultiModalRoute (reusing Dijkstra's implementation)
   */
  convertToRoute(result: AlgorithmResult, startNodeId: string, endNodeId: string): MultiModalRoute | null {
    // Create a temporary Dijkstra instance to reuse its conversion logic
    const dijkstra = new MultiModalDijkstra(this.graph, this.preferences, this.constraints);
    
    // Access the private method using a workaround
    return (dijkstra as any).convertToRoute(result, startNodeId, endNodeId);
  }

  /**
   * Create a more informed heuristic that considers transport mode restrictions
   */
  createInformedHeuristic(): HeuristicFunction {
    return (nodeId: string, targetId: string): number => {
      const node = this.graph.getNode(nodeId);
      const target = this.graph.getNode(targetId);
      
      if (!node || !target) return Infinity;
      
      // Base heuristic: straight-line distance
      const distance = this.calculateDistance(node.coordinate, target.coordinate);
      
      // Check if there are any mode restrictions between node and target
      const commonModes = node.modes.filter(mode => target.modes.includes(mode));
      
      // If no common modes, add a penalty
      if (commonModes.length === 0) {
        return distance * 10; // High penalty for incompatible modes
      }
      
      // Calculate average speed based on common modes
      const avgSpeed = this.getAverageSpeed(commonModes);
      
      // Convert distance to time
      return distance / avgSpeed;
    };
  }

  /**
   * Create a heuristic that considers user preferences
   */
  createPreferenceBasedHeuristic(): HeuristicFunction {
    return (nodeId: string, targetId: string): number => {
      const node = this.graph.getNode(nodeId);
      const target = this.graph.getNode(targetId);
      
      if (!node || !target) return Infinity;
      
      // Base heuristic: straight-line distance
      const distance = this.calculateDistance(node.coordinate, target.coordinate);
      
      // Find the best mode based on user preferences
      const commonModes = node.modes.filter(mode => target.modes.includes(mode));
      
      if (commonModes.length === 0) {
        return distance * 10; // High penalty for incompatible modes
      }
      
      // Find the preferred mode with the highest speed
      let bestSpeed = 0;
      for (const mode of commonModes) {
        const speeds: Record<TransportMode, number> = {
          [TransportMode.WALKING]: 1.4,
          [TransportMode.BICYCLE]: 4.2,
          [TransportMode.CAR]: 11.1,
          [TransportMode.BUS]: 5.6,
          [TransportMode.METRO]: 8.3,
          [TransportMode.TRAM]: 6.9,
          [TransportMode.TRAIN]: 16.7,
          [TransportMode.FERRY]: 4.2
        };
        
        const speed = speeds[mode] || 1.4;
        
        // Apply preference multiplier
        let multiplier = 1;
        if (this.preferences.preferredModes.includes(mode)) {
          multiplier = 1.5; // Boost preferred modes
        } else if (this.preferences.avoidedModes.includes(mode)) {
          multiplier = 0.5; // Reduce avoided modes
        }
        
        const adjustedSpeed = speed * multiplier;
        if (adjustedSpeed > bestSpeed) {
          bestSpeed = adjustedSpeed;
        }
      }
      
      // Convert distance to time using the best speed
      return distance / bestSpeed;
    };
  }

  /**
   * Set a custom heuristic function
   */
  setHeuristic(heuristic: HeuristicFunction): void {
    this.heuristic = heuristic;
  }
}