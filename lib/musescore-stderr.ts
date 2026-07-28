const IGNORED_MUSESCORE_STDERR_PATTERNS = [
  /^qt\.qml\.typeregistration: Invalid QML element name /,
  /^\[\d+:\d+:[^\]]+:WARNING mach_o_image_annotations_reader\.cc:\d+\] unexpected crash info version\b/,
  /^\/(?:usr\/)?lib64\/(?:pipewire-0\.3\/jack\/)?lib(?:jack|nss3|OpenGL|wayland-client|pipewire-0\.3)\.so(?:\.\d+)*$/,
  /^\/home\/jarvis\/\.local\/lib\/musescore-deps\/usr\/lib64\/libOpenGL\.so\.0$/,
];

export function cleanMuseScoreStderr(stderr: string, options: { maxLines?: number } = {}) {
  const maxLines = options.maxLines ?? 6;
  const lines = stderr
    .split(/\r?\n/)
    .flatMap((line) => line.split(/(?=qt\.qml\.typeregistration: Invalid QML element name )/))
    .flatMap((line) => line.split(/(?=\[\d+:\d+:[^\]]+:WARNING mach_o_image_annotations_reader\.cc:\d+\])/))
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !IGNORED_MUSESCORE_STDERR_PATTERNS.some((pattern) => pattern.test(line)));

  const visible = lines.slice(0, maxLines);
  const hiddenCount = lines.length - visible.length;
  return `${visible.join('\n')}${hiddenCount > 0 ? `\n... ${hiddenCount} more line${hiddenCount === 1 ? '' : 's'} hidden` : ''}`;
}
