const CHAT_PANEL_SELECTOR = '[data-chat-panel="true"]';

export type NativeEditCommand = 'cut' | 'copy' | 'paste';

function isElement(value: unknown): value is Element {
  return typeof Element !== 'undefined' && value instanceof Element;
}

function elementFromTarget(target: EventTarget | null | undefined): Element | null {
  if (!target) return null;
  if (isElement(target)) return target;
  const parentElement = (target as { parentElement?: unknown }).parentElement;
  return isElement(parentElement) ? parentElement : null;
}

function isEditableElement(element: Element | null) {
  if (!element) return false;
  if (element instanceof HTMLInputElement) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  return Boolean((element as HTMLElement).isContentEditable || element.closest('[contenteditable="true"]'));
}

function selectionHasVisibleText(selection: Selection | null) {
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim().length > 0);
}

export function shouldUseNativeClipboardShortcut(target: EventTarget | null | undefined) {
  const element = elementFromTarget(target);
  if (isEditableElement(element)) return true;
  if (element?.closest(CHAT_PANEL_SELECTOR)) return true;

  const selection = typeof window !== 'undefined' ? window.getSelection() : null;
  return selectionHasVisibleText(selection);
}

export function shouldUseNativeMenuClipboardCommand() {
  if (typeof document === 'undefined') return false;
  return shouldUseNativeClipboardShortcut(document.activeElement);
}
