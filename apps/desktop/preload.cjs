/**
 * Minimal preload — contextIsolation on, no Node in the renderer.
 * Reserved for future update-status IPC; auto-update runs in main today.
 */
'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('splotDesktop', {
  isDesktop: true,
  platform: process.platform,
});
