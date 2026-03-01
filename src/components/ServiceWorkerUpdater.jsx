import { useEffect } from "react";

/**
 * ServiceWorkerUpdater
 *
 * Registers /sw.js and watches for version updates.
 * When a new SW becomes active (controllerchange), the page reloads
 * automatically so users always run the latest version without
 * needing to manually clear cache.
 */
export default function ServiceWorkerUpdater() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloading = false;

    // Reload once when the SW controller changes (new SW took over)
    const handleControllerChange = () => {
      if (reloading) return;
      reloading = true;
      console.log("🔄 New SW active — reloading for latest version");
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );

    // Register the service worker
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("✅ SW registered:", registration.scope);

        // If a new SW is already waiting (page was open during deploy), activate it
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        // Watch for future updates found while page is open
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New SW installed and waiting — trigger immediate activation
              console.log("🆕 New SW version found — activating immediately");
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((err) => {
        console.warn("SW registration failed:", err);
      });

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
    };
  }, []);

  return null;
}
