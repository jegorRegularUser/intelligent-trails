/**
 * Transport mode handlers and integration
 * Exports all transport mode handlers and integration classes
 */

// Base classes and interfaces
export type { TransportModeHandler, RoutingContext, TransportModeParameters } from './TransportModeHandler';

// Factory and registry
export { TransportModeFactory, TransportModeRegistry, TransportModeCompatibility } from './TransportModeFactory';

// Transport mode handlers
export { CarRoutingHandler } from './CarRoutingHandler';
export type { CarRoutingParameters } from './CarRoutingHandler';
export { PublicTransportRoutingHandler } from './PublicTransportRoutingHandler';
export type { PublicTransportRoutingParameters, TransitSchedule, RealTimeTransitInfo } from './PublicTransportRoutingHandler';
export { BicycleRoutingHandler } from './BicycleRoutingHandler';
export type { BicycleRoutingParameters, BicycleInfrastructure } from './BicycleRoutingHandler';
export { WalkingRoutingHandler } from './WalkingRoutingHandler';
export type { WalkingRoutingParameters, PedestrianInfrastructure } from './WalkingRoutingHandler';

// Multi-modal integration
export { MultiModalRoutingIntegration } from './MultiModalRoutingIntegration';
export type { 
  MultiModalRoutingRequest, 
  MultiModalRoutingOptions, 
  MultiModalRoutingResult 
} from './MultiModalRoutingIntegration';

// Real-time data integration
export { RealTimeDataIntegration } from './RealTimeDataIntegration';
export type { 
  RealTimeDataSource, 
  RealTimeDataProvider, 
  RealTimeDataConfig 
} from './RealTimeDataIntegration';

// Testing and validation
export { TransportModeTesting } from './TransportModeTesting';
export type { 
  TransportModeTestCase, 
  TransportModeTestResult, 
  RouteValidationResult, 
  BenchmarkResult 
} from './TransportModeTesting';