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

  async buildSmartWalk() {
    const startPoint = document.getElementById('smartStartPoint').value.trim();
    
    if (!startPoint) {
      this.modalInstance.showNotification('⚠️ Укажите точку старта', 'error');
      return;
    }

    if (this.modalInstance.activities.length === 0) {
      this.modalInstance.showNotification('⚠️ Добавьте хотя бы одну активность', 'error');
      return;
    }

    const returnToStart = document.querySelector('input[name="routeEnd"]:checked').value === 'return';
    const endPoint = returnToStart ? null : document.getElementById('smartEndPoint').value.trim();

    if (!returnToStart && !endPoint) {
      this.modalInstance.showNotification('⚠️ Укажите точку финиша или выберите возврат к началу', 'error');
      return;
    }

    this.modalInstance.showLoading(true, 'Определяем координаты...');
    
    try {
      const startCoords = await window.RouteModalYandex.geocodeAddress(startPoint);
      let endCoords = null;
      
      if (!returnToStart && endPoint) {
        endCoords = await window.RouteModalYandex.geocodeAddress(endPoint);
      }

      const activitiesData = [];
      for (const activity of this.modalInstance.activities) {
        const actData = { ...activity };
        
        if (activity.type === 'place' && activity.specificPlaceAddress) {
          try {
            const coords = await window.RouteModalYandex.geocodeAddress(activity.specificPlaceAddress);
            actData.specific_place = {
              name: activity.specificPlaceAddress,
              coords: coords
            };
            delete actData.specificPlaceAddress;
          } catch (e) {
            this.modalInstance.showLoading(false);
            this.modalInstance.showNotification(`⚠️ Не удалось найти место: ${activity.specificPlaceAddress}`, 'error');
            return;
          }
        }
        
        activitiesData.push(actData);
      }

      const requestData = {
        start_point: {
          name: startPoint,
          coords: startCoords
        },
        activities: activitiesData,
        return_to_start: returnToStart,
        end_point: endCoords ? {
          name: endPoint,
          coords: endCoords
        } : null
      };

      this.modalInstance.showLoading(true, 'Строим прогулку с учетом ваших активностей...');

      const response = await fetch('api.php?action=build_smart_walk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const result = await response.json();

      if (result.success) {
        this.modalInstance.currentRoute = result.data;
        this.modalInstance.close();
        window.displaySmartWalk(result.data, requestData.start_point, requestData.end_point, returnToStart);
        
        let message = '✅ Прогулка построена!';
        if (result.data.warnings && result.data.warnings.length > 0) {
          message = '✅ Прогулка построена!\n\n⚠️ ' + result.data.warnings.join('\n⚠️ ');
        }
        
        setTimeout(() => {
          this.modalInstance.showNotification(message, result.data.warnings && result.data.warnings.length > 0 ? 'warning' : 'success');
        }, 300);
        
      } else {
        let errorMessage = '❌ Не удалось построить прогулку';
        if (result.error) {
          errorMessage = `❌ ${result.error}`;
        }
        this.modalInstance.showNotification(errorMessage, 'error');
        console.error('Backend error:', result);
      }
    } catch (error) {
      console.error('Error building smart walk:', error);
      this.modalInstance.showNotification('❌ Ошибка соединения с сервером', 'error');
    } finally {
      this.modalInstance.showLoading(false);
    }
  },

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
