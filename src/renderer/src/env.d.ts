/// <reference types="vite/client" />

import type { LabApi } from '@shared/types';

declare global {
  interface Window {
    lab: LabApi;
  }
}

export {};
