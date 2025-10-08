/**
 * POI Route Customization implementation
 * Allows users to modify their routes by adding, removing, reordering, or adjusting POI visits
 */

import {
  PointOfInterest,
  POIRoutingRequest,
  POIRoutingResult,
  POIRouteCustomization,
  POITimeWindow,
  POIVisitPriority,
  POIRouteVisualization
} from '../types/poi';
import { Coordinate, TransportMode } from '../types/graph';
import { POIService } from './POIService';
import { POIRoutingPlanner } from './POIRoutingPlanner';
import { MultiModalPOIRouting } from './MultiModalPOIRouting';

/**
 * Customization result with updated route and impact information
 */
interface POIRouteCustomizationResult {
  success: boolean;
  route?: POIRoutingResult['route'];
  impact?: {
    distanceChange: number; // in meters
    durationChange: number; // in seconds
    costChange: number;
    addedPOIs: string[];
    removedPOIs: string[];
    reorderedPOIs: string[];
    modifiedTimePOIs: string[];
  };
  error?: string;
  warnings?: string[];
}

/**
 * Customization options for route modifications
 */
interface POIRouteCustomizationOptions {
  allowDetour?: boolean;
  maxDetourDistance?: number; // in meters
  maxDetourTime?: number; // in seconds
  maxDetourCost?: number;
  preserveRequiredPOIs?: boolean;
  autoAdjustTiming?: boolean;
  considerOperatingHours?: boolean;
  optimizeAfterCustomization?: boolean;
}

/**
 * Batch customization request
 */
interface POIBatchCustomizationRequest {
  routeId: string;
  customizations: POIRouteCustomization[];
  options?: POIRouteCustomizationOptions;
}

/**
 * POI Route Customizer implementation
 */
export class POIRouteCustomizer {
  private poiService: POIService;
  private routingPlanner: POIRoutingPlanner;
  private multiModalRouting: MultiModalPOIRouting;

  constructor(
    poiService: POIService,
    routingPlanner: POIRoutingPlanner,
    multiModalRouting: MultiModalPOIRouting
  ) {
    this.poiService = poiService;
    this.routingPlanner = routingPlanner;
    this.multiModalRouting = multiModalRouting;
  }

