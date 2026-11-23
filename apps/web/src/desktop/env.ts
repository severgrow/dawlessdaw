/**
 * True when running inside the Electron desktop shell (preload exposes splotDesktop).
 */
export function isSplotDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  const flag = (window as Window & { splotDesktop?: { isDesktop?: boolean } }).splotDesktop;
  return flag?.isDesktop === true;
}
