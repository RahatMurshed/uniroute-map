import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Remove splash screen once React renders
const removeSplash = () => {
  const splash = document.getElementById("splash-screen");
  if (splash) {
    splash.classList.add("fade-out");
    setTimeout(() => splash.remove(), 400);
  }
};

createRoot(document.getElementById("root")!).render(<App />);

// Remove splash after first paint
if (document.readyState === "complete") {
  removeSplash();
} else {
  window.addEventListener("load", removeSplash);
}

// Register service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
