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
    
    if (typeof ymaps !== "undefined" && ymaps.ready) {
      ymaps.ready(() => this.init());
    } else {
      window.addEventListener("load", () => {
        if (typeof ymaps !== "undefined") {
          ymaps.ready(() => this.init());
        } else {
          this.init();
        }
      });
    }
  }

  init() {
    this.createModal();
    this.attachEventListeners();
  }

  createModal() {
    const modalHTML = window.RouteModalTemplate.getHTML();
    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.modal = document.getElementById("routeModal");
  }

  attachEventListeners() {
    document.getElementById("closeModal").addEventListener("click", () => this.close());
    document.getElementById("cancelRoute").addEventListener("click", () => this.close());

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
        endGroup.style.display = e.target.value === "custom" ? "block" : "none";
      });
    });

    window.RouteModalActivities.init(this);
    window.RouteModalWaypoints.init(this);
    window.RouteModalBuilder.init(this);
    window.RouteModalYandex.init(this);

    const globalTransportSelect = document.getElementById('globalTransportMode');
    if (globalTransportSelect) {
      globalTransportSelect.addEventListener('change', (e) => {
        const newMode = e.target.value;
        this.activities.forEach(activity => {
          if (activity.transport_mode) {
            activity.transport_mode = newMode;
          }
        });
        window.RouteModalActivities.updateTimeline(this);
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (document.getElementById('addWalkModal').classList.contains('active')) {
          window.RouteModalActivities.closeWalkModal();
        } else if (document.getElementById('addPlaceModal').classList.contains('active')) {
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

    document.getElementById("smartRoutePanel").classList.toggle("active", type === "smart");
    document.getElementById("simpleRoutePanel").classList.toggle("active", type === "simple");

    const btnText = type === "smart" ? "Построить прогулку" : "Построить маршрут";
    document.getElementById("buildBtnText").textContent = btnText;
  }

  showLoading(show, text = 'Строим оптимальный маршрут...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    
    if (show) {
      overlay.classList.add('active');
      if (text) loadingText.textContent = text;
    } else {
      overlay.classList.remove('active');
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
    this.modal.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  close() {
    this.modal.classList.remove("active");
    document.body.style.overflow = "";
    this.resetForm();
  }

  resetForm() {
    document.getElementById("smartStartPoint").value = "";
    document.getElementById("smartEndPoint").value = "";
    document.getElementById("simpleStartPoint").value = "";
    document.getElementById("simpleEndPoint").value = "";
    document.getElementById("simpleWaypointsContainer").innerHTML = "";
    this.waypoints = [];
    this.activities = [];
    this.totalDuration = 0;
    window.RouteModalActivities.updateTimeline(this);
    
    document.querySelector('input[name="routeEnd"][value="return"]').checked = true;
    document.querySelector('input[name="simpleTransport"][value="auto"]').checked = true;
    document.getElementById("smartEndPointGroup").style.display = "none";
  }

  setMap(mapInstance) {
    this.map = mapInstance;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.routeModal = new RouteModal();
  });
} else {
  window.routeModal = new RouteModal();
}
