'use client';

import type { TestCase } from '@/lib/benchmark-suite';

export interface BenchmarkResult {
  provider: string;
  model: string;
  modelLabel?: string;
  text: string;
  latencyMs: number;
  error?: string;
  editedXml: string | null;
  explanation: string;
  xmlValid: boolean;
  operations?: Array<{ type?: string; op?: string; [key: string]: unknown }> | null;
  workflow?: string | null;
  score?: number;
  passed?: boolean;
  reasons?: string[];
  commandTypes?: string[];
}

export interface SuiteResult {
  testCase: TestCase;
  providerResults: BenchmarkResult[];
}

export interface OllamaSuiteRow {
  testCase: TestCase;
  modelResults: BenchmarkResult[];
}

// ─── constants ───────────────────────────────────────────────────────────────

const PROVIDERS = ['ollama', 'claude', 'gemini'] as const;

const PROVIDER_BADGE: Record<string, string> = {
  ollama: 'bg-violet-100 text-violet-700',
  claude: 'bg-orange-100 text-orange-700',
  gemini: 'bg-blue-100 text-blue-700',
};

// ─── skeleton / helpers ───────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="border border-gray-100 rounded-2xl p-5 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-5 bg-gray-100 rounded-full w-20" />
        <div className="h-4 bg-gray-100 rounded w-12" />
      </div>
      <div className="h-3 bg-gray-100 rounded w-36" />
      <div className="h-1.5 bg-gray-100 rounded-full w-full" />
      <div className="space-y-2 pt-1">
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-4/5" />
      </div>
    </div>
  );
}

function formatOp(op: { type?: string; op?: string; [key: string]: unknown }): string {
  const { op: legacyName, type, ...params } = op;
  const name = type ?? legacyName ?? 'command';
  const extras = Object.entries(params).map(([, v]) => String(v)).join(', ');
  return extras ? `${name}: ${extras}` : name;
}

// ─── single result card ───────────────────────────────────────────────────────

interface CardProps {
  result: BenchmarkResult;
  isFastest: boolean;
  maxLatency: number;
  onApply: (xml: string) => void;
}

function ResultCard({ result: r, isFastest, maxLatency, onApply }: CardProps) {
  const pct = maxLatency > 0 ? Math.round((r.latencyMs / maxLatency) * 100) : 0;
  const badgeClass = PROVIDER_BADGE[r.provider] ?? 'bg-gray-100 text-gray-700';

  return (
    <div className={`border rounded-2xl p-5 flex flex-col gap-3 ${
      r.error ? 'border-red-100' : r.xmlValid ? 'border-gray-200' : 'border-yellow-100'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${badgeClass}`}>
            {r.provider}
          </span>
          {isFastest && !r.error && r.xmlValid && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Fastest</span>
          )}
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap tabular-nums">
          {r.latencyMs > 0 ? `${(r.latencyMs / 1000).toFixed(1)}s` : '—'}
        </span>
      </div>
      <p className="text-[11px] text-gray-400 -mt-1 truncate">{r.model}</p>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${r.error ? 'bg-red-300' : r.xmlValid ? 'bg-green-400' : 'bg-yellow-300'}`}
          style={{ width: `${pct}%` }} />
      </div>
      {r.error ? (
        <p className="text-xs text-red-500 leading-relaxed">{r.error}</p>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.xmlValid ? 'bg-green-400' : 'bg-yellow-400'}`} />
            <span className={`text-xs font-medium ${r.xmlValid ? 'text-green-700' : 'text-yellow-700'}`}>
              {r.xmlValid ? 'Valid XML' : 'No valid XML'}
            </span>
          </div>
          {r.explanation && <p className="text-sm text-gray-700 leading-relaxed">{r.explanation}</p>}
          {r.operations && r.operations.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">
                {r.operations.length} operation{r.operations.length !== 1 ? 's' : ''}
              </p>
              <ul className="space-y-1">
                {r.operations.slice(0, 5).map((op, i) => (
                  <li key={i} className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="text-gray-200">·</span>
                    <span className="font-mono">{formatOp(op)}</span>
                  </li>
                ))}
                {r.operations.length > 5 && (
                  <li className="text-xs text-gray-400 pl-4">+{r.operations.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </>
      )}
      {r.xmlValid && r.editedXml && (
        <button onClick={() => onApply(r.editedXml!)}
          className="mt-auto w-full border border-gray-200 text-gray-700 text-xs py-2 rounded-xl hover:bg-gray-50 transition-colors font-medium">
          Apply
        </button>
      )}
    </div>
  );
}

