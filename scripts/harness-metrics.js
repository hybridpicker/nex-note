#!/usr/bin/env node

(async () => {
  try {
    const { main } = await import('./harness-metrics-core.mjs');
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
})();
