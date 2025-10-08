/**
 * Types for Points of Interest (POI) routing system
 */

import { Coordinate, TransportMode, AccessibilityInfo } from './graph';

/**
 * POI categories for classification
 */
export enum POICategory {
  TOURIST_ATTRACTION = 'tourist_attraction',
  MUSEUM = 'museum',
  PARK = 'park',
  MONUMENT = 'monument',
  LANDMARK = 'landmark',
  RESTAURANT = 'restaurant',
  CAFE = 'cafe',
  SHOP = 'shop',
  MARKET = 'market',
  MALL = 'mall',
  HOTEL = 'hotel',
  HOSPITAL = 'hospital',
  PHARMACY = 'pharmacy',
  BANK = 'bank',
  ATM = 'atm',
  GAS_STATION = 'gas_station',
  PARKING = 'parking',
  PUBLIC_TRANSPORT = 'public_transport',
  BIKE_RENTAL = 'bike_rental',
  SCHOOL = 'school',
  UNIVERSITY = 'university',
  LIBRARY = 'library',
  POST_OFFICE = 'post_office',
  PLACE_OF_WORSHIP = 'place_of_worship',
  ENTERTAINMENT = 'entertainment',
  SPORTS_FACILITY = 'sports_facility',
  PLAYGROUND = 'playground',
  BEACH = 'beach',
  NATURE = 'nature',
  VIEWPOINT = 'viewpoint',
  CAMPGROUND = 'campground',
  CUSTOM = 'custom'
}

/**
 * POI visit status
 */
export enum POIVisitStatus {
  REQUIRED = 'required',
  OPTIONAL = 'optional',
  VISITED = 'visited',
  SKIPPED = 'skipped'
}

/**
 * POI rating information
 */
export interface POIRating {
  average: number; // 1-5
  count: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  userRating?: number; // Current user's rating
}

/**
 * POI operating hours
 */
export interface POIOperatingHours {
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  holidays?: string[];
  specialHours?: {
    date: string; // ISO date string
    hours: string;
  }[];
}

/**
 * POI contact information
 */
export interface POIContact {
  phone?: string;
  website?: string;
  email?: string;
  socialMedia?: {
    platform: string;
    url: string;
  }[];
}

/**
 * POI accessibility details
 */
export interface POIAccessibility extends AccessibilityInfo {
  hasParking?: boolean;
  hasAccessibleRestrooms?: boolean;
  hasBrailleSignage?: boolean;
  hasHearingAssistance?: boolean;
  hasWheelchairRental?: boolean;
  entranceType?: 'level' | 'ramp' | 'stairs' | 'elevator';
  pathwayType?: 'paved' | 'gravel' | 'dirt' | 'boardwalk';
  maxSlope?: number; // in percentage
  minDoorWidth?: number; // in cm
  hasTactileGuide?: boolean;
  hasQuietSpace?: boolean;
}

/**
 * POI pricing information
 */
export interface POIPricing {
  isFree: boolean;
  currency?: string;
  admission?: {
    adult: number;
    child?: number;
    senior?: number;
    student?: number;
  };
  parking?: {
    hourly?: number;
    daily?: number;
    monthly?: number;
  };
  discounts?: {
    type: string; // e.g., 'group', 'student', 'resident'
    amount: number; // percentage or fixed amount
    description: string;
  }[];
}

/**
 * POI metadata
 */
export interface POIMetadata {
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string; // user ID
  verified: boolean;
  verifiedBy?: string; // user ID
  verifiedAt?: Date;
  popularity: number; // 0-1
  tags: string[];
  description?: string;
  images?: {
    id: string;
    url: string;
    caption?: string;
    width: number;
    height: number;
    isPrimary?: boolean;
  }[];
  reviews?: {
    id: string;
    userId: string;
    rating: number;
    comment: string;
    createdAt: Date;
    helpfulCount: number;
  }[];
}

/**
 * POI-specific transport constraints
 */
export interface POITransportConstraints {
  preferredModes?: TransportMode[];
  avoidedModes?: TransportMode[];
  maxWalkingDistance?: number; // in meters
  parkingRequired?: boolean;
  bikeParkingAvailable?: boolean;
  publicTransportAccess?: boolean;
  dropOffPoint?: Coordinate;
  pickupPoint?: Coordinate;
  vehicleRestrictions?: {
    maxHeight?: number; // in cm
    maxWidth?: number; // in cm
    maxLength?: number; // in cm
    maxWeight?: number; // in kg
  };
}

/**
 * Time window for POI visit
 */
export interface POITimeWindow {
  earliestArrival?: Date;
  latestArrival?: Date;
  earliestDeparture?: Date;
  latestDeparture?: Date;
  minDuration?: number; // in seconds
  maxDuration?: number; // in seconds
  preferredDuration?: number; // in seconds
}

/**
 * Visit priority for POI routing
 */
export interface POIVisitPriority {
  priority: number; // 1-10, higher is more important
  flexibility: number; // 0-1, how flexible the timing is
  mustVisit: boolean;
  reason?: string;
}

/**
 * User-defined POI collection
 */
export interface POICollection {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  poiIds: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // user ID
  sharedWith?: string[]; // user IDs
  tags?: string[];
}

/**
 * Main Point of Interest interface
 */
