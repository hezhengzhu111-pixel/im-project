import type { afterEach as vitestAfterEach } from 'vitest';

declare global {
  const afterEach: typeof vitestAfterEach;
}

export {};
