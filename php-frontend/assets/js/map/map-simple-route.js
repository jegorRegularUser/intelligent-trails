/**
 * Отображение простых маршрутов из точки А в точку Б
 */
window.MapSimpleRoute = {
  mapCore: null,

  init(mapCore) {
    this.mapCore = mapCore;
    this.registerGlobalFunction();
  },

  registerGlobalFunction() {
    window.displaySimpleRoute = async (routeData) => {
      await this.displaySimpleRoute(routeData);
    };
  },

  async displaySimpleRoute(routeData) {
    this.mapCore.clearMap();

    const startCoords = await this.geocodeAddress(routeData.start_point);
    const endCoords = await this.geocodeAddress(routeData.end_point);

    const points = [startCoords];

    if (routeData.waypoints && routeData.waypoints.length > 0) {
      for (const waypoint of routeData.waypoints) {
        try {
          const coords = await this.geocodeAddress(waypoint);
          points.push(coords);
        } catch (e) {
          console.error('Failed to geocode waypoint:', waypoint, e);
        }
      }
    }

    points.push(endCoords);

    const modeMapping = {
      'auto': 'auto',
      'pedestrian': 'pedestrian',
      'masstransit': 'masstransit',
      'bicycle': 'bicycle'
    };

    const yandexMode = modeMapping[routeData.mode] || 'auto';

    ymaps.route(points, {
      routingMode: yandexMode,
      mapStateAutoApply: true
    }).then((route) => {
      this.mapCore.currentRouteLines.push(route);
      this.mapCore.map.geoObjects.add(route);

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

      window.MapInfoPanel.displaySimpleRouteInfo(route, routeData);
    }, (error) => {
      alert('Невозможно построить маршрут: ' + error.message);
    });
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
  }
};
