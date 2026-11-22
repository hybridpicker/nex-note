/**
 * Removes API keys from text before it is logged or returned to a client. Known key values are
 * replaced verbatim; common provider key shapes are masked as a second layer.
 */

const KEY_SHAPES: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{8,}/g,
  /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{16,}/g,
  /\bAIza[0-9A-Za-z_-]{20,}/g,
  /\b(?:Bearer|x-api-key:?|x-goog-api-key:?)\s+[A-Za-z0-9._-]{12,}/gi,
  /([?&](?:key|api_key|apikey)=)[^&\s"']+/gi,
];

export const REDACTED = '[redacted]';

export function redactSecrets(text: string, secrets: Array<string | undefined | null> = []) {
  let output = String(text ?? '');
  for (const secret of secrets) {
    const value = secret?.trim();
    if (value && value.length >= 6) output = output.split(value).join(REDACTED);
  }
  for (const shape of KEY_SHAPES) {
    output = output.replace(shape, (match, prefix?: string) => (
      typeof prefix === 'string' && match.startsWith(prefix) ? `${prefix}${REDACTED}` : REDACTED
    ));
  }
  return output;
}
