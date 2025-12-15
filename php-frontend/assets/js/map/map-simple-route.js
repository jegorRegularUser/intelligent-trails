/**
 * Простой маршрут из точки А в точку Б через Yandex Maps
 * Переписано с нуля для корректной работы
 */
window.MapSimpleRoute = {
  mapCore: null,
  currentMultiRoute: null,
  currentRouteData: null,

  init(mapCore) {
    this.mapCore = mapCore;
    window.displaySimpleRoute = (routeData) => this.displaySimpleRoute(routeData);
    console.log('[MapSimpleRoute] Initialized');
  },

  async displaySimpleRoute(routeData) {
    console.log('[MapSimpleRoute] ✨ Building simple route', routeData);
    
    try {
      // Очищаем карту
      this.mapCore.clearMap();
      
      // Геокодируем все точки
      const points = [];
      const pointNames = [];
      
      // Старт
      console.log('[MapSimpleRoute] Geocoding start:', routeData.start_point);
      const startCoords = await this.geocode(routeData.start_point);
      console.log('[MapSimpleRoute] Start coords:', startCoords);
      points.push(startCoords);
      pointNames.push(routeData.start_point);
      
      // Промежуточные точки
      if (routeData.waypoints && routeData.waypoints.length > 0) {
        for (const waypoint of routeData.waypoints) {
          try {
            console.log('[MapSimpleRoute] Geocoding waypoint:', waypoint);
            const coords = await this.geocode(waypoint);
            console.log('[MapSimpleRoute] Waypoint coords:', coords);
            points.push(coords);
            pointNames.push(waypoint);
          } catch (e) {
            console.warn('[MapSimpleRoute] ⚠️ Failed to geocode waypoint:', waypoint);
          }
        }
      }
      
      // Финиш
      console.log('[MapSimpleRoute] Geocoding end:', routeData.end_point);
      const endCoords = await this.geocode(routeData.end_point);
      console.log('[MapSimpleRoute] End coords:', endCoords);
      points.push(endCoords);
      pointNames.push(routeData.end_point);
      
      console.log('[MapSimpleRoute] ✓ Geocoded', points.length, 'points:', points);
      
      // Строим маршрут
      await this.buildRoute(points, pointNames, routeData.mode || 'auto', routeData);
      
      console.log('[MapSimpleRoute] ✅ Route built successfully!');
      
    } catch (error) {
      console.error('[MapSimpleRoute] ❌ Error:', error);
      alert('Ошибка построения маршрута: ' + error.message);
    }
  },

  async buildRoute(points, pointNames, mode, originalRouteData) {
    console.log('[MapSimpleRoute] Building route with', points.length, 'points, mode:', mode);
    
    // Создаём multiRoute
    const multiRoute = new ymaps.multiRouter.MultiRoute({
      referencePoints: points,
      params: {
        routingMode: mode
      }
    }, {
      // Настройки отображения
      boundsAutoApply: true,
      wayPointVisible: false,  // Скрываем стандартные маркеры
      wayPointStartVisible: false,
      wayPointFinishVisible: false,
      routeActiveStrokeWidth: 6,
      routeActiveStrokeColor: '#1e88e5',
      routeActiveStrokeStyle: 'solid'
    });

    console.log('[MapSimpleRoute] MultiRoute created:', multiRoute);

    // Добавляем на карту
    this.mapCore.map.geoObjects.add(multiRoute);
    this.mapCore.currentRouteLines.push(multiRoute);
    this.currentMultiRoute = multiRoute;
    
    console.log('[MapSimpleRoute] MultiRoute added to map');
    console.log('[MapSimpleRoute] Map geoObjects count:', this.mapCore.map.geoObjects.getLength());

    // Добавляем свои маркеры
    this.addMarkers(points, pointNames);

    // Ждём построения маршрута
    console.log('[MapSimpleRoute] Waiting for route calculation...');
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Таймаут построения маршрута'));
      }, 30000);
      
      multiRoute.model.events.add('requestsuccess', () => {
        clearTimeout(timeout);
        console.log('[MapSimpleRoute] ✓ Route calculation successful');
        resolve();
      });
      
      multiRoute.model.events.add('requestfail', (e) => {
        clearTimeout(timeout);
        console.error('[MapSimpleRoute] ❌ Route calculation failed:', e);
        reject(new Error('Не удалось построить маршрут'));
      });
    });

    console.log('[MapSimpleRoute] Route calculation completed');

    // Извлекаем данные маршрута
    const routeInfo = this.extractRouteInfo(multiRoute, pointNames, mode);
    
    console.log('[MapSimpleRoute] Route info extracted:', routeInfo);
    
    // Отображаем информацию
    this.displayRouteInfo(routeInfo);
    
    // Сохраняем маршрут
    setTimeout(() => {
      this.saveRoute(originalRouteData, points, pointNames, routeInfo);
    }, 500);
  },

  addMarkers(points, pointNames) {
    console.log('[MapSimpleRoute] Adding', points.length, 'markers');
    
    points.forEach((coords, index) => {
      let icon, label;
      
      if (index === 0) {
        icon = 'islands#greenDotIcon';
        label = '🟢 Старт';
      } else if (index === points.length - 1) {
        icon = 'islands#redDotIcon';
        label = '🔴 Финиш';
      } else {
        icon = 'islands#orangeDotIcon';
        label = `🟠 Точка ${index}`;
      }
      
      const placemark = new ymaps.Placemark(coords, {
        balloonContent: `<strong>${label}</strong><br>${pointNames[index]}`
      }, {
        preset: icon
      });
      
      this.mapCore.routeMarkers.push(placemark);
      this.mapCore.map.geoObjects.add(placemark);
      
      console.log('[MapSimpleRoute] Marker added:', label, coords);
    });
  },

  extractRouteInfo(multiRoute, pointNames, mode) {
    try {
      const activeRoute = multiRoute.getActiveRoute();
      if (!activeRoute) {
        console.warn('[MapSimpleRoute] No active route');
        return { distance: 0, duration: 0, segments: [] };
      }

      const props = activeRoute.properties.getAll();
      const totalDistance = props.distance ? props.distance.value : 0;
      const totalDuration = props.duration ? props.duration.value : 0;

      console.log('[MapSimpleRoute] Distance:', totalDistance, 'm, Duration:', totalDuration, 's');

      // Извлекаем сегменты
      const segments = [];
      const paths = activeRoute.getPaths();
      
      if (paths && paths.getLength() > 0) {
        console.log('[MapSimpleRoute] Found', paths.getLength(), 'path segments');
        
        for (let i = 0; i < paths.getLength(); i++) {
          const path = paths.get(i);
          const pathProps = path.properties.getAll();
          
          segments.push({
            index: i,
            distance: pathProps.distance ? pathProps.distance.value : 0,
            duration: pathProps.duration ? pathProps.duration.value : 0,
            mode: mode,
            fromPlace: pointNames[i] || `Точка ${i + 1}`,
            toPlace: pointNames[i + 1] || `Точка ${i + 2}`
          });
        }
      } else {
        console.log('[MapSimpleRoute] No path segments, creating single segment');
        // Если нет сегментов, создаём один
        segments.push({
          index: 0,
          distance: totalDistance,
          duration: totalDuration,
          mode: mode,
          fromPlace: pointNames[0] || 'Старт',
          toPlace: pointNames[pointNames.length - 1] || 'Финиш'
        });
      }

      return {
        distance: totalDistance,
        duration: totalDuration,
        segments: segments
      };
      
    } catch (error) {
      console.error('[MapSimpleRoute] Error extracting route info:', error);
      return { distance: 0, duration: 0, segments: [] };
    }
  },

  displayRouteInfo(routeInfo) {
    console.log('[MapSimpleRoute] Displaying route info');
    
    const panel = document.getElementById('routeInfoPanel');
    const statsDiv = document.getElementById('routeInfoStats');
    const stagesDiv = document.getElementById('routeStagesList');
    
    if (!panel || !statsDiv || !stagesDiv) {
      console.warn('[MapSimpleRoute] Info panel elements not found');
      return;
    }

    // Общая информация
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
          <div class="stat-label">Время в пути</div>
          <div class="stat-value">${durationMin} мин</div>
        </div>
      </div>
    `;

    // Сегменты
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
    console.log('[MapSimpleRoute] Route info panel displayed');
  },

  async saveRoute(originalRouteData, points, pointNames, routeInfo) {
    console.log('[MapSimpleRoute] 💾 Saving route...');
    
    if (!window.MapRouteSaver) {
      console.warn('[MapSimpleRoute] MapRouteSaver not available');
      return;
    }

    const places = points.map((coords, i) => ({
      name: pointNames[i],
      coordinates: coords,
      address: pointNames[i],
      type: i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'waypoint',
      transport_mode: originalRouteData.mode || 'auto'
    }));

    const completeRouteData = {
      ...originalRouteData,
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
        console.log('[MapSimpleRoute] ✅ Route saved, ID:', result.route_id);
      } else {
        console.log('[MapSimpleRoute] ⚠️ Route not saved:', result.error);
      }
    } catch (error) {
      console.error('[MapSimpleRoute] ❌ Save error:', error);
    }
  },

  async geocode(address) {
    const result = await ymaps.geocode(address, { results: 1 });
    const geoObject = result.geoObjects.get(0);
    
    if (!geoObject) {
      throw new Error(`Адрес не найден: ${address}`);
    }
    
    return geoObject.geometry.getCoordinates();
  }
};

console.log('[MapSimpleRoute] Module loaded');