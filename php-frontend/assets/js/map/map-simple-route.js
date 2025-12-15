/**
 * Простой маршрут - ТОЧНО как smart-walk через visualizeRoute
 */
window.MapSimpleRoute = {
  mapCore: null,

  init(mapCore) {
    this.mapCore = mapCore;
    window.displaySimpleRoute = (routeData) => this.displaySimpleRoute(routeData);
    console.log('[MapSimpleRoute] Initialized');
  },

  async displaySimpleRoute(routeData) {
    console.log('[MapSimpleRoute] Building simple route:', routeData);
    
    try {
      // Геокодируем точки
      const points = [];
      const pointNames = [];
      
      const startCoords = await this.geocode(routeData.start_point);
      points.push(startCoords);
      pointNames.push(routeData.start_point);
      
      if (routeData.waypoints && routeData.waypoints.length > 0) {
        for (const waypoint of routeData.waypoints) {
          const coords = await this.geocode(waypoint);
          points.push(coords);
          pointNames.push(waypoint);
        }
      }
      
      const endCoords = await this.geocode(routeData.end_point);
      points.push(endCoords);
      pointNames.push(routeData.end_point);
      
      console.log('[MapSimpleRoute] Geocoded points:', points);
      
      // Создаём waypoints ТОЧНО как в map-route-builder.js
      const waypoints = [];
      const mode = routeData.mode || 'auto';
      
      // Старт
      waypoints.push({
        name: pointNames[0],
        coordinates: points[0],
        address: pointNames[0],
        type: 'start',
        transport_mode: mode
      });
      
      // Промежуточные
      for (let i = 1; i < points.length - 1; i++) {
        waypoints.push({
          name: pointNames[i],
          coordinates: points[i],
          address: pointNames[i],
          type: 'waypoint',
          transport_mode: mode
        });
      }
      
      // Финиш
      waypoints.push({
        name: pointNames[pointNames.length - 1],
        coordinates: points[points.length - 1],
        address: pointNames[pointNames.length - 1],
        type: 'end',
        transport_mode: mode
      });
      
      console.log('[MapSimpleRoute] Waypoints:', waypoints);
      
      // Создаём routeData ТОЧНО как в map-route-builder
      const formattedRouteData = {
        places: waypoints,
        start_point: points[0],
        return_to_start: false,
        mode: mode,
        activities: []
      };
      
      console.log('[MapSimpleRoute] Calling visualizeRoute with:', formattedRouteData);
      
      // Вызываем visualizeRoute ТОЧНО как в map-route-builder!
      if (window.MapSmartWalkInstance) {
        await window.MapSmartWalkInstance.visualizeRoute(formattedRouteData, false);
      } else if (window.MapCore && window.MapCore.mapSmartWalk) {
        await window.MapCore.mapSmartWalk.visualizeRoute(formattedRouteData, false);
      } else {
        throw new Error('MapSmartWalk instance not found');
      }
      
      // Показываем панель
      setTimeout(() => {
        if (window.MapRouteBuilder) {
          window.MapRouteBuilder.showRouteInfoPanel(waypoints);
        }
      }, 1000);
      
      console.log('[MapSimpleRoute] Done!');
      
    } catch (error) {
      console.error('[MapSimpleRoute] Error:', error);
      alert('Ошибка: ' + error.message);
    }
  },

  async geocode(address) {
    const result = await ymaps.geocode(address, { results: 1 });
    const geoObject = result.geoObjects.get(0);
    if (!geoObject) throw new Error(`Не найден: ${address}`);
    return geoObject.geometry.getCoordinates();
  }
};

console.log('[MapSimpleRoute] Module loaded');