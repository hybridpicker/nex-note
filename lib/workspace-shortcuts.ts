export type WorkspaceShortcut = 'show-shortcuts' | 'toggle-inspector' | 'toggle-palette';

export interface WorkspaceShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isTextEntry: boolean;
}

/**
 * Workspace-level keys that need no modifier and never collide with note input:
 * `?` and F1 open the shortcut cheat sheet, F8 toggles the inspector, F9 the palette
 * (same F-keys as MuseScore). Bare F-keys are not bound by the Omarchy Hyprland defaults.
 */
export function resolveWorkspaceShortcut(event: WorkspaceShortcutEvent): WorkspaceShortcut | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.key === 'F1') return event.shiftKey ? null : 'show-shortcuts';
  if (event.key === 'F8') return event.shiftKey ? null : 'toggle-inspector';
  if (event.key === 'F9') return event.shiftKey ? null : 'toggle-palette';
  if (event.key === '?' && !event.isTextEntry) return 'show-shortcuts';
  return null;
}
