import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { attachCoreSelectionIdentity, normalizeSelectedNote, repairRenderedDuplicatePartIdentity, repairRenderedRestPartIdentity, resolveSemanticMeasureClickTarget, selectedNoteEquals } from '../src/render-bridge/osmd/note-selection.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import type { SelectedNote } from '../hooks/useNoteEditor.ts';
import { findNearestRenderedNoteInMeasure, getVisibleMeasureSelectionIds, mergeAugmentedMeasureOverlays, sanitizeXmlForOsmdRender } from '../components/ScoreEditor.tsx';
import type { RenderedNote } from '../src/render-bridge/osmd/note-selection.ts';
import type { RenderedMeasureLayoutOverlay } from '../src/render-bridge/osmd/layout-plan-bridge.ts';

(globalThis as typeof globalThis & { DOMParser?: typeof globalThis.DOMParser }).DOMParser =
  DOMParser as unknown as typeof globalThis.DOMParser;
(globalThis as typeof globalThis & { XMLSerializer?: typeof globalThis.XMLSerializer }).XMLSerializer =
  XMLSerializer as unknown as typeof globalThis.XMLSerializer;

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

function makeSelectedNote(): SelectedNote {
  return {
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'C',
    octave: 4,
    alter: 0,
    isRest: false,
    graphicalNote: null,
  };
}

test('augmented overlay merge preserves real staff geometry for existing measures', () => {
  const makeOverlay = (domRect: RenderedMeasureLayoutOverlay['domRect']): RenderedMeasureLayoutOverlay => ({
    measureId: 'm1',
    measureNumber: 1,
    systemIndex: 0,
    pageIndex: 0,
    widthWeight: 1,
    domRect,
    breakBefore: false,
    pageBreakBefore: false,
    staffSpacing: null,
  });
  const base = makeOverlay({ x: 20, y: 10, width: 80, height: 120 });
  const augmented = {
    ...makeOverlay({ x: 10, y: 10, width: 100, height: 120 }),
    staffDetails: [{
      staffIndex: 1,
      corePartId: 'P4',
      musicSheetStaffId: 3,
      topLineDomY: 44,
      bottomLineDomY: 64,
      lineDistanceDom: 5,
      lineCount: 5,
    }],
  };

  const [merged] = mergeAugmentedMeasureOverlays([base], [augmented]);

  assert.deepEqual(merged.domRect, augmented.domRect);
  assert.deepEqual(merged.staffDetails, augmented.staffDetails);
});

test('attachCoreSelectionIdentity resolves core ids from the score document', () => {
  const core = importMusicXmlToCore(SAMPLE_XML);
  const enriched = attachCoreSelectionIdentity(makeSelectedNote(), core);

  assert.ok(enriched.coreEntityId);
  assert.ok(enriched.coreVoiceId);
  assert.ok(enriched.coreMeasureId);
  assert.ok(enriched.corePartId);
});

test('attachCoreSelectionIdentity matches equivalent timestamp fractions', () => {
  const core = importMusicXmlToCore(SAMPLE_XML);
  const enriched = attachCoreSelectionIdentity({
    ...makeSelectedNote(),
    timestampNum: 0,
    timestampDen: 1,
  }, core);

  assert.ok(enriched.coreEntityId);
});

test('normalizeSelectedNote prefers the matched core pitch over OSMD runtime pitch data', () => {
  const core = importMusicXmlToCore(SAMPLE_XML);
  const normalized = normalizeSelectedNote({
    sourceNote: {
      SourceMeasure: { MeasureNumberXML: 1 },
      ParentVoiceEntry: {
        ParentVoice: { VoiceId: 1 },
        Timestamp: { Numerator: 0, Denominator: 1 },
      },
      ParentStaff: { Id: 1 },
      Pitch: {
        FundamentalNote: 0,
        Accidental: 2,
        Octave: 1,
      },
      NoteTypeXml: 'quarter',
      NoteDots: [],
    },
  }, core);

  assert.equal(normalized?.step, 'C');
  assert.equal(normalized?.octave, 4);
  assert.equal(normalized?.coreEntityId != null, true);
});

