/**
 * Preference Management System for the multi-modal routing application
 * Handles storage, retrieval, validation, and manipulation of user preferences
 */

import {
  PreferenceCategory,
  PriorityLevel,
  PreferenceWeights,
  DetailedUserPreferences,
  UserProfile,
  UserProfileTemplate,
  PreferenceValidationResult,
  PreferenceImportExport,
  UserConstraints,
  TransportModePreferences,
  MobilityDevice,
  PreferenceSharingData,
  PreferenceLearningData,
  PreferenceRecommendation,
  PreferenceAnalytics
} from '../types/preferences';
import { UserPreferences, RouteConstraints } from '../types/routing';
import { TransportMode } from '../types/graph';

/**
 * Default preference weights
 */
const DEFAULT_PREFERENCE_WEIGHTS: PreferenceWeights = {
  speed: 0.25,
  safety: 0.2,
  accessibility: 0.15,
  cost: 0.15,
  environment: 0.1,
  comfort: 0.1,
  scenic: 0.05
};

/**
 * Default user constraints
 */
const DEFAULT_USER_CONSTRAINTS: UserConstraints = {
  mobilityDevice: {
    type: 'none',
    canFold: false,
    requiresElevator: false,
    requiresRamp: false
  }
};

/**
 * Default transport mode preferences
 */
const DEFAULT_TRANSPORT_MODE_PREFERENCES: TransportModePreferences = {
  preferredModes: [],
  avoidedModes: [],
  preferDirectRoutes: false,
  avoidVehicleChanges: false
};

/**
 * Default detailed user preferences
 */
const DEFAULT_DETAILED_PREFERENCES: DetailedUserPreferences = {
  weights: { ...DEFAULT_PREFERENCE_WEIGHTS },
  constraints: { ...DEFAULT_USER_CONSTRAINTS },
  transportModes: { ...DEFAULT_TRANSPORT_MODE_PREFERENCES },
  avoidTolls: false,
  avoidHighways: false,
  avoidFerries: false,
  avoidUnpavedRoads: false,
  avoidStairs: false,
  minimizeTransfers: false,
  preferScenicRoutes: false,
  preferLessCrowded: false,
  requireBikeLane: false,
  requireSidewalk: false,
  requireWheelchairAccessibility: false,
  lexicographicOrder: [
    PreferenceCategory.SPEED,
    PreferenceCategory.SAFETY,
    PreferenceCategory.ACCESSIBILITY,
    PreferenceCategory.COST,
    PreferenceCategory.ENVIRONMENT,
    PreferenceCategory.COMFORT,
    PreferenceCategory.SCENIC
  ]
};

/**
 * Preference Manager class
 */
export class PreferenceManager {
  private static instance: PreferenceManager;
  private storage: Storage;
  private preferences: Map<string, UserProfile> = new Map();
  private templates: Map<string, UserProfileTemplate> = new Map();
  private sharingData: Map<string, PreferenceSharingData> = new Map();
  private learningData: Map<string, PreferenceLearningData> = new Map();

