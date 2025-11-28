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

    console.log('[SMART WALK] Displaying walk with', walkData.activities.length, 'activities');

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
      console.log(`[ACTIVITY ${i}]`, activity.activity_type, 'transport:', activity.transport_mode);

      if (activity.geometry && activity.geometry.length > 0) {
        console.log(`[ACTIVITY ${i}] Drawing geometry with ${activity.geometry.length} points`);
        this.drawGeometry(activity.geometry, activity.transport_mode);
        
        activity.geometry.forEach(coord => allBounds.push(coord));
      } else {
        console.warn(`[ACTIVITY ${i}] No geometry available`);
      }

      if (activity.activity_type === 'place' && activity.selected_place) {
        allMarkers.push({
          coords: activity.selected_place.coords,
          name: activity.selected_place.name,
          type: 'place',
          category: activity.category,
          alternatives: activity.alternatives
        });
        allBounds.push(activity.selected_place.coords);
      }
    }

    if (endPoint) {
      allMarkers.push({
        coords: endPoint.coords,
        name: endPoint.name,
        type: 'end'
      });
      allBounds.push(endPoint.coords);
    }

    this.addMarkers(allMarkers);

    if (allBounds.length > 1) {
      console.log('[MAP] Setting bounds for', allBounds.length, 'points');
      
      setTimeout(() => {
        this.mapCore.map.setBounds(allBounds, {
          checkZoomRange: true,
          zoomMargin: [50, 50, 50, 50],
          duration: 500
        }).then(() => {
          const currentZoom = this.mapCore.map.getZoom();
          console.log('[MAP] Current zoom after setBounds:', currentZoom);
          
          if (currentZoom < 10) {
            console.log('[MAP] Zoom too low, setting to 12');
            this.mapCore.map.setZoom(12, { duration: 300 });
          } else if (currentZoom > 16) {
            console.log('[MAP] Zoom too high, setting to 15');
            this.mapCore.map.setZoom(15, { duration: 300 });
          }
        });
      }, 100);
    }

    window.MapInfoPanel.displayWalkInfo(walkData, allMarkers);
    document.getElementById('routeInfoPanel').style.display = 'block';
  },

  drawGeometry(geometry, transportMode) {
    const routeColor = this.getRouteColor(transportMode);
    
    const polyline = new ymaps.Polyline(geometry, {}, {
      strokeColor: routeColor,
      strokeWidth: 5,
      strokeOpacity: 0.8
    });

    this.mapCore.currentRouteLines.push(polyline);
    this.mapCore.map.geoObjects.add(polyline);
    
    console.log('[GEOMETRY] Drew polyline with color', routeColor);
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
        transport_mode: 'pedestrian',
        geometry: null
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