test('normalizeSelectedNote uses the OSMD part identity when local staff indexes repeat', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Upper</part-name></score-part>
    <score-part id="P2"><part-name>Lower</part-name></score-part>
  </part-list>
  ${['P1', 'P2'].map((partId) => `<part id="${partId}"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
  </measure></part>`).join('')}
</score-partwise>`;
  const core = importMusicXmlToCore(xml);
  const normalized = normalizeSelectedNote({
    sourceNote: {
      SourceMeasure: { MeasureNumberXML: 1 },
      ParentVoiceEntry: {
        ParentVoice: { VoiceId: 1 },
        Timestamp: { Numerator: 0, Denominator: 1 },
      },
      ParentStaff: { Id: 1, ParentInstrument: { IdString: 'P2' } },
      Pitch: { FundamentalNote: 0, Accidental: 2, Octave: 4 },
      NoteTypeXml: 'quarter',
      NoteDots: [],
    },
  }, core);

  assert.equal(normalized?.corePartId, core.score.parts[1]?.id);
  assert.equal(normalized?.coreMeasureId, core.score.parts[1]?.staves[0]?.measures[0]?.id);
});

test('repairRenderedRestPartIdentity maps identical rendered rests to their visual parts', () => {
  const core = importMusicXmlToCore(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Trumpet 1</part-name></score-part>
    <score-part id="P2"><part-name>Trumpet 2</part-name></score-part>
    <score-part id="P3"><part-name>Trombone</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><rest/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><rest/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
  <part id="P3">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><rest/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`);

  const baseNote: SelectedNote = {
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
    step: 'C',
    octave: 4,
    alter: 0,
    isRest: true,
    corePartId: core.score.parts[0]!.id,
    coreEntityId: core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.id,
    graphicalNote: null,
  };
  const rendered = [20, 60, 100].map((y, index): RenderedNote => ({
    id: `rest:${index}`,
    coreEntityId: baseNote.coreEntityId ?? null,
    note: { ...baseNote },
    svgCenter: { x: 0, y },
    domCenter: { x: 120, y },
    domRect: { x: 110, y: y - 5, width: 20, height: 10 },
    svgElement: null,
    tintElement: null,
  }));

  repairRenderedRestPartIdentity(rendered, core);

  assert.deepEqual(
    rendered.map((entry) => entry.note.corePartId),
    core.score.parts.map((part) => part.id),
  );
  assert.equal(selectedNoteEquals(rendered[0]!.note, rendered[1]!.note), false);
  assert.equal(selectedNoteEquals(rendered[1]!.note, rendered[2]!.note), false);
});

