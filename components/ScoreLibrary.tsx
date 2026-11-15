'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  clearLibraryScores,
  deleteLibraryScore,
  getLibraryScores,
  toggleLibraryFavorite,
  type LibraryScore,
} from '@/lib/score-library';
import { useI18n } from '@/lib/i18n';

interface Props {
  currentScoreId?: string | null;
  dense?: boolean;
  onOpenScore: (score: LibraryScore) => Promise<void> | void;
}

function formatRelativeTime(timestamp: number, t: ReturnType<typeof useI18n>['t']) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  return t('time.daysAgo', { count: Math.floor(hours / 24) });
}

function waitForUiPaint() {
  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

const SCORE_LIBRARY_PREVIEW_DATA_ENDPOINT = '/api/library-score-preview';

export const SCORE_LIBRARY_PREVIEW_CONTAINER_STYLE = {
  height: '168px',
  overflow: 'hidden',
} satisfies CSSProperties;

export const SCORE_LIBRARY_PREVIEW_IFRAME_STYLE = {
  position: 'absolute',
  left: '50%',
  top: '-154px',
  width: '136%',
  height: '560px',
  transform: 'translateX(-50%)',
  border: 0,
  pointerEvents: 'none',
} satisfies CSSProperties;

export function buildLibraryScorePreviewPayload(score: LibraryScore) {
  if (!score.xml) return null;
  return {
    success: true,
    xml: score.xml,
    filename: score.name,
  };
}

export function buildLibraryScorePreviewDataSource(previewId: string, entryId: string) {
  const params = new URLSearchParams({
    previewId,
    entry: entryId,
  });
  return `${SCORE_LIBRARY_PREVIEW_DATA_ENDPOINT}?${params.toString()}`;
}

export async function createLibraryScorePreviewDataSource(score: LibraryScore, signal?: AbortSignal) {
  const payload = buildLibraryScorePreviewPayload(score);
  if (!payload) return null;
  try {
    const response = await fetch(SCORE_LIBRARY_PREVIEW_DATA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryId: score.id,
        ...payload,
      }),
      signal,
    });
    if (!response.ok) return null;
    const data = await response.json() as { previewId?: unknown };
    return typeof data.previewId === 'string'
      ? buildLibraryScorePreviewDataSource(data.previewId, score.id)
      : null;
  } catch {
    return null;
  }
}

export function buildEmbeddedScorePreviewUrl(score: LibraryScore, scoreDataUrl: string) {
  const params = new URLSearchParams({
    embed: '1',
    chrome: '0',
    entry: score.id,
    scoreDataUrl,
    view: 'score',
  });
  return `/nex-note-app?${params.toString()}`;
}

