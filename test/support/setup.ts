// Loaded before every test file (vite.config.ts → test.setupFiles).
import { afterEach } from 'vitest';

// happy-dom lacks a few browser APIs that some puzzles touch; stub them so games can mount.
const g = globalThis as Record<string, unknown>;
g['ResizeObserver'] ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
g['matchMedia'] ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

// happy-dom caches every querySelector result behind a WeakRef, and V8 keeps WeakRef targets alive
// until the current job ends. Synchronous tests run back to back without ending it, so every board ever
// queried stays in memory (the resume suite reached 4 GB). Yielding a macrotask after each test frees them.
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
