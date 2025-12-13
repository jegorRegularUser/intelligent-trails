fetch('https://intelligent-trails.onrender.com/status').catch(()=>{})

window.MapCore = {
  map: null,
  currentRouteLines: [],
  routeMarkers: [],
  currentWalkData: null,
  
  mapSmartWalk: null,
  mapPlaceMarkers: null,
  mapRouteBuilder: null,

  init() {
    console.log('[MapCore] Initializing...');
    
    this.map = new ymaps.Map("map", {
      center: [55.751574, 37.573856],
      zoom: 12,
      controls: ['zoomControl', 'fullscreenControl', 'geolocationControl']
    });

    console.log('[MapCore] Map created');

    this.initializeModules();
    
    this.attachEventListeners();
    
    // УДАЛЕНО: this.checkForRouteToLoad(); - теперь это делает route-loader.js
    
    console.log('[MapCore] Initialization complete');
  },

  initializeModules() {
    console.log('[MapCore] Initializing modules...');
    
    if (window.MapPlaceMarkers) {
      this.mapPlaceMarkers = new window.MapPlaceMarkers(this.map);
      window.MapPlaceMarkersInstance = this.mapPlaceMarkers;
      console.log('[MapCore] MapPlaceMarkers initialized');
    }
    
    if (window.MapSmartWalk) {
      this.mapSmartWalk = new window.MapSmartWalk(this.map);
      window.MapSmartWalkInstance = this.mapSmartWalk;
      console.log('[MapCore] MapSmartWalk initialized');
    }
    
    if (window.MapRouteBuilder) {
      this.mapRouteBuilder = window.MapRouteBuilder;
      this.mapRouteBuilder.init(this.map);
      console.log('[MapCore] MapRouteBuilder initialized');
    }
    
    if (window.MapSimpleRoute && typeof window.MapSimpleRoute.init === 'function') {
      window.MapSimpleRoute.init(this);
      console.log('[MapCore] MapSimpleRoute initialized');
    }
    
    if (window.MapVariants && typeof window.MapVariants.init === 'function') {
      window.MapVariants.init(this);
      console.log('[MapCore] MapVariants initialized');
    }
    
    if (window.routeModal) {
      window.routeModal.setMap(this.map);
      console.log('[MapCore] RouteModal linked');
    }
    
    if (window.EventBus) {
      window.EventBus.emit('map:ready', this.map);
      console.log('[MapCore] Event map:ready emitted');
    }
  },

  attachEventListeners() {
    console.log('[MapCore] Attaching event listeners...');
    
    const openBtn = document.getElementById('openRouteModal');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        if (window.routeModal) {
          window.routeModal.open();
        }
      });
    }

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

ymaps.ready(() => {
  console.log('[MapCore] Yandex Maps ready, starting init...');
  window.MapCore.init();
});

console.log('[MapCore] Module loaded');
