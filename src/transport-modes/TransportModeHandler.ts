/**
 * Abstract base class for transport mode handlers
 * Defines the interface that all transport mode handlers must implement
 */

import {
  GraphNode,
  GraphEdge,
  TransportMode,
  Coordinate,
  AccessibilityInfo,
  RealTimeEdgeData
} from '../types/graph';
import { MultiModalGraphImpl } from '../graph/MultiModalGraph';
import {
  MultiModalRoute,
  RouteSegment,
  RouteInstruction,
  UserPreferences,
  RouteConstraints,
  InstructionType,
  Maneuver
} from '../types/routing';

/**
 * Parameters specific to a transport mode
 */
export interface TransportModeParameters {
  [key: string]: any;
}

/**
 * Context for routing calculations
 */
export interface RoutingContext {
  graph: MultiModalGraphImpl;
  preferences: UserPreferences;
  constraints: RouteConstraints;
  departureTime?: Date;
  realTimeData?: Map<string, RealTimeEdgeData>;
}

/**
 * Result of edge validation
 */
export interface EdgeValidationResult {
  isValid: boolean;
  reason?: string;
  adjustedCost?: number;
}

/**
 * Result of node validation
 */
export interface NodeValidationResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Abstract base class for transport mode handlers
 */
export abstract class TransportModeHandler {
  protected readonly mode: TransportMode;

  constructor(mode: TransportMode) {
    this.mode = mode;
  }

  /**
   * Get the transport mode this handler handles
   */
  getTransportMode(): TransportMode {
    return this.mode;
  }

  /**
   * Validate if an edge can be used by this transport mode
   * @param edge The edge to validate
   * @param context The routing context
   * @returns Validation result
   */
  abstract validateEdge(edge: GraphEdge, context: RoutingContext): EdgeValidationResult;

  /**
   * Validate if a node can be used by this transport mode
   * @param node The node to validate
   * @param context The routing context
   * @returns Validation result
   */
  abstract validateNode(node: GraphNode, context: RoutingContext): NodeValidationResult;

  /**
   * Calculate the cost of traversing an edge
   * @param edge The edge to traverse
   * @param context The routing context
   * @param parameters Transport mode specific parameters
   * @returns The cost of traversing the edge
   */
  abstract calculateEdgeCost(
    edge: GraphEdge,
    context: RoutingContext,
    parameters?: TransportModeParameters
  ): number;

  /**
   * Calculate the time to traverse an edge
   * @param edge The edge to traverse
   * @param context The routing context
   * @param parameters Transport mode specific parameters
   * @returns The time in seconds to traverse the edge
   */
  abstract calculateEdgeTime(
    edge: GraphEdge,
    context: RoutingContext,
    parameters?: TransportModeParameters
  ): number;

  /**
   * Generate route instructions for traversing an edge
   * @param fromNode The starting node
   * @param toNode The ending node
   * @param edge The edge being traversed
   * @param context The routing context
   * @returns Array of route instructions
   */
  abstract generateInstructions(
    fromNode: GraphNode,
    toNode: GraphNode,
    edge: GraphEdge,
    context: RoutingContext
  ): RouteInstruction[];

  /**
   * Get accessible edges from a node for this transport mode
   * @param nodeId The ID of the node
   * @param context The routing context
   * @returns Array of accessible edges
   */
  getAccessibleEdges(nodeId: string, context: RoutingContext): GraphEdge[] {
    const node = context.graph.getNode(nodeId);
    if (!node) return [];

    const edges = context.graph.getEdgesForMode(nodeId, this.mode);
    return edges.filter(edge => this.validateEdge(edge, context).isValid);
  }

  /**
   * Get accessible nodes from a node for this transport mode
   * @param nodeId The ID of the node
   * @param context The routing context
   * @returns Array of accessible node IDs
   */
  getAccessibleNodes(nodeId: string, context: RoutingContext): string[] {
    const edges = this.getAccessibleEdges(nodeId, context);
    return edges.map(edge => edge.to === nodeId ? edge.from : edge.to);
  }

  /**
   * Check if a transfer between modes is possible
   * @param fromMode The source transport mode
   * @param toMode The target transport mode
   * @param nodeId The node where the transfer would occur
   * @param context The routing context
   * @returns True if the transfer is possible
   */
  abstract canTransferTo(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): boolean;

  /**
   * Calculate the cost of transferring between modes
   * @param fromMode The source transport mode
   * @param toMode The target transport mode
   * @param nodeId The node where the transfer would occur
   * @param context The routing context
   * @returns The cost of the transfer
   */
  abstract calculateTransferCost(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): number;

  /**
   * Calculate the time required for a transfer between modes
   * @param fromMode The source transport mode
   * @param toMode The target transport mode
   * @param nodeId The node where the transfer would occur
   * @param context The routing context
   * @returns The time in seconds required for the transfer
   */
  abstract calculateTransferTime(
    fromMode: TransportMode,
    toMode: TransportMode,
    nodeId: string,
    context: RoutingContext
  ): number;

  /**
   * Apply real-time data adjustments to an edge
   * @param edge The edge to adjust
   * @param realTimeData The real-time data
   * @returns The adjusted edge
   */
  applyRealTimeAdjustments(edge: GraphEdge, realTimeData: RealTimeEdgeData): GraphEdge {
    const adjustedEdge = { ...edge };
    
    if (realTimeData.currentSpeed !== undefined) {
      // Adjust duration based on current speed
      const originalSpeed = edge.distance / edge.duration;
      const adjustedDuration = edge.distance / realTimeData.currentSpeed;
      adjustedEdge.duration = adjustedDuration;
    }
    
    if (realTimeData.blocked) {
      // Mark edge as blocked
      adjustedEdge.duration = Infinity;
    }
    
    return adjustedEdge;
  }

  /**
   * Check if this transport mode is available at a given time
   * @param time The time to check
   * @param context The routing context
   * @returns True if the transport mode is available
   */
  abstract isAvailableAt(time: Date, context: RoutingContext): boolean;

  /**
   * Get the average speed for this transport mode
   * @param context The routing context
   * @returns The average speed in meters per second
   */
  abstract getAverageSpeed(context: RoutingContext): number;

  /**
   * Get environmental impact score for this transport mode
   * @param distance The distance traveled
   * @param context The routing context
   * @returns Environmental impact score (0-1, where 0 is best)
   */
  abstract getEnvironmentalImpact(distance: number, context: RoutingContext): number;

  /**
   * Get comfort score for this transport mode
   * @param distance The distance traveled
   * @param context The routing context
   * @returns Comfort score (0-1, where 1 is best)
   */
  abstract getComfortScore(distance: number, context: RoutingContext): number;

  /**
   * Get safety score for this transport mode
   * @param distance The distance traveled
   * @param context The routing context
   * @returns Safety score (0-1, where 1 is best)
   */
  abstract getSafetyScore(distance: number, context: RoutingContext): number;
}