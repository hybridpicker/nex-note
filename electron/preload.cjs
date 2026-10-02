const { contextBridge, ipcRenderer } = require('electron');

const validMenuCommandPattern = /^(file|edit|view|help):[A-Za-z0-9]+$/;

function markElectronDocument() {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.classList.add('nex-note-electron');
  // Linux hides the native menu bar (tiling WM), so the in-app menus must stay visible.
  if (process.platform === 'linux') document.documentElement.classList.add('nex-note-linux');
}

markElectronDocument();
globalThis.addEventListener?.('DOMContentLoaded', markElectronDocument);

function isOpenFilePayload(payload) {
  return Boolean(payload)
    && typeof payload.name === 'string'
    && typeof payload.base64 === 'string'
    && (typeof payload.type === 'string' || typeof payload.type === 'undefined');
}

function isOpenFileBatchPayload(payload) {
  return Boolean(payload)
    && Array.isArray(payload.files)
    && payload.files.length > 0
    && (typeof payload.name === 'string' || typeof payload.name === 'undefined')
    && payload.files.every(isOpenFilePayload);
}

contextBridge.exposeInMainWorld('nexNoteElectron', {
  isElectron: true,
  onMenuCommand(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, commandId) => {
      if (typeof commandId === 'string' && validMenuCommandPattern.test(commandId)) {
        callback(commandId);
      }
    };
    ipcRenderer.on('nex-note:menu-command', listener);
    return () => ipcRenderer.removeListener('nex-note:menu-command', listener);
  },
  onOpenFile(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => {
      if (isOpenFilePayload(payload) || isOpenFileBatchPayload(payload)) {
        callback(payload);
      }
    };
    ipcRenderer.on('nex-note:open-file', listener);
    ipcRenderer.send('nex-note:open-file-ready');
    return () => ipcRenderer.removeListener('nex-note:open-file', listener);
  },
  openFileDialog() {
    return ipcRenderer.invoke('nex-note:open-file-dialog');
  },
  listUserTemplates() {
    return ipcRenderer.invoke('nex-note:list-user-templates');
  },
  readUserTemplateSample(payload) {
    return ipcRenderer.invoke('nex-note:read-user-template-sample', payload);
  },
  exportPdf(suggestedName) {
    return ipcRenderer.invoke('nex-note:export-pdf', { suggestedName: String(suggestedName || 'score') });
  },
  performNativeEditCommand(command) {
    return ipcRenderer.invoke('nex-note:native-edit-command', command);
  },
  updateMenuState(state) {
    if (!state || typeof state !== 'object') return;
    ipcRenderer.send('nex-note:update-menu-state', {
      hasScore: Boolean(state.hasScore),
      hasCoreDocument: Boolean(state.hasCoreDocument),
      canUndo: Boolean(state.canUndo),
      canRedo: Boolean(state.canRedo),
      hasSelection: Boolean(state.hasSelection),
      activeViewMode: typeof state.activeViewMode === 'string' ? state.activeViewMode : undefined,
      printView: Boolean(state.printView),
    });
  },
});
