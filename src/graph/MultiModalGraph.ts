/**
 * MultiModalGraph implementation for the routing system
 * Manages nodes, edges, and transfers for different transport modes
 */

import { 
  MultiModalGraph, 
  GraphNode, 
  GraphEdge, 
  TransferPoint, 
  GraphConstraints, 
  GraphMetadata, 
  SpatialIndex, 
  Coordinate, 
  TransportMode,
  NodeType 
} from '../types/graph';
import { PriorityQueue } from '../data-structures/PriorityQueue';

/**
 * Simple spatial index implementation using a grid-based approach
 */
class SimpleSpatialIndex implements SpatialIndex {
  private grid: Map<string, GraphNode[]> = new Map();
  private edgeGrid: Map<string, GraphEdge[]> = new Map();
  private cellSize: number; // in degrees

  constructor(cellSize: number = 0.01) { // ~1km at equator
    this.cellSize = cellSize;
  }

  findNearbyNodes(coordinate: Coordinate, radius: number): GraphNode[] {
    const results: GraphNode[] = [];
    const radiusInDegrees = radius / 111000; // rough conversion

    // Calculate grid bounds
    const minLat = coordinate.latitude - radiusInDegrees;
    const maxLat = coordinate.latitude + radiusInDegrees;
    const minLon = coordinate.longitude - radiusInDegrees;
    const maxLon = coordinate.longitude + radiusInDegrees;

    // Check all cells in the bounding box
    for (let lat = minLat; lat <= maxLat; lat += this.cellSize) {
      for (let lon = minLon; lon <= maxLon; lon += this.cellSize) {
        const cellKey = this.getCellKey({ latitude: lat, longitude: lon });
        const nodes = this.grid.get(cellKey) || [];
        
        for (const node of nodes) {
          const distance = this.calculateDistance(coordinate, node.coordinate);
          if (distance <= radius) {
            results.push(node);
          }
        }
      }
    }

    return results;
  }

  findEdgesInBoundingBox(northEast: Coordinate, southWest: Coordinate): GraphEdge[] {
    const results: GraphEdge[] = [];

    // Check all cells in the bounding box
    for (let lat = southWest.latitude; lat <= northEast.latitude; lat += this.cellSize) {
      for (let lon = southWest.longitude; lon <= northEast.longitude; lon += this.cellSize) {
        const cellKey = this.getCellKey({ latitude: lat, longitude: lon });
        const edges = this.edgeGrid.get(cellKey) || [];
        results.push(...edges);
      }
    }

    return results;
  }

  addNode(node: GraphNode): void {
    const cellKey = this.getCellKey(node.coordinate);
    if (!this.grid.has(cellKey)) {
      this.grid.set(cellKey, []);
    }
    this.grid.get(cellKey)!.push(node);
  }

  addEdge(edge: GraphEdge): void {
    // For simplicity, add edge to cells containing both endpoints
    // In a real implementation, you'd want to add to all cells the edge intersects
    const fromCellKey = this.getCellKeyForNodeId(edge.from);
    const toCellKey = this.getCellKeyForNodeId(edge.to);
    
    if (!this.edgeGrid.has(fromCellKey)) {
      this.edgeGrid.set(fromCellKey, []);
    }
    this.edgeGrid.get(fromCellKey)!.push(edge);
    
    if (fromCellKey !== toCellKey) {
      if (!this.edgeGrid.has(toCellKey)) {
        this.edgeGrid.set(toCellKey, []);
      }
      this.edgeGrid.get(toCellKey)!.push(edge);
    }
  }

  clear(): void {
    this.grid.clear();
    this.edgeGrid.clear();
  }

  private getCellKey(coordinate: Coordinate): string {
    const latCell = Math.floor(coordinate.latitude / this.cellSize);
    const lonCell = Math.floor(coordinate.longitude / this.cellSize);
    return `${latCell},${lonCell}`;
  }

  private getCellKeyForNodeId(nodeId: string): string {
    // This is a simplified approach - in a real implementation,
    // you'd need to store node coordinates or have a way to look them up
    return '0,0'; // placeholder
  }

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
}

/**
 * MultiModalGraph implementation
 */
export class MultiModalGraphImpl implements MultiModalGraph {
  public nodes: Map<string, GraphNode> = new Map();
  public edges: Map<string, GraphEdge> = new Map();
  public transfers: Map<string, TransferPoint> = new Map();
  public constraints: GraphConstraints;
  public metadata: GraphMetadata;
  private spatialIndex: SpatialIndex;
  private adjacencyList: Map<string, string[]> = new Map(); // node id -> edge ids

