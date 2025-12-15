/**
 * Отображение простых маршрутов из точки А в точку Б
 */
window.MapSimpleRoute = {
  mapCore: null,
  currentRouteData: null,
  segmentDataArray: [],

  init(mapCore) {
    this.mapCore = mapCore;
    this.registerGlobalFunction();
    console.log('[MapSimpleRoute] Initialized');
  },

  registerGlobalFunction() {
    window.displaySimpleRoute = async (routeData) => {
      await this.displaySimpleRoute(routeData);
    };
  },

  async displaySimpleRoute(routeData) {
    console.log('[MapSimpleRoute] Building simple route...');
    console.log('[MapSimpleRoute] Route data:', routeData);
    
    this.mapCore.clearMap();
    this.segmentDataArray = [];
    this.currentRouteData = routeData;

    // Геокодирование точек
    const startCoords = await this.geocodeAddress(routeData.start_point);
    const endCoords = await this.geocodeAddress(routeData.end_point);

    const points = [startCoords];
    const pointNames = [routeData.start_point];

    // Промежуточные точки
    if (routeData.waypoints && routeData.waypoints.length > 0) {
      for (const waypoint of routeData.waypoints) {
        try {
          const coords = await this.geocodeAddress(waypoint);
          points.push(coords);
          pointNames.push(waypoint);
        } catch (e) {
          console.error('[MapSimpleRoute] Failed to geocode waypoint:', waypoint, e);
        }
      }
    }

    points.push(endCoords);
    pointNames.push(routeData.end_point);

    console.log('[MapSimpleRoute] Total points:', points.length);

    const modeMapping = {
      'auto': 'auto',
      'pedestrian': 'pedestrian',
      'masstransit': 'masstransit',
      'bicycle': 'bicycle'
    };

    const yandexMode = modeMapping[routeData.mode] || 'auto';

    try {
      const route = await ymaps.route(points, {
        routingMode: yandexMode,
        mapStateAutoApply: true
      });
      
      this.mapCore.currentRouteLines.push(route);
      this.mapCore.map.geoObjects.add(route);

      // Добавляем маркеры
      points.forEach((point, index) => {
        const placemark = new ymaps.Placemark(
          point,
          {
            balloonContent: index === 0 ? 'Старт' : index === points.length - 1 ? 'Финиш' : `Точка ${index}`
          },
          {
            preset: index === 0 ? 'islands#greenDotIcon' : index === points.length - 1 ? 'islands#redDotIcon' : 'islands#orangeDotIcon'
          }
        );
        this.mapCore.routeMarkers.push(placemark);
        this.mapCore.map.geoObjects.add(placemark);
      });

      // Извлекаем данные сегментов
      await this.extractSegmentData(route, pointNames);
      
      // Создаем полные данные маршрута с координатами
      const completeRouteData = await this.buildCompleteRouteData(routeData, points, pointNames);
      
      // Отображаем информацию о маршруте
      if (window.MapInfoPanel) {
        window.MapInfoPanel.displaySimpleRouteInfo(route, routeData);
      }
      
      // Автоматическое сохранение маршрута
      console.log('[MapSimpleRoute] ⏳ Waiting 500ms before saving...');
      setTimeout(() => {
        console.log('[MapSimpleRoute] ✓ Timeout complete, calling saveRoute');
        this.saveRoute(completeRouteData);
      }, 500);
      
      console.log('[MapSimpleRoute] ✅ Route built successfully');
      
    } catch (error) {
      console.error('[MapSimpleRoute] ❌ Route building failed:', error);
      alert('Невозможно построить маршрут: ' + error.message);
    }
  },
  
  /**
   * Извлечение данных сегментов из Yandex route
   */
  async extractSegmentData(route, pointNames) {
    console.log('[MapSimpleRoute] Extracting segment data...');
    
    try {
      const activeRoute = route.getActiveRoute();
      
      if (!activeRoute) {
        console.warn('[MapSimpleRoute] No active route available');
        return;
      }
      
      // Получаем общие данные маршрута
      const totalDistance = activeRoute.properties.get('distance')?.value || 0;
      const totalDuration = activeRoute.properties.get('duration')?.value || 0;
      
      console.log('[MapSimpleRoute] Total distance:', totalDistance, 'm');
      console.log('[MapSimpleRoute] Total duration:', totalDuration, 's');
      
      // Пытаемся получить сегменты
      const segments = activeRoute.getPaths();
      
      if (segments && segments.getLength && segments.getLength() > 0) {
        console.log('[MapSimpleRoute] Found', segments.getLength(), 'segments');
        
        // Если есть отдельные сегменты, извлекаем данные
        for (let i = 0; i < segments.getLength(); i++) {
          const segment = segments.get(i);
          const segmentDistance = segment.properties.get('distance')?.value || 0;
          const segmentDuration = segment.properties.get('duration')?.value || 0;
          
          this.segmentDataArray.push({
            index: i,
            distance: segmentDistance,
            duration: segmentDuration,
            mode: this.currentRouteData.mode || 'auto',
            fromPlace: pointNames[i] || `Точка ${i + 1}`,
            toPlace: pointNames[i + 1] || `Точка ${i + 2}`
          });
          
          console.log(`[MapSimpleRoute] Segment ${i + 1}: ${segmentDistance}m, ${segmentDuration}s`);
        }
      } else {
        // Если нет отдельных сегментов, создаем один сегмент
        console.log('[MapSimpleRoute] No separate segments, creating single segment');
        
        this.segmentDataArray.push({
          index: 0,
          distance: totalDistance,
          duration: totalDuration,
          mode: this.currentRouteData.mode || 'auto',
          fromPlace: pointNames[0] || 'Старт',
          toPlace: pointNames[pointNames.length - 1] || 'Финиш'
        });
      }
      
      console.log('[MapSimpleRoute] Extracted segment data:', this.segmentDataArray);
      
    } catch (error) {
      console.error('[MapSimpleRoute] Error extracting segment data:', error);
      
      // Fallback: создаем базовый сегмент
      this.segmentDataArray.push({
        index: 0,
        distance: 0,
        duration: 0,
        mode: this.currentRouteData.mode || 'auto',
        fromPlace: pointNames[0] || 'Старт',
        toPlace: pointNames[pointNames.length - 1] || 'Финиш'
      });
    }
  },
  
  /**
   * Построение полных данных маршрута с координатами
   */
  async buildCompleteRouteData(routeData, points, pointNames) {
    console.log('[MapSimpleRoute] Building complete route data...');
    
    const places = [];
    
    for (let i = 0; i < points.length; i++) {
      let address = '';
      
      // Пытаемся получить адрес через reverse geocoding
      try {
        address = await this.reverseGeocode(points[i]);
      } catch (e) {
        console.warn('[MapSimpleRoute] Failed to reverse geocode:', e);
        address = pointNames[i] || `Точка ${i + 1}`;
      }
      
      places.push({
        name: pointNames[i] || (i === 0 ? 'Старт' : i === points.length - 1 ? 'Финиш' : `Точка ${i + 1}`),
        coordinates: points[i],
        address: address,
        type: i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'waypoint',
        transport_mode: routeData.mode || 'auto'
      });
    }
    
    const completeData = {
      ...routeData,
      places: places,
      route_type: 'simple'
    };
    
    console.log('[MapSimpleRoute] Complete route data:', completeData);
    return completeData;
  },
  
  /**
   * Сохранение маршрута через MapRouteSaver
   */
  async saveRoute(routeData) {
    console.log('[MapSimpleRoute] 💾 Attempting to save route...');
    
    if (!window.MapRouteSaver) {
      console.error('[MapSimpleRoute] ❌ MapRouteSaver not available');
      return;
    }
    
    try {
      const result = await window.MapRouteSaver.saveRoute(
        routeData,
        this.segmentDataArray,
        'simple'
      );
      
      console.log('[MapSimpleRoute] Save result:', result);
      
      if (result.success) {
        console.log('[MapSimpleRoute] ✅ Route saved successfully, ID:', result.route_id);
      } else {
        console.log('[MapSimpleRoute] ⚠️ Route not saved:', result.error);
      }
    } catch (error) {
      console.error('[MapSimpleRoute] ❌ Save error:', error);
    }
  },

  async geocodeAddress(address) {
    return new Promise((resolve, reject) => {
      ymaps.geocode(address, {
        results: 1
      }).then(
        (result) => {
          const firstGeoObject = result.geoObjects.get(0);
          if (firstGeoObject) {
            resolve(firstGeoObject.geometry.getCoordinates());
          } else {
            reject(new Error("Адрес не найден"));
          }
        },
        (error) => reject(error)
      );
    });
  },
  
  async reverseGeocode(coords) {
    return new Promise((resolve, reject) => {
      ymaps.geocode(coords, {
        results: 1
      }).then(
        (result) => {
          const firstGeoObject = result.geoObjects.get(0);
          if (firstGeoObject) {
            resolve(firstGeoObject.getAddressLine());
          } else {
            resolve('');
          }
        },
        (error) => {
          console.warn('[MapSimpleRoute] Reverse geocode error:', error);
          resolve('');
        }
      );
    });
  }
};

console.log('[MapSimpleRoute] Module loaded');
