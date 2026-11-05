import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import "./mobile.css";
import { MobileApp } from "./MobileApp";
import { ErrorBoundary } from "./ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <MobileApp />
    </ErrorBoundary>
  </StrictMode>,
);

// Native MainActivity uses this flag to distinguish a live WebView from a
// renderer that was killed while playback continued in the background.
requestAnimationFrame(() => {
  (window as Window & { __ariaWebReady?: boolean }).__ariaWebReady = true;
});
