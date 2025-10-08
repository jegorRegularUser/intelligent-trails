/**
 * User Profile Management System for the multi-modal routing application
 * Handles user profiles, profile templates, and profile switching for different contexts
 */

import {
  UserProfile,
  UserProfileTemplate,
  DetailedUserPreferences,
  PreferenceCategory,
  UserConstraints,
  TransportModePreferences,
  MobilityDevice,
  PreferenceAnalytics,
  PreferenceRecommendation
} from '../types/preferences';
import { PreferenceManager } from './PreferenceManager';

/**
 * Profile context types
 */
export enum ProfileContext {
  COMMUTING = 'commuting',
  LEISURE = 'leisure',
  BUSINESS = 'business',
  EMERGENCY = 'emergency',
  TOURISM = 'tourism',
  EXERCISE = 'exercise',
  SHOPPING = 'shopping',
  SOCIAL = 'social'
}

/**
 * Profile sharing settings
 */
export interface ProfileSharingSettings {
  isPublic: boolean;
  allowCopying: boolean;
  allowEditing: boolean;
  requiresApproval: boolean;
  expiresAt?: Date;
  allowedUsers?: string[]; // User IDs
}

/**
 * Profile usage statistics
 */
export interface ProfileUsageStats {
  profileId: string;
  usageCount: number;
  lastUsed: Date;
  averageRating: number; // 1-5
  contexts: Map<ProfileContext, number>; // Context usage count
  satisfactionScore: number; // 0-1
}

/**
 * Profile adaptation data
 */
export interface ProfileAdaptationData {
  profileId: string;
  adaptations: {
    category: PreferenceCategory;
    oldValue: number;
    newValue: number;
    adaptedAt: Date;
    reason: string;
    context: ProfileContext;
  }[];
  effectiveness: number; // 0-1
}

/**
 * Profile recommendation
 */
export interface ProfileRecommendation {
  id: string;
  type: 'new_profile' | 'profile_switch' | 'profile_update';
  title: string;
  description: string;
  confidence: number; // 0-1
  profile?: UserProfileTemplate;
  profileId?: string;
  context: ProfileContext;
  reasons: string[];
  dismissed?: boolean;
  appliedAt?: Date;
}

/**
 * Profile manager class
 */
export class ProfileManager {
  private preferenceManager: PreferenceManager;
  private usageStats: Map<string, ProfileUsageStats> = new Map();
  private adaptationData: Map<string, ProfileAdaptationData> = new Map();
  private recommendations: Map<string, ProfileRecommendation> = new Map();
  private contextProfiles: Map<string, string> = new Map(); // userId -> context -> profileId

  constructor(preferenceManager: PreferenceManager) {
    this.preferenceManager = preferenceManager;
    this.loadUsageStats();
    this.loadAdaptationData();
    this.loadRecommendations();
    this.loadContextProfiles();
  }

