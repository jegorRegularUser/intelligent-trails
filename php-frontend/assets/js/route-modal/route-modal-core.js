/**
 * Route Modal Core - FIXED & FULL VERSION
 * Preserves all legacy functionality + fixes initialization crashes
 */
class RouteModal {
  constructor() {
    this.modal = null;
    this.currentRouteType = "smart";
    this.waypoints = [];
    this.currentRoute = null;
    this.map = null;
    this.selectedCategories = [];
    this.activities = [];
    this.totalDuration = 0;
    this.draggedElement = null;
    this.editingActivityIndex = null;

    // Ждем загрузки DOM или Ymaps
    if (document.readyState === "loading") {
       document.addEventListener("DOMContentLoaded", () => this.preInit());
    } else {
       this.preInit();
    }
  }

  preInit() {
    if (typeof ymaps !== "undefined" && ymaps.ready) {
      ymaps.ready(() => this.init());
    } else {
      // Fallback если ymaps долго грузится
      this.init();
    }
  }

  init() {
    console.log('[RouteModal] Initializing core...');
    this.createModal();
    this.attachEventListeners();
    console.log('[RouteModal] Initialized');
  }

  createModal() {
    // Проверка наличия шаблонизатора
    if (window.RouteModalTemplate) {
        const modalHTML = window.RouteModalTemplate.getHTML();
        // Проверка чтобы не дублировать модалку
        if (!document.getElementById("routeModal")) {
            document.body.insertAdjacentHTML("beforeend", modalHTML);
        }
        this.modal = document.getElementById("routeModal");
    } else {
        console.error('[RouteModal] Template module not found!');
    }
  }

  attachEventListeners() {
    if (!this.modal) return;

    const closeBtn = document.getElementById("closeModal");
    if (closeBtn) closeBtn.addEventListener("click", () => this.close());

    const cancelBtn = document.getElementById("cancelRoute");
    if (cancelBtn) cancelBtn.addEventListener("click", () => this.close());

    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) this.close();
    });

    document.querySelectorAll(".route-type-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.switchRouteType(e.currentTarget.dataset.type);
      });
    });

    document.querySelectorAll('input[name="routeEnd"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        const endGroup = document.getElementById("smartEndPointGroup");
        if (endGroup) endGroup.style.display = e.target.value === "custom" ? "block" : "none";
      });
    });

    // --- ВАЖНОЕ ИСПРАВЛЕНИЕ: Безопасная инициализация модулей ---
    
    if (window.RouteModalActivities && typeof window.RouteModalActivities.init === 'function') {
        window.RouteModalActivities.init(this);
    } else {
        console.warn('[RouteModal] Activities module missing');
    }

    if (window.RouteModalWaypoints && typeof window.RouteModalWaypoints.init === 'function') {
        window.RouteModalWaypoints.init(this);
    } else {
        console.warn('[RouteModal] Waypoints module missing');
    }

    // Поддержка и старого Builder, и нового RouteBuilder
    if (window.RouteModalBuilder && typeof window.RouteModalBuilder.init === 'function') {
        window.RouteModalBuilder.init(this);
    } else if (window.RouteBuilder && typeof window.RouteBuilder.init === 'function') {
        // Если используется новый билдер, просто инициализируем его
        // Он сам найдет кнопку
    }

    if (window.RouteModalYandex && typeof window.RouteModalYandex.init === 'function') {
        window.RouteModalYandex.init(this);
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const walkModal = document.getElementById('addWalkModal');
        const placeModal = document.getElementById('addPlaceModal');
        
        if (walkModal && walkModal.classList.contains('active') && window.RouteModalActivities) {
          window.RouteModalActivities.closeWalkModal();
        } else if (placeModal && placeModal.classList.contains('active') && window.RouteModalActivities) {
          window.RouteModalActivities.closePlaceModal();
        } else if (this.modal.classList.contains("active")) {
          this.close();
        }
      }
    });
  }

  switchRouteType(type) {
    this.currentRouteType = type;

    document.querySelectorAll(".route-type-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.type === type);
    });

    const smartPanel = document.getElementById("smartRoutePanel");
    const simplePanel = document.getElementById("simpleRoutePanel");
    
    if (smartPanel) smartPanel.classList.toggle("active", type === "smart");
    if (simplePanel) simplePanel.classList.toggle("active", type === "simple");

    const buildBtnText = document.getElementById("buildBtnText");
    if (buildBtnText) {
        buildBtnText.textContent = type === "smart" ? "Построить прогулку" : "Построить маршрут";
    }
  }

  showLoading(show, text = 'Строим оптимальный маршрут...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    
    if (overlay) {
        if (show) {
            overlay.classList.add('active');
            if (loadingText && text) loadingText.textContent = text;
        } else {
            overlay.classList.remove('active');
        }
    }
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    if (message.length > 150 || message.split('\n').length > 4) {
      notification.classList.add('long');
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 10);

    const duration = message.length > 150 ? 7000 : 5000;
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 400);
    }, duration);
  }

  open() {
    if (this.modal) {
        this.modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }
  }

  close() {
    if (this.modal) {
        this.modal.classList.remove("active");
        document.body.style.overflow = "";
        this.resetForm();
    }
  }

  resetForm() {
    const idsToClear = ["smartStartPoint", "smartEndPoint", "simpleStartPoint", "simpleEndPoint"];
    idsToClear.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    const waypointsContainer = document.getElementById("simpleWaypointsContainer");
    if (waypointsContainer) waypointsContainer.innerHTML = "";

    this.waypoints = [];
    this.activities = [];
    this.totalDuration = 0;
    
    if (window.RouteModalActivities) {
        window.RouteModalActivities.updateTimeline(this);
    }
    
    const returnRadio = document.querySelector('input[name="routeEnd"][value="return"]');
    if (returnRadio) returnRadio.checked = true;

    const autoRadio = document.querySelector('input[name="simpleTransport"][value="auto"]');
    if (autoRadio) autoRadio.checked = true;

    const endGroup = document.getElementById("smartEndPointGroup");
    if (endGroup) endGroup.style.display = "none";
  }

  setMap(mapInstance) {
    this.map = mapInstance;
  }
}

// Инициализация
window.routeModal = new RouteModal();
