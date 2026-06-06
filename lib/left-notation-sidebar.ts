export const LEFT_NOTATION_SIDEBAR_STORAGE_KEY = 'nex-note:left-notation-sidebar-collapsed';

export function parseLeftNotationSidebarCollapsed(value: string | null | undefined) {
  return value === 'true';
}

export function readLeftNotationSidebarCollapsed() {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage?.getItem(LEFT_NOTATION_SIDEBAR_STORAGE_KEY);
  return stored == null ? true : parseLeftNotationSidebarCollapsed(stored);
}

export function writeLeftNotationSidebarCollapsed(collapsed: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage?.setItem(LEFT_NOTATION_SIDEBAR_STORAGE_KEY, String(collapsed));
}
