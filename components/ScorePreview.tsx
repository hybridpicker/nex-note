'use client';

import { applyNotationFont } from '@/lib/notation-font';
import { useEffect, useRef, useState } from 'react';
import { resolveMusicXmlMetadataDrawOptions } from '@/lib/musicxml-metadata-display';
import { importMusicXmlToCore } from '@/src/musicxml-adapter/import/import-musicxml';
import { collectRenderedNotes } from '@/src/render-bridge/osmd/note-selection';
import { drawNestedTupletBrackets, hasNestedTuplets, nestedTupletRenderXml } from '@/src/render-bridge/osmd/nested-tuplets';
import { installOsmdGlyphBoundsCache } from '@/src/render-bridge/osmd/glyph-bounds-cache';

interface Props {
  xml: string;
  className?: string;
  onRendered?: (xml: string) => void;
}

export default function ScorePreview({ xml, className = '', onRendered }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onRenderedRef = useRef(onRendered);
  onRenderedRef.current = onRendered;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!xml || !containerRef.current) return;

    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let frame = 0;
    setLoading(true);
    setError('');

    async function render() {
      try {
        // Dynamic import to avoid SSR issues
        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
        if (cancelled || !containerRef.current) return;

        const container = containerRef.current;
        const core = importMusicXmlToCore(xml);
        const metadataDrawOptions = resolveMusicXmlMetadataDrawOptions(xml, core);
        container.innerHTML = '';
        const osmd = new OpenSheetMusicDisplay(container, {
            autoResize: false,
            ...metadataDrawOptions,
            drawingParameters: 'default',
        });
        applyNotationFont(osmd);
        await osmd.load(nestedTupletRenderXml(xml, core));
        if (cancelled) return;
        if (hasNestedTuplets(core)) {
          osmd.EngravingRules.TupletNumberUseShowNoneXMLValue = true;
          osmd.EngravingRules.TupletsBracketedUseXMLValue = true;
        }
        const draw = () => {
          if (cancelled) return;
          installOsmdGlyphBoundsCache(osmd);
          osmd.render();
          installOsmdGlyphBoundsCache(osmd);
          if (hasNestedTuplets(core)) drawNestedTupletBrackets(container, core, collectRenderedNotes(osmd, container, core));
          // Preserve the engraving coordinate system when print CSS scales the
          // screen-sized SVG to the physical page width.
          container.querySelectorAll('svg').forEach(svg => {
            if (!svg.hasAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${svg.width.baseVal.value} ${svg.height.baseVal.value}`);
          });
          frame = window.requestAnimationFrame(() => {
            if (cancelled) return;
            setLoading(false);
            onRenderedRef.current?.(xml);
          });
        };
        draw();
        let width = container.clientWidth;
        observer = new ResizeObserver(() => {
          if (container.clientWidth === width) return;
          width = container.clientWidth;
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(draw);
        });
        observer.observe(container);
      } catch (err) {
        if (!cancelled) {
          setError(`Preview error: ${err}`);
          setLoading(false);
        }
      }
    }

    render();
    return () => { cancelled = true; observer?.disconnect(); cancelAnimationFrame(frame); };
  }, [xml]);

  if (!xml) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        No file loaded
      </div>
    );
  }

  return (
    <div className={`relative h-full overflow-auto ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
          <span className="text-gray-500 text-sm animate-pulse">Rendering score...</span>
        </div>
      )}
      {error && (
        <div className="p-4 text-red-600 text-sm bg-red-50 rounded">{error}</div>
      )}
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
