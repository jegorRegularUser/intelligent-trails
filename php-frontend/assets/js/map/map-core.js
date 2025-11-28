/**
 * Основная инициализация карты Yandex Maps
 * Хранение глобальных переменных карты
 */
window.MapCore = {
  map: null,
  currentRouteLines: [],
  routeMarkers: [],
  currentWalkData: null,

  init() {
    this.map = new ymaps.Map("map", {
      center: [55.751574, 37.573856],
      zoom: 12,
      controls: ['zoomControl', 'fullscreenControl', 'geolocationControl']
    });

    this.attachEventListeners();
    this.initializeModules();
  },

  attachEventListeners() {
    // Открытие модального окна маршрута
    document.getElementById('openRouteModal').addEventListener('click', () => {
      if (window.routeModal) {
        window.routeModal.open();
      }
    });

    // Закрытие информационной панели
    document.getElementById('closeRouteInfo').addEventListener('click', () => {
      document.getElementById('routeInfoPanel').style.display = 'none';
    });
  },

  initializeModules() {
    // Инициализируем связанные модули
    window.MapSmartWalk.init(this);
    window.MapSimpleRoute.init(this);
    window.MapVariants.init(this);
    
    // Передаем карту в модальное окно
    if (window.routeModal) {
      window.routeModal.setMap(this.map);
    }
  },

  clearMap() {
    this.currentRouteLines.forEach(line => this.map.geoObjects.remove(line));
    this.currentRouteLines = [];

    this.routeMarkers.forEach(marker => this.map.geoObjects.remove(marker));
    this.routeMarkers = [];
  },

  getMap() {
    return this.map;
  }
};

// Инициализация при загрузке Yandex Maps
ymaps.ready(() => {
  window.MapCore.init();
});
