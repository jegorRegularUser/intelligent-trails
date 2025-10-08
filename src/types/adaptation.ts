/**
 * Types and interfaces for the dynamic adaptation system
 * Defines structures for route adaptation, decision-making, and user preferences
 */

import { Coordinate, TransportMode } from './graph';
import { MultiModalRoute, RouteSegment, UserPreferences, RouteConstraints } from './routing';
import {
  TrafficCondition,
  PublicTransportStatus,
  EventData,
  WeatherData,
  ImpactLevel,
  EventSeverity
} from './realtime';

/**
 * Real-time conditions that affect routing
 * This interface is defined here since it's not exported from the realtime module
 */
export interface RealTimeConditions {
  traffic: {
    segmentId: string;
    delay: number; // in seconds
    speed: number; // current speed
  }[];
  transit: {
    routeId: string;
    delay: number; // in seconds
    status: 'on_time' | 'delayed' | 'cancelled' | 'early';
  }[];
  weather: {
    condition: 'clear' | 'rain' | 'snow' | 'fog' | 'storm';
    temperature: number; // in celsius
    windSpeed: number; // in km/h
    visibility: number; // in meters
  };
  events: {
    id: string;
    type: 'construction' | 'accident' | 'event' | 'closure';
    location: {
      coordinate: Coordinate;
      radius: number; // in meters
    };
    impact: 'low' | 'medium' | 'high';
    startTime: Date;
    endTime: Date;
  }[];
}

/**
 * Adaptation types
 */
export enum AdaptationType {
  REROUTE = 'reroute',
  MODE_CHANGE = 'mode_change',
  TIMING_ADJUSTMENT = 'timing_adjustment',
  SEGMENT_SKIP = 'segment_skip',
  DIVERSIFICATION = 'diversification',
  DEVIATION = 'deviation',
  CANCELLATION = 'cancellation'
}

/**
 * Adaptation urgency levels
 */
