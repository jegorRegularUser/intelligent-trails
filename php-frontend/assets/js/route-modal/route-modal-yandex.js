/**
 * Интеграция с Yandex Maps API: автоподсказки и геокодирование
 * ИСПРАВЛЕНО: Добавлена возможность установки начальной точки кликом на карту
 */
window.RouteModalYandex = {
  modalInstance: null,
  startPointMarker: null,

  init(modal) {
    this.modalInstance = modal;
    this.setupAllSuggests();
    this.setupMapClickHandler();
  },

  setupAllSuggests() {
    this.setupSuggest("smartStartPoint");
    this.setupSuggest("smartEndPoint");
    this.setupSuggest("simpleStartPoint");
    this.setupSuggest("simpleEndPoint");
    this.setupSuggest("specificPlaceInput");
  },

  setupSuggest(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    if (typeof ymaps !== "undefined" && ymaps.suggest) {
      new ymaps.SuggestView(input, { results: 5 });
    }
    
    // ✅ Когда пользователь вводит адрес, геокодируем его
    input.addEventListener('blur', async () => {
      const address = input.value.trim();
      if (address && !input.dataset.coords) {
        try {
          const coords = await this.geocodeAddress(address);
          if (coords) {
            input.dataset.coords = coords.join(',');
            console.log(`[RouteModalYandex] ✅ Auto-geocoded ${inputId}:`, coords);
            
            // Добавляем визуальную индикацию
            if (inputId.includes('Start')) {
              input.style.borderColor = '#4CAF50';
              input.title = `Координаты: ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`;
            }
          }
        } catch (error) {
          console.error(`[RouteModalYandex] ✖️ Failed to geocode ${inputId}:`, error);
        }
      }
    });
  },

  /**
   * ✅ НОВОЕ: Настройка клика по карте для установки начальной точки
   */
  setupMapClickHandler() {
    // Подписываемся на события от кнопок "Выбрать на карте"
    const pickStartBtn = document.getElementById('pickStartPointBtn');
    const pickEndBtn = document.getElementById('pickEndPointBtn');
    
    if (pickStartBtn) {
      pickStartBtn.addEventListener('click', () => {
        this.enableMapPicker('start');
      });
    }
    
    if (pickEndBtn) {
      pickEndBtn.addEventListener('click', () => {
        this.enableMapPicker('end');
      });
    }
  },

  /**
   * Включает режим выбора точки на карте
   */
  enableMapPicker(pointType) {
    console.log(`[RouteModalYandex] 📍 Enabling map picker for ${pointType} point`);
    
    if (!window.MapCore || !window.MapCore.map) {
      alert('Карта ещё не загрузилась');
      return;
    }
    
    const map = window.MapCore.map;
    
    // Создаём одноразовый обработчик клика
    const clickHandler = async (e) => {
      const coords = e.get('coords');
      console.log(`[RouteModalYandex] ✅ Map clicked at:`, coords);
      
      // Получаем адрес через геокодер
      const address = await this.reverseGeocode(coords);
      
      // Устанавливаем значение в инпут
      const inputId = pointType === 'start' ? 'smartStartPoint' : 'smartEndPoint';
      const input = document.getElementById(inputId);
      
      if (input) {
        input.value = address;
        input.dataset.coords = coords.join(',');
        input.style.borderColor = '#4CAF50';
        input.title = `Координаты: ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`;
        
        console.log(`[RouteModalYandex] ✅ ${inputId} set to:`, address, coords);
      }
      
      // Добавляем маркер на карту
      if (this.startPointMarker) {
        map.geoObjects.remove(this.startPointMarker);
      }
      
      this.startPointMarker = new ymaps.Placemark(coords, {
        balloonContent: address,
        iconCaption: pointType === 'start' ? '🎯 Старт' : '🏁 Финиш'
      }, {
        preset: pointType === 'start' ? 'islands#greenDotIcon' : 'islands#redDotIcon',
        draggable: false
      });
      
      map.geoObjects.add(this.startPointMarker);
      
      // Отключаем обработчик
      map.events.remove('click', clickHandler);
      map.options.set('cursor', 'grab');
      
      // Показываем уведомление
      if (this.modalInstance && this.modalInstance.showNotification) {
        this.modalInstance.showNotification(`✅ ${pointType === 'start' ? 'Начальная' : 'Конечная'} точка установлена`, 'success');
      }
    };
    
    // Подписываемся на клик
    map.events.add('click', clickHandler);
    map.options.set('cursor', 'crosshair');
    
    // Уведомление
    if (this.modalInstance && this.modalInstance.showNotification) {
      this.modalInstance.showNotification(`📍 Кликните на карте, чтобы выбрать ${pointType === 'start' ? 'начальную' : 'конечную'} точку`, 'info');
    }
  },

  setupSuggestForElement(element) {
    if (typeof ymaps !== "undefined" && ymaps.suggest) {
      new ymaps.SuggestView(element, { results: 5 });
    }
  },

  async geocodeAddress(address) {
    return new Promise((resolve, reject) => {
      ymaps.geocode(address, { results: 1 }).then(
        (result) => {
          const firstGeoObject = result.geoObjects.get(0);
          if (firstGeoObject) {
            const coords = firstGeoObject.geometry.getCoordinates();
            resolve(coords);
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
      ymaps.geocode(coords, { results: 1 }).then(
        (result) => {
          const firstGeoObject = result.geoObjects.get(0);
          if (firstGeoObject) {
            const address = firstGeoObject.getAddressLine();
            resolve(address);
          } else {
            resolve(`Координаты: ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`);
          }
        },
        (error) => {
          console.error('[RouteModalYandex] Reverse geocode error:', error);
          resolve(`Координаты: ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`);
        }
      );
    });
  }
};