export default function ScoreLibrary({ currentScoreId, dense = false, onOpenScore }: Props) {
  const { t } = useI18n();
  const [items, setItems] = useState<LibraryScore[]>([]);
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(currentScoreId ?? null);
  const [openingItemId, setOpeningItemId] = useState<string | null>(null);

  useEffect(() => {
    setItems(getLibraryScores());
  }, []);

  useEffect(() => {
    if (currentScoreId) setActiveItemId(currentScoreId);
  }, [currentScoreId]);

  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function registerPreviewDataSources() {
      const nextPreviewUrls: Record<string, string> = {};
      await Promise.all(items.map(async (item) => {
        const dataSourceUrl = await createLibraryScorePreviewDataSource(item, controller.signal);
        if (!dataSourceUrl) return;
        nextPreviewUrls[item.id] = buildEmbeddedScorePreviewUrl(item, dataSourceUrl);
      }));
      if (!cancelled) setPreviewUrls(nextPreviewUrls);
    }

    void registerPreviewDataSources();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [items]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      if (favoritesOnly && !item.favorite) return false;
      if (!normalized) return true;
      return item.name.toLowerCase().includes(normalized) || item.format.toLowerCase().includes(normalized);
    });
  }, [favoritesOnly, items, query]);

  const stats = useMemo(() => {
    const totalMeasures = items.reduce((sum, item) => sum + item.measures, 0);
    const totalParts = items.reduce((sum, item) => sum + item.parts, 0);
    return {
      count: items.length,
      favorites: items.filter((item) => item.favorite).length,
      totalMeasures,
      totalParts,
    };
  }, [items]);

  function refresh() {
    setItems(getLibraryScores());
  }

  function handleFavorite(id: string) {
    toggleLibraryFavorite(id);
    refresh();
  }

  function handleDelete(id: string) {
    deleteLibraryScore(id);
    if (activeItemId === id) {
      setActiveItemId(currentScoreId && currentScoreId !== id ? currentScoreId : null);
    }
    refresh();
  }

  async function handleOpenScore(item: LibraryScore) {
    if (openingItemId) return;
    setActiveItemId(item.id);
    setOpeningItemId(item.id);
    try {
      await waitForUiPaint();
      await onOpenScore(item);
    } finally {
      setOpeningItemId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-gray-200 bg-white/80 p-6 text-center">
        <p className="text-sm font-medium text-gray-700">{t('library.emptyTitle')}</p>
        <p className="mt-2 text-xs leading-5 text-gray-500">
          {t('library.emptyDescription')}
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-3xl border border-gray-200 bg-white ${dense ? 'p-4' : 'p-5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-400">{t('library.title')}</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">{t('library.heading')}</h3>
        </div>
        <button
          onClick={() => {
            clearLibraryScores();
            refresh();
          }}
          className="text-xs text-gray-400 transition-colors hover:text-gray-700"
        >
          {t('library.clearAll')}
        </button>
      </div>

      <div className={`grid gap-2 ${dense ? 'mt-4 grid-cols-2' : 'mt-5 grid-cols-4'}`}>
        <div className="rounded-2xl bg-stone-100 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-stone-500">{t('library.scores')}</p>
          <p className="mt-1 text-lg font-semibold text-stone-900">{stats.count}</p>
        </div>
        <div className="rounded-2xl bg-amber-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-amber-700">{t('library.favorites')}</p>
          <p className="mt-1 text-lg font-semibold text-amber-950">{stats.favorites}</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-emerald-700">{t('library.measures')}</p>
          <p className="mt-1 text-lg font-semibold text-emerald-950">{stats.totalMeasures}</p>
        </div>
        <div className="rounded-2xl bg-sky-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-sky-700">{t('library.parts')}</p>
          <p className="mt-1 text-lg font-semibold text-sky-950">{stats.totalParts}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('library.filter')}
          className="flex-1 rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-500 focus:border-gray-400"
        />
        <button
          onClick={() => setFavoritesOnly((value) => !value)}
          className={`rounded-2xl px-3 py-2 text-sm transition-colors ${
            favoritesOnly ? 'bg-nex-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {t('library.favorites')}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {filtered.map((item) => {
          const isActive = item.id === activeItemId;
          const isCurrent = item.id === currentScoreId;
          const previewUrl = previewUrls[item.id] ?? '';
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              aria-busy={openingItemId === item.id}
              onClick={() => {
                void handleOpenScore(item);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  void handleOpenScore(item);
                }
              }}
              className={`w-full cursor-pointer rounded-2xl border px-3 py-3 text-left transition-colors ${
                isActive
                  ? 'border-nex-accent bg-nex-accent text-white'
                  : isCurrent
                    ? 'border-nex-accent/30 bg-nex-accent/10'
                    : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`truncate text-sm font-semibold ${isActive ? 'text-white' : 'text-gray-900'}`}>{item.name}</p>
                    {isActive && (
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white">
                        {t('library.selected')}
                      </span>
                    )}
                    {isCurrent && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                        isActive ? 'bg-white/20 text-white' : 'bg-nex-accent text-white'
                      }`}>
                        {t('library.active')}
                      </span>
                    )}
                    {openingItemId === item.id && (
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        <span className={`h-2.5 w-2.5 animate-spin rounded-full border ${
                          isActive ? 'border-white/30 border-t-white' : 'border-slate-300 border-t-slate-700'
                        }`} />
                        {t('library.opening')}
                      </span>
                    )}
                  </div>
                  <p className={`mt-1 text-[11px] ${isActive ? 'text-white/70' : 'text-gray-400'}`}>{t('library.lastOpened')} {formatRelativeTime(item.lastOpenedAt, t)}</p>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event?.stopPropagation?.();
                    handleFavorite(item.id);
                    setActiveItemId(item.id);
                  }}
                  className={`shrink-0 text-sm transition-transform hover:scale-110 ${
                    item.favorite
                      ? isActive ? 'text-amber-200' : 'text-amber-500'
                      : isActive ? 'text-white/60' : 'text-gray-300'
                  }`}
                  title={t('library.toggleFavorite')}
                >
                  ★
                </button>
              </div>

              <div
                className={`relative mt-3 rounded-lg border shadow-inner ${
                  isActive
                    ? 'border-white/20 bg-white'
                    : 'border-slate-200 bg-nex-score-bg'
                }`}
                data-testid="library-score-preview-frame"
                style={SCORE_LIBRARY_PREVIEW_CONTAINER_STYLE}
              >
                {previewUrl && (
                  <iframe
                    title={`${item.name} score preview`}
                    src={previewUrl}
                    className="block bg-nex-score-bg"
                    data-testid="library-score-preview-iframe"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    aria-hidden="true"
                    tabIndex={-1}
                    style={SCORE_LIBRARY_PREVIEW_IFRAME_STYLE}
                  />
                )}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={(event) => {
                    event?.stopPropagation?.();
                    void handleOpenScore(item);
                  }}
                  disabled={openingItemId !== null}
                  className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-white text-nex-accent hover:bg-slate-100'
                      : 'bg-gray-900 text-white hover:bg-gray-700'
                  } disabled:cursor-wait disabled:opacity-70`}
                >
                  {openingItemId === item.id ? (
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-3 w-3 animate-spin rounded-full border ${
                        isActive ? 'border-nex-accent/20 border-t-nex-accent' : 'border-white/30 border-t-white'
                      }`} />
                      {t('library.opening')}
                    </span>
                  ) : t('library.open')}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event?.stopPropagation?.();
                    handleDelete(item.id);
                  }}
                  className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-white/15 text-white hover:bg-red-500/25'
                      : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
                  }`}
                >
                  {t('library.remove')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