test('repairRenderedDuplicatePartIdentity keeps notation above TAB when part order is reversed', () => {
  const core = importMusicXmlToCore(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar TAB</part-name></score-part>
    <score-part id="P2"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><staff-details><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details><clef><sign>TAB</sign></clef></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff><notations><technical><string>2</string><fret>3</fret></technical></notations></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>2</divisions><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`);
  const baseNote: SelectedNote = {
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'D',
    octave: 4,
    alter: 0,
    isRest: false,
    graphicalNote: null,
  };
  const rendered = [30, 90].map((y, index): RenderedNote => ({
    id: `note:${index}`,
    coreEntityId: null,
    note: { ...baseNote },
    svgCenter: { x: 0, y },
    domCenter: { x: 120, y },
    domRect: { x: 110, y: y - 5, width: 20, height: 10 },
    svgElement: null,
    tintElement: null,
  }));

  repairRenderedDuplicatePartIdentity(rendered, core);

  assert.equal(rendered[0]!.note.corePartId, core.score.parts[1]!.id);
  assert.equal(rendered[1]!.note.corePartId, core.score.parts[0]!.id);
  assert.equal(rendered[0]!.note.guitar, undefined);
  assert.deepEqual(rendered[1]!.note.guitar, { string: 2, fret: 3, techniques: [] });
});

test('selectedNoteEquals prefers core entity ids when present', () => {
  const a: SelectedNote = { ...makeSelectedNote(), coreEntityId: 'event:1' };
  const b: SelectedNote = { ...makeSelectedNote(), step: 'D', coreEntityId: 'event:1' };
  const c: SelectedNote = { ...makeSelectedNote(), coreEntityId: 'event:2' };

  assert.equal(selectedNoteEquals(a, b), true);
  assert.equal(selectedNoteEquals(a, c), false);
});

test('selectedNoteEquals matches equivalent timestamp fractions without core ids', () => {
  const a: SelectedNote = { ...makeSelectedNote(), timestampNum: 0, timestampDen: 4 };
  const b: SelectedNote = { ...makeSelectedNote(), timestampNum: 0, timestampDen: 1 };
  const c: SelectedNote = { ...makeSelectedNote(), timestampNum: 1, timestampDen: 4 };

  assert.equal(selectedNoteEquals(a, b), true);
  assert.equal(selectedNoteEquals(a, c), false);
});

test('resolveSemanticMeasureClickTarget maps stacked multi-voice noteheads by horizontal and vertical order', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <type>half</type>
        <staff>1</staff>
      </note>
      <backup><duration>2</duration></backup>
      <note>
        <pitch><step>G</step><octave>3</octave></pitch>
        <duration>1</duration>
        <voice>2</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;
  const core = importMusicXmlToCore(xml);
  const measureId = core.score.parts[0].staves[0].measures[0].id;

  const top = resolveSemanticMeasureClickTarget(core, measureId, [
    { x: 100, y: 40, width: 12, height: 10 },
    { x: 100, y: 55, width: 12, height: 10 },
  ], { x: 106, y: 45 });
  const bottom = resolveSemanticMeasureClickTarget(core, measureId, [
    { x: 100, y: 40, width: 12, height: 10 },
    { x: 100, y: 55, width: 12, height: 10 },
  ], { x: 106, y: 60 });

  assert.equal(top?.step, 'C');
  assert.equal(top?.octave, 4);
  assert.equal(top?.voiceId, 1);
  assert.equal(bottom?.step, 'G');
  assert.equal(bottom?.octave, 3);
  assert.equal(bottom?.voiceId, 2);
});

test('resolveSemanticMeasureClickTarget ignores grace notes for single-anchor fallback', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Lead</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <grace slash="yes"/>
        <pitch><step>D</step><octave>5</octave></pitch>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;
  const core = importMusicXmlToCore(xml);
  const measureId = core.score.parts[0].staves[0].measures[0].id;
  const target = resolveSemanticMeasureClickTarget(core, measureId, [], { x: 20, y: 20 });

  assert.equal(target?.step, 'C');
  assert.equal(target?.octave, 5);
  assert.equal(target?.isRest, false);
});

test('findNearestRenderedNoteInMeasure falls back to the closest note within the clicked measure', () => {
  const selected = findNearestRenderedNoteInMeasure([
    {
      id: 'm1-a',
      coreEntityId: null,
      note: { ...makeSelectedNote(), measureNumber: 1, step: 'C', octave: 4 },
      svgCenter: { x: 0, y: 0 },
      domCenter: { x: 50, y: 40 },
      domRect: { x: 44, y: 34, width: 12, height: 12 },
      svgElement: null,
      tintElement: null,
    },
    {
      id: 'm1-b',
      coreEntityId: null,
      note: { ...makeSelectedNote(), measureNumber: 1, step: 'G', octave: 4, timestampNum: 2 },
      svgCenter: { x: 0, y: 0 },
      domCenter: { x: 180, y: 52 },
      domRect: { x: 174, y: 46, width: 12, height: 12 },
      svgElement: null,
      tintElement: null,
    },
    {
      id: 'm2-a',
      coreEntityId: null,
      note: { ...makeSelectedNote(), measureNumber: 2, step: 'D', octave: 5 },
      svgCenter: { x: 0, y: 0 },
      domCenter: { x: 300, y: 40 },
      domRect: { x: 294, y: 34, width: 12, height: 12 },
      svgElement: null,
      tintElement: null,
    },
  ], { x: 48, y: 40 }, 1);

  assert.equal(selected?.measureNumber, 1);
  assert.equal(selected?.step, 'C');
  assert.equal(selected?.octave, 4);
});

test('findNearestRenderedNoteInMeasure ignores clicks that are not close to any notehead', () => {
  const selected = findNearestRenderedNoteInMeasure([
    {
      id: 'm1-a',
      coreEntityId: null,
      note: { ...makeSelectedNote(), measureNumber: 1, step: 'C', octave: 4 },
      svgCenter: { x: 0, y: 0 },
      domCenter: { x: 50, y: 40 },
      domRect: { x: 44, y: 34, width: 12, height: 12 },
      svgElement: null,
      tintElement: null,
    },
    {
      id: 'm1-b',
      coreEntityId: null,
      note: { ...makeSelectedNote(), measureNumber: 1, step: 'G', octave: 4, timestampNum: 2 },
      svgCenter: { x: 0, y: 0 },
      domCenter: { x: 180, y: 52 },
      domRect: { x: 174, y: 46, width: 12, height: 12 },
      svgElement: null,
      tintElement: null,
    },
  ], { x: 20, y: 38 }, 1);

  assert.equal(selected, null);
});

test('getVisibleMeasureSelectionIds hides measure overlays for a focused single note', () => {
  const selectedNote = makeSelectedNote();

  assert.deepEqual(
    getVisibleMeasureSelectionIds(['measure:1'], selectedNote, [selectedNote]),
    [],
  );
});

test('getVisibleMeasureSelectionIds preserves measure overlays for multi-note selections', () => {
  const selectedNote = makeSelectedNote();
  const otherNote: SelectedNote = {
    ...makeSelectedNote(),
    coreEntityId: 'event:2',
    timestampNum: 1,
    timestampDen: 4,
    step: 'D',
  };

  assert.deepEqual(
    getVisibleMeasureSelectionIds(['measure:1', 'measure:2'], otherNote, [selectedNote, otherNote]),
    ['measure:1', 'measure:2'],
  );
});

test('sanitizeXmlForOsmdRender removes metronome and empty direction-type nodes that break OSMD', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no">
            <beat-unit>quarter</beat-unit>
            <per-minute>120</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="120"/>
        <staff>1</staff>
      </direction>
      <direction placement="above">
        <direction-type>
          
        </direction-type>
        <staff>1</staff>
      </direction>
      <direction placement="above">
        <direction-type><words>dolce</words></direction-type>
        <staff>1</staff>
      </direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const sanitized = sanitizeXmlForOsmdRender(xml);

  assert.ok(!sanitized.includes('<metronome'));
  assert.ok(!sanitized.includes('tempo="120"'));
  assert.ok(!sanitized.includes('<direction-type>\n          \n        </direction-type>'));
  assert.ok(sanitized.includes('<words>dolce</words>'));
});

test('sanitizeXmlForOsmdRender strips direct chord markers from unpitched notes', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
      <note>
        <chord/>
        <rest/>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

  const sanitized = sanitizeXmlForOsmdRender(xml);

  assert.doesNotMatch(sanitized, /<note>\s*<chord\/>\s*<rest\/>/);
  assert.match(sanitized, /<note>\s*<rest\/>/);
});
