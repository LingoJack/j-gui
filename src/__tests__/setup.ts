import "@testing-library/jest-dom/vitest";

// Polyfill ResizeObserver for jsdom (used by ScrollMinimap)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