  private constructor() {
    this.storage = typeof window !== 'undefined' ? window.localStorage : {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null
    };
    this.loadDefaultTemplates();
    this.loadFromStorage();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PreferenceManager {
    if (!PreferenceManager.instance) {
      PreferenceManager.instance = new PreferenceManager();
    }
    return PreferenceManager.instance;
  }

  /**
   * Load default profile templates
   */
  private loadDefaultTemplates(): void {
    // Commuter profile
    this.templates.set('commuter', {
      id: 'commuter',
      name: 'Commuter',
      description: 'Optimized for daily commuting with focus on speed and reliability',
      icon: 'briefcase',
      preferences: {
        ...DEFAULT_DETAILED_PREFERENCES,
        weights: {
          speed: 0.4,
          safety: 0.2,
          accessibility: 0.1,
          cost: 0.15,
          environment: 0.05,
          comfort: 0.05,
          scenic: 0.05
        },
        transportModes: {
          ...DEFAULT_TRANSPORT_MODE_PREFERENCES,
          preferredModes: [TransportMode.CAR, TransportMode.BUS, TransportMode.METRO, TransportMode.WALKING],
          maxTransfers: 2
        },
        avoidTolls: false,
        avoidHighways: false,
        minimizeTransfers: true
      },
      isDefault: true,
      isEditable: true
    });

    // Tourist profile
    this.templates.set('tourist', {
      id: 'tourist',
      name: 'Tourist',
      description: 'Optimized for sightseeing with focus on scenic routes and points of interest',
      icon: 'camera',
      preferences: {
        ...DEFAULT_DETAILED_PREFERENCES,
        weights: {
          speed: 0.15,
          safety: 0.2,
          accessibility: 0.15,
          cost: 0.1,
          environment: 0.15,
          comfort: 0.15,
          scenic: 0.1
        },
        preferScenicRoutes: true,
        transportModes: {
          ...DEFAULT_TRANSPORT_MODE_PREFERENCES,
          preferredModes: [TransportMode.WALKING, TransportMode.BICYCLE, TransportMode.TRAM, TransportMode.BUS]
        }
      },
      isDefault: true,
      isEditable: true
    });

    // Accessibility-focused profile
    this.templates.set('accessible', {
      id: 'accessible',
      name: 'Accessibility Focus',
      description: 'Optimized for users with mobility requirements',
      icon: 'wheelchair',
      preferences: {
        ...DEFAULT_DETAILED_PREFERENCES,
        weights: {
          speed: 0.1,
          safety: 0.15,
          accessibility: 0.4,
          cost: 0.1,
          environment: 0.05,
          comfort: 0.15,
          scenic: 0.05
        },
        constraints: {
          mobilityDevice: {
            type: 'wheelchair',
            width: 70,
            length: 120,
            requiresElevator: true,
            requiresRamp: true,
            maxSlope: 6,
            minDoorWidth: 80
          },
          maxWalkingDistance: 500,
          maxStairs: 0,
          requiresFlatSurface: true,
          requiresHandrails: true,
          requiresRestAreas: true,
          requiresAccessibleToilets: true
        },
        requireWheelchairAccessibility: true,
        avoidStairs: true,
        transportModes: {
          ...DEFAULT_TRANSPORT_MODE_PREFERENCES,
          preferredModes: [TransportMode.BUS, TransportMode.METRO],
          maxTransfers: 3
        }
      },
      isDefault: true,
      isEditable: true
    });

    // Eco-friendly profile
    this.templates.set('eco', {
      id: 'eco',
      name: 'Eco-Friendly',
      description: 'Optimized for minimal environmental impact',
      icon: 'leaf',
      preferences: {
        ...DEFAULT_DETAILED_PREFERENCES,
        weights: {
          speed: 0.15,
          safety: 0.15,
          accessibility: 0.1,
          cost: 0.15,
          environment: 0.3,
          comfort: 0.1,
          scenic: 0.05
        },
        transportModes: {
          ...DEFAULT_TRANSPORT_MODE_PREFERENCES,
          preferredModes: [TransportMode.WALKING, TransportMode.BICYCLE, TransportMode.BUS, TransportMode.TRAM],
          avoidedModes: [TransportMode.CAR]
        },
        avoidHighways: true,
        requireBikeLane: true
      },
      isDefault: true,
      isEditable: true
    });
  }

  /**
   * Load data from storage
   */
  private loadFromStorage(): void {
    try {
      // Load user profiles
      const profilesData = this.storage.getItem('userProfiles');
      if (profilesData) {
        const profiles: UserProfile[] = JSON.parse(profilesData);
        profiles.forEach(profile => {
          this.preferences.set(profile.id, profile);
          // Convert date strings back to Date objects
          profile.createdAt = new Date(profile.createdAt);
          profile.lastModified = new Date(profile.lastModified);
        });
      }

      // Load sharing data
      const sharingData = this.storage.getItem('preferenceSharing');
      if (sharingData) {
        const sharing: PreferenceSharingData[] = JSON.parse(sharingData);
        sharing.forEach(data => {
          this.sharingData.set(data.groupId, data);
          data.sharedAt = new Date(data.sharedAt);
          if (data.expiresAt) {
            data.expiresAt = new Date(data.expiresAt);
          }
        });
      }

      // Load learning data
      const learningData = this.storage.getItem('preferenceLearning');
      if (learningData) {
        const learning: PreferenceLearningData[] = JSON.parse(learningData);
        learning.forEach((data, index) => {
          this.learningData.set(`learning-${index}`, data);
          // Convert date strings back to Date objects
          data.routeSelections.forEach(selection => {
            selection.selectedAt = new Date(selection.selectedAt);
          });
          data.routeRejections.forEach(rejection => {
            rejection.rejectedAt = new Date(rejection.rejectedAt);
          });
          data.preferenceAdjustments.forEach(adjustment => {
            adjustment.adjustedAt = new Date(adjustment.adjustedAt);
          });
        });
      }
    } catch (error) {
      console.error('Failed to load preferences from storage:', error);
    }
  }

  /**
   * Save data to storage
   */
  private saveToStorage(): void {
    try {
      // Save user profiles
      const profiles = Array.from(this.preferences.values());
      this.storage.setItem('userProfiles', JSON.stringify(profiles));

      // Save sharing data
      const sharing = Array.from(this.sharingData.values());
      this.storage.setItem('preferenceSharing', JSON.stringify(sharing));

      // Save learning data
      const learning = Array.from(this.learningData.values());
      this.storage.setItem('preferenceLearning', JSON.stringify(learning));
    } catch (error) {
      console.error('Failed to save preferences to storage:', error);
    }
  }

  /**
   * Create a new user profile
   */
  public createUserProfile(name: string, email?: string): UserProfile {
    const profile: UserProfile = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      email,
      createdAt: new Date(),
      lastModified: new Date(),
      profiles: [],
      activeProfileId: '',
      learningEnabled: true,
      sharingEnabled: false
    };

    // Create default profile from commuter template
    const defaultTemplate = this.templates.get('commuter');
    if (defaultTemplate) {
      const userProfile = { ...defaultTemplate };
      userProfile.id = `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      userProfile.isDefault = false;
      profile.profiles.push(userProfile);
      profile.activeProfileId = userProfile.id;
    }

    this.preferences.set(profile.id, profile);
    this.saveToStorage();
    return profile;
  }

  /**
   * Get user profile by ID
   */
  public getUserProfile(userId: string): UserProfile | null {
    return this.preferences.get(userId) || null;
  }

  /**
   * Update user profile
   */
  public updateUserProfile(userId: string, updates: Partial<UserProfile>): boolean {
    const profile = this.preferences.get(userId);
    if (!profile) return false;

    Object.assign(profile, updates);
    profile.lastModified = new Date();
    this.preferences.set(userId, profile);
    this.saveToStorage();
    return true;
  }

  /**
   * Add a new preference profile to a user
   */
  public addPreferenceProfile(
    userId: string,
    name: string,
    description: string,
    preferences?: Partial<DetailedUserPreferences>
  ): string | null {
    const userProfile = this.preferences.get(userId);
    if (!userProfile) return null;

    const newProfile: UserProfileTemplate = {
      id: `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      preferences: {
        ...DEFAULT_DETAILED_PREFERENCES,
        ...preferences
      },
      isDefault: false,
      isEditable: true
    };

    userProfile.profiles.push(newProfile);
    userProfile.lastModified = new Date();
    this.preferences.set(userId, userProfile);
    this.saveToStorage();

    return newProfile.id;
  }

