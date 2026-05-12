// Bridge: lets renderer code import a typed API instead of poking window.toolbox.

import type { ToolboxAPI } from '../../../preload/index';

declare global {
  interface Window {
    toolbox: ToolboxAPI;
  }
}

export const api = window.toolbox;