// ─── suite matrix ─────────────────────────────────────────────────────────────

interface SuiteViewProps {
  suiteResults: SuiteResult[];
  suiteRunning: boolean;
  suiteProgress: { current: number; total: number; currentLabel: string };
  totalTests: number;
  allTestCases: { id: string; label: string }[];
}

function SuiteView({ suiteResults, suiteRunning, suiteProgress, totalTests, allTestCases }: SuiteViewProps) {
  const successRate = (provider: string) => {
    const done = suiteResults.filter(({ providerResults }) =>
      providerResults.find(r => r.provider === provider)
    );
    if (done.length === 0) return null;
    const ok = done.filter(({ providerResults }) =>
      providerResults.find(r => r.provider === provider)?.xmlValid
    ).length;
    return Math.round((ok / done.length) * 100);
  };

  const avgLatency = (provider: string) => {
    const latencies = suiteResults
      .flatMap(({ providerResults }) => providerResults)
      .filter(r => r.provider === provider && r.xmlValid)
      .map(r => r.latencyMs);
    if (latencies.length === 0) return null;
    return latencies.reduce((a, b) => a + b, 0) / latencies.length;
  };

  return (
    <div className="flex-1 overflow-auto p-5">
      {/* Progress */}
      {suiteRunning && (
        <div className="mb-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Test {suiteProgress.current} / {suiteProgress.total} — <span className="text-gray-700 font-medium">{suiteProgress.currentLabel}</span></span>
            <span className="animate-pulse text-gray-400">Running…</span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gray-400 rounded-full transition-all"
              style={{ width: `${(suiteProgress.current / suiteProgress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Matrix table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left py-2 pr-6 text-[11px] text-gray-400 font-medium uppercase tracking-wide">Test</th>
              {PROVIDERS.map(p => (
                <th key={p} className="py-2 px-4 text-center">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${PROVIDER_BADGE[p]}`}>{p}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* All rows — filled or pending */}
            {Array.from({ length: totalTests }).map((_, i) => {
              const done = suiteResults[i];
              const label = done?.testCase.label ?? allTestCases[i]?.label ?? `Test ${i + 1}`;
              const isRunning = !done && suiteRunning && i === suiteProgress.current - 1;
              const isPending = !done && !isRunning;

              if (!done) {
                return (
                  <tr key={i} className={`border-t border-gray-100 ${isRunning ? 'bg-gray-50/60' : ''}`}>
                    <td className="py-2.5 pr-6 text-xs font-medium whitespace-nowrap">
                      {isRunning
                        ? <span className="text-gray-600">{label} <span className="text-gray-400 font-normal animate-pulse">…</span></span>
                        : <span className="text-gray-300">{label}</span>}
                    </td>
                    {PROVIDERS.map(p => (
                      <td key={p} className="py-2.5 px-4 text-center">
                        {isRunning
                          ? <span className="inline-block w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                          : <span className="text-gray-200 text-xs">—</span>}
                      </td>
                    ))}
                  </tr>
                );
              }

              return (
                <tr key={done.testCase.id} className="border-t border-gray-100">
                  <td className="py-2.5 pr-6 text-xs text-gray-600 font-medium whitespace-nowrap">
                    {done.testCase.label}
                  </td>
                  {PROVIDERS.map(p => {
                    const r = done.providerResults.find(r => r.provider === p);
                    if (!r) return <td key={p} className="py-2.5 px-4 text-center text-xs text-gray-300">—</td>;
                    return (
                      <td key={p} className="py-2.5 px-4 text-center">
                        {r.error ? (
                          <span className="text-red-400 text-xs">✗</span>
                        ) : r.xmlValid ? (
                          <span className="text-green-600 text-xs tabular-nums">✓ {(r.latencyMs / 1000).toFixed(1)}s</span>
                        ) : (
                          <span className="text-yellow-500 text-xs">✗</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          {/* Summary */}
          {suiteResults.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td className="pt-3 pb-1 pr-6 text-[11px] text-gray-400 uppercase tracking-wide font-medium">Erfolgsrate</td>
                {PROVIDERS.map(p => {
                  const rate = successRate(p);
                  return (
                    <td key={p} className="pt-3 pb-1 px-4 text-center">
                      <span className={`text-xs font-semibold tabular-nums ${
                        rate === null ? 'text-gray-300' :
                        rate === 100 ? 'text-green-600' :
                        rate >= 70 ? 'text-yellow-600' : 'text-red-500'
                      }`}>{rate !== null ? `${rate}%` : '—'}</span>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="py-1 pr-6 text-[11px] text-gray-400 uppercase tracking-wide font-medium">Ø Latenz</td>
                {PROVIDERS.map(p => {
                  const lat = avgLatency(p);
                  return (
                    <td key={p} className="py-1 px-4 text-center text-xs text-gray-500 tabular-nums font-medium">
                      {lat ? `${(lat / 1000).toFixed(1)}s` : '—'}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── ollama model matrix ──────────────────────────────────────────────────────

interface OllamaMatrixProps {
  rows: OllamaSuiteRow[];
  running: boolean;
  progress: { current: number; total: number; currentLabel: string };
  totalTests: number;
  allTestCases: { id: string; label: string }[];
  ollamaModels: { id: string; label: string }[];
}

function OllamaModelMatrix({ rows, running, progress, totalTests, allTestCases, ollamaModels }: OllamaMatrixProps) {
  const shortLabel = (model: { id: string; label: string }) => {
    const label = model.label.replace(' (Recommended)', '');
    const cloud = /(?:-cloud|:cloud)$/i.test(model.id);
    const compact = label
      .replace(/\s+Cloud$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 4)
      .join(' ');
    return cloud ? `${compact} Cloud` : compact;
  };

  const successRate = (modelId: string) => {
    const done = rows.filter(r => r.modelResults.find(m => m.model === modelId));
    if (done.length === 0) return null;
    const ok = done.filter(r => r.modelResults.find(m => m.model === modelId)?.xmlValid).length;
    return Math.round((ok / done.length) * 100);
  };

  const avgLatency = (modelId: string) => {
    const lats = rows.flatMap(r => r.modelResults).filter(m => m.model === modelId && m.xmlValid).map(m => m.latencyMs);
    if (lats.length === 0) return null;
    return lats.reduce((a, b) => a + b, 0) / lats.length;
  };

  return (
    <div className="flex-1 overflow-auto p-5">
      {running && (
        <div className="mb-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Test {progress.current} / {progress.total} — <span className="text-gray-700 font-medium">{progress.currentLabel}</span></span>
            <span className="animate-pulse text-gray-400">Running…</span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-violet-400 rounded-full transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left py-2 pr-4 text-[11px] text-gray-400 font-medium uppercase tracking-wide">Test</th>
              {ollamaModels.map(m => (
                <th key={m.id} className="py-2 px-3 text-center text-[11px] text-violet-600 font-semibold whitespace-nowrap">
                  <span title={m.id}>{shortLabel(m)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalTests }).map((_, i) => {
              const done = rows[i];
              const label = done?.testCase.label ?? allTestCases[i]?.label ?? `Test ${i + 1}`;
              const isRunning = !done && running && i === progress.current - 1;

              if (!done) {
                return (
                  <tr key={i} className={`border-t border-gray-100 ${isRunning ? 'bg-gray-50/60' : ''}`}>
                    <td className="py-2.5 pr-4 text-xs font-medium whitespace-nowrap">
                      {isRunning
                        ? <span className="text-gray-600">{label} <span className="text-gray-400 font-normal animate-pulse">…</span></span>
                        : <span className="text-gray-300">{label}</span>}
                    </td>
                    {ollamaModels.map(m => (
                      <td key={m.id} className="py-2.5 px-3 text-center">
                        {isRunning
                          ? <span className="inline-block w-3 h-3 border border-gray-300 border-t-violet-500 rounded-full animate-spin" />
                          : <span className="text-gray-200 text-xs">—</span>}
                      </td>
                    ))}
                  </tr>
                );
              }

              return (
                <tr key={done.testCase.id} className="border-t border-gray-100">
                  <td className="py-2.5 pr-4 text-xs text-gray-600 font-medium whitespace-nowrap">{done.testCase.label}</td>
                  {ollamaModels.map(m => {
                    const r = done.modelResults.find(r => r.model === m.id);
                    if (!r) return <td key={m.id} className="py-2.5 px-3 text-center text-xs text-gray-300">—</td>;
                    return (
                      <td key={m.id} className="py-2.5 px-3 text-center text-xs tabular-nums">
                        {r.error
                          ? <span className="text-red-400">✗</span>
                          : r.xmlValid
                            ? <span className="text-green-600">✓ {r.score ?? 100} · {(r.latencyMs / 1000).toFixed(1)}s</span>
                            : <span className="text-yellow-500">✗ {r.score ?? 0}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td className="pt-3 pb-1 pr-4 text-[11px] text-gray-400 uppercase tracking-wide font-medium">Erfolgsrate</td>
                {ollamaModels.map(m => {
                  const rate = successRate(m.id);
                  return (
                    <td key={m.id} className="pt-3 pb-1 px-3 text-center">
                      <span className={`text-xs font-semibold tabular-nums ${
                        rate === null ? 'text-gray-300' : rate === 100 ? 'text-green-600' : rate >= 70 ? 'text-yellow-600' : 'text-red-500'
                      }`}>{rate !== null ? `${rate}%` : '—'}</span>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="py-1 pr-4 text-[11px] text-gray-400 uppercase tracking-wide font-medium">Ø Latenz</td>
                {ollamaModels.map(m => {
                  const lat = avgLatency(m.id);
                  return (
                    <td key={m.id} className="py-1 px-3 text-center text-xs text-gray-500 tabular-nums font-medium">
                      {lat ? `${(lat / 1000).toFixed(1)}s` : '—'}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

interface Props {
  results: BenchmarkResult[];
  loading: boolean;
  prompt: string;
  onApply: (xml: string) => void;
  onClose: () => void;
  onRunSuite: () => void;
  onRunOllamaProviderSuite: () => void;
  suiteRunning: boolean;
  suiteProgress: { current: number; total: number; currentLabel: string };
  suiteResults: SuiteResult[];
  suiteTotalTests: number;
  allTestCases: { id: string; label: string }[];
  // Ollama model comparison
  onRunOllamaSuite: () => void;
  onRunSmartOllamaSuite: () => void;
  ollamaSuiteRunning: boolean;
  ollamaSuiteProgress: { current: number; total: number; currentLabel: string };
  ollamaSuiteRows: OllamaSuiteRow[];
  ollamaSuiteMode: 'smart' | 'all';
  ollamaSuiteTotalTests: number;
  ollamaModelSuiteTestCases: { id: string; label: string }[];
  ollamaModels: { id: string; label: string }[];
  smartOllamaModelCount: number;
}

export default function BenchmarkPanel({
  results, loading, prompt,
  onApply, onClose, onRunSuite, onRunOllamaProviderSuite,
  suiteRunning, suiteProgress, suiteResults, suiteTotalTests, allTestCases,
  onRunOllamaSuite, onRunSmartOllamaSuite, ollamaSuiteRunning, ollamaSuiteProgress,
  ollamaSuiteRows, ollamaSuiteMode, ollamaSuiteTotalTests, ollamaModelSuiteTestCases, ollamaModels,
  smartOllamaModelCount,
}: Props) {
  const showOllama = ollamaSuiteRunning || ollamaSuiteRows.length > 0;
  const showSuite = !showOllama && (suiteRunning || suiteResults.length > 0);
  const showSingle = !showOllama && !showSuite && (loading || results.length > 0);
  const showReady = !showOllama && !showSuite && !showSingle;

  const validResults = results.filter(r => r.xmlValid && !r.error);
  const fastest = validResults.length > 0
    ? validResults.reduce((a, b) => a.latencyMs <= b.latencyMs ? a : b)
    : null;
  const maxLatency = results.length > 0 ? Math.max(...results.map(r => r.latencyMs || 0), 1) : 1;
  const activeOllamaModelCount = ollamaSuiteRows[0]?.modelResults.length
    ?? (ollamaSuiteMode === 'smart' ? smartOllamaModelCount : ollamaModels.length);

  return (
    <div className="flex-1 border-r border-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
            {showOllama ? 'Ollama Models' : showSuite ? 'Suite' : 'Benchmark'}
          </span>
          {showSingle && prompt && (
            <span className="text-xs text-gray-400 truncate">&ldquo;{prompt}&rdquo;</span>
          )}
          {showSuite && !suiteRunning && suiteResults.length > 0 && (
            <span className="text-xs text-gray-400">{suiteResults.length} / {suiteTotalTests} tests</span>
          )}
          {showOllama && !ollamaSuiteRunning && ollamaSuiteRows.length > 0 && (
            <span className="text-xs text-gray-400">
              {ollamaSuiteRows.length} / {ollamaSuiteTotalTests} tests · {activeOllamaModelCount} models · {ollamaSuiteMode}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 ml-3 flex-shrink-0">
          {showSuite && (
            <>
              <button onClick={onRunOllamaProviderSuite} disabled={suiteRunning}
                className="text-xs text-violet-500 hover:text-violet-700 disabled:opacity-40 transition-colors font-medium">
                Re-run Ollama only
              </button>
              <button onClick={onRunSuite} disabled={suiteRunning}
                className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 transition-colors font-medium">
                Re-run all
              </button>
            </>
          )}
          {showOllama && (
            <>
              <button onClick={onRunSmartOllamaSuite} disabled={ollamaSuiteRunning}
                className="text-xs text-violet-500 hover:text-violet-700 disabled:opacity-40 transition-colors font-medium">
                Re-run smart
              </button>
              <button onClick={onRunOllamaSuite} disabled={ollamaSuiteRunning}
                className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 transition-colors font-medium">
                Re-run all
              </button>
            </>
          )}
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Exit
          </button>
        </div>
      </div>

      {/* Ready state */}
      {showReady && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              {PROVIDERS.map(p => (
                <span key={p} className={`text-xs font-semibold px-3 py-1.5 rounded-full capitalize ${PROVIDER_BADGE[p]}`}>{p}</span>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              3 providers ready
            </div>
          </div>

          <div className="max-w-xs space-y-2">
            <p className="text-base font-semibold text-gray-800">Ready to benchmark</p>
            <p className="text-sm text-gray-400 leading-relaxed">
              Type a change on the right and press <span className="font-semibold text-gray-600">Test</span> for a single run,
              or run the full suite to compare all providers automatically.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap justify-center">
            <button onClick={onRunSuite}
              className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors">
              Run Suite: all providers
            </button>
            <button onClick={onRunOllamaProviderSuite}
              className="px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
              Run Suite: Ollama only
            </button>
            <button onClick={onRunSmartOllamaSuite}
              className="px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-500 transition-colors">
              Smart Ollama shortlist
            </button>
            <button onClick={onRunOllamaSuite}
              className="px-5 py-2.5 border border-violet-200 text-violet-700 text-sm font-medium rounded-xl hover:bg-violet-50 transition-colors">
              All Ollama models
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            <div className="border border-gray-100 rounded-xl p-3 space-y-1.5 text-left">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Suite (7 Tests)</p>
              {['Dynamics', 'Articulations', '8vb/8va', 'Tempo', 'Key', 'Title', 'Everything'].map(ex => (
                <p key={ex} className="text-xs text-gray-500">{ex}</p>
              ))}
            </div>
            <div className="border border-violet-100 rounded-xl p-3 space-y-1.5 text-left">
              <p className="text-[11px] text-violet-400 uppercase tracking-wide font-medium">
                Ollama Models ({ollamaModelSuiteTestCases.length} Tests)
              </p>
              <p className="text-xs text-violet-500 font-medium">Smart shortlist: {smartOllamaModelCount} models</p>
              {['Edit commands', 'Harmony', 'Structure', 'Notation', 'Analysis', 'Practice', 'Layout', 'Lyrics', 'Arrangement'].map(ex => (
                <p key={ex} className="text-xs text-violet-400">{ex}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Single benchmark cards */}
      {showSingle && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-3 gap-4">
            {loading ? (
              <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
            ) : (
              results.map((r, i) => (
                <ResultCard key={i} result={r}
                  isFastest={!!(fastest && fastest.provider === r.provider && fastest.model === r.model)}
                  maxLatency={maxLatency} onApply={onApply} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Suite matrix */}
      {showSuite && (
        <SuiteView
          suiteResults={suiteResults}
          suiteRunning={suiteRunning}
          suiteProgress={suiteProgress}
          totalTests={suiteTotalTests}
          allTestCases={allTestCases}
        />
      )}

      {/* Ollama model matrix */}
      {showOllama && (
        <OllamaModelMatrix
          rows={ollamaSuiteRows}
          running={ollamaSuiteRunning}
          progress={ollamaSuiteProgress}
          totalTests={ollamaSuiteTotalTests}
          allTestCases={ollamaModelSuiteTestCases}
          ollamaModels={ollamaModels}
        />
      )}
    </div>
  );
}
