const warnedShims = new Set<string>();

export function warnCompatibilityShim(name: string) {
  if (process.env.NODE_ENV === 'production' || warnedShims.has(name)) return;
  warnedShims.add(name);
  // eslint-disable-next-line no-console
  console.warn(
    `[nex-note:compat] ${name} is a compatibility shim over the core command pipeline. Prefer applyDocumentCommands or useScoreDocument for new work.`,
  );
}
