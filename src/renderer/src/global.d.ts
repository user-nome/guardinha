/// <reference types="vite/client" />

import type { ElectronApi } from '@zero/types';

declare global {
  interface Window {
    api: ElectronApi;
  }
}

export {};
