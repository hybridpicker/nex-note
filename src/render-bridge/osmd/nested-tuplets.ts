import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import type { RenderedNote } from './note-selection';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

function nestedSpans(document: ScoreDocumentModel | null | undefined) {
  return document?.tuplets.filter(span => document.tuplets.some(other => span !== other && (
    span.eventIds.every(id => other.eventIds.includes(id)) || other.eventIds.every(id => span.eventIds.includes(id))
  ))) ?? [];
}
export function hasNestedTuplets(document: ScoreDocumentModel | null | undefined) {
  return nestedSpans(document).length > 0;
}

/** OSMD 1.9 has one tuplet ratio per note. Keep sounding XML, draw nested brackets from core IDs. */
export function nestedTupletRenderXml(xml: string, document: ScoreDocumentModel | null | undefined) {
  if (!hasNestedTuplets(document)) return xml;
  const parsed = new DOMParser().parseFromString(xml, 'text/xml');
  type Element = ReturnType<typeof parsed.createElement>;
  // MusicXML numbers are local and routinely reused in later measures/voices.
  // Pair actual start/stop elements in each lane before finding containment.
  for (const part of Array.from(parsed.getElementsByTagName('part'))) {
    for (const measure of Array.from(part.getElementsByTagName('measure'))) {
      const lanes = new Map<string, Array<{ number: string; start: number; stop: number; tags: Element[] }>>();
      Array.from(measure.getElementsByTagName('note')).forEach((note, index) => {
        const lane = `${note.getElementsByTagName('staff')[0]?.textContent ?? '1'}:${note.getElementsByTagName('voice')[0]?.textContent ?? '1'}`;
        const groups = lanes.get(lane) ?? [];
        lanes.set(lane, groups);
        for (const tag of Array.from(note.getElementsByTagName('tuplet'))) {
          const number = tag.getAttribute('number') || '1';
          if (tag.getAttribute('type') === 'start') groups.push({ number, start: index, stop: Infinity, tags: [tag] });
          else if (tag.getAttribute('type') === 'stop') {
            const group = groups.findLast(group => group.number === number && group.stop === Infinity);
            if (group) { group.stop = index; group.tags.push(tag); }
          }
        }
      });
      for (const groups of lanes.values()) for (const group of groups) {
        if (!Number.isFinite(group.stop)) continue;
        const nested = groups.some(other => other !== group && Number.isFinite(other.stop)
          && ((other.start <= group.start && other.stop >= group.stop) || (group.start <= other.start && group.stop >= other.stop)));
        if (nested) for (const tag of group.tags) { tag.setAttribute('bracket', 'no'); tag.setAttribute('show-number', 'none'); }
      }
    }
  }
  return new XMLSerializer().serializeToString(parsed);
}

export function drawNestedTupletBrackets(container: HTMLElement, document: ScoreDocumentModel | null | undefined, notes: RenderedNote[]) {
  container.querySelectorAll('[data-nex-tuplet]').forEach(element => element.remove());
  if (!document || !hasNestedTuplets(document)) return;
  const ns = 'http://www.w3.org/2000/svg';
  const byId = new Map(notes.map(note => [note.coreEntityId, note]));
  const depth = (span: ScoreDocumentModel['tuplets'][number]) => document.tuplets.filter(outer => outer !== span && span.eventIds.every(id => outer.eventIds.includes(id))).length;
  for (const span of nestedSpans(document)) {
    const members = span.eventIds.map(id => byId.get(id)).filter((note): note is RenderedNote => Boolean(note));
    if (!members.length) continue;
    const svg = members[0]!.svgElement?.ownerSVGElement;
    if (!svg || members.some(note => note.svgElement?.ownerSVGElement !== svg)) continue;
    const matrix = svg.getScreenCTM();
    if (!matrix) continue;
    const origin = container.getBoundingClientRect();
    const points = members.map(note => new DOMPoint(origin.left + note.domCenter.x, origin.top + note.domCenter.y).matrixTransform(matrix.inverse()));
    const maxDepth = Math.max(depth(span), ...document.tuplets.filter(inner => inner.eventIds.every(id => span.eventIds.includes(id))).map(depth));
    const left = Math.min(...points.map(point => point.x)) - 8;
    const right = Math.max(...points.map(point => point.x)) + 12;
    const y = Math.min(...points.map(point => point.y)) - 50 - (maxDepth - depth(span)) * 18;
    const center = (left + right) / 2;
    const label = span.showNumber === 'none' ? '' : span.showNumber === 'both' ? `${span.actualNotes}:${span.normalNotes}` : String(span.actualNotes);
    const group = window.document.createElementNS(ns, 'g');
    group.setAttribute('data-nex-tuplet', span.id); group.setAttribute('pointer-events', 'none');
    if (span.bracket !== false) {
      const gap = label.length ? label.length * 4 + 5 : 0;
      const path = window.document.createElementNS(ns, 'path');
      path.setAttribute('d', `M${left},${y+5}V${y}H${Math.max(left, center-gap)} M${Math.min(right,center+gap)},${y}H${right}V${y+5}`);
      path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1'); group.append(path);
    }
    if (label) {
      const text = window.document.createElementNS(ns, 'text'); text.textContent = label;
      text.setAttribute('x', String(center)); text.setAttribute('y', String(y+4)); text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '14'); text.setAttribute('font-family', 'serif'); text.setAttribute('font-weight', 'bold'); group.append(text);
    }
    svg.append(group);
  }
}