export enum AdaptationUrgency {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Adaptation trigger types
 */
export enum AdaptationTrigger {
  TRAFFIC_DELAY = 'traffic_delay',
  TRANSIT_DISRUPTION = 'transit_disruption',
  WEATHER_CONDITION = 'weather_condition',
  ROUTE_BLOCKAGE = 'route_blockage',
  USER_DEVIATION = 'user_deviation',
  PREDICTIVE_ISSUE = 'predictive_issue',
  USER_REQUEST = 'user_request',
  SCHEDULE_CHANGE = 'schedule_change'
}

/**
 * Adaptation strategy types
 */
export enum AdaptationStrategy {
  MINIMAL_CHANGE = 'minimal_change',
  FASTEST_ROUTE = 'fastest_route',
  PREFERRED_MODE = 'preferred_mode',
  COST_OPTIMAL = 'cost_optimal',
  RELIABILITY_FOCUSED = 'reliability_focused',
  COMFORT_FOCUSED = 'comfort_focused',
  HYBRID = 'hybrid'
}

/**
 * Adaptation status
 */
export enum AdaptationStatus {
  PROPOSED = 'proposed',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  EXPIRED = 'expired',
  EXECUTED = 'executed',
  FAILED = 'failed'
}

/**
 * Route deviation information
 */
export interface RouteDeviation {
  id: string;
  routeId: string;
  segmentId: string;
  type: 'time' | 'route' | 'mode';
  severity: EventSeverity;
  distance?: number; // in meters
  time?: number; // in seconds
  currentPosition: Coordinate;
  lastKnownPosition: Coordinate;
  description: string;
  timestamp: Date;
  acknowledged: boolean;
}

/**
 * Adaptation impact analysis
 */
export interface AdaptationImpact {
  type: AdaptationType;
  significance: ImpactLevel;
  affectedSegments: string[]; // segment IDs
  timeImpact: number; // in seconds
  costImpact: number; // monetary
  comfortImpact: number; // 0-1
  reliabilityImpact: number; // 0-1
  environmentalImpact: number; // 0-1
  recommendations: AdaptationRecommendation[];
}

/**
 * Adaptation recommendation
 */
export interface AdaptationRecommendation {
  type: AdaptationType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  estimatedBenefits: {
    timeSavings?: number; // in seconds
    costSavings?: number; // monetary
    comfortImprovement?: number; // 0-1
    reliabilityImprovement?: number; // 0-1
  };
  confidence: number; // 0-1
  reasons: string[];
}

/**
 * Adaptation option
 */
export interface AdaptationOption {
  id: string;
  type: AdaptationType;
  strategy: AdaptationStrategy;
  description: string;
  newRoute?: MultiModalRoute;
  modifiedSegments?: RouteSegment[];
  timeImpact: number; // in seconds (positive = increase, negative = decrease)
  costImpact: number; // monetary (positive = increase, negative = decrease)
  comfortImpact: number; // 0-1 (positive = improvement, negative = degradation)
  reliabilityImpact: number; // 0-1 (positive = improvement, negative = degradation)
  environmentalImpact: number; // 0-1 (positive = improvement, negative = degradation)
  confidence: number; // 0-1
  executionComplexity: number; // 0-1
  userInconvenience: number; // 0-1
  reasons: string[];
  constraints: AdaptationConstraints;
}

/**
 * Adaptation constraints
 */
export interface AdaptationConstraints {
  maxDetourDistance?: number; // in meters
  maxAdditionalTime?: number; // in seconds
  maxAdditionalCost?: number; // monetary
  minReliability?: number; // 0-1
  allowedModes?: TransportMode[];
  forbiddenModes?: TransportMode[];
  forbiddenSegments?: string[]; // segment IDs
  requiredFeatures?: string[];
  avoidAreas?: {
    coordinate: Coordinate;
    radius: number; // in meters
  }[];
}

/**
 * Evaluated adaptation option
 */
export interface EvaluatedAdaptationOption {
  option: AdaptationOption;
  score: number; // 0-1
  benefits: {
    time: number; // 0-1
    cost: number; // 0-1
    comfort: number; // 0-1
    reliability: number; // 0-1
    environmental: number; // 0-1
  };
  costs: {
    inconvenience: number; // 0-1
    complexity: number; // 0-1
    uncertainty: number; // 0-1
    learning: number; // 0-1
  };
  risk: {
    overall: number; // 0-1
    execution: number; // 0-1
    acceptance: number; // 0-1
  };
  confidence: number; // 0-1
  reasoning: string;
}

/**
 * Adaptation decision
 */
export interface AdaptationDecision {
  shouldAdapt: boolean;
  selectedOption?: EvaluatedAdaptationOption;
  alternatives?: EvaluatedAdaptationOption[];
  trigger: AdaptationTrigger;
  urgency: AdaptationUrgency;
  context: AdaptationContext;
  confidence: number; // 0-1
  reasoning: string;
  timestamp: Date;
}

/**
 * Adaptation context
 */
export interface AdaptationContext {
  routeId: string;
  currentPosition: Coordinate;
  currentProgress: number; // 0-1
  currentTime: Date;
  estimatedArrival: Date;
  originalArrival: Date;
  currentConditions: RealTimeConditions;
  userContext: UserAdaptationContext;
  systemContext: SystemAdaptationContext;
}

/**
 * User adaptation context
 */
export interface UserAdaptationContext {
  userId: string;
  preferences: UserAdaptationPreferences;
  profile: AdaptationProfile;
  isActive: boolean;
  isDriving: boolean;
  deviceInfo: {
    type: 'mobile' | 'desktop' | 'tablet';
    os: string;
    appVersion: string;
  };
  locationAccuracy: number; // in meters
}

/**
 * System adaptation context
 */
export interface SystemAdaptationContext {
  systemLoad: number; // 0-1
  dataQuality: number; // 0-1
  predictionAccuracy: number; // 0-1
  adaptationHistory: AdaptationHistorySummary;
  networkConditions: {
    connectivity: 'excellent' | 'good' | 'fair' | 'poor';
    bandwidth: number; // in Mbps
    latency: number; // in ms
  };
}

/**
 * User adaptation preferences
 */
export interface UserAdaptationPreferences {
  adaptationEnabled: boolean;
  autoAcceptThreshold: number; // 0-1, automatically accept adaptations above this score
  preferredStrategies: AdaptationStrategy[];
  avoidedStrategies: AdaptationStrategy[];
  sensitivity: {
    time: number; // 0-1, how sensitive to time changes
    cost: number; // 0-1, how sensitive to cost changes
    comfort: number; // 0-1, how sensitive to comfort changes
    reliability: number; // 0-1, how sensitive to reliability changes
  };
  notificationPreferences: {
    enabled: boolean;
    channels: ('app' | 'push' | 'email' | 'sms' | 'voice')[];
    urgencyThreshold: AdaptationUrgency;
    quietHours: {
      enabled: boolean;
      start: string; // HH:MM
      end: string; // HH:MM
    };
  };
  constraints: AdaptationConstraints;
}

/**
 * Adaptation profile
 */
export interface AdaptationProfile {
  id: string;
  name: string;
  description: string;
  preferences: UserAdaptationPreferences;
  contexts: string[]; // context types where this profile applies
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Adaptation history summary
 */
export interface AdaptationHistorySummary {
  totalAdaptations: number;
  acceptedAdaptations: number;
  declinedAdaptations: number;
  averageTimeSavings: number; // in seconds
  averageCostSavings: number; // monetary
  averageUserSatisfaction: number; // 0-1
  recentAdaptations: {
    type: AdaptationType;
    timestamp: Date;
    success: boolean;
  }[];
}

/**
 * Route adaptation
 */
export interface RouteAdaptation {
  id: string;
  routeId: string;
  type: AdaptationType;
  strategy: AdaptationStrategy;
  trigger: AdaptationTrigger;
  status: AdaptationStatus;
  originalRoute: MultiModalRoute;
  adaptedRoute?: MultiModalRoute;
  impact: AdaptationImpact;
  decision: AdaptationDecision;
  userResponse?: {
    accepted: boolean;
    responseTime: number; // in ms
    feedback?: string;
    rating?: number; // 1-5
  };
  execution?: {
    startTime: Date;
    endTime?: Date;
    success: boolean;
    error?: string;
  };
  timestamp: Date;
  expiry?: Date;
  confidence: number; // 0-1
  metadata: {
    algorithm: string;
    calculationTime: number; // in ms
    dataSources: string[];
    version: string;
  };
}

/**
 * Adaptation engine configuration
 */
export interface AdaptationEngineConfig {
  enabled: boolean;
  monitoring: {
    updateInterval: number; // in seconds
    deviationThreshold: {
      distance: number; // in meters
      time: number; // in seconds
    };
    predictionLookahead: number; // in seconds
  };
  decision: {
    adaptationThreshold: number; // 0-1
    confidenceThreshold: number; // 0-1
    maxAlternatives: number;
    strategyWeights: {
      time: number;
      cost: number;
      comfort: number;
      reliability: number;
      environmental: number;
    };
  };
  execution: {
    autoAcceptEnabled: boolean;
    autoAcceptThreshold: number; // 0-1
    maxExecutionTime: number; // in seconds
    rollbackEnabled: boolean;
  };
  constraints: {
    maxAdaptationsPerHour: number;
    maxAdaptationsPerRoute: number;
    minTimeBetweenAdaptations: number; // in seconds
    maxDetourFactor: number; // multiplier of original route distance
  };
  learning: {
    enabled: boolean;
    feedbackWeight: number; // 0-1
    adaptationHistorySize: number;
    modelUpdateInterval: number; // in seconds
  };
}

/**
 * Adaptation engine statistics
 */
export interface AdaptationEngineStatistics {
  totalRoutes: number;
  activeRoutes: number;
  totalAdaptations: number;
  acceptedAdaptations: number;
  declinedAdaptations: number;
  failedAdaptations: number;
  averageAdaptationTime: number; // in ms
  averageTimeSavings: number; // in seconds
  averageCostSavings: number; // monetary
  averageUserSatisfaction: number; // 0-1
  adaptationByType: {
    [key in AdaptationType]: number;
  };
  adaptationByTrigger: {
    [key in AdaptationTrigger]: number;
  };
  systemLoad: {
    cpu: number; // 0-1
    memory: number; // 0-1
    queueSize: number;
  };
  dataQuality: {
    overall: number; // 0-1
    bySource: {
      [key: string]: number;
    };
  };
  lastUpdate: Date;
}

/**
 * Alternative route generation parameters
 */
export interface AlternativeRouteGenerationParams {
  originalRoute: MultiModalRoute;
  currentPosition: Coordinate;
  destination: Coordinate;
  constraints: RouteConstraints & AdaptationConstraints;
  preferences: UserPreferences;
  maxAlternatives: number;
  diversityFactor: number; // 0-1, how different alternatives should be
  excludedSegments?: string[]; // segment IDs to exclude
  requiredFeatures?: string[];
}

/**
 * Alternative route comparison result
 */
export interface AlternativeRouteComparison {
  routes: MultiModalRoute[];
  scores: Map<string, number>; // route ID to score (0-1)
  rankings: {
    fastest: string; // route ID
    shortest: string; // route ID
    cheapest: string; // route ID
    mostReliable: string; // route ID
    mostComfortable: string; // route ID
    mostEcoFriendly: string; // route ID
    bestOverall: string; // route ID
  };
  diversityMetrics: {
    averageSimilarity: number; // 0-1
    minSimilarity: number; // 0-1
    maxSimilarity: number; // 0-1
  };
  comparisonFactors: {
    time: number; // 0-1, importance weight
    cost: number; // 0-1, importance weight
    comfort: number; // 0-1, importance weight
    reliability: number; // 0-1, importance weight
    environmental: number; // 0-1, importance weight
  };
}

/**
 * Predictive adaptation parameters
 */
export interface PredictiveAdaptationParams {
  route: MultiModalRoute;
  currentPosition: Coordinate;
  forecastHorizon: number; // in seconds
  confidenceThreshold: number; // 0-1
  factors: {
    traffic: boolean;
    weather: boolean;
    transit: boolean;
    events: boolean;
  };
}

/**
 * Predictive adaptation result
 */
export interface PredictiveAdaptationResult {
  predictions: {
    time: number; // in seconds
    probability: number; // 0-1
    confidence: number; // 0-1
    factors: {
      traffic: number; // 0-1
      weather: number; // 0-1
      transit: number; // 0-1
      events: number; // 0-1
    };
  }[];
  recommendedActions: {
    type: AdaptationType;
    urgency: AdaptationUrgency;
    description: string;
    timeWindow: {
      start: Date;
      end: Date;
    };
    benefits: {
      timeSavings?: number; // in seconds
      costSavings?: number; // monetary
    };
  }[];
  overallConfidence: number; // 0-1
}

/**
 * Adaptation notification
 */
export interface AdaptationNotification {
  id: string;
  adaptationId: string;
  type: 'proposal' | 'confirmation' | 'update' | 'error';
  urgency: AdaptationUrgency;
  title: string;
  message: string;
  details: {
    originalRoute: {
      duration: number; // in seconds
      distance: number; // in meters
      cost: number; // monetary
    };
    adaptedRoute?: {
      duration: number; // in seconds
      distance: number; // in meters
      cost: number; // monetary
    };
    impact: {
      time: number; // in seconds
      cost: number; // monetary
      comfort: number; // 0-1
      reliability: number; // 0-1
    };
    reasons: string[];
    alternatives?: {
      id: string;
      description: string;
      timeImpact: number; // in seconds
      costImpact: number; // monetary
    }[];
  };
  actions: {
    id: string;
    label: string;
    type: 'primary' | 'secondary' | 'tertiary';
    action: string;
    data?: any;
  }[];
  channels: ('app' | 'push' | 'email' | 'sms' | 'voice')[];
  timestamp: Date;
  expiry: Date;
  status: 'pending' | 'delivered' | 'read' | 'acted' | 'expired';
}