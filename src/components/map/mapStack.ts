// src/components/map/mapStack.ts
// Критерий переключения карт-стеков (docs/ux-human-wave.md «Решения», блокер B2):
// главный сценарий (quick / пикер точек) рендерится на maplibre, эксперт-режим
// временно остаётся на Яндексе — его метрики и транспортные альтернативы живут
// в рантайме multiRouter.MultiRoute. Ревизия 2026-11-18: режим 'sightseeing'
// («Новый город») удалён из продукта — walkMode сторa стал 'quick' | 'route'.
//
// Инвариант: эксперт-линия и quick-линия не рисуются одновременно; на ?r=
// карта — всегда Яндекс. Гидрация ?r= заполняет mapPoints ещё до переключения
// walkMode, поэтому второй аргумент — именно факт заполненного эксперт-маршрута.
export type MapWalkMode = 'quick' | 'route';

export function shouldRenderMaplibre(walkMode: MapWalkMode, mapPointsCount: number): boolean {
  return walkMode !== 'route' && mapPointsCount === 0;
}