  /**
   * Update a preference profile
   */
  public updatePreferenceProfile(
    userId: string,
    profileId: string,
    updates: Partial<UserProfileTemplate>
  ): boolean {
    const userProfile = this.preferences.get(userId);
    if (!userProfile) return false;

    const profileIndex = userProfile.profiles.findIndex(p => p.id === profileId);
    if (profileIndex === -1) return false;

    // Don't allow editing default templates
    if (userProfile.profiles[profileIndex].isDefault && !updates.isEditable) {
      return false;
    }

    Object.assign(userProfile.profiles[profileIndex], updates);
    userProfile.lastModified = new Date();
    this.preferences.set(userId, userProfile);
    this.saveToStorage();

    return true;
  }

  /**
   * Delete a preference profile
   */
  public deletePreferenceProfile(userId: string, profileId: string): boolean {
    const userProfile = this.preferences.get(userId);
    if (!userProfile) return false;

    const profileIndex = userProfile.profiles.findIndex(p => p.id === profileId);
    if (profileIndex === -1) return false;

    // Don't allow deleting default templates
    if (userProfile.profiles[profileIndex].isDefault) {
      return false;
    }

    userProfile.profiles.splice(profileIndex, 1);

    // If the active profile was deleted, switch to the first available profile
    if (userProfile.activeProfileId === profileId && userProfile.profiles.length > 0) {
      userProfile.activeProfileId = userProfile.profiles[0].id;
    }

    userProfile.lastModified = new Date();
    this.preferences.set(userId, userProfile);
    this.saveToStorage();

    return true;
  }