  /**
   * Load usage statistics from storage
   */
  private loadUsageStats(): void {
    try {
      const storage = typeof window !== 'undefined' ? window.localStorage : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null
      };

      const statsData = storage.getItem('profileUsageStats');
      if (statsData) {
        const stats: ProfileUsageStats[] = JSON.parse(statsData);
        stats.forEach(stat => {
          stat.lastUsed = new Date(stat.lastUsed);
          const contextEntries = Object.entries(stat.contexts || {});
          const validContexts = contextEntries.filter(([key]) =>
            Object.values(ProfileContext).includes(key as ProfileContext)
          );
          stat.contexts = new Map(validContexts as [ProfileContext, number][]);
          this.usageStats.set(stat.profileId, stat);
        });
      }
    } catch (error) {
      console.error('Failed to load profile usage stats:', error);
    }
  }

  /**
   * Save usage statistics to storage
   */
  private saveUsageStats(): void {
    try {
      const storage = typeof window !== 'undefined' ? window.localStorage : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null
      };

      const stats = Array.from(this.usageStats.values()).map(stat => ({
        ...stat,
        contexts: Object.fromEntries(stat.contexts)
      }));

      storage.setItem('profileUsageStats', JSON.stringify(stats));
    } catch (error) {
      console.error('Failed to save profile usage stats:', error);
    }
  }

  /**
   * Load adaptation data from storage
   */
  private loadAdaptationData(): void {
    try {
      const storage = typeof window !== 'undefined' ? window.localStorage : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null
      };

      const adaptationData = storage.getItem('profileAdaptationData');
      if (adaptationData) {
        const adaptations: ProfileAdaptationData[] = JSON.parse(adaptationData);
        adaptations.forEach(adaptation => {
          adaptation.adaptations.forEach(adjustment => {
            adjustment.adaptedAt = new Date(adjustment.adaptedAt);
          });
          this.adaptationData.set(adaptation.profileId, adaptation);
        });
      }
    } catch (error) {
      console.error('Failed to load profile adaptation data:', error);
    }
  }

  /**
   * Save adaptation data to storage
   */
  private saveAdaptationData(): void {
    try {
      const storage = typeof window !== 'undefined' ? window.localStorage : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null
      };

      const adaptations = Array.from(this.adaptationData.values());
      storage.setItem('profileAdaptationData', JSON.stringify(adaptations));
    } catch (error) {
      console.error('Failed to save profile adaptation data:', error);
    }
  }

  /**
   * Load recommendations from storage
   */
  private loadRecommendations(): void {
    try {
      const storage = typeof window !== 'undefined' ? window.localStorage : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null
      };

      const recommendationsData = storage.getItem('profileRecommendations');
      if (recommendationsData) {
        const recommendations: ProfileRecommendation[] = JSON.parse(recommendationsData);
        recommendations.forEach(recommendation => {
          if (recommendation.appliedAt) {
            recommendation.appliedAt = new Date(recommendation.appliedAt);
          }
          this.recommendations.set(recommendation.id, recommendation);
        });
      }
    } catch (error) {
      console.error('Failed to load profile recommendations:', error);
    }
  }

  /**
   * Save recommendations to storage
   */
  private saveRecommendations(): void {
    try {
      const storage = typeof window !== 'undefined' ? window.localStorage : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null
      };

      const recommendations = Array.from(this.recommendations.values());
      storage.setItem('profileRecommendations', JSON.stringify(recommendations));
    } catch (error) {
      console.error('Failed to save profile recommendations:', error);
    }
  }

  /**
   * Load context profiles from storage
   */
  private loadContextProfiles(): void {
    try {
      const storage = typeof window !== 'undefined' ? window.localStorage : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null
      };

      const contextProfilesData = storage.getItem('contextProfiles');
      if (contextProfilesData) {
        const profiles = JSON.parse(contextProfilesData);
        this.contextProfiles = new Map(Object.entries(profiles));
      }
    } catch (error) {
      console.error('Failed to load context profiles:', error);
    }
  }

  /**
   * Save context profiles to storage
   */
  private saveContextProfiles(): void {
    try {
      const storage = typeof window !== 'undefined' ? window.localStorage : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        length: 0,
        key: () => null
      };

      const profiles = Object.fromEntries(this.contextProfiles);
      storage.setItem('contextProfiles', JSON.stringify(profiles));
    } catch (error) {
      console.error('Failed to save context profiles:', error);
    }
  }

  /**
   * Create a new user profile
   */
  public createUserProfile(name: string, email?: string): UserProfile {
    return this.preferenceManager.createUserProfile(name, email);
  }

  /**
   * Get user profile by ID
   */
  public getUserProfile(userId: string): UserProfile | null {
    return this.preferenceManager.getUserProfile(userId);
  }

  /**
   * Create a new preference profile for a user
   */
  public createPreferenceProfile(
    userId: string,
    name: string,
    description: string,
    preferences?: Partial<DetailedUserPreferences>
  ): string | null {
    return this.preferenceManager.addPreferenceProfile(userId, name, description, preferences);
  }

  /**
   * Update a preference profile
   */
  public updatePreferenceProfile(
    userId: string,
    profileId: string,
    updates: Partial<UserProfileTemplate>
  ): boolean {
    return this.preferenceManager.updatePreferenceProfile(userId, profileId, updates);
  }

  /**
   * Delete a preference profile
   */
  public deletePreferenceProfile(userId: string, profileId: string): boolean {
    // Clean up usage stats
    this.usageStats.delete(profileId);
    this.saveUsageStats();

    // Clean up adaptation data
    this.adaptationData.delete(profileId);
    this.saveAdaptationData();

    // Clean up context profiles
    for (const [key, value] of this.contextProfiles) {
      if (value === profileId) {
        this.contextProfiles.delete(key);
      }
    }
    this.saveContextProfiles();

    return this.preferenceManager.deletePreferenceProfile(userId, profileId);
  }

  /**
   * Set active preference profile for a user
   */
  public setActiveProfile(userId: string, profileId: string): boolean {
    return this.preferenceManager.setActiveProfile(userId, profileId);
  }

  /**
   * Get active preference profile for a user
   */
  public getActiveProfile(userId: string): UserProfileTemplate | null {
    const userProfile = this.preferenceManager.getUserProfile(userId);
    if (!userProfile) return null;

    return userProfile.profiles.find(p => p.id === userProfile.activeProfileId) || null;
  }

  /**
   * Get all preference profiles for a user
   */
  public getAllProfiles(userId: string): UserProfileTemplate[] {
    const userProfile = this.preferenceManager.getUserProfile(userId);
    return userProfile ? userProfile.profiles : [];
  }

  /**
   * Get all available profile templates
   */
  public getProfileTemplates(): UserProfileTemplate[] {
    return this.preferenceManager.getProfileTemplates();
  }

  /**
   * Get profile template by ID
   */
  public getProfileTemplate(templateId: string): UserProfileTemplate | null {
    return this.preferenceManager.getProfileTemplate(templateId);
  }

  /**
   * Create a new profile from a template
   */
  public createProfileFromTemplate(
    userId: string,
    templateId: string,
    name: string,
    description?: string
  ): string | null {
    const template = this.preferenceManager.getProfileTemplate(templateId);
    if (!template) return null;

    return this.preferenceManager.addPreferenceProfile(
      userId,
      name,
      description || template.description,
      template.preferences
    );
  }

  /**
   * Set profile for a specific context
   */
  public setContextProfile(userId: string, context: ProfileContext, profileId: string): boolean {
    const userProfile = this.preferenceManager.getUserProfile(userId);
    if (!userProfile) return false;

    // Check if profile exists
    const profileExists = userProfile.profiles.some(p => p.id === profileId);
    if (!profileExists) return false;

    const key = `${userId}:${context}`;
    this.contextProfiles.set(key, profileId);
    this.saveContextProfiles();

    return true;
  }

  /**
   * Get profile for a specific context
   */
  public getContextProfile(userId: string, context: ProfileContext): UserProfileTemplate | null {
    const key = `${userId}:${context}`;
    const profileId = this.contextProfiles.get(key);
    if (!profileId) return null;

    const userProfile = this.preferenceManager.getUserProfile(userId);
    if (!userProfile) return null;

    return userProfile.profiles.find(p => p.id === profileId) || null;
  }

  /**
   * Switch to context profile
   */
  public switchToContextProfile(userId: string, context: ProfileContext): boolean {
    const profile = this.getContextProfile(userId, context);
    if (!profile) return false;

    return this.setActiveProfile(userId, profile.id);
  }

  /**
   * Record profile usage
   */
  public recordProfileUsage(
    userId: string,
    profileId: string,
    context: ProfileContext,
    rating?: number
  ): void {
    let stats = this.usageStats.get(profileId);
    if (!stats) {
      stats = {
        profileId,
        usageCount: 0,
        lastUsed: new Date(),
        averageRating: 0,
        contexts: new Map(),
        satisfactionScore: 0
      };
      this.usageStats.set(profileId, stats);
    }

    // Update usage stats
    stats.usageCount++;
    stats.lastUsed = new Date();

    // Update context usage
    const contextCount = stats.contexts.get(context) || 0;
    stats.contexts.set(context, contextCount + 1);

    // Update rating
    if (rating !== undefined) {
      const totalRating = stats.averageRating * (stats.usageCount - 1) + rating;
      stats.averageRating = totalRating / stats.usageCount;
    }

    // Update satisfaction score (simplified calculation)
    stats.satisfactionScore = Math.min(stats.averageRating / 5, 1);

    this.saveUsageStats();
  }

  /**
   * Get profile usage statistics
   */
  public getProfileUsageStats(profileId: string): ProfileUsageStats | null {
    return this.usageStats.get(profileId) || null;
  }

  /**
   * Get all usage statistics for a user
   */
  public getAllUsageStats(userId: string): ProfileUsageStats[] {
    const userProfile = this.preferenceManager.getUserProfile(userId);
    if (!userProfile) return [];

    const stats: ProfileUsageStats[] = [];
    userProfile.profiles.forEach(profile => {
      const profileStats = this.usageStats.get(profile.id);
      if (profileStats) {
        stats.push(profileStats);
      }
    });

    return stats.sort((a, b) => b.usageCount - a.usageCount);
  }

  /**
   * Adapt profile based on user behavior
   */
  public adaptProfile(
    userId: string,
    profileId: string,
    adaptations: {
      category: PreferenceCategory;
      newValue: number;
      reason: string;
      context: ProfileContext;
    }[]
  ): boolean {
    const userProfile = this.preferenceManager.getUserProfile(userId);
    if (!userProfile) return false;

    const profile = userProfile.profiles.find(p => p.id === profileId);
    if (!profile) return false;

    // Get or create adaptation data
    let adaptationData = this.adaptationData.get(profileId);
    if (!adaptationData) {
      adaptationData = {
        profileId,
        adaptations: [],
        effectiveness: 0
      };
      this.adaptationData.set(profileId, adaptationData);
    }

    // Apply adaptations
    adaptations.forEach(adaptation => {
      const oldValue = profile.preferences.weights[adaptation.category as keyof typeof profile.preferences.weights];
      
      // Update profile preferences
      profile.preferences.weights[adaptation.category as keyof typeof profile.preferences.weights] = adaptation.newValue;
      
      // Record adaptation
      adaptationData.adaptations.push({
        category: adaptation.category,
        oldValue,
        newValue: adaptation.newValue,
        adaptedAt: new Date(),
        reason: adaptation.reason,
        context: adaptation.context
      });
    });

    // Normalize weights to ensure they sum to 1
    const totalWeight = Object.values(profile.preferences.weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      const scale = 1.0 / totalWeight;
      Object.keys(profile.preferences.weights).forEach(key => {
        profile.preferences.weights[key as keyof typeof profile.preferences.weights] *= scale;
      });
    }

    // Update profile
    this.preferenceManager.updatePreferenceProfile(userId, profileId, profile);
    
    // Save adaptation data
    this.saveAdaptationData();

    return true;
  }

  /**
   * Get profile adaptation data
   */
  public getProfileAdaptationData(profileId: string): ProfileAdaptationData | null {
    return this.adaptationData.get(profileId) || null;
  }

  /**
   * Generate profile recommendations
   */
  public generateProfileRecommendations(userId: string): ProfileRecommendation[] {
    const userProfile = this.preferenceManager.getUserProfile(userId);
    if (!userProfile) return [];

    const recommendations: ProfileRecommendation[] = [];
    const usageStats = this.getAllUsageStats(userId);
    const preferenceRecommendations = this.preferenceManager.getPreferenceRecommendations(userId);

    // Analyze usage patterns to generate recommendations
    this.analyzeUsagePatterns(userId, usageStats, recommendations);

    // Generate recommendations based on preference learning
    this.generatePreferenceBasedRecommendations(userId, preferenceRecommendations, recommendations);

    // Generate context-based recommendations
    this.generateContextBasedRecommendations(userId, recommendations);

    // Save recommendations
    recommendations.forEach(rec => {
      this.recommendations.set(rec.id, rec);
    });
    this.saveRecommendations();

    return recommendations;
  }

  /**
   * Analyze usage patterns to generate recommendations
   */
  private analyzeUsagePatterns(
    userId: string,
    usageStats: ProfileUsageStats[],
    recommendations: ProfileRecommendation[]
  ): void {
    // Find underused profiles
    const underusedProfiles = usageStats.filter(stat => 
      stat.usageCount > 0 && stat.usageCount < 5 && stat.averageRating < 3
    );

    underusedProfiles.forEach(stat => {
      recommendations.push({
        id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'profile_update',
        title: `Update ${stat.profileId} profile`,
        description: 'This profile is rarely used and has low ratings. Consider updating it.',
        confidence: 0.7,
        profileId: stat.profileId,
        context: ProfileContext.LEISURE,
        reasons: [
          `Low usage count: ${stat.usageCount}`,
          `Low average rating: ${stat.averageRating.toFixed(1)}/5`
        ]
      });
    });

    // Find frequently used contexts
    const contextUsage = new Map<ProfileContext, number>();
    usageStats.forEach(stat => {
      stat.contexts.forEach((count, context) => {
        const total = contextUsage.get(context) || 0;
        contextUsage.set(context, total + count);
      });
    });

    // Find contexts without dedicated profiles
    const userProfile = this.preferenceManager.getUserProfile(userId);
    if (!userProfile) return;

    for (const [context, usage] of contextUsage) {
      if (usage > 10) { // Frequently used context
        const hasContextProfile = Array.from(this.contextProfiles.keys()).some(key => 
          key.startsWith(`${userId}:`) && key.endsWith(`:${context}`)
        );

        if (!hasContextProfile) {
          recommendations.push({
            id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'new_profile',
            title: `Create ${context} profile`,
            description: `You frequently use ${context} context. Consider creating a dedicated profile.`,
            confidence: Math.min(usage / 20, 1),
            context,
            reasons: [
              `High context usage: ${usage} times`,
              'No dedicated profile for this context'
            ]
          });
        }
      }
    }
  }

  /**
   * Generate recommendations based on preference learning
   */
  private generatePreferenceBasedRecommendations(
    userId: string,
    preferenceRecommendations: PreferenceRecommendation[],
    profileRecommendations: ProfileRecommendation[]
  ): void {
    // Convert preference recommendations to profile recommendations
    preferenceRecommendations.forEach(prefRec => {
      if (prefRec.type === 'weight_adjustment') {
        const userProfile = this.preferenceManager.getUserProfile(userId);
        if (!userProfile) return;

        const activeProfile = userProfile.profiles.find(p => p.id === userProfile.activeProfileId);
        if (!activeProfile) return;

        profileRecommendations.push({
          id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'profile_update',
          title: `Update ${activeProfile.name} profile`,
          description: prefRec.description,
          confidence: prefRec.confidence,
          profileId: activeProfile.id,
          context: ProfileContext.LEISURE,
          reasons: prefRec.reasons
        });
      }
    });
  }

  /**
   * Generate context-based recommendations
   */
  private generateContextBasedRecommendations(
    userId: string,
    recommendations: ProfileRecommendation[]
  ): void {
    // Analyze time-based patterns
    const hour = new Date().getHours();
    
    // Morning commute recommendation
    if (hour >= 7 && hour <= 9) {
      const hasCommuteProfile = Array.from(this.contextProfiles.keys()).some(key => 
        key.startsWith(`${userId}:`) && key.endsWith(`:${ProfileContext.COMMUTING}`)
      );

      if (!hasCommuteProfile) {
        recommendations.push({
          id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'new_profile',
          title: 'Create morning commute profile',
          description: 'It\'s morning commute time. Consider creating a profile optimized for commuting.',
          confidence: 0.8,
          context: ProfileContext.COMMUTING,
          reasons: [
            'Current time suggests morning commute',
            'No dedicated commute profile found'
          ]
        });
      }
    }

    // Evening leisure recommendation
    if (hour >= 18 && hour <= 20) {
      const hasLeisureProfile = Array.from(this.contextProfiles.keys()).some(key => 
        key.startsWith(`${userId}:`) && key.endsWith(`:${ProfileContext.LEISURE}`)
      );

      if (!hasLeisureProfile) {
        recommendations.push({
          id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'new_profile',
          title: 'Create evening leisure profile',
          description: 'It\'s evening leisure time. Consider creating a profile optimized for leisure activities.',
          confidence: 0.7,
          context: ProfileContext.LEISURE,
          reasons: [
            'Current time suggests leisure activities',
            'No dedicated leisure profile found'
          ]
        });
      }
    }
  }

  /**
   * Apply profile recommendation
   */
  public applyProfileRecommendation(userId: string, recommendationId: string): boolean {
    const recommendation = this.recommendations.get(recommendationId);
    if (!recommendation) return false;

    switch (recommendation.type) {
      case 'profile_switch':
        if (recommendation.profileId) {
          return this.setActiveProfile(userId, recommendation.profileId);
        }
        break;

      case 'new_profile':
        // Create a new profile based on context
        const template = this.getProfileTemplate('commuter'); // Default template
        if (template) {
          const profileId = this.createProfileFromTemplate(
            userId,
            template.id,
            `${recommendation.context} Profile`,
            `Profile optimized for ${recommendation.context}`
          );
          
          if (profileId) {
            // Set as context profile
            this.setContextProfile(userId, recommendation.context, profileId);
            
            // Mark recommendation as applied
            recommendation.appliedAt = new Date();
            this.recommendations.set(recommendationId, recommendation);
            this.saveRecommendations();
            
            return true;
          }
        }
        break;

      case 'profile_update':
        // This would require more complex logic to update the profile
        // For now, just mark as applied
        recommendation.appliedAt = new Date();
        this.recommendations.set(recommendationId, recommendation);
        this.saveRecommendations();
        return true;
    }

    return false;
  }

  /**
   * Dismiss profile recommendation
   */
  public dismissProfileRecommendation(recommendationId: string): boolean {
    const recommendation = this.recommendations.get(recommendationId);
    if (!recommendation) return false;

    recommendation.dismissed = true;
    this.recommendations.set(recommendationId, recommendation);
    this.saveRecommendations();

    return true;
  }

  /**
   * Get all recommendations for a user
   */
  public getProfileRecommendations(userId: string): ProfileRecommendation[] {
    return Array.from(this.recommendations.values()).filter(rec => !rec.dismissed);
  }

  /**
   * Share a profile with other users
   */
  public shareProfile(
    userId: string,
    profileId: string,
    sharingSettings: ProfileSharingSettings
  ): string | null {
    const userProfile = this.preferenceManager.getUserProfile(userId);
    if (!userProfile) return null;

    const profile = userProfile.profiles.find(p => p.id === profileId);
    if (!profile) return null;

    // Create a shared profile template
    const sharedProfile: UserProfileTemplate = {
      ...profile,
      id: `shared-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `${profile.name} (Shared by ${userProfile.name})`,
      description: `${profile.description} - Shared profile`,
      isDefault: false,
      isEditable: sharingSettings.allowEditing
    };

    // Add to templates
    // This would typically involve a backend service
    // For now, we'll just return the profile ID
    return sharedProfile.id;
  }

  /**
   * Get profile analytics
   */
  public getProfileAnalytics(userId: string): PreferenceAnalytics | null {
    return this.preferenceManager.getPreferenceAnalytics(userId);
  }
}