window.MapSmartWalk = {
  mapCore: null,

  init(mapCore) {
    this.mapCore = mapCore;
    this.registerGlobalFunction();
  },

  registerGlobalFunction() {
    window.displaySmartWalk = async (walkData, startPoint, endPoint, returnToStart) => {
      await this.displaySmartWalk(walkData, startPoint, endPoint, returnToStart);
    };

    window.displaySmartRoute = (routeData) => {
      this.displaySmartRoute(routeData);
    };
  },

  async displaySmartWalk(walkData, startPoint, endPoint, returnToStart) {
    this.mapCore.clearMap();
    this.mapCore.currentWalkData = walkData;

    if (!walkData.activities || walkData.activities.length === 0) {
      alert('Не удалось построить прогулку');
      return;
    }

    console.log('[SMART WALK] Starting walk construction');
    console.log('[SMART WALK] Activities:', walkData.activities);

    let currentCoords = startPoint.coords;
    const allMarkers = [];
    const allBounds = [];

    allMarkers.push({
      coords: startPoint.coords,
      name: startPoint.name,
      type: 'start'
    });
    allBounds.push(startPoint.coords);

    for (let i = 0; i < walkData.activities.length; i++) {
      const activity = walkData.activities[i];
      console.log(`[ACTIVITY ${i}] Type: ${activity.activity_type}, Transport: ${activity.transport_mode}`);

      if (activity.activity_type === 'walk') {
        const nextCoords = this.getNextCoords(walkData, i, startPoint, endPoint, returnToStart);
        
        if (nextCoords) {
          console.log(`[WALK ${i}] Route from`, currentCoords, 'to', nextCoords, 'using', activity.transport_mode);
          
          await this.buildSingleRoute(currentCoords, nextCoords, activity.transport_mode);
          currentCoords = nextCoords;
          allBounds.push(nextCoords);
        }
      } else if (activity.activity_type === 'place' && activity.selected_place) {
        const placeCoords = activity.selected_place.coords;
        
        console.log(`[PLACE ${i}] Route to`, activity.selected_place.name, 'from', currentCoords, 'using', activity.transport_mode);
        
        await this.buildSingleRoute(currentCoords, placeCoords, activity.transport_mode);
        
        allMarkers.push({
          coords: placeCoords,
          name: activity.selected_place.name,
          type: 'place',
          category: activity.category,
          alternatives: activity.alternatives
        });
        
        currentCoords = placeCoords;
        allBounds.push(placeCoords);
      }
    }

    if (returnToStart) {
      console.log('[RETURN] Building route back to start');
      const lastActivity = walkData.activities[walkData.activities.length - 1];
      const mode = lastActivity ? lastActivity.transport_mode : 'pedestrian';
      console.log('[RETURN] Using mode:', mode);
      await this.buildSingleRoute(currentCoords, startPoint.coords, mode);
      allBounds.push(startPoint.coords);
    } else if (endPoint) {
      console.log('[END] Building route to end point');
      const lastActivity = walkData.activities[walkData.activities.length - 1];
      const mode = lastActivity ? lastActivity.transport_mode : 'pedestrian';
      console.log('[END] Using mode:', mode);
      await this.buildSingleRoute(currentCoords, endPoint.coords, mode);
      
      allMarkers.push({
        coords: endPoint.coords,
        name: endPoint.name,
        type: 'end'
      });
      allBounds.push(endPoint.coords);
    }

    this.addMarkers(allMarkers);

    if (allBounds.length > 0) {
      this.mapCore.map.setBounds(allBounds, {
        checkZoomRange: true,
        zoomMargin: 50
      });
    }

    window.MapInfoPanel.displayWalkInfo(walkData, allMarkers);
    document.getElementById('routeInfoPanel').style.display = 'block';
  },

  getNextCoords(walkData, currentIndex, startPoint, endPoint, returnToStart) {
    for (let i = currentIndex + 1; i < walkData.activities.length; i++) {
      const nextActivity = walkData.activities[i];
      if (nextActivity.activity_type === 'place' && nextActivity.selected_place) {
        return nextActivity.selected_place.coords;
      }
    }

    if (returnToStart) {
      return startPoint.coords;
    } else if (endPoint) {
      return endPoint.coords;
    }

    return null;
  },

  async buildSingleRoute(fromCoords, toCoords, transportMode) {
    const routingMode = this.getYandexRoutingMode(transportMode);
    
    console.log(`[BUILD ROUTE] From ${fromCoords} to ${toCoords}`);
    console.log(`[BUILD ROUTE] Transport mode: ${transportMode} -> Yandex mode: ${routingMode}`);
    
    try {
      const route = await ymaps.route([fromCoords, toCoords], {
        routingMode: routingMode,
        mapStateAutoApply: false
      });

      const routeColor = this.getRouteColor(transportMode);
      
      route.getPaths().each((path) => {
        path.options.set({
          strokeColor: routeColor,
          strokeWidth: 5,
          strokeOpacity: 0.7
        });
      });

      this.mapCore.currentRouteLines.push(route);
      this.mapCore.map.geoObjects.add(route);
      
      console.log('[BUILD ROUTE] Successfully added Yandex route');
      
    } catch (error) {
      console.error('[BUILD ROUTE ERROR]', error);
      console.warn('[BUILD ROUTE] Fallback to polyline');
      
      const polyline = new ymaps.Polyline([fromCoords, toCoords], {}, {
        strokeColor: this.getRouteColor(transportMode),
        strokeWidth: 4,
        strokeOpacity: 0.5,
        strokeStyle: 'dash'
      });
      
      this.mapCore.currentRouteLines.push(polyline);
      this.mapCore.map.geoObjects.add(polyline);
    }
  },

  getYandexRoutingMode(transportMode) {
    const modeMap = {
      'pedestrian': 'pedestrian',
      'auto': 'auto',
      'bicycle': 'bicycle',
      'masstransit': 'masstransit'
    };
    const result = modeMap[transportMode] || 'pedestrian';
    console.log(`[MODE MAP] ${transportMode} -> ${result}`);
    return result;
  },

  getRouteColor(transportMode) {
    const colorMap = {
      'pedestrian': '#10b981',
      'auto': '#3b82f6',
      'bicycle': '#f59e0b',
      'masstransit': '#8b5cf6'
    };
    return colorMap[transportMode] || '#667eea';
  },

  addMarkers(markers) {
    markers.forEach((marker) => {
      let iconPreset, iconColor;

      if (marker.type === 'start') {
        iconPreset = 'islands#greenDotIcon';
        iconColor = '#10b981';
      } else if (marker.type === 'end') {
        iconPreset = 'islands#redDotIcon';
        iconColor = '#ef4444';
      } else if (marker.type === 'place') {
        iconPreset = 'islands#blueDotIcon';
        iconColor = '#667eea';
      } else {
        return;
      }

      const placemark = new ymaps.Placemark(
        marker.coords,
        {
          balloonContent: `<strong>${marker.name}</strong>${marker.category ? '<br>' + marker.category : ''}`,
          iconCaption: marker.name
        },
        {
          preset: iconPreset,
          iconColor: iconColor
        }
      );

      this.mapCore.routeMarkers.push(placemark);
      this.mapCore.map.geoObjects.add(placemark);
    });
  },

  displaySmartRoute(routeData) {
    const walkData = {
      activities: routeData.ordered_route.map((point, idx) => ({
        activity_type: 'place',
        selected_place: point,
        category: 'место',
        duration_minutes: idx < routeData.ordered_route.length - 1 ? 10 : 0,
        transport_mode: 'pedestrian'
      })),
      total_duration_minutes: routeData.total_time_minutes,
      warnings: routeData.warnings || []
    };

    const startPoint = {
      name: routeData.ordered_route[0].name,
      coords: routeData.ordered_route[0].coords
    };

    this.displaySmartWalk(walkData, startPoint, null, false);
  }
};
