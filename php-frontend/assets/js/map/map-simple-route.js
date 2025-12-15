/**
 * Простой маршрут - просто передаём точки в Yandex и они сами всё рисуют
 */
window.MapSimpleRoute = {
  mapCore: null,

  init(mapCore) {
    this.mapCore = mapCore;
    window.displaySimpleRoute = (routeData) => this.displaySimpleRoute(routeData);
    console.log('[MapSimpleRoute] Initialized');
  },

  async displaySimpleRoute(routeData) {
    console.log('[MapSimpleRoute] Building route:', routeData);
    
    try {
      this.mapCore.clearMap();
      
      // Геокодируем точки
      const points = [];
      const pointNames = [];
      
      // Старт
      const startCoords = await this.geocode(routeData.start_point);
      points.push(startCoords);
      pointNames.push(routeData.start_point);
      
      // Промежуточные
      if (routeData.waypoints && routeData.waypoints.length > 0) {
        for (const waypoint of routeData.waypoints) {
          const coords = await this.geocode(waypoint);
          points.push(coords);
          pointNames.push(waypoint);
        }
      }
      
      // Финиш
      const endCoords = await this.geocode(routeData.end_point);
      points.push(endCoords);
      pointNames.push(routeData.end_point);
      
      console.log('[MapSimpleRoute] Points:', points);
      
      // Просто вызываем ymaps.route() и яндекс сам всё рисует!
      const routeObject = await ymaps.route(points, {
        mapStateAutoApply: true,
        routingMode: routeData.mode || 'auto'
      });
      
      console.log('[MapSimpleRoute] Route created:', routeObject);
      
      // Добавляем на карту
      this.mapCore.map.geoObjects.add(routeObject);
      this.mapCore.currentRouteLines.push(routeObject);
      
      console.log('[MapSimpleRoute] Route added to map');
      
      // Извлекаем инфу для панели
      const routeInfo = this.extractInfo(routeObject, pointNames, routeData.mode);
      this.displayInfo(routeInfo);
      
      // Сохраняем
      setTimeout(() => {
        this.saveRoute(routeData, points, pointNames, routeInfo);
      }, 500);
      
      console.log('[MapSimpleRoute] Done!');
      
    } catch (error) {
      console.error('[MapSimpleRoute] Error:', error);
      alert('Ошибка: ' + error.message);
    }
  },

  extractInfo(routeObject, pointNames, mode) {
    try {
      const routes = routeObject.getRoutes();
      if (!routes || routes.getLength() === 0) {
        return { distance: 0, duration: 0, segments: [] };
      }
      
      const route = routes.get(0);
      const props = route.properties.getAll();
      
      const totalDistance = props.distance?.value || 0;
      const totalDuration = props.duration?.value || 0;
      
      const segments = [{
        index: 0,
        distance: totalDistance,
        duration: totalDuration,
        mode: mode || 'auto',
        fromPlace: pointNames[0] || 'Старт',
        toPlace: pointNames[pointNames.length - 1] || 'Финиш'
      }];
      
      return { distance: totalDistance, duration: totalDuration, segments };
      
    } catch (error) {
      console.error('[MapSimpleRoute] Extract error:', error);
      return { distance: 0, duration: 0, segments: [] };
    }
  },

  displayInfo(routeInfo) {
    const panel = document.getElementById('routeInfoPanel');
    const statsDiv = document.getElementById('routeInfoStats');
    const stagesDiv = document.getElementById('routeStagesList');
    
    if (!panel || !statsDiv || !stagesDiv) return;

    const distanceKm = (routeInfo.distance / 1000).toFixed(1);
    const durationMin = Math.round(routeInfo.duration / 60);
    
    statsDiv.innerHTML = `
      <div class="stat-item">
        <span class="stat-icon">📍</span>
        <div>
          <div class="stat-label">Расстояние</div>
          <div class="stat-value">${distanceKm} км</div>
        </div>
      </div>
      <div class="stat-item">
        <span class="stat-icon">⏱️</span>
        <div>
          <div class="stat-label">Время</div>
          <div class="stat-value">${durationMin} мин</div>
        </div>
      </div>
    `;

    if (routeInfo.segments.length > 0) {
      stagesDiv.innerHTML = routeInfo.segments.map((seg, idx) => {
        const segDistKm = (seg.distance / 1000).toFixed(1);
        const segDurMin = Math.round(seg.duration / 60);
        return `
          <div class="stage-item">
            <div class="stage-number">${idx + 1}</div>
            <div class="stage-details">
              <div class="stage-places">
                <strong>${seg.fromPlace}</strong> → <strong>${seg.toPlace}</strong>
              </div>
              <div class="stage-info">
                📍 ${segDistKm} км &nbsp;•&nbsp; ⏱️ ${segDurMin} мин
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    panel.style.display = 'block';
  },

  async saveRoute(routeData, points, pointNames, routeInfo) {
    if (!window.MapRouteSaver) return;

    const places = points.map((coords, i) => ({
      name: pointNames[i],
      coordinates: coords,
      address: pointNames[i],
      type: i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'waypoint',
      transport_mode: routeData.mode || 'auto'
    }));

    const completeRouteData = {
      ...routeData,
      places: places,
      route_type: 'simple'
    };

    try {
      const result = await window.MapRouteSaver.saveRoute(
        completeRouteData,
        routeInfo.segments,
        'simple'
      );
      
      if (result.success) {
        console.log('[MapSimpleRoute] Saved, ID:', result.route_id);
      }
    } catch (error) {
      console.error('[MapSimpleRoute] Save error:', error);
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