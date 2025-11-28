/**
 * Отображение умных прогулок с реальными маршрутами
 * Построение маршрута через активности
 */
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

    // Старая функция для совместимости
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

    // Собираем все точки для маршрута
    const allPoints = [startPoint.coords];
    const pointsInfo = [{
      name: startPoint.name,
      type: 'start',
      coords: startPoint.coords
    }];

    walkData.activities.forEach((activity, idx) => {
      if (activity.activity_type === 'walk' && activity.route_segment) {
        activity.route_segment.forEach((point, segIdx) => {
          // Пропускаем первую точку сегмента, если она совпадает с предыдущей
          if (segIdx > 0 || allPoints.length === 0 ||
            !this.coordsEqual(allPoints[allPoints.length - 1], point.coords)) {
            allPoints.push(point.coords);
            pointsInfo.push({
              name: point.name,
              type: 'walk_point',
              coords: point.coords,
              activityIndex: idx
            });
          }
        });
      } else if (activity.activity_type === 'place' && activity.selected_place) {
        allPoints.push(activity.selected_place.coords);
        pointsInfo.push({
          name: activity.selected_place.name,
          type: 'place',
          coords: activity.selected_place.coords,
          category: activity.category,
          activityIndex: idx,
          alternatives: activity.alternatives
        });
      }
    });

    if (returnToStart) {
      allPoints.push(startPoint.coords);
    } else if (endPoint) {
      allPoints.push(endPoint.coords);
      pointsInfo.push({
        name: endPoint.name,
        type: 'end',
        coords: endPoint.coords
      });
    }

    // Строим РЕАЛЬНЫЙ маршрут через Yandex Maps API
    await this.buildRoute(allPoints, walkData);

    // Добавляем маркеры
    this.addMarkers(pointsInfo);

    // Добавляем зоны для парков
    this.addParkZones(walkData);

    // Отображаем информацию в левой панели
    window.MapInfoPanel.displayWalkInfo(walkData, pointsInfo);
  },

  async buildRoute(allPoints, walkData) {
    try {
      const mode = walkData.activities[0]?.transport_mode || 'pedestrian';
      const routingMode = {
        'pedestrian': 'pedestrian',
        'auto': 'auto',
        'bicycle': 'bicycle',
        'masstransit': 'masstransit'
      }[mode] || 'pedestrian';

      const route = await ymaps.route(allPoints, {
        routingMode: routingMode,
        mapStateAutoApply: false
      });

      this.mapCore.currentRouteLines.push(route);
      this.mapCore.map.geoObjects.add(route);

      // Центрируем карту на маршруте
      this.mapCore.map.setBounds(route.getBounds(), {
        checkZoomRange: true,
        zoomMargin: 50
      });

    } catch (error) {
      console.error('Error building route:', error);
      // Fallback - просто линия между точками
      const polyline = new ymaps.Polyline(allPoints, {}, {
        strokeColor: '#667eea',
        strokeWidth: 4,
        strokeOpacity: 0.8
      });
      this.mapCore.currentRouteLines.push(polyline);
      this.mapCore.map.geoObjects.add(polyline);

      this.mapCore.map.setBounds(polyline.geometry.getBounds(), {
        checkZoomRange: true,
        zoomMargin: 50
      });
    }
  },

  addMarkers(pointsInfo) {
    pointsInfo.forEach((point) => {
      let iconPreset, iconColor;

      if (point.type === 'start') {
        iconPreset = 'islands#greenDotIcon';
        iconColor = '#10b981';
      } else if (point.type === 'end') {
        iconPreset = 'islands#redDotIcon';
        iconColor = '#ef4444';
      } else if (point.type === 'place') {
        iconPreset = 'islands#blueDotIcon';
        iconColor = '#667eea';
      } else {
        // walk_point - не показываем маркеры для промежуточных точек прогулки
        return;
      }

      const placemark = new ymaps.Placemark(
        point.coords,
        {
          balloonContent: `<strong>${point.name}</strong>${point.category ? '<br>' + point.category : ''}`,
          iconCaption: point.name
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

  addParkZones(walkData) {
    walkData.activities.forEach((activity) => {
      if (activity.activity_type === 'place' &&
        (activity.category === 'парк' || activity.category === 'сквер')) {

        if (activity.selected_place) {
          // Рисуем круг вокруг парка как зону прогулки
          const circle = new ymaps.Circle(
            [activity.selected_place.coords, 200], // радиус 200м
            {},
            {
              fillColor: '#10b98130',
              strokeColor: '#10b981',
              strokeWidth: 2,
              strokeStyle: 'shortdash'
            }
          );

          this.mapCore.routeMarkers.push(circle);
          this.mapCore.map.geoObjects.add(circle);
        }
      }
    });
  },

  coordsEqual(c1, c2) {
    return Math.abs(c1[0] - c2[0]) < 0.0001 && Math.abs(c1[1] - c2[1]) < 0.0001;
  },

  // Старая функция для совместимости
  displaySmartRoute(routeData) {
    // Конвертируем в новый формат
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
