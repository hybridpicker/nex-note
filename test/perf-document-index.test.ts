import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

import { syntheticScore } from '../scripts/benchmark-note-entry.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { normalizeScoreDocument } from '../src/score-core/normalize/normalize-score-document.ts';
import { getEffectiveMeasureTiming } from '../src/score-core/measure-timing.ts';
import {
  findMeasureLocationById,
  findStaffMeasureById,
  findStaffMeasureByNumber,
  getDocumentIndex,
  getIndexedEffectiveMeasureTiming,
} from '../src/score-core/document-index.ts';
import { staffIndexForMeasureId } from '../src/score-core/GeometryProxy.ts';
import { applyCoreCommands } from '../src/score-core/commands/core-command-executor.ts';
import { normalizeScoreCommands } from '../src/shared/schemas/score-command.ts';
import {
  buildOsmdLayoutBridge,
  buildRenderedMeasureLayoutOverlays,
  type OsmdLayoutBridge,
} from '../src/render-bridge/osmd/layout-plan-bridge.ts';
import { projectOsmdLayoutXml } from '../src/render-bridge/osmd/layout-render-xml.ts';
import type { RectLike, RenderedNote } from '../src/render-bridge/osmd/note-selection.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';

/*
 * Equivalence tests for the per-edit lookup work removed by the perf-core pass: the cached
 * document index, the grouped measure overlays and the Map-based layout XML projection must give
 * exactly what the old linear scans gave. The old algorithms are kept here as oracles.
 */

const FIXTURE_DIR = path.join(process.cwd(), 'test', 'fixtures');

function fixtureFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return fixtureFiles(full);
    return /\.(musicxml|xml)$/.test(entry.name) ? [full] : [];
  });
}