  constructor(constraints: GraphConstraints) {
    this.constraints = constraints;
    this.spatialIndex = new SimpleSpatialIndex();
    this.metadata = {
      version: '1.0.0',
      lastUpdated: new Date(),
      boundingBox: {
        northEast: { latitude: -90, longitude: -180 },
        southWest: { latitude: 90, longitude: 180 }
      },
      nodeCount: 0,
      edgeCount: 0,
      transferCount: 0,
      supportedModes: []
    };
  }

  /**
   * Add a node to the graph
   */
  addNode(node: GraphNode): boolean {
    if (this.nodes.has(node.id)) {
      return false;
    }
    
    this.nodes.set(node.id, node);
    this.spatialIndex.addNode(node);
    this.updateBoundingBox(node.coordinate);
    this.metadata.nodeCount++;
    this.updateSupportedModes(node.modes);
    
    return true;
  }

  /**
   * Add an edge to the graph
   */
  addEdge(edge: GraphEdge): boolean {
    // Check if both nodes exist
    if (!this.nodes.has(edge.from) || !this.nodes.has(edge.to)) {
      return false;
    }
    
    if (this.edges.has(edge.id)) {
      return false;
    }
    
    this.edges.set(edge.id, edge);
    this.spatialIndex.addEdge(edge);
    
    // Update adjacency list
    if (!this.adjacencyList.has(edge.from)) {
      this.adjacencyList.set(edge.from, []);
    }
    this.adjacencyList.get(edge.from)!.push(edge.id);
    
    this.metadata.edgeCount++;
    
    return true;
  }

