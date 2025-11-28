window.GlobalTransportSwitcher = {
  init(modal) {
    const switcher = document.getElementById("globalTransportSwitcher");
    switcher.innerHTML = `
      <select id="globalTransportMode">
        <option value="pedestrian">🚶 Пешком</option>
        <option value="bicycle">🚴 Велосипед</option>
        <option value="auto">🚗 Авто</option>
        <option value="masstransit">🚌 Транспорт</option>
      </select>
    `;
    document.getElementById("globalTransportMode").addEventListener("change", (e) => {
      modal.activities.forEach(act => act.transport_mode = e.target.value);
      window.RouteModalActivities.updateTimeline(modal);
    });
  }
};
