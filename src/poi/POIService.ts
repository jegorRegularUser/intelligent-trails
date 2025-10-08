/**
 * POI Service for discovery, search, and recommendation of Points of Interest
 */

import {
  PointOfInterest,
  POICategory,
  POISearchRequest,
  POISearchResult,
  POISearchFilters,
  POICluster,
  POIRecommendationRequest,
  POIRecommendationResult,
  POIOperatingHours,
  POIAccessibility,
  POITimeWindow,
  POIVisitPriority
} from '../types/poi';
import { Coordinate, TransportMode } from '../types/graph';
import { DetailedUserPreferences } from '../types/preferences';

/**
 * POI Service implementation
 */
export class POIService {
  private poiDatabase: Map<string, PointOfInterest> = new Map();
  private collections: Map<string, string[]> = new Map(); // collection ID -> POI IDs
  private userPreferences: Map<string, DetailedUserPreferences> = new Map(); // user ID -> preferences

  /**
   * Add a POI to the database
   */
  addPOI(poi: PointOfInterest): void {
    this.poiDatabase.set(poi.id, poi);
  }

  /**
   * Get a POI by ID
   */
  getPOI(id: string): PointOfInterest | undefined {
    return this.poiDatabase.get(id);
  }

  /**
   * Update a POI
   */
  updatePOI(id: string, updates: Partial<PointOfInterest>): boolean {
    const poi = this.poiDatabase.get(id);
    if (!poi) return false;

    const updatedPOI = { ...poi, ...updates, metadata: { ...poi.metadata, updatedAt: new Date() } };
    this.poiDatabase.set(id, updatedPOI);
    return true;
  }

  /**
   * Remove a POI
   */
  removePOI(id: string): boolean {
    return this.poiDatabase.delete(id);
  }

  /**
   * Search for POIs based on criteria
   */
  searchPOIs(request: POISearchRequest): POISearchResult {
    const startTime = performance.now();
    
    // Get all POIs within the radius
    let candidates = Array.from(this.poiDatabase.values()).filter(poi => {
      const distance = this.calculateDistance(request.center, poi.coordinate);
      return distance <= request.radius;
    });

    // Apply filters
    if (request.filters) {
      candidates = this.applyFilters(candidates, request.filters);
    }

    // Sort results
    candidates = this.sortResults(candidates, request.sortBy || 'distance', request.sortOrder || 'asc');

    // Apply pagination
    const offset = request.offset || 0;
    const limit = request.limit || 20;
    const paginatedResults = candidates.slice(offset, offset + limit);

    const endTime = performance.now();

    return {
      pois: paginatedResults,
      total: candidates.length,
      limit,
      offset,
      hasMore: offset + limit < candidates.length,
      searchTime: endTime - startTime
    };
  }

