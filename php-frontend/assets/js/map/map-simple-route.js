/**
 * Простой маршрут - скопировано с map-smart-walk.js
 */
window.MapSimpleRoute = {
  mapCore: null,
  multiRoutes: [],
  segmentDataArray: [],

  init(mapCore) {
    this.mapCore = mapCore;
    window.displaySimpleRoute = (routeData) => this.displaySimpleRoute(routeData);
    console.log('[MapSimpleRoute] Initialized');
  },

  async displaySimpleRoute(routeData) {
    console.log('[MapSimpleRoute] Building simple route:', routeData);
    
    try {
      this.clearRouteLines();
      this.segmentDataArray = [];
      
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
      
      console.log('[MapSimpleRoute] Points:', points);
      console.log('[MapSimpleRoute] Building route through', points.length, 'points');
      
      // Строим маршрут по сегментам (как в smart-walk)
      for (let i = 0; i < points.length - 1; i++) {
        await this.drawSegment(
          { coordinates: points[i], name: pointNames[i] },
          { coordinates: points[i + 1], name: pointNames[i + 1] },
          i,
          routeData.mode || 'auto'
        );
      }
      
      console.log('[MapSimpleRoute] All segments drawn');
      
      // Ждём немного и показываем инфу
      setTimeout(() => {
        this.fitMapToRoute();
        this.displayInfo(pointNames, routeData.mode);
        this.saveRoute(routeData, points, pointNames);
      }, 500);
      
      console.log('[MapSimpleRoute] Done!');
      
    } catch (error) {
      console.error('[MapSimpleRoute] Error:', error);
      alert('Ошибка: ' + error.message);
    }
  },

  async drawSegment(fromPlace, toPlace, segmentIndex, mode) {
    console.log(`[MapSimpleRoute] Segment ${segmentIndex + 1}: ${fromPlace.name} -> ${toPlace.name}`);
    
    try {
      const routingMode = this.convertModeToYandex(mode);
      
      // Точно также как в smart-walk!
      const multiRoute = new ymaps.multiRouter.MultiRoute({
        referencePoints: [fromPlace.coordinates, toPlace.coordinates],
        params: {
          routingMode: routingMode
        }
      }, {
        boundsAutoApply: false,
        wayPointVisible: false,
        wayPointStartVisible: false,
        wayPointFinishVisible: false,
        wayPointStartIconVisible: false,
        wayPointFinishIconVisible: false,
        wayPointIconVisible: false,
        pinVisible: false,
        viaPointVisible: false,
        routeActiveStrokeWidth: 5,
        routeActiveStrokeColor: '#4A90E2',
        routeActiveStrokeStyle: 'solid'
      });
      
      this.mapCore.map.geoObjects.add(multiRoute);
      this.multiRoutes.push(multiRoute);
      
      // Ждём построения
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 10000);
        
        multiRoute.model.events.once('requestsuccess', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        multiRoute.model.events.once('requestfail', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      const activeRoute = multiRoute.getActiveRoute();
      if (!activeRoute) {
        console.warn(`[MapSimpleRoute] No active route for segment ${segmentIndex}`);
        return;
      }
      
      const distance = activeRoute.properties.get('distance').value;
      const duration = activeRoute.properties.get('duration').value;
      
      console.log(`  ✓ Distance: ${(distance / 1000).toFixed(2)} km, Time: ${(duration / 60).toFixed(0)} min`);
      
      this.segmentDataArray.push({
        index: segmentIndex,
        distance: distance,
        duration: duration,
        mode: mode,
        fromPlace: fromPlace.name,
        toPlace: toPlace.name
      });
      
      console.log(`  ✓ Segment drawn`);
      
    } catch (error) {
      console.error(`[MapSimpleRoute] Error drawing segment ${segmentIndex}:`, error);
    }
  },

  convertModeToYandex(mode) {
    const mapping = {
      'pedestrian': 'pedestrian',
      'walking': 'pedestrian',
      'driving': 'auto',
      'auto': 'auto',
      'masstransit': 'masstransit',
      'transit': 'masstransit',
      'bicycle': 'bicycle'
    };
    return mapping[mode] || 'auto';
  },

  displayInfo(pointNames, mode) {
    const panel = document.getElementById('routeInfoPanel');
    const statsDiv = document.getElementById('routeInfoStats');
    const stagesDiv = document.getElementById('routeStagesList');
    
    if (!panel || !statsDiv || !stagesDiv) return;

    const totalDistance = this.segmentDataArray.reduce((sum, seg) => sum + seg.distance, 0);
    const totalDuration = this.segmentDataArray.reduce((sum, seg) => sum + seg.duration, 0);
    
    const distanceKm = (totalDistance / 1000).toFixed(1);
    const durationMin = Math.round(totalDuration / 60);
    
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

    if (this.segmentDataArray.length > 0) {
      stagesDiv.innerHTML = this.segmentDataArray.map((seg, idx) => {
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

  async saveRoute(routeData, points, pointNames) {
    if (!window.MapRouteSaver) {
      console.log('[MapSimpleRoute] MapRouteSaver not available');
      return;
    }

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
        this.segmentDataArray,
        'simple'
      );
      
      if (result.success) {
        console.log('[MapSimpleRoute] Saved, ID:', result.route_id);
      }
    } catch (error) {
      console.error('[MapSimpleRoute] Save error:', error);
    }
  },

  clearRouteLines() {
    console.log(`[MapSimpleRoute] Clearing ${this.multiRoutes.length} routes`);
    
    this.multiRoutes.forEach(route => {
      this.mapCore.map.geoObjects.remove(route);
    });
    this.multiRoutes = [];
    this.segmentDataArray = [];
  },

  fitMapToRoute() {
    if (this.multiRoutes.length === 0) return;
    
    try {
      const bounds = this.mapCore.map.geoObjects.getBounds();
      if (bounds) {
        this.mapCore.map.setBounds(bounds, {
          checkZoomRange: true,
          zoomMargin: 50,
          duration: 500
        });
      }
    } catch (error) {
      console.error('[MapSimpleRoute] Error fitting map:', error);
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