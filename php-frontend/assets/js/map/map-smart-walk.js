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
    const allBounds = []; // Сюда будем собирать все координаты для зума

    // Функция для безопасного добавления координат в bounds
    const addToBounds = (coords) => {
        if (Array.isArray(coords) && coords.length === 2 && coords[0] !== 0 && coords[1] !== 0) {
            allBounds.push(coords);
        }
    };

    // Добавляем старт
    if (startPoint && startPoint.coords) {
        allMarkers.push({
          coords: startPoint.coords,
          name: startPoint.name,
          type: 'start'
        });
        addToBounds(startPoint.coords);
    }

    for (let i = 0; i < walkData.activities.length; i++) {
      const activity = walkData.activities[i];
      console.log(`[ACTIVITY ${i}]`, activity.activity_type, 'transport:', activity.transport_mode);

      if (activity.geometry && activity.geometry.length > 0) {
        console.log(`[ACTIVITY ${i}] Drawing geometry with ${activity.geometry.length} points`);
        this.drawGeometry(activity.geometry, activity.transport_mode);
        
        // Добавляем точки геометрии в bounds (можно не все, а через шаг, чтобы не грузить)
        activity.geometry.forEach((coord, idx) => {
            if (idx % 5 === 0) addToBounds(coord); // Берем каждую 5-ю точку для скорости
        });
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
        addToBounds(activity.selected_place.coords);
      }
    }

    if (endPoint) {
      allMarkers.push({
        coords: endPoint.coords,
        name: endPoint.name,
        type: 'end'
      });
      addToBounds(endPoint.coords);
    }

    this.addMarkers(allMarkers);

    // Логика зума и границ
    if (allBounds.length > 1) {
      console.log('[MAP] Setting bounds for', allBounds.length, 'valid points');
      
      // Небольшая задержка, чтобы карта успела отрисоваться
      setTimeout(() => {
        try {
            this.mapCore.map.setBounds(this.mapCore.map.geoObjects.getBounds(), {
                checkZoomRange: true,
                zoomMargin: [50, 50, 50, 50],
                duration: 500
            }).then(() => {
                 // Если зум слишком мелкий (весь мир), принудительно приближаем
                 if (this.mapCore.map.getZoom() < 9) {
                     this.mapCore.map.setZoom(11);
                 }
            });
        } catch (e) {
            console.error("[MAP] Error setting bounds:", e);
            // Fallback: центрируем на старте
            if (startPoint && startPoint.coords) {
                this.mapCore.map.setCenter(startPoint.coords, 13);
            }
        }
      }, 200);
    }

    if (window.MapInfoPanel) {
        window.MapInfoPanel.displayWalkInfo(walkData, allMarkers);
    }
    
    const panel = document.getElementById('routeInfoPanel');
    if (panel) panel.style.display = 'block';
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
  },

  getRouteColor(transportMode) {
    const colorMap = {
      'pedestrian': '#10b981', // Зеленый
      'auto': '#3b82f6',       // Синий
      'bicycle': '#f59e0b',    // Оранжевый
      'masstransit': '#8b5cf6' // Фиолетовый
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
