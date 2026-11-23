import path from 'node:path';

/**
 * Resolve the Vite-built web app directory for the Electron shell.
 *
 * Packaged: extraResources → `resources/web`
 * Dev / unpackaged: sibling `apps/web/dist` (must be built with SPLOT_DESKTOP=1)
 *
 * @param {{
 *   isPackaged: boolean,
 *   desktopDir: string,
 *   resourcesPath: string,
 * }} opts
 * @returns {string}
 */
export function resolveWebRoot(opts) {
  if (opts.isPackaged) {
    return path.join(opts.resourcesPath, 'web');
  }
  return path.join(opts.desktopDir, '..', 'web', 'dist');
}

/**
 * @param {string} webRoot
 * @returns {string}
 */
export function resolveWebIndex(webRoot) {
  return path.join(webRoot, 'index.html');
}