  /**
   * Set active preference profile for a user
   */
  public setActiveProfile(userId: string, profileId: string): boolean {
    const userProfile = this.preferences.get(userId);
    if (!userProfile) return false;

    const profileExists = userProfile.profiles.some(p => p.id === profileId);
    if (!profileExists) return false;

    userProfile.activeProfileId = profileId;
    userProfile.lastModified = new Date();
    this.preferences.set(userId, userProfile);
    this.saveToStorage();

    return true;
  }

  /**
   * Get active preference profile for a user
   */
  public getActivePreferences(userId: string): DetailedUserPreferences | null {
    const userProfile = this.preferences.get(userId);
    if (!userProfile) return null;

    const activeProfile = userProfile.profiles.find(p => p.id === userProfile.activeProfileId);
    return activeProfile ? activeProfile.preferences : null;
  }

  /**
   * Get all available profile templates
   */
  public getProfileTemplates(): UserProfileTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get profile template by ID
   */
  public getProfileTemplate(templateId: string): UserProfileTemplate | null {
    return this.templates.get(templateId) || null;
  }

  /**
   * Validate user preferences
   */
  public validatePreferences(preferences: DetailedUserPreferences): PreferenceValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const normalizedPreferences = { ...preferences };

    // Validate weights
    const weightSum = Object.values(preferences.weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(weightSum - 1.0) > 0.01) {
      warnings.push(`Preference weights sum to ${weightSum.toFixed(3)}, should sum to 1.0`);
      // Normalize weights
      const scale = 1.0 / weightSum;
      Object.keys(normalizedPreferences.weights).forEach(key => {
        normalizedPreferences.weights[key as keyof PreferenceWeights] *= scale;
      });
    }

    // Validate individual weights
    Object.entries(preferences.weights).forEach(([key, value]) => {
      if (value < 0 || value > 1) {
        errors.push(`${key} weight must be between 0 and 1, got ${value}`);
      }
    });

    // Validate constraints
    if (preferences.constraints.mobilityDevice.type !== 'none') {
      const device = preferences.constraints.mobilityDevice;
      if (device.width && device.width < 30) {
        warnings.push('Device width seems very small, please verify');
      }
      if (device.width && device.width > 150) {
        warnings.push('Device width seems very large, may limit accessibility');
      }
      if (device.maxSlope && device.maxSlope > 15) {
        warnings.push('Maximum slope seems high for wheelchair accessibility');
      }
    }

    // Validate transport modes
    const allModes = [...preferences.transportModes.preferredModes, ...preferences.transportModes.avoidedModes];
    const duplicates = allModes.filter((mode, index) => allModes.indexOf(mode) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate transport modes found: ${duplicates.join(', ')}`);
    }

    // Validate lexicographic order
    const allCategories = Object.values(PreferenceCategory);
    const invalidCategories = preferences.lexicographicOrder.filter(
      category => !allCategories.includes(category)
    );
    if (invalidCategories.length > 0) {
      errors.push(`Invalid preference categories: ${invalidCategories.join(', ')}`);
    }

    const duplicateCategories = preferences.lexicographicOrder.filter(
      (category, index) => preferences.lexicographicOrder.indexOf(category) !== index
    );
    if (duplicateCategories.length > 0) {
      errors.push(`Duplicate preference categories: ${duplicateCategories.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      normalizedPreferences: errors.length === 0 ? normalizedPreferences : undefined
    };
  }

