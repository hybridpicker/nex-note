function isMacPlatform(platform: string | undefined) {
  return /\b(Mac|iPhone|iPad|iPod)/i.test(platform ?? '');
}

function browserPlatform() {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.platform;
}

export function formatShortcutHint(shortcut: string, platform = browserPlatform()) {
  const commandLabel = isMacPlatform(platform) ? 'Cmd' : 'Ctrl';
  const optionLabel = isMacPlatform(platform) ? 'Option' : 'Alt';

  return shortcut
    .replace(/\bCmd\/Ctrl\b/g, commandLabel)
    .replace(/\bCtrl\/Cmd\b/g, commandLabel)
    .replace(/\bCmd\b/g, commandLabel)
    .replace(/\bOption\/Alt\b/g, optionLabel)
    .replace(/\bAlt\/Option\b/g, optionLabel)
    .replace(/\bOption\b/g, optionLabel);
}
