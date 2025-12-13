window.RouteModalYandex = {
  modalInstance: null,
  startPointMarker: null,
  lastGeocodedAddress: {},

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
    
    // ТОЛЬКО при потере фокуса - чтобы дождаться выбора из подсказки!
    input.addEventListener('blur', async () => {
      // Задержка 300мс чтобы подсказка Яндекса успела применить выбор
      setTimeout(async () => {
        await this.handleInputChange(input, inputId);
      }, 300);
    });
    
    // Геокодирование при нажатии Enter
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Небольшая задержка на случай если подсказка еще применяется
        setTimeout(async () => {
          await this.handleInputChange(input, inputId);
        }, 100);
      }
    });
    
    // Очистка координат при начале ввода
    input.addEventListener('input', () => {
      const currentValue = input.value.trim();
      const lastGeocoded = this.lastGeocodedAddress[inputId];
      
      // Если текст изменился - удаляем старые координаты
      if (currentValue !== lastGeocoded) {
        delete input.dataset.coords;
        input.style.borderColor = '';
        input.title = '';
        console.log(`[RouteModalYandex] Cleared coords for ${inputId} (text changed)`);
      }
    });
  },

  async handleInputChange(input, inputId) {
    const address = input.value.trim();
    
    console.log(`[RouteModalYandex] handleInputChange for ${inputId}: "${address}"`);
    
    if (!address) {
      delete input.dataset.coords;
      delete this.lastGeocodedAddress[inputId];
      input.style.borderColor = '';
      input.title = '';
      return;
    }
    
    // Проверяем, нужно ли геокодировать
    const lastGeocoded = this.lastGeocodedAddress[inputId];
    if (address === lastGeocoded && input.dataset.coords) {
      console.log(`[RouteModalYandex] Skipping geocoding for ${inputId} - already geocoded this address`);
      return;
    }
    
    // Геокодируем
    try {
      console.log(`[RouteModalYandex] Geocoding ${inputId}: "${address}"`);
      
      const coords = await this.geocodeAddress(address);
      
      if (coords) {
        input.dataset.coords = coords.join(',');
        this.lastGeocodedAddress[inputId] = address;
        
        console.log(`[RouteModalYandex] ✓ Geocoded ${inputId}: "${address}" -> [lat,lon] = ${coords}`);
        console.log(`[RouteModalYandex] ✓ Saved to dataset.coords: "${input.dataset.coords}"`);
        
        if (inputId.includes('Start') || inputId.includes('End')) {
          input.style.borderColor = '#4CAF50';
          input.title = `Координаты: ${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`;
        }
      }
    } catch (error) {
      console.error(`[RouteModalYandex] ✗ Failed to geocode ${inputId}:`, error);
      input.style.borderColor = '#FF5722';
      input.title = 'Ошибка геокодирования';
    }
  },

  setupMapClickHandler() {
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

  enableMapPicker(pointType) {
    console.log(`[RouteModalYandex] Enabling map picker for ${pointType} point`);
    
    if (!window.MapCore || !window.MapCore.map) {
      alert('Карта ещё не загрузилась');
      return;
    }
    
    const map = window.MapCore.map;
    
    const clickHandler = async (e) => {
      const coords = e.get('coords');
      console.log(`[RouteModalYandex] Map clicked at: [lat,lon] = ${coords}`);
      
      const address = await this.reverseGeocode(coords);
      
      const inputId = pointType === 'start' ? 'smartStartPoint' : 'smartEndPoint';
      const input = document.getElementById(inputId);
      
      if (input) {
        input.value = address;
        input.dataset.coords = coords.join(',');
        this.lastGeocodedAddress[inputId] = address;
        input.style.borderColor = '#4CAF50';
        input.title = `Координаты: ${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`;
        
        console.log(`[RouteModalYandex] ${inputId} set to: ${address}, coords: ${coords}`);
      }
      
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
      
      map.events.remove('click', clickHandler);
      map.options.set('cursor', 'grab');
      
      if (this.modalInstance && this.modalInstance.showNotification) {
        this.modalInstance.showNotification(`${pointType === 'start' ? 'Начальная' : 'Конечная'} точка установлена`, 'success');
      }
    };
    
    map.events.add('click', clickHandler);
    map.options.set('cursor', 'crosshair');
    
    if (this.modalInstance && this.modalInstance.showNotification) {
      this.modalInstance.showNotification(`Кликните на карте, чтобы выбрать ${pointType === 'start' ? 'начальную' : 'конечную'} точку`, 'info');
    }
  },

  setupSuggestForElement(element) {
    if (typeof ymaps !== "undefined" && ymaps.suggest) {
      new ymaps.SuggestView(element, { results: 5 });
    }
  },

  async geocodeAddress(address) {
    return new Promise((resolve, reject) => {
      if (typeof ymaps === 'undefined') {
        reject(new Error('Yandex Maps not loaded'));
        return;
      }
      
      ymaps.geocode(address, { results: 1 }).then(
        (result) => {
          const firstGeoObject = result.geoObjects.get(0);
          if (firstGeoObject) {
            const coords = firstGeoObject.geometry.getCoordinates();
            console.log(`[RouteModalYandex] Yandex returned coords for "${address}":`, coords);
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
