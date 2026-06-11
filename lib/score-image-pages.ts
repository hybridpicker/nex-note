export const SCORE_IMAGE_FILENAME_PATTERN = /\.(png|jpe?g|tiff?|webp|bmp|heic|heif)$/i;
export const PDF_EMBEDDABLE_SCORE_IMAGE_FILENAME_PATTERN = /\.(png|jpe?g)$/i;

const naturalFilenameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export function isScoreImageFilename(name: string) {
  return SCORE_IMAGE_FILENAME_PATTERN.test(name);
}

export function isPdfEmbeddableScoreImageFilename(name: string) {
  return PDF_EMBEDDABLE_SCORE_IMAGE_FILENAME_PATTERN.test(name);
}

export function sortScoreImagePages<T extends { name: string }>(files: readonly T[]) {
  return [...files].sort((a, b) => naturalFilenameCollator.compare(a.name, b.name));
}

function basenameWithoutExtension(name: string) {
  return name.replace(/\.[^.]+$/, '');
}

function sanitizeBatchBaseName(name: string) {
  return name
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildScoreImageBatchBaseName(files: readonly { name: string }[], fallback = 'image-pages') {
  const first = sortScoreImagePages(files)[0]?.name;
  if (!first) return fallback;
  const base = sanitizeBatchBaseName(basenameWithoutExtension(first));
  return base ? `${base}-${files.length}-pages` : fallback;
}