  /**
   * Convert detailed preferences to legacy UserPreferences format
   */
  public convertToLegacyPreferences(detailedPreferences: DetailedUserPreferences): UserPreferences {
    return {
      speed: Math.round(detailedPreferences.weights.speed * 5),
      safety: Math.round(detailedPreferences.weights.safety * 5),
      accessibility: Math.round(detailedPreferences.weights.accessibility * 5),
      cost: Math.round(detailedPreferences.weights.cost * 5),
      comfort: Math.round(detailedPreferences.weights.comfort * 5),
      environmental: Math.round(detailedPreferences.weights.environment * 5),
      scenic: detailedPreferences.preferScenicRoutes,
      minimizeTransfers: detailedPreferences.minimizeTransfers,
      avoidWalking: detailedPreferences.constraints.maxWalkingDistance === 0,
      avoidCycling: detailedPreferences.constraints.maxCyclingDistance === 0,
      avoidStairs: detailedPreferences.avoidStairs,
      requireWheelchairAccessibility: detailedPreferences.requireWheelchairAccessibility,
      preferredModes: detailedPreferences.transportModes.preferredModes,
      avoidedModes: detailedPreferences.transportModes.avoidedModes
    };
  }

  /**
   * Convert detailed preferences to RouteConstraints
   */
  public convertToRouteConstraints(detailedPreferences: DetailedUserPreferences): RouteConstraints {
    return {
      maxDistance: 100000, // 100km default
      maxDuration: detailedPreferences.constraints.timeConstraints?.maxTotalTime || 10800, // 3 hours default
      maxTransfers: detailedPreferences.transportModes.maxTransfers || 5,
      maxWalkingDistance: detailedPreferences.constraints.maxWalkingDistance || 2000,
      maxCyclingDistance: detailedPreferences.constraints.maxCyclingDistance || 15000,
      maxCost: 1000, // Default monetary limit
      departureTime: detailedPreferences.constraints.timeConstraints?.departureTime,
      arrivalTime: detailedPreferences.constraints.timeConstraints?.arrivalTime,
      avoidTolls: detailedPreferences.avoidTolls,
      avoidHighways: detailedPreferences.avoidHighways,
      avoidFerries: detailedPreferences.avoidFerries,
      avoidUnpavedRoads: detailedPreferences.avoidUnpavedRoads,
      requireBikeLane: detailedPreferences.requireBikeLane,
      requireSidewalk: detailedPreferences.requireSidewalk
    };
  }

