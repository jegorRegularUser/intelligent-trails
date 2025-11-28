/**
 * Построение умных прогулок и простых маршрутов
 * Взаимодействие с API
 */
window.RouteModalBuilder = {
  modalInstance: null,

  init(modal) {
    this.modalInstance = modal;
    this.attachEventListeners();
  },

  attachEventListeners() {
    document.getElementById("buildRoute").addEventListener("click", () => this.buildRoute());
  },

  async buildRoute() {
    if (this.modalInstance.currentRouteType === "smart") {
      await this.buildSmartWalk();
    } else {
      await this.buildSimpleRoute();
    }
  },

  async buildSmartWalk(places, mode = 'pedestrian') {
    try {
        console.log('[RouteBuilder] Building smart walk:', places.length, 'places');
        
        // Преобразовать places в нужный формат
        const formattedPlaces = places.map(p => ({
            name: p.name,
            coordinates: p.coords || p.coordinates,
            type: 'must_visit'
        }));
        
        // Вызвать новый API
        const response = await fetch('https://intelligent-trails.onrender.com/api/route/build', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                places: formattedPlaces,
                mode: mode,
                optimize: true
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const routeData = await response.json();
        
        if (!routeData.success) {
            throw new Error(routeData.error || 'Failed to build route');
        }
        
        console.log('[RouteBuilder] ✅ Route built successfully:', routeData);
        
        // Обновить состояние
        if (window.StateManager) {
            window.StateManager.setRouteData(routeData);
        }
        
        // Визуализировать через НОВЫЙ API
        if (window.MapSmartWalkInstance) {
            window.MapSmartWalkInstance.visualizeRoute(routeData);
            console.log('[RouteBuilder] ✅ Route visualized');
        } else {
            console.error('[RouteBuilder] ❌ MapSmartWalkInstance not found!');
        }
        
        // Установить маркеры
        if (window.MapPlaceMarkersInstance) {
            window.MapPlaceMarkersInstance.setPlaces(routeData.places);
            console.log('[RouteBuilder] ✅ Markers set');
        }
        
        return routeData;
        
    } catch (error) {
        console.error('[RouteBuilder] ❌ Error building smart walk:', error);
        alert('Ошибка построения маршрута: ' + error.message);
        throw error;
    }
}
,

  async buildSimpleRoute() {
    const startPoint = document.getElementById('simpleStartPoint').value.trim();
    const endPoint = document.getElementById('simpleEndPoint').value.trim();
    const mode = document.querySelector('input[name="simpleTransport"]:checked').value;

    if (!startPoint || !endPoint) {
      this.modalInstance.showNotification('⚠️ Укажите начальную и конечную точки', 'error');
      return;
    }

    const waypoints = [];
    document.querySelectorAll('.waypoint-input').forEach(input => {
      const value = input.value.trim();
      if (value) waypoints.push(value);
    });

    const routeData = {
      start_point: startPoint,
      end_point: endPoint,
      waypoints: waypoints,
      mode: mode
    };

    this.modalInstance.showLoading(true, 'Строим маршрут...');

    try {
      const response = await fetch('api.php?action=build_simple_route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routeData)
      });

      const result = await response.json();

      if (result.success) {
        this.modalInstance.close();
        window.displaySimpleRoute(result.data);
        
        setTimeout(() => {
          this.modalInstance.showNotification('✅ Маршрут построен!', 'success');
        }, 300);
      } else {
        let errorMessage = '❌ Не удалось построить маршрут';
        if (result.error) {
          errorMessage = `❌ ${result.error}`;
        }
        this.modalInstance.showNotification(errorMessage, 'error');
        console.error('Backend error:', result);
      }
    } catch (error) {
      console.error('Error building simple route:', error);
      this.modalInstance.showNotification('❌ Ошибка соединения с сервером', 'error');
    } finally {
      this.modalInstance.showLoading(false);
    }
  }
};
