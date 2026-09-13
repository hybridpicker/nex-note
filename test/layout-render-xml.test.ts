import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { syntheticScore } from '../scripts/benchmark-note-entry';
import { buildDocumentState } from '../src/score-core/commands/apply-document-commands';
import { buildOsmdLayoutBridge } from '../src/render-bridge/osmd/layout-plan-bridge';
import { projectOsmdLayoutXml } from '../src/render-bridge/osmd/layout-render-xml';
import { projectLayoutToDocument } from '../src/layout/project-layout-to-document';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml';

function controls(xml: string) {
  const parsed = new DOMParser().parseFromString(xml, 'text/xml');
  return Array.from(parsed.getElementsByTagName('measure')).map(measure => {
    const print = measure.getElementsByTagName('print')[0];
    return [print?.getAttribute('new-system') || '', print?.getAttribute('new-page') || '', print?.getElementsByTagName('staff-distance')[0]?.textContent];
  });
}

test('direct layout projection matches the existing plan on a full multi-part score', () => {
  const state = buildDocumentState(syntheticScore(32, 4));
  const core = state.coreDocument!;
  const before = JSON.stringify(core);
  const projected = projectOsmdLayoutXml(state.xml, core, buildOsmdLayoutBridge(core));
  const previous = exportCoreToMusicXml(state.xml, projectLayoutToDocument(core));
  assert.deepEqual(controls(projected), controls(previous));
  assert.equal(JSON.stringify(core), before);
  const notes = (xml: string) => Array.from(new DOMParser().parseFromString(xml, 'text/xml').getElementsByTagName('note')).map(note => new XMLSerializer().serializeToString(note));
  assert.deepEqual(notes(projected), notes(state.xml));
  assert.equal(notes(projected).length, 1024);
});

test('layout-only projection preserves imported print fields and unrelated notation', () => {
  const state = buildDocumentState(syntheticScore(2));
  const source = state.xml.replace('<measure number="1">', '<measure number="1"><print><system-layout><system-margins><left-margin>27</left-margin></system-margins></system-layout></print>')
    .replace('</note>', '<notations><other-notation type="single">Synthetic editorial marker</other-notation></notations></note>');
  const projected = projectOsmdLayoutXml(source, state.coreDocument!, buildOsmdLayoutBridge(state.coreDocument!));
  assert.match(projected, /<left-margin>27<\/left-margin>/);
  assert.match(projected, /Synthetic editorial marker/);
  assert.equal((projected.match(/<note>/g) ?? []).length, 16);
});