  /**
   * Apply a single customization to a route
   */
  async customizeRoute(
    route: POIRoutingResult['route'],
    customization: POIRouteCustomization,
    options?: POIRouteCustomizationOptions
  ): Promise<POIRouteCustomizationResult> {
    try {
      // Validate customization
      const validationResult = this.validateCustomization(route, customization, options);
      if (!validationResult.valid) {
        return {
          success: false,
          error: validationResult.error,
          warnings: validationResult.warnings
        };
      }

      // Apply customization based on action type
      let customizedRoute: POIRoutingResult['route'];
      let impact: POIRouteCustomizationResult['impact'];

      switch (customization.action) {
        case 'add':
          ({ route: customizedRoute, impact } = await this.addPOIToRoute(
            route,
            customization.poiId,
            customization.parameters,
            options
          ));
          break;
        case 'remove':
          ({ route: customizedRoute, impact } = await this.removePOIFromRoute(
            route,
            customization.poiId,
            options
          ));
          break;
        case 'reorder':
          ({ route: customizedRoute, impact } = await this.reorderPOIInRoute(
            route,
            customization.poiId,
            customization.parameters?.newOrder,
            options
          ));
          break;
        case 'modify_time':
          ({ route: customizedRoute, impact } = await this.modifyPOIVisitTime(
            route,
            customization.poiId,
            customization.parameters?.newDuration,
            customization.parameters?.newTimeWindow,
            options
          ));
          break;
        case 'skip':
          ({ route: customizedRoute, impact } = await this.skipPOIInRoute(
            route,
            customization.poiId,
            options
          ));
          break;
        default:
          return {
            success: false,
            error: `Unknown customization action: ${customization.action}`
          };
      }

      // Optimize route after customization if requested
      if (options?.optimizeAfterCustomization && customizedRoute) {
        customizedRoute = await this.optimizeRouteAfterCustomization(
          customizedRoute,
          options
        );
      }

      return {
        success: true,
        route: customizedRoute,
        impact
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Apply multiple customizations to a route in batch
   */
  async customizeRouteBatch(
    route: POIRoutingResult['route'],
    request: POIBatchCustomizationRequest
  ): Promise<POIRouteCustomizationResult> {
    try {
      let currentRoute = route;
      const totalImpact: POIRouteCustomizationResult['impact'] = {
        distanceChange: 0,
        durationChange: 0,
        costChange: 0,
        addedPOIs: [],
        removedPOIs: [],
        reorderedPOIs: [],
        modifiedTimePOIs: []
      };

      // Apply each customization in sequence
      for (const customization of request.customizations) {
        const result = await this.customizeRoute(
          currentRoute,
          customization,
          request.options
        );

        if (!result.success) {
          return {
            success: false,
            error: `Failed to apply customization: ${result.error}`,
            warnings: result.warnings
          };
        }

        if (result.route) {
          currentRoute = result.route;
        }

        // Accumulate impact
        if (result.impact) {
          totalImpact.distanceChange += result.impact.distanceChange;
          totalImpact.durationChange += result.impact.durationChange;
          totalImpact.costChange += result.impact.costChange;
          totalImpact.addedPOIs.push(...result.impact.addedPOIs);
          totalImpact.removedPOIs.push(...result.impact.removedPOIs);
          totalImpact.reorderedPOIs.push(...result.impact.reorderedPOIs);
          totalImpact.modifiedTimePOIs.push(...result.impact.modifiedTimePOIs);
        }
      }

      // Optimize route after all customizations if requested
      if (request.options?.optimizeAfterCustomization) {
        currentRoute = await this.optimizeRouteAfterCustomization(
          currentRoute,
          request.options
        );
      }

      return {
        success: true,
        route: currentRoute,
        impact: totalImpact
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Validate a customization request
   */
  private validateCustomization(
    route: POIRoutingResult['route'],
    customization: POIRouteCustomization,
    options?: POIRouteCustomizationOptions
  ): { valid: boolean; error?: string; warnings?: string[] } {
    const warnings: string[] = [];

    // Check if POI exists for actions that require it
    if (customization.action !== 'reorder' && customization.poiId) {
      const poi = this.poiService.getPOI(customization.poiId);
      if (!poi) {
        return { valid: false, error: `POI with ID ${customization.poiId} not found` };
      }
    }

    // Check if POI is in the route for actions that require it
    if (['remove', 'reorder', 'modify_time', 'skip'].includes(customization.action)) {
      const poiInRoute = route.pois.find(p => p.poi.id === customization.poiId);
      if (!poiInRoute) {
        return { 
          valid: false, 
          error: `POI with ID ${customization.poiId} is not in the route` 
        };
      }
    }

    // Validate parameters based on action type
    switch (customization.action) {
      case 'reorder':
        if (customization.parameters?.newOrder === undefined) {
          return { 
            valid: false, 
            error: 'newOrder parameter is required for reorder action' 
          };
        }
        if (customization.parameters.newOrder < 1 || 
            customization.parameters.newOrder > route.pois.length) {
          return { 
            valid: false, 
            error: `newOrder must be between 1 and ${route.pois.length}` 
          };
        }
        break;
      case 'modify_time':
        if (!customization.parameters?.newDuration && 
            !customization.parameters?.newTimeWindow) {
          return { 
            valid: false, 
            error: 'Either newDuration or newTimeWindow parameter is required for modify_time action' 
          };
        }
        break;
    }

    // Check if customization would violate constraints
    if (options) {
      const constraintWarnings = this.checkConstraintViolations(
        route,
        customization,
        options
      );
      warnings.push(...constraintWarnings);
    }

    return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  /**
   * Check if a customization would violate constraints
   */
  private checkConstraintViolations(
    route: POIRoutingResult['route'],
    customization: POIRouteCustomization,
    options: POIRouteCustomizationOptions
  ): string[] {
    const warnings: string[] = [];

    // Check detour constraints
    if (options.allowDetour === false) {
      if (customization.action === 'add') {
        warnings.push('Adding POI will create a detour, but detours are not allowed');
      }
    }

    // Check if required POIs would be affected
    if (options.preserveRequiredPOIs) {
      if (customization.action === 'remove') {
        const poi = route.pois.find(p => p.poi.id === customization.poiId);
        if (poi && poi.poi.visitPriority?.mustVisit) {
          warnings.push('Removing a required POI, but required POIs should be preserved');
        }
      }
    }

    return warnings;
  }

  /**
   * Add a POI to an existing route
   */
  private async addPOIToRoute(
    route: POIRoutingResult['route'],
    poiId: string,
    parameters?: POIRouteCustomization['parameters'],
    options?: POIRouteCustomizationOptions
  ): Promise<{ route: POIRoutingResult['route']; impact: POIRouteCustomizationResult['impact'] }> {
    // Get POI from service
    const poi = this.poiService.getPOI(poiId);
    if (!poi) {
      throw new Error(`POI with ID ${poiId} not found`);
    }

    // Check if POI is already in the route
    if (route.pois.some(p => p.poi.id === poiId)) {
      throw new Error(`POI with ID ${poiId} is already in the route`);
    }

    // Find best position to insert POI
    const bestPosition = this.findBestInsertPosition(route, poi, options);

    // Insert POI at best position
    const newPOIs = [...route.pois.map(p => p.poi)];
    newPOIs.splice(bestPosition, 0, poi);

    // Recalculate route with new POI
    const origin = route.geometry[0];
    const destination = route.geometry[route.geometry.length - 1];
    
    // Create a new routing request
    const routingRequest: POIRoutingRequest = {
      origin,
      destination,
      pois: newPOIs,
      preferences: {
        optimizeFor: 'balanced' // Could be made configurable
      }
    };

    // Use the routing planner to recalculate the route
    const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
    if (!routingResult.route) {
      throw new Error('Failed to recalculate route with added POI');
    }

    // Calculate impact
    const impact: POIRouteCustomizationResult['impact'] = {
      distanceChange: routingResult.route.distance - route.distance,
      durationChange: routingResult.route.duration - route.duration,
      costChange: 0, // Could be calculated if cost is tracked
      addedPOIs: [poiId],
      removedPOIs: [],
      reorderedPOIs: [],
      modifiedTimePOIs: []
    };

    return { route: routingResult.route, impact };
  }

  /**
   * Find the best position to insert a POI in a route
   */
  private findBestInsertPosition(
    route: POIRoutingResult['route'],
    poi: PointOfInterest,
    options?: POIRouteCustomizationOptions
  ): number {
    let bestPosition = 0;
    let minAdditionalDistance = Infinity;
    
    for (let i = 0; i <= route.pois.length; i++) {
      // Calculate additional distance if POI is inserted at position i
      let additionalDistance = 0;
      
      if (i === 0) {
        // Insert at beginning
        additionalDistance = this.calculateDistance(poi.coordinate, route.pois[0].poi.coordinate);
      } else if (i === route.pois.length) {
        // Insert at end
        additionalDistance = this.calculateDistance(
          route.pois[route.pois.length - 1].poi.coordinate,
          poi.coordinate
        );
      } else {
        // Insert between two POIs
        const before = route.pois[i - 1].poi.coordinate;
        const after = route.pois[i].poi.coordinate;
        const directDistance = this.calculateDistance(before, after);
        const detourDistance = this.calculateDistance(before, poi.coordinate) + 
                             this.calculateDistance(poi.coordinate, after);
        additionalDistance = detourDistance - directDistance;
      }
      
      // Check if this position is better than the current best
      if (additionalDistance < minAdditionalDistance) {
        minAdditionalDistance = additionalDistance;
        bestPosition = i;
      }
    }
    
    // Check if the additional distance exceeds the maximum allowed detour
    if (options?.maxDetourDistance && minAdditionalDistance > options.maxDetourDistance) {
      throw new Error(`Adding POI would exceed maximum detour distance of ${options.maxDetourDistance} meters`);
    }
    
    return bestPosition;
  }

  /**
   * Remove a POI from an existing route
   */
  private async removePOIFromRoute(
    route: POIRoutingResult['route'],
    poiId: string,
    options?: POIRouteCustomizationOptions
  ): Promise<{ route: POIRoutingResult['route']; impact: POIRouteCustomizationResult['impact'] }> {
    // Find and remove POI
    const poiIndex = route.pois.findIndex(p => p.poi.id === poiId);
    if (poiIndex === -1) {
      throw new Error(`POI with ID ${poiId} not found in route`);
    }

    const removedPOI = route.pois[poiIndex].poi;
    const newPOIs = route.pois.filter(p => p.poi.id !== poiId).map(p => p.poi);

    // Recalculate route without POI
    const origin = route.geometry[0];
    const destination = route.geometry[route.geometry.length - 1];
    
    // Create a new routing request
    const routingRequest: POIRoutingRequest = {
      origin,
      destination,
      pois: newPOIs,
      preferences: {
        optimizeFor: 'balanced' // Could be made configurable
      }
    };

    // Use the routing planner to recalculate the route
    const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
    if (!routingResult.route) {
      throw new Error('Failed to recalculate route without removed POI');
    }

    // Calculate impact
    const impact: POIRouteCustomizationResult['impact'] = {
      distanceChange: routingResult.route.distance - route.distance,
      durationChange: routingResult.route.duration - route.duration,
      costChange: 0, // Could be calculated if cost is tracked
      addedPOIs: [],
      removedPOIs: [poiId],
      reorderedPOIs: [],
      modifiedTimePOIs: []
    };

    return { route: routingResult.route, impact };
  }

  /**
   * Reorder a POI in an existing route
   */
  private async reorderPOIInRoute(
    route: POIRoutingResult['route'],
    poiId: string,
    newOrder?: number,
    options?: POIRouteCustomizationOptions
  ): Promise<{ route: POIRoutingResult['route']; impact: POIRouteCustomizationResult['impact'] }> {
    if (newOrder === undefined) {
      throw new Error('newOrder parameter is required for reorder action');
    }

    // Find POI and move to new position
    const poiIndex = route.pois.findIndex(p => p.poi.id === poiId);
    if (poiIndex === -1) {
      throw new Error(`POI with ID ${poiId} not found in route`);
    }

    const poi = route.pois[poiIndex];
    const newPOIs = [...route.pois];
    newPOIs.splice(poiIndex, 1);
    newPOIs.splice(newOrder - 1, 0, poi);

    // Recalculate route with reordered POIs
    const origin = route.geometry[0];
    const destination = route.geometry[route.geometry.length - 1];
    
    // Create a new routing request
    const routingRequest: POIRoutingRequest = {
      origin,
      destination,
      pois: newPOIs.map(p => p.poi),
      preferences: {
        optimizeFor: 'balanced' // Could be made configurable
      }
    };

    // Use the routing planner to recalculate the route
    const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
    if (!routingResult.route) {
      throw new Error('Failed to recalculate route with reordered POIs');
    }

    // Calculate impact
    const impact: POIRouteCustomizationResult['impact'] = {
      distanceChange: routingResult.route.distance - route.distance,
      durationChange: routingResult.route.duration - route.duration,
      costChange: 0, // Could be calculated if cost is tracked
      addedPOIs: [],
      removedPOIs: [],
      reorderedPOIs: [poiId],
      modifiedTimePOIs: []
    };

    return { route: routingResult.route, impact };
  }

  /**
   * Modify POI visit time in an existing route
   */
  private async modifyPOIVisitTime(
    route: POIRoutingResult['route'],
    poiId: string,
    newDuration?: number,
    newTimeWindow?: POITimeWindow,
    options?: POIRouteCustomizationOptions
  ): Promise<{ route: POIRoutingResult['route']; impact: POIRouteCustomizationResult['impact'] }> {
    // Find POI and update visit duration
    const poiIndex = route.pois.findIndex(p => p.poi.id === poiId);
    if (poiIndex === -1) {
      throw new Error(`POI with ID ${poiId} not found in route`);
    }

    const poi = route.pois[poiIndex];
    const newPOIs = [...route.pois];
    
    // Update visit duration
    let visitDuration = newDuration || poi.visitDuration;
    
    // Apply time window constraints
    if (newTimeWindow) {
      if (newTimeWindow.minDuration) {
        visitDuration = Math.max(visitDuration, newTimeWindow.minDuration);
      }
      
      if (newTimeWindow.maxDuration) {
        visitDuration = Math.min(visitDuration, newTimeWindow.maxDuration);
      }
    }
    
    newPOIs[poiIndex] = {
      ...poi,
      visitDuration
    };

    // Recalculate timing for subsequent POIs if auto-adjust timing is enabled
    if (options?.autoAdjustTiming) {
      // This would involve recalculating arrival and departure times
      // For simplicity, we'll just update the visit duration here
    }

    // Calculate impact
    const durationChange = visitDuration - poi.visitDuration;
    const impact: POIRouteCustomizationResult['impact'] = {
      distanceChange: 0,
      durationChange,
      costChange: 0, // Could be calculated if cost is tracked
      addedPOIs: [],
      removedPOIs: [],
      reorderedPOIs: [],
      modifiedTimePOIs: [poiId]
    };

    return { 
      route: {
        ...route,
        pois: newPOIs,
        duration: route.duration + durationChange
      }, 
      impact 
    };
  }

  /**
   * Skip a POI in an existing route
   */
  private async skipPOIInRoute(
    route: POIRoutingResult['route'],
    poiId: string,
    options?: POIRouteCustomizationOptions
  ): Promise<{ route: POIRoutingResult['route']; impact: POIRouteCustomizationResult['impact'] }> {
    // Find POI and mark as skipped
    const poiIndex = route.pois.findIndex(p => p.poi.id === poiId);
    if (poiIndex === -1) {
      throw new Error(`POI with ID ${poiId} not found in route`);
    }

    const poi = route.pois[poiIndex];
    const newPOIs = [...route.pois];
    
    // Set visit duration to 0 to indicate skipping
    newPOIs[poiIndex] = {
      ...poi,
      visitDuration: 0
    };

    // Recalculate route without spending time at this POI
    const durationChange = -poi.visitDuration;
    
    // Calculate impact
    const impact: POIRouteCustomizationResult['impact'] = {
      distanceChange: 0,
      durationChange,
      costChange: 0, // Could be calculated if cost is tracked
      addedPOIs: [],
      removedPOIs: [],
      reorderedPOIs: [],
      modifiedTimePOIs: [poiId]
    };

    return { 
      route: {
        ...route,
        pois: newPOIs,
        duration: route.duration + durationChange
      }, 
      impact 
    };
  }

  /**
   * Optimize route after customization
   */
  private async optimizeRouteAfterCustomization(
    route: POIRoutingResult['route'],
    options?: POIRouteCustomizationOptions
  ): Promise<POIRoutingResult['route']> {
    // Extract POIs from route
    const pois = route.pois.map(p => p.poi);
    
    // Get origin and destination
    const origin = route.geometry[0];
    const destination = route.geometry[route.geometry.length - 1];
    
    // Create a new routing request
    const routingRequest: POIRoutingRequest = {
      origin,
      destination,
      pois,
      preferences: {
        optimizeFor: 'balanced' // Could be made configurable
      }
    };

    // Use the routing planner to recalculate the route
    const routingResult = await this.routingPlanner.planRouteWithPOIs(routingRequest);
    if (!routingResult.route) {
      throw new Error('Failed to optimize route after customization');
    }

    return routingResult.route;
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
   * Get suggested customizations for a route
   */
  async getSuggestedCustomizations(
    route: POIRoutingResult['route'],
    options?: {
      maxSuggestions?: number;
      considerOperatingHours?: boolean;
      considerUserPreferences?: boolean;
      userId?: string;
    }
  ): Promise<POIRouteCustomization[]> {
    const suggestions: POIRouteCustomization[] = [];
    const maxSuggestions = options?.maxSuggestions || 5;

    // Suggest adding nearby POIs
    const nearbyPOIs = await this.getSuggestedNearbyPOIs(route, maxSuggestions / 2);
    for (const poi of nearbyPOIs) {
      suggestions.push({
        poiId: poi.id,
        action: 'add'
      });
    }

    // Suggest removing low-priority POIs if route is long
    if (route.duration > 7200) { // 2 hours
      const lowPriorityPOIs = route.pois
        .filter(p => !p.poi.visitPriority?.mustVisit && (p.poi.visitPriority?.priority || 5) < 5)
        .slice(0, maxSuggestions / 2);
      
      for (const visit of lowPriorityPOIs) {
        suggestions.push({
          poiId: visit.poi.id,
          action: 'remove'
        });
      }
    }

    // Suggest reordering for more efficient route
    if (route.pois.length > 3) {
      suggestions.push({
        poiId: route.pois[0].poi.id,
        action: 'reorder',
        parameters: {
          newOrder: Math.floor(route.pois.length / 2)
        }
      });
    }

    return suggestions.slice(0, maxSuggestions);
  }

  /**
   * Get suggested nearby POIs for a route
   */
  private async getSuggestedNearbyPOIs(
    route: POIRoutingResult['route'],
    maxPOIs: number
  ): Promise<PointOfInterest[]> {
    // Find POIs near the route
    const nearbyPOIs: PointOfInterest[] = [];
    
    // Check each segment of the route for nearby POIs
    for (let i = 0; i < route.segments.length; i++) {
      const segment = route.segments[i];
      
      // Find POIs near this segment
      const { POICategory } = await import('../types/poi');
      const searchRequest = {
        center: segment.from,
        radius: 1000, // 1km search radius
        filters: {
          maxRating: 4.5, // Only suggest highly-rated POIs
          excludeCategories: [
            POICategory.PARKING,
            POICategory.ATM,
            POICategory.GAS_STATION
          ] // Exclude utility POIs
        },
        limit: maxPOIs
      };
      
      const searchResult = this.poiService.searchPOIs(searchRequest);
      
      // Filter out POIs that are already in the route
      const newPOIs = searchResult.pois.filter(poi => 
        !route.pois.some(visit => visit.poi.id === poi.id)
      );
      
      nearbyPOIs.push(...newPOIs);
      
      if (nearbyPOIs.length >= maxPOIs) {
        break;
      }
    }
    
    return nearbyPOIs.slice(0, maxPOIs);
  }

  /**
   * Preview a customization without applying it
   */
  async previewCustomization(
    route: POIRoutingResult['route'],
    customization: POIRouteCustomization,
    options?: POIRouteCustomizationOptions
  ): Promise<POIRouteCustomizationResult> {
    // Create a deep copy of the route
    const routeCopy = JSON.parse(JSON.stringify(route));
    
    // Try to apply the customization
    try {
      const result = await this.customizeRoute(routeCopy, customization, options);
      
      // If successful, return the result but mark it as a preview
      if (result.success && result.route) {
        // Add a preview marker to the route ID
        result.route.id = `${result.route.id}-preview`;
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Undo a customization
   */
  async undoCustomization(
    originalRoute: POIRoutingResult['route'],
    customizedRoute: POIRoutingResult['route'],
    customization: POIRouteCustomization
  ): Promise<POIRouteCustomizationResult> {
    // Create reverse customization based on the original action
    let reverseCustomization: POIRouteCustomization;
    
    switch (customization.action) {
      case 'add':
        reverseCustomization = {
          poiId: customization.poiId,
          action: 'remove'
        };
        break;
      case 'remove':
        // For remove, we need to know where to reinsert the POI
        const originalIndex = originalRoute.pois.findIndex(p => p.poi.id === customization.poiId);
        reverseCustomization = {
          poiId: customization.poiId,
          action: 'add'
        };
        break;
      case 'reorder':
        // For reorder, we need to know the original position
        const originalOrder = originalRoute.pois.findIndex(p => p.poi.id === customization.poiId) + 1;
        reverseCustomization = {
          poiId: customization.poiId,
          action: 'reorder',
          parameters: {
            newOrder: originalOrder
          }
        };
        break;
      case 'modify_time':
        // For modify_time, we need to know the original duration
        const originalVisit = originalRoute.pois.find(p => p.poi.id === customization.poiId);
        reverseCustomization = {
          poiId: customization.poiId,
          action: 'modify_time',
          parameters: {
            newDuration: originalVisit?.visitDuration
          }
        };
        break;
      case 'skip':
        // For skip, restore the original visit duration
        const originalSkippedVisit = originalRoute.pois.find(p => p.poi.id === customization.poiId);
        reverseCustomization = {
          poiId: customization.poiId,
          action: 'modify_time',
          parameters: {
            newDuration: originalSkippedVisit?.visitDuration || 1800 // 30 minutes default
          }
        };
        break;
      default:
        return {
          success: false,
          error: `Cannot undo unknown customization action: ${customization.action}`
        };
    }
    
    // Apply the reverse customization
    return this.customizeRoute(customizedRoute, reverseCustomization);
  }
}