import { vi } from "vitest";

Object.defineProperty(window, "scrollTo", { value: vi.fn(), writable: true });

vi.mock("nprogress", () => ({
  default: {
    configure: vi.fn(),
    start: vi.fn(),
    done: vi.fn(),
  },
}));

vi.mock("nprogress/nprogress.css", () => ({}));

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}