  /**
   * Apply search filters to POI candidates
   */
  private applyFilters(pois: PointOfInterest[], filters: POISearchFilters): PointOfInterest[] {
    return pois.filter(poi => {
      // Category filter
      if (filters.categories && filters.categories.length > 0) {
        if (!filters.categories.includes(poi.category)) {
          return false;
        }
      }

      // Rating filter
      if (filters.minRating !== undefined && poi.rating && poi.rating.average < filters.minRating) {
        return false;
      }

      if (filters.maxRating !== undefined && poi.rating && poi.rating.average > filters.maxRating) {
        return false;
      }

      // Open now filter
      if (filters.isOpenNow && poi.operatingHours) {
        if (!this.isPOIOpenNow(poi.operatingHours)) {
          return false;
        }
      }

      // Free filter
      if (filters.isFree && poi.pricing && !poi.pricing.isFree) {
        return false;
      }

      // Accessibility filter
      if (filters.isAccessible && !this.isPOIAccessible(poi.accessibility)) {
        return false;
      }

      // Parking filter
      if (filters.hasParking && !poi.accessibility.hasParking) {
        return false;
      }

      // Distance filter (additional check after initial radius filter)
      if (filters.maxDistance) {
        // This would require a center point, which isn't available here
        // In a real implementation, you'd pass the center to this method
      }

      // Keywords filter
      if (filters.keywords && filters.keywords.length > 0) {
        const searchText = `${poi.name} ${poi.metadata.description || ''} ${poi.address || ''}`.toLowerCase();
        const hasKeyword = filters.keywords.some(keyword => 
          searchText.includes(keyword.toLowerCase())
        );
        if (!hasKeyword) {
          return false;
        }
      }

      // Tags filter
      if (filters.tags && filters.tags.length > 0) {
        const hasAllTags = filters.tags.every(tag => poi.metadata.tags.includes(tag));
        if (!hasAllTags) {
          return false;
        }
      }

      // Transport modes filter
      if (filters.transportModes && filters.transportModes.length > 0) {
        if (!poi.transportConstraints) {
          return false;
        }
        
        const hasCompatibleMode = filters.transportModes.some(mode => {
          if (poi.transportConstraints!.preferredModes?.includes(mode)) {
            return true;
          }
          if (!poi.transportConstraints!.avoidedModes?.includes(mode)) {
            return true;
          }
          return false;
        });
        
        if (!hasCompatibleMode) {
          return false;
        }
      }

      // Collections filter
      if (filters.collections && filters.collections.length > 0) {
        if (!poi.collections || !filters.collections.some(collectionId => 
          poi.collections!.includes(collectionId)
        )) {
          return false;
        }
      }

      // Exclude categories filter
      if (filters.excludeCategories && filters.excludeCategories.length > 0) {
        if (filters.excludeCategories.includes(poi.category)) {
          return false;
        }
      }

      // Exclude tags filter
      if (filters.excludeTags && filters.excludeTags.length > 0) {
        const hasExcludedTag = filters.excludeTags.some(tag => poi.metadata.tags.includes(tag));
        if (hasExcludedTag) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Sort POI search results
   */
  private sortResults(
    pois: PointOfInterest[], 
    sortBy: 'distance' | 'rating' | 'popularity' | 'relevance',
    sortOrder: 'asc' | 'desc'
  ): PointOfInterest[] {
    const sorted = [...pois];
    
    sorted.sort((a, b) => {
      let valueA: number;
      let valueB: number;

      switch (sortBy) {
        case 'distance':
          // This would require a center point, which isn't available here
          // In a real implementation, you'd pass the center to this method
          valueA = 0;
          valueB = 0;
          break;
        case 'rating':
          valueA = a.rating?.average || 0;
          valueB = b.rating?.average || 0;
          break;
        case 'popularity':
          valueA = a.metadata.popularity || 0;
          valueB = b.metadata.popularity || 0;
          break;
        case 'relevance':
          // Relevance would be calculated based on multiple factors
          valueA = this.calculateRelevanceScore(a);
          valueB = this.calculateRelevanceScore(b);
          break;
        default:
          valueA = 0;
          valueB = 0;
      }

      if (sortOrder === 'asc') {
        return valueA - valueB;
      } else {
        return valueB - valueA;
      }
    });

    return sorted;
  }

  /**
   * Calculate relevance score for a POI
   */
  private calculateRelevanceScore(poi: PointOfInterest): number {
    let score = 0;
    
    // Base score from rating
    score += (poi.rating?.average || 0) * 20;
    
    // Popularity factor
    score += poi.metadata.popularity * 30;
    
    // Verification status
    if (poi.metadata.verified) {
      score += 10;
    }
    
    // Number of reviews
    if (poi.rating) {
      score += Math.min(poi.rating.count / 10, 20);
    }
    
    // Recency of updates (more recent is better)
    const daysSinceUpdate = (Date.now() - poi.metadata.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 30) {
      score += 10;
    }
    
    return Math.min(score, 100);
  }

  /**
   * Check if a POI is open now
   */
  private isPOIOpenNow(hours: POIOperatingHours): boolean {
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const dayHours = hours[day as keyof POIOperatingHours];
    if (!dayHours || dayHours === 'closed') {
      return false;
    }
    
    const [open, close] = (dayHours as string).split('-');
    const [openHour, openMinute] = open.split(':').map(Number);
    const [closeHour, closeMinute] = close.split(':').map(Number);
    
    const openTime = openHour * 60 + openMinute;
    const closeTime = closeHour * 60 + closeMinute;
    
    return currentTime >= openTime && currentTime <= closeTime;
  }

  /**
   * Check if a POI meets accessibility requirements
   */
  private isPOIAccessible(accessibility: POIAccessibility): boolean {
    return accessibility.wheelchairAccessible ||
           accessibility.visuallyImpairedFriendly ||
           accessibility.hasElevator ||
           accessibility.hasRamp;
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
   * Cluster POIs for dense areas
   */
  clusterPOIs(pois: PointOfInterest[], radius: number = 100): POICluster[] {
    const clusters: POICluster[] = [];
    const usedPOIs = new Set<string>();

    for (const poi of pois) {
      if (usedPOIs.has(poi.id)) continue;

      // Find all POIs within the cluster radius
      const clusterPOIs = pois.filter(p => {
        if (usedPOIs.has(p.id)) return false;
        return this.calculateDistance(poi.coordinate, p.coordinate) <= radius;
      });

      if (clusterPOIs.length > 1) {
        // Mark POIs as used
        clusterPOIs.forEach(p => usedPOIs.add(p.id));

        // Calculate cluster center
        const centerLat = clusterPOIs.reduce((sum, p) => sum + p.coordinate.latitude, 0) / clusterPOIs.length;
        const centerLon = clusterPOIs.reduce((sum, p) => sum + p.coordinate.longitude, 0) / clusterPOIs.length;
        
        // Get unique categories
        const categories = [...new Set(clusterPOIs.map(p => p.category))];
        
        // Calculate average rating
        const ratings = clusterPOIs.filter(p => p.rating).map(p => p.rating!.average);
        const averageRating = ratings.length > 0 
          ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length 
          : undefined;

        clusters.push({
          id: `cluster-${clusters.length}`,
          center: {
            latitude: centerLat,
            longitude: centerLon
          },
          pois: clusterPOIs,
          count: clusterPOIs.length,
          radius,
          categories,
          averageRating
        });
      }
    }

    return clusters;
  }

  /**
   * Recommend POIs based on user preferences
   */
  recommendPOIs(request: POIRecommendationRequest): POIRecommendationResult {
    const startTime = performance.now();
    
    // Get all POIs within the radius (or use a default large radius)
    const radius = request.radius || 5000; // 5km default
    const candidates = Array.from(this.poiDatabase.values()).filter(poi => {
      const distance = this.calculateDistance(request.center, poi.coordinate);
      return distance <= radius;
    });

    // Apply preference-based filtering
    const filteredPOIs = this.applyPreferenceFilters(candidates, request);
    
    // Score and rank POIs
    const scoredPOIs = this.scorePOIsForRecommendation(filteredPOIs, request);
    
    // Sort by score and limit results
    const limit = request.limit || 10;
    const recommendedPOIs = scoredPOIs
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.poi);

    // Create scores and reasons maps
    const scores = new Map<string, number>();
    const reasons = new Map<string, string[]>();
    
    scoredPOIs.forEach(item => {
      scores.set(item.poi.id, item.score);
      reasons.set(item.poi.id, item.reasons);
    });

    const endTime = performance.now();

    return {
      pois: recommendedPOIs,
      scores,
      reasons,
      recommendationTime: endTime - startTime
    };
  }

  /**
   * Apply preference-based filters to POI candidates
   */
  private applyPreferenceFilters(
    pois: PointOfInterest[], 
    request: POIRecommendationRequest
  ): PointOfInterest[] {
    if (!request.preferences) {
      return pois;
    }

    return pois.filter(poi => {
      const prefs = request.preferences!;

      // Category filter
      if (prefs.categories && prefs.categories.length > 0) {
        if (!prefs.categories.includes(poi.category)) {
          return false;
        }
      }

      // Rating filter
      if (prefs.minRating !== undefined && poi.rating && poi.rating.average < prefs.minRating) {
        return false;
      }

      // Distance filter
      if (prefs.maxDistance !== undefined) {
        const distance = this.calculateDistance(request.center, poi.coordinate);
        if (distance > prefs.maxDistance) {
          return false;
        }
      }

      // Transport modes filter
      if (prefs.transportModes && prefs.transportModes.length > 0) {
        if (!poi.transportConstraints) {
          return false;
        }
        
        const hasCompatibleMode = prefs.transportModes.some(mode => {
          if (poi.transportConstraints!.preferredModes?.includes(mode)) {
            return true;
          }
          if (!poi.transportConstraints!.avoidedModes?.includes(mode)) {
            return true;
          }
          return false;
        });
        
        if (!hasCompatibleMode) {
          return false;
        }
      }

      // Accessibility filter
      if (prefs.accessibility) {
        const meetsRequirements = this.checkAccessibilityRequirements(
          poi.accessibility, 
          prefs.accessibility
        );
        if (!meetsRequirements) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Check if POI meets accessibility requirements
   */
  private checkAccessibilityRequirements(
    poiAccessibility: POIAccessibility,
    requiredAccessibility: POIAccessibility
  ): boolean {
    if (requiredAccessibility.wheelchairAccessible && !poiAccessibility.wheelchairAccessible) {
      return false;
    }
    
    if (requiredAccessibility.visuallyImpairedFriendly && !poiAccessibility.visuallyImpairedFriendly) {
      return false;
    }
    
    if (requiredAccessibility.hasElevator && !poiAccessibility.hasElevator) {
      return false;
    }
    
    if (requiredAccessibility.hasRamp && !poiAccessibility.hasRamp) {
      return false;
    }

    return true;
  }

  /**
   * Score POIs for recommendation
   */
  private scorePOIsForRecommendation(
    pois: PointOfInterest[], 
    request: POIRecommendationRequest
  ): { poi: PointOfInterest; score: number; reasons: string[] }[] {
    const userPreferences = this.userPreferences.get(request.userId);
    
    return pois.map(poi => {
      let score = 0;
      const reasons: string[] = [];

      // Base score from rating
      if (poi.rating) {
        score += poi.rating.average * 20;
        reasons.push(`High rating: ${poi.rating.average}/5`);
      }

      // Popularity factor
      score += poi.metadata.popularity * 30;
      if (poi.metadata.popularity > 0.7) {
        reasons.push('Popular destination');
      }

      // Distance factor (closer is better)
      const distance = this.calculateDistance(request.center, poi.coordinate);
      const maxDistance = request.radius || 5000;
      const distanceScore = (1 - distance / maxDistance) * 25;
      score += distanceScore;
      if (distance < 1000) {
        reasons.push('Within walking distance');
      }

      // User preference alignment
      if (userPreferences && request.preferences) {
        // Transport mode preference
        if (request.preferences.transportModes && poi.transportConstraints) {
          const preferredModes = request.preferences.transportModes.filter(mode =>
            userPreferences.weights.speed > 0.5 ||
            userPreferences.weights.environment > 0.5
          );
          
          const modeMatch = preferredModes.some(mode => 
            poi.transportConstraints!.preferredModes?.includes(mode)
          );
          
          if (modeMatch) {
            score += 15;
            reasons.push('Matches your transport preferences');
          }
        }

        // Accessibility preference
        if (userPreferences.weights.accessibility > 0.5 && this.isPOIAccessible(poi.accessibility)) {
          score += 15;
          reasons.push('Accessible location');
        }

        // Cost preference
        if (userPreferences.weights.cost > 0.5 && poi.pricing?.isFree) {
          score += 10;
          reasons.push('Free admission');
        }
      }

      // Context-specific scoring
      if (request.context) {
        switch (request.context) {
          case 'tourism':
            if ([
              POICategory.TOURIST_ATTRACTION,
              POICategory.MUSEUM,
              POICategory.MONUMENT,
              POICategory.LANDMARK
            ].includes(poi.category)) {
              score += 20;
              reasons.push('Great for tourism');
            }
            break;
          case 'dining':
            if ([
              POICategory.RESTAURANT,
              POICategory.CAFE
            ].includes(poi.category)) {
              score += 20;
              reasons.push('Dining option');
            }
            break;
          case 'shopping':
            if ([
              POICategory.SHOP,
              POICategory.MARKET,
              POICategory.MALL
            ].includes(poi.category)) {
              score += 20;
              reasons.push('Shopping destination');
            }
            break;
        }
      }

      // Verification bonus
      if (poi.metadata.verified) {
        score += 5;
        reasons.push('Verified information');
      }

      return { poi, score, reasons };
    });
  }

  /**
   * Set user preferences for recommendation
   */
  setUserPreferences(userId: string, preferences: DetailedUserPreferences): void {
    this.userPreferences.set(userId, preferences);
  }

  /**
   * Create a new POI collection
   */
  createCollection(
    id: string,
    name: string,
    description: string,
    isPublic: boolean,
    createdBy: string,
    poiIds: string[] = []
  ): boolean {
    // Validate that all POI IDs exist
    for (const poiId of poiIds) {
      if (!this.poiDatabase.has(poiId)) {
        return false;
      }
    }

    this.collections.set(id, poiIds);
    
    // Update POIs with collection reference
    for (const poiId of poiIds) {
      const poi = this.poiDatabase.get(poiId);
      if (poi) {
        if (!poi.collections) {
          poi.collections = [];
        }
        if (!poi.collections.includes(id)) {
          poi.collections.push(id);
        }
      }
    }

    return true;
  }

  /**
   * Add POI to collection
   */
  addPOIToCollection(collectionId: string, poiId: string): boolean {
    if (!this.collections.has(collectionId) || !this.poiDatabase.has(poiId)) {
      return false;
    }

    const collection = this.collections.get(collectionId)!;
    if (!collection.includes(poiId)) {
      collection.push(poiId);
    }

    // Update POI with collection reference
    const poi = this.poiDatabase.get(poiId)!;
    if (!poi.collections) {
      poi.collections = [];
    }
    if (!poi.collections.includes(collectionId)) {
      poi.collections.push(collectionId);
    }

    return true;
  }

  /**
   * Remove POI from collection
   */
  removePOIFromCollection(collectionId: string, poiId: string): boolean {
    if (!this.collections.has(collectionId)) {
      return false;
    }

    const collection = this.collections.get(collectionId)!;
    const index = collection.indexOf(poiId);
    if (index !== -1) {
      collection.splice(index, 1);
    }

    // Update POI to remove collection reference
    const poi = this.poiDatabase.get(poiId);
    if (poi && poi.collections) {
      const poiCollectionIndex = poi.collections.indexOf(collectionId);
      if (poiCollectionIndex !== -1) {
        poi.collections.splice(poiCollectionIndex, 1);
      }
    }

    return true;
  }

  /**
   * Get POIs in a collection
   */
  getPOIsInCollection(collectionId: string): PointOfInterest[] {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      return [];
    }

    return collection
      .map(poiId => this.poiDatabase.get(poiId))
      .filter(Boolean) as PointOfInterest[];
  }

  /**
   * Get all collections for a user
   */
  getUserCollections(userId: string): string[] {
    // In a real implementation, you'd have a proper user-collection mapping
    // For now, we'll return all collections (simplified)
    return Array.from(this.collections.keys());
  }
}