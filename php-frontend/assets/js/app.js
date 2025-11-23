import { RouteModal } from "./modals/RouteModal.js";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

function initApp() {
  const routeModal = new RouteModal();
  routeModal.onReady = () => {
    document
      .getElementById("openRouteModal")
      .addEventListener("click", () => routeModal.open());
  };
}

// Export for potential external use
export { initApp };