const note = (step: string, duration: number, type: string) => (
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>1</voice><type>${type}</type></note>`
);

/** Pickup, divisions change, time signature changes with beat groups, and an implicit measure. */
function meterChangeScore() {
  return '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Synthetic</part-name></score-part>'
    + '<score-part id="P2"><part-name>Synthetic 2</part-name></score-part></part-list>'
    + ['P1', 'P2'].map((id) => `<part id="${id}">`
      + '<measure number="0" implicit="yes"><attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' + note('C', 2, 'quarter') + '</measure>'
      + `<measure number="1">${note('D', 2, 'quarter').repeat(3)}</measure>`
      + `<measure number="2"><attributes><divisions>4</divisions><time><beats>7</beats><beat-type>8</beat-type></time></attributes>${note('E', 2, 'eighth').repeat(7)}</measure>`
      + `<measure number="3">${note('F', 2, 'eighth').repeat(7)}</measure>`
      + `<measure number="4"><attributes><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${note('G', 4, 'quarter').repeat(4)}</measure>`
      + `<measure number="5" implicit="yes">${note('A', 4, 'quarter').repeat(2)}</measure>`
      + '</part>').join('')
    + '</score-partwise>';
}

function corpus(): Array<{ name: string; xml: string; doc: ScoreDocumentModel }> {
  const sources = [
    ...fixtureFiles(FIXTURE_DIR).map((file) => ({ name: path.relative(FIXTURE_DIR, file), xml: readFileSync(file, 'utf8') })),
    { name: 'synthetic 16x2', xml: syntheticScore(16, 2) },
    { name: 'synthetic meter changes', xml: meterChangeScore() },
  ];
  return sources.map(({ name, xml }) => ({ name, xml, doc: normalizeScoreDocument(importMusicXmlToCore(xml)) }));
}

/** A copy of the document with repeated measure ids and numbers, to pin "first match" order. */
function withDuplicates(doc: ScoreDocumentModel): ScoreDocumentModel {
  const copy = structuredClone(doc);
  const staves = copy.score.parts.flatMap((part) => part.staves);
  const first = staves[0]!;
  if (first.measures.length >= 3) {
    first.measures[2]!.measureNumber = first.measures[1]!.measureNumber;
    first.measures[2]!.id = first.measures[0]!.id;
  }
  const last = staves.at(-1)!;
  if (last !== first && last.measures.length >= 2) last.measures[1]!.id = first.measures[0]!.id;
  return copy;
}

// --- Old linear algorithms (oracles) ------------------------------------------------------------

function oracleStaffIndexForMeasureId(coreDocument: ScoreDocumentModel | null | undefined, measureId: string) {
  if (!coreDocument) return null;
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      if (staff.measures.some((measure) => measure.id === measureId)) return staff.staffIndex;
    }
  }
  return null;
}

function oracleMeasureLocationById(coreDocument: ScoreDocumentModel, measureId: string) {
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      const measureIndex = staff.measures.findIndex((measure) => measure.id === measureId);
      if (measureIndex >= 0) return { part, staff, measure: staff.measures[measureIndex]!, measureIndex };
    }
  }
  return null;
}

function oracleRenderedMeasureLayoutOverlays(renderedNotes: RenderedNote[], layoutBridge: OsmdLayoutBridge | null | undefined) {
  if (!layoutBridge) return [];
  const unionRects = (rects: RectLike[]): RectLike | null => {
    if (rects.length === 0) return null;
    const left = Math.min(...rects.map((rect) => rect.x));
    const top = Math.min(...rects.map((rect) => rect.y));
    const right = Math.max(...rects.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  };
  return layoutBridge.measures.flatMap((measure) => {
    const rects = renderedNotes
      .filter((entry) => entry.note.coreMeasureId === measure.measureId)
      .map((entry) => entry.domRect);
    const domRect = unionRects(rects);
    if (!domRect) return [];
    return [{
      measureId: measure.measureId,
      measureNumber: measure.measureNumber,
      systemIndex: measure.systemIndex,
      pageIndex: measure.pageIndex,
      widthWeight: measure.widthWeight,
      domRect,
      breakBefore: measure.breakBefore,
      pageBreakBefore: measure.pageBreakBefore,
      staffSpacing: measure.staffSpacing,
    }];
  }).sort((a, b) => a.pageIndex - b.pageIndex || a.systemIndex - b.systemIndex || a.measureNumber - b.measureNumber);
}

function oracleProjectOsmdLayoutXml(xml: string, document: ScoreDocumentModel, bridge: OsmdLayoutBridge): string {
  const parsed = new DOMParser().parseFromString(xml, 'text/xml');
  const xmlParts = Array.from(parsed.getElementsByTagName('part'));
  const plans = new Map(bridge.measures.map(measure => [measure.measureId, measure]));
  for (const part of document.score.parts) {
    const xmlPart = xmlParts.find(candidate => candidate.getAttribute('id') === part.sourcePartId);
    if (!xmlPart) continue;
    const canonical = part.staves.find(staff => staff.measures.length)?.measures ?? [];
    const sourceMeasures = Array.from(xmlPart.getElementsByTagName('measure'));
    for (const measure of canonical) {
      const plan = plans.get(measure.id);
      const element = sourceMeasures.find(candidate => Number(candidate.getAttribute('number')) === (measure.sourceMeasureNumber ?? measure.measureNumber));
      if (!plan || !element) continue;
      const prints = Array.from(element.childNodes).filter(node => node.nodeType === 1 && node.nodeName === 'print') as typeof element[];
      for (const print of prints) { print.removeAttribute('new-system'); print.removeAttribute('new-page'); }
      const print = prints[0] ?? parsed.createElement('print');
      if (!prints.length) element.insertBefore(print, element.firstChild);
      if (plan.breakBefore) print.setAttribute('new-system', 'yes');
      if (plan.pageBreakBefore) print.setAttribute('new-page', 'yes');
      if (plan.staffSpacing != null) {
        const layouts = Array.from(print.getElementsByTagName('staff-layout'));
        const layout = layouts.find(candidate => !candidate.hasAttribute('number')) ?? parsed.createElement('staff-layout');
        if (!layout.parentNode) print.appendChild(layout);
        const distance = layout.getElementsByTagName('staff-distance')[0] ?? parsed.createElement('staff-distance');
        if (!distance.parentNode) layout.appendChild(distance);
        distance.textContent = String(plan.staffSpacing);
      }
    }
  }
  return new XMLSerializer().serializeToString(parsed);
}

// --- Document index ------------------------------------------------------------------------------

function timingQueries(doc: ScoreDocumentModel) {
  const queries: Array<Parameters<typeof getEffectiveMeasureTiming>[1]> = [];
  const partIds = [null, undefined, 'missing-part', ...doc.score.parts.flatMap((part) => [part.id, part.sourcePartId])];
  const staffIndexes = [null, undefined, 0, 1, 2, 3];
  const measures = doc.score.parts.flatMap((part) => part.staves.flatMap((staff) => staff.measures));
  const numbers = [...new Set(measures.map((measure) => measure.measureNumber)), -1, 9999, Number.NaN];
  const ids = [...new Set(measures.map((measure) => measure.id)), 'missing-measure', ''];
  for (const measureId of [null, undefined, ...ids]) {
    for (const measureNumber of [null, undefined, ...numbers]) {
      // Keep the query count bounded: measure ids pair with a few numbers only.
      if (measureId && measureNumber != null && measureNumber !== numbers[0]) continue;
      for (const staffIndex of staffIndexes) {
        for (const partId of partIds) queries.push({ measureId, measureNumber, staffIndex, partId });
      }
    }
  }
  return queries;
}

test('indexed timing matches getEffectiveMeasureTiming for every query on the fixture corpus', () => {
  let compared = 0;
  for (const { name, doc } of corpus()) {
    for (const candidate of [doc, withDuplicates(doc)]) {
      for (const query of timingQueries(candidate)) {
        const expected = getEffectiveMeasureTiming(candidate, query);
        const actual = getIndexedEffectiveMeasureTiming(candidate, query);
        assert.deepStrictEqual(actual, expected, `${name}: ${JSON.stringify(query)}`);
        if (expected && actual) {
          assert.equal(actual.part, expected.part, `${name}: part identity`);
          assert.equal(actual.staff, expected.staff, `${name}: staff identity`);
          assert.equal(actual.measure, expected.measure, `${name}: measure identity`);
        }
        compared += 1;
      }
    }
  }
  assert.ok(compared > 1000, `compared ${compared} queries`);
  assert.equal(getIndexedEffectiveMeasureTiming(null, { measureNumber: 1 }), null);
  assert.equal(getIndexedEffectiveMeasureTiming(undefined, { measureNumber: 1 }), null);
});

test('indexed timing results are independent copies', () => {
  const doc = normalizeScoreDocument(importMusicXmlToCore(meterChangeScore()));
  const measureId = doc.score.parts[0]!.staves[0]!.measures[2]!.id;
  const first = getIndexedEffectiveMeasureTiming(doc, { measureId })!;
  first.timeSignature!.beats = 99;
  first.divisions = 99;
  const second = getIndexedEffectiveMeasureTiming(doc, { measureId })!;
  assert.deepStrictEqual(second, getEffectiveMeasureTiming(doc, { measureId }));
  assert.equal(second.timeSignature!.beats, 7);
});

test('indexed measure lookups match the linear scans on the fixture corpus', () => {
  for (const { name, doc } of corpus()) {
    for (const candidate of [doc, withDuplicates(doc)]) {
      const staves = candidate.score.parts.flatMap((part) => part.staves);
      const measures = staves.flatMap((staff) => staff.measures);
      const ids = [...new Set(measures.map((measure) => measure.id)), 'missing-measure', ''];
      const numbers = [...new Set(measures.map((measure) => measure.measureNumber)), -1, 9999, Number.NaN];
      for (const id of ids) {
        assert.equal(staffIndexForMeasureId(candidate, id), oracleStaffIndexForMeasureId(candidate, id), `${name}: staff of ${id}`);
        const expected = oracleMeasureLocationById(candidate, id);
        const actual = findMeasureLocationById(candidate, id);
        assert.equal(actual?.part ?? null, expected?.part ?? null, `${name}: part of ${id}`);
        assert.equal(actual?.staff ?? null, expected?.staff ?? null, `${name}: staff node of ${id}`);
        assert.equal(actual?.measure ?? null, expected?.measure ?? null, `${name}: measure ${id}`);
        assert.equal(actual?.measureIndex ?? null, expected?.measureIndex ?? null, `${name}: index of ${id}`);
        for (const staff of staves) {
          assert.equal(findStaffMeasureById(candidate, staff, id), staff.measures.find((measure) => measure.id === id), `${name}: staff measure ${id}`);
        }
      }
      for (const number of numbers) {
        for (const staff of staves) {
          assert.equal(
            findStaffMeasureByNumber(candidate, staff, number),
            staff.measures.find((measure) => measure.measureNumber === number),
            `${name}: staff measure number ${number}`,
          );
        }
      }
    }
    assert.equal(staffIndexForMeasureId(null, 'x'), null);
    assert.equal(findMeasureLocationById(undefined, 'x'), null);
  }
});

test('a staff from another document falls back to the linear scan', () => {
  const doc = normalizeScoreDocument(importMusicXmlToCore(syntheticScore(4)));
  const foreign = structuredClone(doc).score.parts[0]!.staves[0]!;
  assert.equal(findStaffMeasureByNumber(doc, foreign, 3), foreign.measures[2]);
  assert.equal(findStaffMeasureById(doc, foreign, foreign.measures[1]!.id), foreign.measures[1]);
  assert.equal(findStaffMeasureByNumber(null, foreign, 2), foreign.measures[1]);
});

test('the index is cached per document object and a new document gets a fresh index', () => {
  const doc = normalizeScoreDocument(importMusicXmlToCore(syntheticScore(4, 2)));
  const index = getDocumentIndex(doc);
  assert.equal(getDocumentIndex(doc), index, 'same document, same index');

  const copy = structuredClone(doc);
  assert.notEqual(getDocumentIndex(copy), index, 'a copy gets its own index');
  assert.equal(findMeasureLocationById(copy, copy.score.parts[0]!.staves[0]!.measures[0]!.id)?.measure, copy.score.parts[0]!.staves[0]!.measures[0]);

  // An edit produces a new document; lookups on it see the new structure, the old one is unchanged.
  const lastNumber = doc.score.parts[0]!.staves[0]!.measures.at(-1)!.measureNumber;
  const commands = normalizeScoreCommands([{ type: 'insertMeasureAfter', measureNumber: lastNumber }]);
  const edited = applyCoreCommands(doc, commands);
  assert.notEqual(edited, doc);
  const added = edited.score.parts[0]!.staves[0]!.measures.at(-1)!;
  assert.equal(added.measureNumber, lastNumber + 1);
  assert.equal(staffIndexForMeasureId(edited, added.id), oracleStaffIndexForMeasureId(edited, added.id));
  assert.notEqual(staffIndexForMeasureId(edited, added.id), null);
  assert.equal(findStaffMeasureByNumber(edited, edited.score.parts[0]!.staves[0]!, lastNumber + 1), added);
  assert.equal(findStaffMeasureByNumber(doc, doc.score.parts[0]!.staves[0]!, lastNumber + 1), undefined);
  assert.equal(getDocumentIndex(doc), index, 'the published input keeps its index');
});

test('structural mutation of an indexed document rebuilds the index (safety net)', () => {
  const doc = normalizeScoreDocument(importMusicXmlToCore(syntheticScore(4)));
  const staff = doc.score.parts[0]!.staves[0]!;
  const index = getDocumentIndex(doc);
  const extra = { ...structuredClone(staff.measures[0]!), id: 'extra-measure', measureNumber: 42 };
  staff.measures.push(extra);
  assert.equal(findStaffMeasureByNumber(doc, staff, 42), extra);
  assert.equal(staffIndexForMeasureId(doc, 'extra-measure'), staff.staffIndex);
  assert.notEqual(getDocumentIndex(doc), index);
  staff.measures = staff.measures.slice(0, 2);
  assert.equal(findStaffMeasureByNumber(doc, staff, 3), undefined);
  assert.equal(staffIndexForMeasureId(doc, 'extra-measure'), null);
});

// --- Measure overlays ----------------------------------------------------------------------------

test('grouped measure overlays match the per-measure filter on the fixture corpus', () => {
  for (const { name, doc } of corpus()) {
    const bridge = buildOsmdLayoutBridge(doc);
    const measures = doc.score.parts.flatMap((part) => part.staves.flatMap((staff) => staff.measures));
    const renderedNotes: RenderedNote[] = [];
    let seed = 7;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (const measure of measures) {
      const events = measure.voices.flatMap((voice) => voice.events);
      for (const [eventIndex, event] of events.entries()) {
        if (random() < 0.15) continue; // Some events are not rendered.
        renderedNotes.push({
          id: event.id,
          coreEntityId: event.id,
          note: { coreMeasureId: measure.id, measureNumber: measure.measureNumber } as RenderedNote['note'],
          svgCenter: { x: 0, y: 0 },
          domCenter: { x: 0, y: 0 },
          domRect: { x: Math.round(random() * 900), y: Math.round(random() * 400) - eventIndex, width: 6 + eventIndex, height: 20 },
          svgElement: null,
          tintElement: null,
        });
      }
    }
    // Notes without or with an unknown core measure never produce an overlay.
    for (const coreMeasureId of [null, undefined, 'unknown-measure']) {
      renderedNotes.push({ ...renderedNotes[0]!, note: { ...renderedNotes[0]!.note, coreMeasureId } });
    }
    renderedNotes.sort(() => random() - 0.5);
    assert.deepStrictEqual(
      buildRenderedMeasureLayoutOverlays(renderedNotes, bridge),
      oracleRenderedMeasureLayoutOverlays(renderedNotes, bridge),
      name,
    );
    assert.deepStrictEqual(buildRenderedMeasureLayoutOverlays([], bridge), []);
  }
  assert.deepStrictEqual(buildRenderedMeasureLayoutOverlays([], null), []);
});

// --- Layout XML projection -----------------------------------------------------------------------

/** Exercise every branch of the projection: breaks, page breaks and staff spacing on some measures. */
function withLayoutControls(bridge: OsmdLayoutBridge, salt: number): OsmdLayoutBridge {
  return {
    ...bridge,
    measures: bridge.measures.map((measure, index) => ({
      ...measure,
      breakBefore: (index + salt) % 3 === 0,
      pageBreakBefore: (index + salt) % 5 === 0,
      staffSpacing: (index + salt) % 4 === 0 ? 60 + index : (index + salt) % 4 === 1 ? null : measure.staffSpacing,
    })),
  };
}

/** Repeated, non-numeric and missing measure numbers, plus an existing print element. */
function irregularNumbersXml(xml: string) {
  let count = 0;
  return xml.replace(/<measure number="(\d+)"([^>]*)>/g, (match, _number: string, rest: string) => {
    count += 1;
    if (count === 2) return `<measure number="1"${rest}>`;
    if (count === 3) return `<measure number="X3"${rest}>`;
    if (count === 4) return `<measure${rest}>`;
    if (count === 5) return `${match}<print new-system="yes"><staff-layout><staff-distance>11</staff-distance></staff-layout><staff-layout number="2"/></print>`;
    return match;
  });
}

test('layout XML projection is byte-identical to the linear-search algorithm on the fixture corpus', () => {
  let compared = 0;
  for (const { name, xml, doc } of corpus()) {
    const variants = [xml, irregularNumbersXml(xml)];
    for (const [variantIndex, source] of variants.entries()) {
      const variantDoc = variantIndex === 0 ? doc : normalizeScoreDocument(importMusicXmlToCore(source));
      const baseBridge = buildOsmdLayoutBridge(variantDoc);
      for (const bridge of [baseBridge, withLayoutControls(baseBridge, 0), withLayoutControls(baseBridge, 1)]) {
        const before = JSON.stringify(variantDoc);
        assert.equal(
          projectOsmdLayoutXml(source, variantDoc, bridge),
          oracleProjectOsmdLayoutXml(source, variantDoc, bridge),
          `${name} variant ${variantIndex}`,
        );
        assert.equal(JSON.stringify(variantDoc), before, 'the document is not mutated');
        compared += 1;
      }
    }
  }
  assert.ok(compared >= 30, `compared ${compared} projections`);
});
