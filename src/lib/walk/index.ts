// src/lib/walk/index.ts
// Публичный API движка прогулок (docs/walk-engine.md).
// Никакого UI и сети: createWalkPlan(input, ports) → план или честный отказ.

export { createWalkPlan, isUnderfloor, minimalLoopZoneMeters } from './createWalkPlan';
export { replaceStopInPlan } from './replaceStop';
export { buildWalkWithFallback } from './fallback';
export { buildLoopThroughCandidates } from './loopThrough';
export { buildStreetLoop, loopRadiusMeters } from './streetLoop';
export { evaluateGates } from './gates';
export { selectCandidates } from './selection';
export { solveWalkOrder, nearestNeighborOrder } from './ordering';

export type {
  WalkInput,
  WalkLatLng,
  WalkPlace,
  WalkStop,
  WalkLeg,
  WalkGateName,
  GateReport,
  WalkPlan,
  WalkFailure,
  WalkFailureCode,
  WalkPlanResult,
  WalkDegradedLevel,
} from './types';
export type { ReplaceStopInput, ReplaceStopResult, ReplaceablePlan } from './replaceStop';
export type { LoopThroughInput, LoopThroughResult } from './loopThrough';
export type { StreetLoopInput, StreetLoopResult } from './streetLoop';
export type { WalkWithFallbackResult } from './fallback';
export type { WalkRoutingPort, WalkRouteSegment, WalkMatrixCell } from './ports';

export {
  DEFAULT_WALKING_SPEED_KMH,
  MAX_CANDIDATES,
  MAX_STOPS,
  MAX_LEG_MINUTES,
  BUDGET_TOLERANCE,
  FLOOR_SHARE,
} from './types';
