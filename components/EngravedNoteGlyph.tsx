'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { NoteDuration } from '@/hooks/useNoteEditor';
import type { GhostStemDirection } from '@/src/render-bridge/utils/svg-helpers';

type VexFlowNamespace = {
  Flow: {
    Accidental: new (type: string) => unknown;
    Formatter: new () => {
      joinVoices: (voices: unknown[]) => { format: (voices: unknown[], width: number) => unknown };
    };
    Renderer: {
      new (element: HTMLElement, backend: number): {
        resize: (width: number, height: number) => void;
        getContext: () => unknown;
      };
      Backends: { SVG: number };
    };
    Stave: new (x: number, y: number, width: number) => {
      setContext: (context: unknown) => { draw: () => unknown };
    };
    StaveNote: new (options: {
      keys: string[];
      duration: string;
      stem_direction?: number;
    }) => {
      addAccidental: (index: number, accidental: unknown) => unknown;
      addDotToAll: () => unknown;
      getAbsoluteX: () => number;
      getNoteHeadBeginX: () => number;
      getNoteHeadEndX: () => number;
      getYs: () => number[];
    };
    Voice: new (options: { num_beats: number; beat_value: number }) => {
      addTickables: (tickables: unknown[]) => unknown;
      draw: (context: unknown, stave: unknown) => unknown;
    };
    Stem: { UP: number; DOWN: number };
  };
};

const VEXFLOW_DURATION: Partial<Record<NoteDuration, string>> = {
  breve: '1/2',
  '1': '1',
  '2': '2',
  '4': '4',
  '8': '8',
  '16': '16',
  '32': '32',
  '64': '64',
};

const VEXFLOW_ACCIDENTAL: Record<number, string | undefined> = {
  [-2]: 'bb',
  [-1]: 'b',
  0: undefined,
  1: '#',
  2: '##',
};

let vexFlowPromise: Promise<VexFlowNamespace> | null = null;

function loadVexFlow() {
  vexFlowPromise ??= import('vexflow/releases/vexflow-min.js')
    .then((module) => ((module as { default?: VexFlowNamespace }).default ?? module) as VexFlowNamespace);
  return vexFlowPromise;
}

function colorizeEngraving(svg: SVGSVGElement) {
  svg.querySelectorAll<SVGElement>('[fill]').forEach((element) => {
    if (element.getAttribute('fill') !== 'none') element.setAttribute('fill', 'currentColor');
  });
  svg.querySelectorAll<SVGElement>('[stroke]').forEach((element) => {
    if (element.getAttribute('stroke') !== 'none') element.setAttribute('stroke', 'currentColor');
  });
}

export interface EngravedNoteGlyphProps {
  duration: NoteDuration;
  className?: string;
  color?: string;
  dotted?: boolean;
  stemDirection?: GhostStemDirection;
  accidentalAlter?: number;
  noteheadCenterX?: number;
  noteheadCenterY?: number;
  fallback?: ReactNode;
}

/**
 * Renders note previews with the same VexFlow engraver used by OSMD for the
 * committed score. In overlay mode the generated notehead is aligned to the
 * semantic hover target; in icon mode the exact engraving is tightly cropped.
 */
export function EngravedNoteGlyph({
  duration,
  className = 'h-6 w-6',
  color = 'currentColor',
  dotted = false,
  stemDirection = 'up',
  accidentalAlter = 0,
  noteheadCenterX,
  noteheadCenterY = 28,
  fallback = null,
}: EngravedNoteGlyphProps) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [ready, setReady] = useState(false);
  const overlayMode = noteheadCenterX != null;

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    const vexDuration = VEXFLOW_DURATION[duration];
    setReady(false);
    if (!host || !vexDuration) {
      if (host) host.innerHTML = '';
      return () => {
        cancelled = true;
      };
    }

    void loadVexFlow().then((Vex) => {
      if (cancelled || !hostRef.current) return;
      const activeHost = hostRef.current;
      activeHost.innerHTML = '';
      const VF = Vex.Flow;
      const canvasSize = 112;
      const renderer = new VF.Renderer(activeHost, VF.Renderer.Backends.SVG);
      renderer.resize(canvasSize, canvasSize);
      const context = renderer.getContext();
      const stave = new VF.Stave(0, 0, canvasSize);
      stave.setContext(context).draw();

      const svg = activeHost.querySelector('svg');
      if (!svg) return;
      const staveElements = Array.from(svg.children);
      const denominator = vexDuration === '1/2' ? 1 : Number.parseInt(vexDuration, 10);
      const beats = vexDuration === '1/2' ? 2 : 1;
      const note = new VF.StaveNote({
        keys: ['b/4'],
        duration: vexDuration,
        stem_direction: stemDirection === 'down' ? VF.Stem.DOWN : VF.Stem.UP,
      });
      const accidental = VEXFLOW_ACCIDENTAL[accidentalAlter];
      if (accidental) note.addAccidental(0, new VF.Accidental(accidental));
      if (dotted) note.addDotToAll();
      const voice = new VF.Voice({ num_beats: beats, beat_value: Math.max(denominator, 1) });
      voice.addTickables([note]);
      new VF.Formatter().joinVoices([voice]).format([voice], 44);
      voice.draw(context, stave);
      staveElements.forEach((element) => element.remove());

      const engraving = svg.querySelector<SVGGElement>('.vf-stavenote');
      const notehead = svg.querySelector<SVGGElement>('.vf-notehead');
      if (!engraving || !notehead) return;
      colorizeEngraving(svg);
      svg.setAttribute('aria-hidden', 'true');
      svg.style.display = 'block';
      svg.style.overflow = 'visible';

      const engravingBox = engraving.getBBox();
      const noteheadX = (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
      const renderedNoteheadY = note.getYs()[0] ?? 60;

      if (overlayMode) {
        svg.setAttribute('viewBox', `0 0 ${canvasSize} ${canvasSize}`);
        svg.setAttribute('width', String(canvasSize));
        svg.setAttribute('height', String(canvasSize));
        svg.style.position = 'absolute';
        svg.style.left = `${noteheadCenterX - noteheadX}px`;
        svg.style.top = `${noteheadCenterY - renderedNoteheadY}px`;
      } else {
        const padding = 1.5;
        svg.setAttribute(
          'viewBox',
          `${engravingBox.x - padding} ${engravingBox.y - padding} ${engravingBox.width + (padding * 2)} ${engravingBox.height + (padding * 2)}`,
        );
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      }
      if (!cancelled) setReady(true);
    }).catch(() => {
      if (!cancelled) setReady(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    accidentalAlter,
    dotted,
    duration,
    noteheadCenterX,
    noteheadCenterY,
    overlayMode,
    stemDirection,
  ]);

  const style: CSSProperties = {
    color,
    display: overlayMode ? 'block' : 'inline-block',
    position: overlayMode ? 'absolute' : 'relative',
    inset: overlayMode ? 0 : undefined,
    overflow: 'visible',
    pointerEvents: 'none',
  };

  return (
    <span
      className={overlayMode ? undefined : className}
      style={style}
      data-engraving-source="vexflow"
      aria-hidden
    >
      {!ready ? fallback : null}
      <span ref={hostRef} className="absolute inset-0 block overflow-visible" />
    </span>
  );
}
