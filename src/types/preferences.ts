/**
 * User preference system types for the multi-modal routing application
 */

import { TransportMode } from './graph';

/**
 * Preference categories for route optimization
 */
export enum PreferenceCategory {
  SPEED = 'speed',
  SAFETY = 'safety',
  ACCESSIBILITY = 'accessibility',
  COST = 'cost',
  ENVIRONMENT = 'environment',
  COMFORT = 'comfort',
  SCENIC = 'scenic'
}

/**
 * Priority levels for preferences
 */
export enum PriorityLevel {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  VERY_HIGH = 4,
  CRITICAL = 5
}

/**
 * Weight configuration for preferences (normalized 0-1)
 */
export interface PreferenceWeights {
  speed: number;
  safety: number;
  accessibility: number;
  cost: number;
  environment: number;
  comfort: number;
  scenic: number;
}

/**
 * Mobility device specifications for accessibility
 */
export interface MobilityDevice {
  type: 'wheelchair' | 'scooter' | 'walker' | 'stroller' | 'none';
  width?: number; // in cm
  length?: number; // in cm
  weight?: number; // in kg
  canFold?: boolean;
  requiresElevator?: boolean;
  requiresRamp?: boolean;
  maxSlope?: number; // in percentage
  minDoorWidth?: number; // in cm
}

/**
 * User-specific constraints
 */
export interface UserConstraints {
  mobilityDevice: MobilityDevice;
  maxWalkingDistance?: number; // in meters
  maxCyclingDistance?: number; // in meters
  maxStairs?: number; // maximum number of stairs
  requiresFlatSurface?: boolean;
  requiresHandrails?: boolean;
  requiresRestAreas?: boolean;
  requiresAccessibleToilets?: boolean;
  visualImpairment?: boolean;
  hearingImpairment?: boolean;
  cognitiveImpairment?: boolean;
  timeConstraints?: {
    departureTime?: Date;
    arrivalTime?: Date;
    maxTotalTime?: number; // in seconds
  };
}

/**
 * Transport mode preferences
 */
export interface TransportModePreferences {
  preferredModes: TransportMode[];
  avoidedModes: TransportMode[];
  maxTransfers?: number;
  minTransferTime?: number; // in seconds
  preferDirectRoutes?: boolean;
  avoidVehicleChanges?: boolean;
}

/**
 * Detailed user preferences with weights and constraints
 */
export interface DetailedUserPreferences {
  weights: PreferenceWeights;
  constraints: UserConstraints;
  transportModes: TransportModePreferences;
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidFerries: boolean;
  avoidUnpavedRoads: boolean;
  avoidStairs: boolean;
  minimizeTransfers: boolean;
  preferScenicRoutes: boolean;
  preferLessCrowded: boolean;
  requireBikeLane: boolean;
  requireSidewalk: boolean;
  requireWheelchairAccessibility: boolean;
  lexicographicOrder: PreferenceCategory[]; // Order of priority for strict preferences
}

/**
 * User profile template
 */
export interface UserProfileTemplate {
  id: string;
  name: string;
  description: string;
  icon?: string;
  preferences: DetailedUserPreferences;
  isDefault: boolean;
  isEditable: boolean;
}

/**
 * User profile with personal information and preferences
 */
export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  createdAt: Date;
  lastModified: Date;
  profiles: UserProfileTemplate[]; // Multiple preference profiles for different contexts
  activeProfileId: string;
  learningEnabled: boolean; // Whether to learn from user behavior
  sharingEnabled: boolean; // Whether to share preferences with others
}

/**
 * Preference learning data from user behavior
 */
export interface PreferenceLearningData {
  routeSelections: {
    routeId: string;
    selectedAt: Date;
    preferences: DetailedUserPreferences;
    context: string; // e.g., 'commuting', 'leisure', 'emergency'
  }[];
  routeRejections: {
    routeId: string;
    rejectedAt: Date;
    reason: string; // e.g., 'too_long', 'too_expensive', 'not_accessible'
  }[];
  preferenceAdjustments: {
    category: PreferenceCategory;
    oldWeight: number;
    newWeight: number;
    adjustedAt: Date;
    reason: string;
  }[];
}

/**
 * Preference sharing data for collaborative travel
 */
export interface PreferenceSharingData {
  groupId: string;
  groupName: string;
  sharedPreferences: DetailedUserPreferences;
  sharedBy: string; // user ID
  sharedAt: Date;
  expiresAt?: Date;
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canUse: boolean;
  };
}

/**
 * Preference import/export format
 */
export interface PreferenceImportExport {
  version: string;
  exportedAt: Date;
  preferences: DetailedUserPreferences;
  profiles: UserProfileTemplate[];
  learningData?: PreferenceLearningData;
  metadata?: {
    description?: string;
    tags?: string[];
    isPublic?: boolean;
  };
}

/**
 * Preference validation result
 */
export interface PreferenceValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  normalizedPreferences?: DetailedUserPreferences;
}

/**
 * Route segment score based on preferences
 */
export interface PreferenceSegmentScore {
  segmentId: string;
  scores: {
    speed: number; // 0-1
    safety: number; // 0-1
    accessibility: number; // 0-1
    cost: number; // 0-1
    environment: number; // 0-1
    comfort: number; // 0-1
    scenic: number; // 0-1
  };
  weightedScore: number; // Overall weighted score
  meetsConstraints: boolean;
  constraintViolations: string[];
}

/**
 * Preference-based route ranking
 */
export interface PreferenceRouteRanking {
  routeId: string;
  overallScore: number; // 0-1
  categoryScores: {
    speed: number;
    safety: number;
    accessibility: number;
    cost: number;
    environment: number;
    comfort: number;
    scenic: number;
  };
  constraintViolations: string[];
  meetsAllConstraints: boolean;
  explanation: string; // Human-readable explanation of the ranking
}

/**
 * Preference recommendation based on usage patterns
 */
export interface PreferenceRecommendation {
  id: string;
  type: 'weight_adjustment' | 'constraint_change' | 'profile_switch';
  title: string;
  description: string;
  confidence: number; // 0-1
  impact: 'low' | 'medium' | 'high';
  data: {
    category?: PreferenceCategory;
    currentWeight?: number;
    recommendedWeight?: number;
    constraint?: string;
    currentValue?: any;
    recommendedValue?: any;
    profileId?: string;
  };
  reasons: string[];
  dismissed?: boolean;
  appliedAt?: Date;
}

/**
 * Preference analytics data
 */
export interface PreferenceAnalytics {
  mostUsedProfiles: {
    profileId: string;
    usageCount: number;
    lastUsed: Date;
  }[];
  preferenceTrends: {
    category: PreferenceCategory;
    averageWeight: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    changeOverTime: number;
  }[];
  routeSelectionPatterns: {
    context: string;
    averageWeights: PreferenceWeights;
    commonConstraints: string[];
  }[];
  learningEffectiveness: {
    adaptationRate: number; // How often recommendations are accepted
    satisfactionScore: number; // User satisfaction with learned preferences
  };
}