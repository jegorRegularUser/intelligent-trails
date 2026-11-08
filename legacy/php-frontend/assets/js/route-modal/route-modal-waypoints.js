/**
 * Управление промежуточными точками для простого маршрута
 */
window.RouteModalWaypoints = {
  modalInstance: null,

  init(modal) {
    this.modalInstance = modal;
    this.attachEventListeners();
  },

  attachEventListeners() {
    document.getElementById("addSimpleWaypoint").addEventListener("click", () => this.addWaypoint());
  },

  addWaypoint() {
    const waypointIndex = this.modalInstance.waypoints.length;
    const waypointHTML = `
      <div class="input-group waypoint-group" data-index="${waypointIndex}">
        <label>
          <span class="point-icon waypoint-icon">${waypointIndex + 1}</span>
          Промежуточная точка ${waypointIndex + 1}
        </label>
        <div class="waypoint-input-wrapper">
          <input type="text" class="location-input waypoint-input" 
                 placeholder="Адрес промежуточной точки"
                 data-index="${waypointIndex}" autocomplete="off" />
          <button class="remove-waypoint-btn" data-index="${waypointIndex}">&times;</button>
        </div>
      </div>
    `;

    document.getElementById("simpleWaypointsContainer").insertAdjacentHTML("beforeend", waypointHTML);
    this.modalInstance.waypoints.push("");

    document.querySelector(`.remove-waypoint-btn[data-index="${waypointIndex}"]`)
      .addEventListener("click", (e) => {
        this.removeWaypoint(parseInt(e.target.dataset.index));
      });

    const waypointInput = document.querySelector(`.waypoint-input[data-index="${waypointIndex}"]`);
    window.RouteModalYandex.setupSuggestForElement(waypointInput);
  },

  removeWaypoint(index) {
    const waypointGroup = document.querySelector(`.waypoint-group[data-index="${index}"]`);
    if (waypointGroup) {
      waypointGroup.remove();
      this.modalInstance.waypoints[index] = null;
    }
  }
};
