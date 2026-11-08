// src/lib/walk/index.ts
// Публичный API движка прогулок (docs/walk-engine.md).
// Никакого UI и сети: createWalkPlan(input, ports) → план или честный отказ.

export { createWalkPlan } from './createWalkPlan';
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
} from './types';
export type { WalkRoutingPort, WalkRouteSegment, WalkMatrixCell } from './ports';

export {
  DEFAULT_WALKING_SPEED_KMH,
  MAX_CANDIDATES,
  MAX_STOPS,
  MAX_LEG_MINUTES,
  BUDGET_TOLERANCE,
} from './types';
