import type { ScoreDocumentModel } from '@/src/score-core/model/types';

/*
 * Render window (gate 3, steps 2 and 3 of docs/note-entry-mastery-ledger.md).
 *
 * The engraver draws whatever MusicXML it is given, and its time grows with the size of that file.
 * A window is a part of the score, whole systems around the viewport, written as a MusicXML file of
 * its own: the bars of the window with their numbers, and in front of the first of them what the
 * bars before it had said about divisions, key, time signature and clefs. The engraver then draws a
 * score of a fixed size however long the piece is.
 *
 * The slice is cut from the stored MusicXML as text. Nothing in a bar is rewritten.
 */

export interface RenderWindow {
  /** First and last bar of the window, as the document numbers them (inclusive). */
  firstMeasureNumber: number;
  lastMeasureNumber: number;
}

interface CarriedState {
  divisions: number | null;
  keyFifths: number | null;
  time: { beats: number; beatType: number; beatGroups?: number[] } | null;
  clefs: Map<number, { sign?: string; line?: number; octaveChange?: number }>;
}

/** What the bars before `firstMeasureNumber` say that still holds at it, part by part. */
function carriedStateOfPart(part: ScoreDocumentModel['score']['parts'][number], firstMeasureNumber: number): CarriedState {
  const state: CarriedState = { divisions: null, keyFifths: null, time: null, clefs: new Map() };
  const measureCount = Math.max(0, ...part.staves.map((staff) => staff.measures.length));
  for (let index = 0; index < measureCount; index += 1) {
    for (const staff of part.staves) {
      const measure = staff.measures[index];
      if (!measure || measure.measureNumber >= firstMeasureNumber) continue;
      for (const attribute of measure.attributes) {
        if (typeof attribute.divisions === 'number' && attribute.divisions > 0) state.divisions = attribute.divisions;
        if (typeof attribute.keyFifths === 'number') state.keyFifths = attribute.keyFifths;
        if (attribute.time?.beats && attribute.time.beatType) state.time = attribute.time;
        for (const clef of attribute.clefs) state.clefs.set(clef.staffIndex, clef);
      }
    }
  }
  return state;
}

/** Children of the first bar's <attributes> that describe the part as a whole. */
const PART_WIDE_ATTRIBUTE_TAGS = ['staves', 'part-symbol', 'instruments', 'staff-details', 'transpose', 'for-part'] as const;

function partWideAttributeXml(firstMeasureXml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const attributes = /<attributes\b[^>]*>([\s\S]*?)<\/attributes>/.exec(firstMeasureXml)?.[1] ?? '';
  for (const tag of PART_WIDE_ATTRIBUTE_TAGS) {
    const matches = attributes.match(new RegExp(`<${tag}\\b[^>]*?(?:/>|>[\\s\\S]*?</${tag}>)`, 'g'));
    if (matches?.length) out[tag] = matches.join('');
  }
  return out;
}

function carriedAttributesXml(state: CarriedState, partWide: Record<string, string>, multiStaff: boolean) {
  const pieces: string[] = [];
  if (state.divisions != null) pieces.push(`<divisions>${state.divisions}</divisions>`);
  if (state.keyFifths != null) pieces.push(`<key><fifths>${state.keyFifths}</fifths></key>`);
  if (state.time) {
    const groups = state.time.beatGroups;
    const beats = groups && groups.length > 1 && groups.reduce((sum, group) => sum + group, 0) === state.time.beats
      ? groups.join('+')
      : String(state.time.beats);
    // The time signature holds from an earlier bar on; it is not printed again in the window.
    pieces.push(`<time print-object="no"><beats>${beats}</beats><beat-type>${state.time.beatType}</beat-type></time>`);
  }
  pieces.push(partWide.staves ?? '', partWide['part-symbol'] ?? '', partWide.instruments ?? '');
  for (const [staffIndex, clef] of [...state.clefs.entries()].sort((left, right) => left[0] - right[0])) {
    pieces.push(
      `<clef${multiStaff || staffIndex > 1 ? ` number="${staffIndex}"` : ''}>`
      + (clef.sign ? `<sign>${clef.sign}</sign>` : '')
      + (clef.line != null ? `<line>${clef.line}</line>` : '')
      + (clef.octaveChange ? `<clef-octave-change>${clef.octaveChange}</clef-octave-change>` : '')
      + '</clef>',
    );
  }
  pieces.push(partWide['staff-details'] ?? '', partWide.transpose ?? '', partWide['for-part'] ?? '');
  const body = pieces.join('');
  return body ? `<attributes>${body}</attributes>` : '';
}

interface MeasureSpan { number: number; start: number; contentStart: number; end: number }

