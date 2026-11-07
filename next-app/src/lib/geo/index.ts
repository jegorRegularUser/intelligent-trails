// src/lib/geo/index.ts
// Публичная поверхность geo-слоя. Движок прогулки и server actions импортируют
// отсюда; внутренности адаптеров наружу не протекают.

export * from './types';
export { CloudProvider } from './cloud/cloud-provider';
export type { CloudProviderConfig } from './cloud/config';