  /**
   * Add a transfer point to the graph
   */
  addTransfer(transfer: TransferPoint): void {
    this.transfers.set(transfer.id, transfer);
    this.spatialIndex.addNode({
      id: transfer.id,
      coordinate: transfer.coordinate,
      modes: [transfer.fromMode, transfer.toMode],
      accessibility: transfer.accessibility,
      amenities: [],
      type: NodeType.TRANSFER,
      properties: {}
    });
    this.updateBoundingBox(transfer.coordinate);
    this.metadata.transferCount++;
    this.updateSupportedModes([transfer.fromMode, transfer.toMode]);
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get an edge by ID
   */
  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id);
  }

  /**
   * Get a transfer point by ID
   */
  getTransfer(id: string): TransferPoint | undefined {
    return this.transfers.get(id);
  }

  /**
   * Get all edges connected to a node
   */
  getEdgesForNode(nodeId: string): GraphEdge[] {
    const edgeIds = this.adjacencyList.get(nodeId) || [];
    return edgeIds.map(id => this.edges.get(id)).filter(Boolean) as GraphEdge[];
  }

  /**
   * Get all edges for a specific transport mode from a node
   */
  getEdgesForMode(nodeId: string, mode: TransportMode): GraphEdge[] {
    return this.getEdgesForNode(nodeId).filter(edge => edge.mode === mode);
  }

  /**
   * Get all outgoing edges from a node
   */
  getOutgoingEdges(nodeId: string): GraphEdge[] {
    return this.getEdgesForNode(nodeId).filter(edge => edge.from === nodeId);
  }

  /**
   * Get all incoming edges to a node
   */
  getIncomingEdges(nodeId: string): GraphEdge[] {
    return this.getEdgesForNode(nodeId).filter(edge => edge.to === nodeId);
  }

  /**
   * Find nodes within a given radius of a coordinate
   */
  findNearbyNodes(coordinate: Coordinate, radius: number): GraphNode[] {
    return this.spatialIndex.findNearbyNodes(coordinate, radius);
  }

  /**
   * Find transfer points within a given radius of a coordinate
   */
  findNearbyTransfers(coordinate: Coordinate, radius: number): TransferPoint[] {
    const nearbyNodes = this.spatialIndex.findNearbyNodes(coordinate, radius);
    return nearbyNodes
      .filter(node => node.type === NodeType.TRANSFER)
      .map(node => this.transfers.get(node.id))
      .filter(Boolean) as TransferPoint[];
  }

  /**
   * Get all nodes that support a specific transport mode
   */
  getNodesForMode(mode: TransportMode): GraphNode[] {
    return Array.from(this.nodes.values()).filter(node => 
      node.modes.includes(mode)
    );
  }

  /**
   * Get all edges for a specific transport mode
   */
  getEdgesForModeGlobal(mode: TransportMode): GraphEdge[] {
    return Array.from(this.edges.values()).filter(edge => edge.mode === mode);
  }

  /**
   * Get all transfer points between two transport modes
   */
  getTransfersBetweenModes(fromMode: TransportMode, toMode: TransportMode): TransferPoint[] {
    return Array.from(this.transfers.values()).filter(transfer => 
      transfer.fromMode === fromMode && transfer.toMode === toMode
    );
  }

  /**
   * Find the shortest path between two nodes using Dijkstra's algorithm
   */
  findShortestPath(startId: string, endId: string, mode: TransportMode): string[] | null {
    const distances = new Map<string, number>();
    const previous = new Map<string, string>();
    const unvisited = new PriorityQueue<string>();
    
    // Initialize distances
    for (const nodeId of this.nodes.keys()) {
      distances.set(nodeId, Infinity);
    }
    distances.set(startId, 0);
    unvisited.enqueue(startId, 0);
    
    while (!unvisited.isEmpty()) {
      const current = unvisited.dequeue();
      if (!current) break;
      
      if (current === endId) {
        // Reconstruct path
        const path: string[] = [];
        let node: string | undefined = endId;
        while (node) {
          path.unshift(node);
          node = previous.get(node);
        }
        return path;
      }
      
      // Get all edges for the current mode
      const edges = this.getEdgesForMode(current, mode);
      
      for (const edge of edges) {
        const neighbor = edge.to === current ? edge.from : edge.to;
        const alt = distances.get(current)! + edge.duration;
        
        if (alt < distances.get(neighbor)!) {
          distances.set(neighbor, alt);
          previous.set(neighbor, current);
          unvisited.enqueue(neighbor, alt);
        }
      }
    }
    
    return null; // No path found
  }

  /**
   * Calculate the bounding box of the graph
   */
  getBoundingBox(): { northEast: Coordinate; southWest: Coordinate } {
    return this.metadata.boundingBox;
  }

  /**
   * Get the number of nodes in the graph
   */
  getNodeCount(): number {
    return this.nodes.size;
  }

  /**
   * Get the number of edges in the graph
   */
  getEdgeCount(): number {
    return this.edges.size;
  }

  /**
   * Get the number of transfer points in the graph
   */
  getTransferCount(): number {
    return this.transfers.size;
  }

  /**
   * Update the graph's bounding box
   */
  private updateBoundingBox(coordinate: Coordinate): void {
    const { boundingBox } = this.metadata;
    
    boundingBox.northEast.latitude = Math.max(boundingBox.northEast.latitude, coordinate.latitude);
    boundingBox.northEast.longitude = Math.max(boundingBox.northEast.longitude, coordinate.longitude);
    boundingBox.southWest.latitude = Math.min(boundingBox.southWest.latitude, coordinate.latitude);
    boundingBox.southWest.longitude = Math.min(boundingBox.southWest.longitude, coordinate.longitude);
  }

  /**
   * Update the supported transport modes
   */
  private updateSupportedModes(modes: TransportMode[]): void {
    for (const mode of modes) {
      if (!this.metadata.supportedModes.includes(mode)) {
        this.metadata.supportedModes.push(mode);
      }
    }
  }

  /**
   * Validate the graph for consistency
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check that all edges reference valid nodes
    for (const edge of this.edges.values()) {
      if (!this.nodes.has(edge.from)) {
        errors.push(`Edge ${edge.id} references non-existent from node: ${edge.from}`);
      }
      if (!this.nodes.has(edge.to)) {
        errors.push(`Edge ${edge.id} references non-existent to node: ${edge.to}`);
      }
    }
    
    // Check that all transfer points reference valid nodes
    for (const transfer of this.transfers.values()) {
      if (!this.nodes.has(transfer.id)) {
        errors.push(`Transfer ${transfer.id} references non-existent node: ${transfer.id}`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Remove a node from the graph
   */
  removeNode(nodeId: string): boolean {
    if (!this.nodes.has(nodeId)) {
      return false;
    }
    
    // Remove all edges connected to this node
    const edgesToRemove = this.getEdgesForNode(nodeId);
    for (const edge of edgesToRemove) {
      this.edges.delete(edge.id);
      
      // Remove from adjacency list
      const adjList = this.adjacencyList.get(edge.from);
      if (adjList) {
        const index = adjList.indexOf(edge.id);
        if (index > -1) {
          adjList.splice(index, 1);
        }
      }
    }
    
    // Remove the node
    this.nodes.delete(nodeId);
    this.metadata.nodeCount--;
    
    return true;
  }

  /**
   * Clear all data from the graph
   */
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.transfers.clear();
    this.adjacencyList.clear();
    this.spatialIndex.clear();
    
    // Reset metadata
    this.metadata = {
      ...this.metadata,
      lastUpdated: new Date(),
      boundingBox: {
        northEast: { latitude: -90, longitude: -180 },
        southWest: { latitude: 90, longitude: 180 }
      },
      nodeCount: 0,
      edgeCount: 0,
      transferCount: 0,
      supportedModes: []
    };
  }
}