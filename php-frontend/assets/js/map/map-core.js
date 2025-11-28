fetch('https://intelligent-trails.onrender.com/status').catch(()=>{}) // Запуск бэкенда

/**
 * MapCore - НОВАЯ АРХИТЕКТУРА
 * Инициализация карты с новыми модулями
 */
window.MapCore = {
  map: null,
  currentRouteLines: [],
  routeMarkers: [],
  currentWalkData: null,
  
  // Экземпляры новых модулей
  mapSmartWalk: null,
  mapPlaceMarkers: null,

  init() {
    console.log('[MapCore] Initializing...');
    
    // Создать карту
    this.map = new ymaps.Map("map", {
      center: [55.751574, 37.573856],
      zoom: 12,
      controls: ['zoomControl', 'fullscreenControl', 'geolocationControl']
    });

    console.log('[MapCore] Map created');

    // Инициализировать модули
    this.initializeModules();
    
    // Подключить события
    this.attachEventListeners();
    
    console.log('[MapCore] Initialization complete');
  },

  initializeModules() {
    console.log('[MapCore] Initializing modules...');
    
    // НОВАЯ АРХИТЕКТУРА - создаем экземпляры классов
    if (window.MapPlaceMarkers) {
      this.mapPlaceMarkers = new window.MapPlaceMarkers(this.map);
      window.MapPlaceMarkersInstance = this.mapPlaceMarkers;
      console.log('[MapCore] ✅ MapPlaceMarkers initialized');
    }
    
    if (window.MapSmartWalk) {
      this.mapSmartWalk = new window.MapSmartWalk(this.map);
      window.MapSmartWalkInstance = this.mapSmartWalk;
      console.log('[MapCore] ✅ MapSmartWalk initialized');
    }
    
    // СТАРЫЕ МОДУЛИ (если есть)
    if (window.MapSimpleRoute && typeof window.MapSimpleRoute.init === 'function') {
      window.MapSimpleRoute.init(this);
      console.log('[MapCore] ✅ MapSimpleRoute initialized (legacy)');
    }
    
    if (window.MapVariants && typeof window.MapVariants.init === 'function') {
      window.MapVariants.init(this);
      console.log('[MapCore] ✅ MapVariants initialized (legacy)');
    }
    
    // Передать карту в модальное окно
    if (window.routeModal) {
      window.routeModal.setMap(this.map);
      console.log('[MapCore] ✅ RouteModal linked');
    }
    
    // Уведомить что карта готова
    if (window.EventBus) {
      window.EventBus.emit('map:ready', this.map);
      console.log('[MapCore] ✅ Event map:ready emitted');
    }
  },

  attachEventListeners() {
    console.log('[MapCore] Attaching event listeners...');
    
    // Открытие модального окна маршрута
    const openBtn = document.getElementById('openRouteModal');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        if (window.routeModal) {
          window.routeModal.open();
        }
      });
    }

    // Закрытие информационной панели
    const closeBtn = document.getElementById('closeRouteInfo');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const panel = document.getElementById('routeInfoPanel');
        if (panel) {
          panel.style.display = 'none';
        }
      });
    }
  },

  clearMap() {
    console.log('[MapCore] Clearing map...');
    
    this.currentRouteLines.forEach(line => this.map.geoObjects.remove(line));
    this.currentRouteLines = [];

    this.routeMarkers.forEach(marker => this.map.geoObjects.remove(marker));
    this.routeMarkers = [];
    
    console.log('[MapCore] Map cleared');
  },

  getMap() {
    return this.map;
  }
};

// Автоматическая инициализация при загрузке Yandex Maps
ymaps.ready(() => {
  console.log('[MapCore] Yandex Maps ready, starting init...');
  window.MapCore.init();
});

console.log('[MapCore] Module loaded');