  /**
   * Import preferences from data
   */
  public importPreferences(data: PreferenceImportExport): PreferenceValidationResult {
    const validation = this.validatePreferences(data.preferences);
    if (!validation.isValid) {
      return validation;
    }

    // Import profiles
    data.profiles.forEach(profile => {
      // Check if profile already exists
      if (this.templates.has(profile.id)) {
        // Generate new ID to avoid conflicts
        profile.id = `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      this.templates.set(profile.id, profile);
    });

    // Import learning data if available
    if (data.learningData) {
      const learningId = `imported-${Date.now()}`;
      this.learningData.set(learningId, data.learningData);
    }

    this.saveToStorage();
    return validation;
  }

  /**
   * Export preferences to data
   */
  public exportPreferences(userId: string, includeLearningData = false): PreferenceImportExport | null {
    const userProfile = this.preferences.get(userId);
    if (!userProfile) return null;

    return {
      version: '1.0.0',
      exportedAt: new Date(),
      preferences: userProfile.profiles.find(p => p.id === userProfile.activeProfileId)?.preferences || DEFAULT_DETAILED_PREFERENCES,
      profiles: userProfile.profiles,
      learningData: includeLearningData ? this.learningData.get(`learning-${userId}`) : undefined,
      metadata: {
        description: `Preferences for ${userProfile.name}`,
        tags: [],
        isPublic: false
      }
    };
  }

  /**
   * Share preferences with a group
   */
  public sharePreferences(
    userId: string,
    groupId: string,
    groupName: string,
    permissions: PreferenceSharingData['permissions'],
    expiresAt?: Date
  ): string | null {
    const userProfile = this.preferences.get(userId);
    if (!userProfile || !userProfile.sharingEnabled) return null;

    const activePreferences = userProfile.profiles.find(p => p.id === userProfile.activeProfileId);
    if (!activePreferences) return null;

    const sharingData: PreferenceSharingData = {
      groupId,
      groupName,
      sharedPreferences: activePreferences.preferences,
      sharedBy: userId,
      sharedAt: new Date(),
      expiresAt,
      permissions
    };

    this.sharingData.set(groupId, sharingData);
    this.saveToStorage();

    return groupId;
  }

  /**
   * Get shared preferences for a group
   */
  public getSharedPreferences(groupId: string): PreferenceSharingData | null {
    const sharingData = this.sharingData.get(groupId);
    if (!sharingData) return null;

    // Check if sharing data has expired
    if (sharingData.expiresAt && sharingData.expiresAt < new Date()) {
      this.sharingData.delete(groupId);
      this.saveToStorage();
      return null;
    }

    return sharingData;
  }

  /**
   * Record route selection for learning
   */
  public recordRouteSelection(
    userId: string,
    routeId: string,
    preferences: DetailedUserPreferences,
    context: string
  ): void {
    const userProfile = this.preferences.get(userId);
    if (!userProfile || !userProfile.learningEnabled) return;

    let learningData = this.learningData.get(`learning-${userId}`);
    if (!learningData) {
      learningData = {
        routeSelections: [],
        routeRejections: [],
        preferenceAdjustments: []
      };
      this.learningData.set(`learning-${userId}`, learningData);
    }

    learningData.routeSelections.push({
      routeId,
      selectedAt: new Date(),
      preferences,
      context
    });

    // Limit the number of stored selections
    if (learningData.routeSelections.length > 1000) {
      learningData.routeSelections = learningData.routeSelections.slice(-500);
    }

    this.saveToStorage();
  }

  /**
   * Record route rejection for learning
   */
  public recordRouteRejection(
    userId: string,
    routeId: string,
    reason: string
  ): void {
    const userProfile = this.preferences.get(userId);
    if (!userProfile || !userProfile.learningEnabled) return;

    let learningData = this.learningData.get(`learning-${userId}`);
    if (!learningData) {
      learningData = {
        routeSelections: [],
        routeRejections: [],
        preferenceAdjustments: []
      };
      this.learningData.set(`learning-${userId}`, learningData);
    }

    learningData.routeRejections.push({
      routeId,
      rejectedAt: new Date(),
      reason
    });

    // Limit the number of stored rejections
    if (learningData.routeRejections.length > 1000) {
      learningData.routeRejections = learningData.routeRejections.slice(-500);
    }

    this.saveToStorage();
  }

  /**
   * Get preference recommendations based on learning data
   */
  public getPreferenceRecommendations(userId: string): PreferenceRecommendation[] {
    const userProfile = this.preferences.get(userId);
    if (!userProfile || !userProfile.learningEnabled) return [];

    const learningData = this.learningData.get(`learning-${userId}`);
    if (!learningData || learningData.routeSelections.length < 10) return [];

    const recommendations: PreferenceRecommendation[] = [];
    const activePreferences = userProfile.profiles.find(p => p.id === userProfile.activeProfileId)?.preferences;

    if (!activePreferences) return recommendations;

    // Analyze selection patterns to generate recommendations
    this.analyzeSelectionPatterns(learningData, activePreferences, recommendations);

    return recommendations;
  }

  /**
   * Analyze selection patterns to generate recommendations
   */
  private analyzeSelectionPatterns(
    learningData: PreferenceLearningData,
    activePreferences: DetailedUserPreferences,
    recommendations: PreferenceRecommendation[]
  ): void {
    // Analyze context-based preferences
    const contextGroups = this.groupByContext(learningData.routeSelections);
    
    for (const [context, selections] of contextGroups) {
      if (selections.length < 5) continue;

      // Calculate average weights for this context
      const avgWeights = this.calculateAverageWeights(selections);
      
      // Compare with current active preferences
      Object.entries(avgWeights).forEach(([category, avgWeight]) => {
        const currentWeight = activePreferences.weights[category as keyof PreferenceWeights];
        const difference = Math.abs(avgWeight - currentWeight);
        
        // If difference is significant, create recommendation
        if (difference > 0.1) {
          recommendations.push({
            id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'weight_adjustment',
            title: `Adjust ${category} preference for ${context}`,
            description: `Based on your ${context} routes, you might prefer ${category} to be ${avgWeight > currentWeight ? 'higher' : 'lower'}`,
            confidence: Math.min(difference * 2, 1),
            impact: difference > 0.2 ? 'high' : 'medium',
            data: {
              category: category as PreferenceCategory,
              currentWeight,
              recommendedWeight: avgWeight
            },
            reasons: [
              `You've selected ${selections.length} routes for ${context}`,
              `Average preference weight: ${avgWeight.toFixed(2)}`,
              `Current preference weight: ${currentWeight.toFixed(2)}`
            ]
          });
        }
      });
    }

    // Analyze rejection patterns
    const rejectionsByReason = this.groupRejectionsByReason(learningData.routeRejections);
    
    for (const [reason, rejections] of rejectionsByReason) {
      if (rejections.length < 3) continue;

      // Create recommendations based on rejection reasons
      if (reason.includes('expensive') && activePreferences.weights.cost < 0.2) {
        recommendations.push({
          id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'weight_adjustment',
          title: 'Increase cost priority',
          description: 'You often reject routes for being too expensive',
          confidence: Math.min(rejections.length * 0.2, 1),
          impact: 'medium',
          data: {
            category: PreferenceCategory.COST,
            currentWeight: activePreferences.weights.cost,
            recommendedWeight: Math.min(activePreferences.weights.cost + 0.1, 0.5)
          },
          reasons: [
            `You've rejected ${rejections.length} routes for being too expensive`,
            'Consider increasing cost priority to avoid these routes'
          ]
        });
      }
    }
  }

  /**
   * Group route selections by context
   */
  private groupByContext(selections: PreferenceLearningData['routeSelections']): Map<string, PreferenceLearningData['routeSelections']> {
    const groups = new Map<string, PreferenceLearningData['routeSelections']>();
    
    selections.forEach(selection => {
      if (!groups.has(selection.context)) {
        groups.set(selection.context, []);
      }
      groups.get(selection.context)!.push(selection);
    });
    
    return groups;
  }

  /**
   * Calculate average weights from route selections
   */
  private calculateAverageWeights(selections: PreferenceLearningData['routeSelections']): PreferenceWeights {
    const avgWeights: PreferenceWeights = {
      speed: 0,
      safety: 0,
      accessibility: 0,
      cost: 0,
      environment: 0,
      comfort: 0,
      scenic: 0
    };

    selections.forEach(selection => {
      Object.entries(selection.preferences.weights).forEach(([category, weight]) => {
        avgWeights[category as keyof PreferenceWeights] += weight;
      });
    });

    // Calculate average
    Object.keys(avgWeights).forEach(category => {
      avgWeights[category as keyof PreferenceWeights] /= selections.length;
    });

    return avgWeights;
  }

  /**
   * Group route rejections by reason
   */
  private groupRejectionsByReason(rejections: PreferenceLearningData['routeRejections']): Map<string, PreferenceLearningData['routeRejections']> {
    const groups = new Map<string, PreferenceLearningData['routeRejections']>();
    
    rejections.forEach(rejection => {
      if (!groups.has(rejection.reason)) {
        groups.set(rejection.reason, []);
      }
      groups.get(rejection.reason)!.push(rejection);
    });
    
    return groups;
  }

  /**
   * Get preference analytics for a user
   */
  public getPreferenceAnalytics(userId: string): PreferenceAnalytics | null {
    const userProfile = this.preferences.get(userId);
    if (!userProfile) return null;

    const learningData = this.learningData.get(`learning-${userId}`);
    if (!learningData) return null;

    // Calculate most used profiles
    const profileUsage = new Map<string, { count: number; lastUsed: Date }>();
    learningData.routeSelections.forEach(selection => {
      // Find which profile matches the selection preferences
      const matchingProfile = userProfile.profiles.find(profile => 
        this.arePreferencesEqual(profile.preferences, selection.preferences)
      );
      
      if (matchingProfile) {
        const usage = profileUsage.get(matchingProfile.id) || { count: 0, lastUsed: selection.selectedAt };
        usage.count++;
        usage.lastUsed = selection.selectedAt > usage.lastUsed ? selection.selectedAt : usage.lastUsed;
        profileUsage.set(matchingProfile.id, usage);
      }
    });

    const mostUsedProfiles = Array.from(profileUsage.entries()).map(([profileId, usage]) => ({
      profileId,
      usageCount: usage.count,
      lastUsed: usage.lastUsed
    })).sort((a, b) => b.usageCount - a.usageCount);

    // Calculate preference trends
    const preferenceTrends = this.calculatePreferenceTrends(learningData);

    // Calculate route selection patterns
    const routeSelectionPatterns = this.calculateRouteSelectionPatterns(learningData);

    return {
      mostUsedProfiles,
      preferenceTrends,
      routeSelectionPatterns,
      learningEffectiveness: {
        adaptationRate: 0.7, // Placeholder - would calculate from recommendation acceptance
        satisfactionScore: 0.8 // Placeholder - would calculate from user feedback
      }
    };
  }

  /**
   * Check if two preference objects are equal
   */
  private arePreferencesEqual(p1: DetailedUserPreferences, p2: DetailedUserPreferences): boolean {
    return JSON.stringify(p1.weights) === JSON.stringify(p2.weights) &&
           JSON.stringify(p1.constraints) === JSON.stringify(p2.constraints) &&
           JSON.stringify(p1.transportModes) === JSON.stringify(p2.transportModes);
  }

  /**
   * Calculate preference trends over time
   */
  private calculatePreferenceTrends(learningData: PreferenceLearningData): PreferenceAnalytics['preferenceTrends'] {
    // Sort selections by date
    const sortedSelections = [...learningData.routeSelections].sort((a, b) => 
      a.selectedAt.getTime() - b.selectedAt.getTime()
    );

    // Split into two halves to compare
    const midpoint = Math.floor(sortedSelections.length / 2);
    const firstHalf = sortedSelections.slice(0, midpoint);
    const secondHalf = sortedSelections.slice(midpoint);

    if (firstHalf.length === 0 || secondHalf.length === 0) {
      return [];
    }

    const firstHalfWeights = this.calculateAverageWeights(firstHalf);
    const secondHalfWeights = this.calculateAverageWeights(secondHalf);

    const trends: PreferenceAnalytics['preferenceTrends'] = [];

    Object.entries(firstHalfWeights).forEach(([category, firstWeight]) => {
      const secondWeight = secondHalfWeights[category as keyof PreferenceWeights];
      const difference = secondWeight - firstWeight;
      let trend: 'increasing' | 'decreasing' | 'stable';

      if (Math.abs(difference) < 0.05) {
        trend = 'stable';
      } else if (difference > 0) {
        trend = 'increasing';
      } else {
        trend = 'decreasing';
      }

      trends.push({
        category: category as PreferenceCategory,
        averageWeight: secondWeight,
        trend,
        changeOverTime: difference
      });
    });

    return trends;
  }

  /**
   * Calculate route selection patterns
   */
  private calculateRouteSelectionPatterns(learningData: PreferenceLearningData): PreferenceAnalytics['routeSelectionPatterns'] {
    const contextGroups = this.groupByContext(learningData.routeSelections);
    const patterns: PreferenceAnalytics['routeSelectionPatterns'] = [];

    for (const [context, selections] of contextGroups) {
      if (selections.length < 3) continue;

      const avgWeights = this.calculateAverageWeights(selections);
      
      // Extract common constraints
      const commonConstraints: string[] = [];
      const constraintCounts = new Map<string, number>();

      selections.forEach(selection => {
        if (selection.preferences.constraints.maxWalkingDistance) {
          const constraint = `maxWalkingDistance: ${selection.preferences.constraints.maxWalkingDistance}`;
          constraintCounts.set(constraint, (constraintCounts.get(constraint) || 0) + 1);
        }
        if (selection.preferences.avoidStairs) {
          constraintCounts.set('avoidStairs', (constraintCounts.get('avoidStairs') || 0) + 1);
        }
        if (selection.preferences.requireWheelchairAccessibility) {
          constraintCounts.set('requireWheelchairAccessibility', (constraintCounts.get('requireWheelchairAccessibility') || 0) + 1);
        }
      });

      // Find constraints used in more than 50% of selections
      constraintCounts.forEach((count, constraint) => {
        if (count / selections.length > 0.5) {
          commonConstraints.push(constraint);
        }
      });

      patterns.push({
        context,
        averageWeights: avgWeights,
        commonConstraints
      });
    }

    return patterns;
  }
}