/** The bars of one <part>, located in the text. `end` is past the closing tag. */
function locateMeasures(xml: string, partStart: number, partEnd: number): MeasureSpan[] {
  const spans: MeasureSpan[] = [];
  let cursor = partStart;
  for (;;) {
    const start = xml.indexOf('<measure', cursor);
    if (start < 0 || start >= partEnd) break;
    const openEnd = xml.indexOf('>', start);
    if (openEnd < 0) break;
    const selfClosing = xml[openEnd - 1] === '/';
    const close = selfClosing ? -1 : xml.indexOf('</measure>', openEnd);
    const end = selfClosing ? openEnd + 1 : close + '</measure>'.length;
    if (!selfClosing && close < 0) break;
    const number = Number.parseInt(/\bnumber="([^"]*)"/.exec(xml.slice(start, openEnd))?.[1] ?? '', 10);
    spans.push({ number: Number.isFinite(number) ? number : spans.length + 1, start, contentStart: openEnd + 1, end });
    cursor = end;
  }
  return spans;
}

/**
 * The MusicXML of the window: every part, with only the bars of the window. Returns null when the
 * window cannot be cut (a part without the bars, or XML that is not laid out as the export writes
 * it); the caller then draws the whole score.
 */
export function buildRenderWindowXml(xml: string, document: ScoreDocumentModel, window: RenderWindow): string | null {
  const out: string[] = [];
  let cursor = 0;
  let partIndex = 0;
  for (;;) {
    const partStart = xml.indexOf('<part ', cursor);
    if (partStart < 0) break;
    const partEnd = xml.indexOf('</part>', partStart);
    if (partEnd < 0) return null;
    const partId = /\bid="([^"]*)"/.exec(xml.slice(partStart, xml.indexOf('>', partStart)))?.[1] ?? null;
    const part = document.score.parts.find((entry) => entry.sourcePartId === partId) ?? null;
    const measures = locateMeasures(xml, partStart, partEnd);
    if (!part || measures.length === 0) return null;
    const kept = measures.filter((measure) => measure.number >= window.firstMeasureNumber && measure.number <= window.lastMeasureNumber);
    if (kept.length === 0) return null;
    const first = kept[0]!;
    const last = kept[kept.length - 1]!;
    // The bars of a window are consecutive in the file.
    if (measures.indexOf(last) - measures.indexOf(first) !== kept.length - 1) return null;

    out.push(xml.slice(cursor, measures[0]!.start));
    if (first === measures[0]) {
      out.push(xml.slice(first.start, last.end));
    } else {
      const carried = carriedAttributesXml(
        carriedStateOfPart(part, first.number),
        partWideAttributeXml(xml.slice(measures[0]!.start, measures[0]!.end)),
        part.staves.length > 1,
      );
      out.push(xml.slice(first.start, first.contentStart), carried, xml.slice(first.contentStart, last.end));
    }
    cursor = partEnd;
    partIndex += 1;
  }
  if (partIndex === 0) return null;
  out.push(xml.slice(cursor));
  return out.join('');
}

/**
 * Whether a document can be drawn in windows at all. Lines that the engraver draws from a start in
 * one bar to a stop in another change how the notes between them are drawn when the start lies
 * before the window; an octave line moves them by an octave. Such scores are drawn whole.
 */
export function documentAllowsRenderWindow(document: ScoreDocumentModel): boolean {
  for (const part of document.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        if (measure.multiMeasureRest || (measure.measureRepeat ?? 0) > 0) return false;
        for (const direction of measure.directions) {
          if (/octave/i.test(direction.kind)) return false;
        }
      }
    }
  }
  return true;
}

export interface WindowSystem { systemIndex: number; measureNumbers: number[] }

/**
 * The window for a set of systems that must be in it (those on screen, the one with the caret):
 * these and `margin` systems on either side. Null when that is the whole score or nearly so: a
 * window pays only when it leaves a good part of the score out.
 */
export function resolveRenderWindow(
  systems: WindowSystem[],
  focus: { firstSystemIndex: number; lastSystemIndex: number },
  options: { margin: number; minimumSystems: number },
): (RenderWindow & { firstSystemIndex: number; lastSystemIndex: number }) | null {
  if (systems.length < options.minimumSystems) return null;
  const ordered = [...systems].sort((left, right) => left.systemIndex - right.systemIndex);
  const firstIndex = Math.max(0, Math.min(focus.firstSystemIndex, focus.lastSystemIndex) - options.margin);
  const lastIndex = Math.min(ordered.length - 1, Math.max(focus.firstSystemIndex, focus.lastSystemIndex) + options.margin);
  const first = ordered[firstIndex];
  const last = ordered[lastIndex];
  if (!first || !last || first.measureNumbers.length === 0 || last.measureNumbers.length === 0) return null;
  if (lastIndex - firstIndex + 1 >= ordered.length) return null;
  return {
    firstSystemIndex: firstIndex,
    lastSystemIndex: lastIndex,
    firstMeasureNumber: Math.min(...first.measureNumbers),
    lastMeasureNumber: Math.max(...last.measureNumbers),
  };
}