export interface PointOfInterest {
  id: string;
  name: string;
  category: POICategory;
  coordinate: Coordinate;
  address?: string;
  rating?: POIRating;
  operatingHours?: POIOperatingHours;
  contact?: POIContact;
  accessibility: POIAccessibility;
  pricing?: POIPricing;
  metadata: POIMetadata;
  transportConstraints?: POITransportConstraints;
  timeWindow?: POITimeWindow;
  visitPriority?: POIVisitPriority;
  visitStatus?: POIVisitStatus;
  collections?: string[]; // collection IDs
  properties?: {
    [key: string]: any;
  };
}

/**
 * POI search filters
 */
export interface POISearchFilters {
  categories?: POICategory[];
  minRating?: number;
  maxRating?: number;
  isOpenNow?: boolean;
  isFree?: boolean;
  isAccessible?: boolean;
  hasParking?: boolean;
  maxDistance?: number; // in meters
  keywords?: string[];
  tags?: string[];
  transportModes?: TransportMode[];
  collections?: string[];
  excludeCategories?: POICategory[];
  excludeTags?: string[];
}

/**
 * POI search request
 */
export interface POISearchRequest {
  center: Coordinate;
  radius: number; // in meters
  filters?: POISearchFilters;
  limit?: number;
  offset?: number;
  sortBy?: 'distance' | 'rating' | 'popularity' | 'relevance';
  sortOrder?: 'asc' | 'desc';
}

/**
 * POI search result
 */
export interface POISearchResult {
  pois: PointOfInterest[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  searchTime: number; // in milliseconds
}

/**
 * POI cluster for dense areas
 */
export interface POICluster {
  id: string;
  center: Coordinate;
  pois: PointOfInterest[];
  count: number;
  radius: number; // in meters
  categories: POICategory[];
  averageRating?: number;
}

/**
 * POI recommendation request
 */
export interface POIRecommendationRequest {
  userId: string;
  center: Coordinate;
  radius?: number; // in meters
  preferences?: {
    categories?: POICategory[];
    minRating?: number;
    maxDistance?: number;
    transportModes?: TransportMode[];
    accessibility?: POIAccessibility;
  };
  limit?: number;
  excludeVisited?: boolean;
  context?: string; // e.g., 'tourism', 'dining', 'shopping'
}

/**
 * POI recommendation result
 */
export interface POIRecommendationResult {
  pois: PointOfInterest[];
  scores: Map<string, number>; // POI ID -> relevance score
  reasons: Map<string, string[]>; // POI ID -> recommendation reasons
  recommendationTime: number; // in milliseconds
}

/**
 * POI routing request
 */
export interface POIRoutingRequest {
  origin: Coordinate;
  destination: Coordinate;
  pois: PointOfInterest[];
  preferences: {
    optimizeFor: 'time' | 'distance' | 'scenic' | 'balanced';
    maxDetourDistance?: number; // in meters
    maxDetourTime?: number; // in seconds
    requiredPOIs?: string[]; // POI IDs
    avoidPOIs?: string[]; // POI IDs
    transportModes?: TransportMode[];
    accessibility?: POIAccessibility;
  };
  constraints?: {
    maxTotalDistance?: number; // in meters
    maxTotalTime?: number; // in seconds
    maxPOIs?: number;
    minPOIs?: number;
    departureTime?: Date;
    arrivalTime?: Date;
  };
}

/**
 * POI routing result
 */
export interface POIRoutingResult {
  route: {
    id: string;
    geometry: Coordinate[];
    distance: number; // in meters
    duration: number; // in seconds
    pois: {
      poi: PointOfInterest;
      order: number;
      arrivalTime?: Date;
      departureTime?: Date;
      visitDuration?: number; // in seconds
      distanceFromPrevious?: number; // in meters
      timeFromPrevious?: number; // in seconds
    }[];
    segments: {
      from: Coordinate;
      to: Coordinate;
      mode: TransportMode;
      distance: number; // in meters
      duration: number; // in seconds
      instructions?: string[];
    }[];
  };
  alternatives?: POIRoutingResult['route'][];
  statistics: {
    totalDistance: number; // in meters
    totalDuration: number; // in seconds
    totalPOIs: number;
    requiredPOIsVisited: number;
    optionalPOIsVisited: number;
    averageRating?: number;
    accessibilityScore: number; // 0-1
  };
  calculationTime: number; // in milliseconds
}

/**
 * POI route customization options
 */
export interface POIRouteCustomization {
  poiId: string;
  action: 'add' | 'remove' | 'reorder' | 'modify_time' | 'skip';
  parameters?: {
    newOrder?: number;
    newDuration?: number; // in seconds
    newTimeWindow?: POITimeWindow;
    newPriority?: POIVisitPriority;
  };
}

/**
 * POI route visualization data
 */
export interface POIRouteVisualization {
  routeId: string;
  geometry: Coordinate[];
  poiMarkers: {
    poi: PointOfInterest;
    position: Coordinate;
    order: number;
    isVisited: boolean;
    isRequired: boolean;
    label: string;
    icon: string;
    color: string;
  }[];
  segments: {
    from: Coordinate;
    to: Coordinate;
    mode: TransportMode;
    color: string;
    width: number;
    style: 'solid' | 'dashed' | 'dotted';
    label?: string;
  }[];
  bounds: {
    northEast: Coordinate;
    southWest: Coordinate;
  };
  center: Coordinate;
  zoom: number;
}