import test from 'node:test';
import assert from 'node:assert/strict';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';

const direction = (body: string, staff?: number) => (
  `<direction placement="below"><direction-type>${body}</direction-type>${staff ? `<staff>${staff}</staff>` : ''}</direction>`
);

/** Synthetic two-staff piano bar: pedal and dynamic on staff 2 at beat 1, a pedal change at beat 3, two left-hand voices. */
const GRAND_STAFF_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
${direction('<words>dolce</words>')}
<note><pitch><step>C</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
<backup><duration>8</duration></backup>
${direction('<pedal type="start" line="yes"/>', 2)}${direction('<dynamics><p/></dynamics>', 2)}
<note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><type>half</type><staff>2</staff></note>
${direction('<pedal type="change" line="yes"/>', 2)}
<note><pitch><step>E</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><type>half</type><staff>2</staff></note>
<backup><duration>8</duration></backup>
<note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>6</voice><type>whole</type><staff>2</staff></note>
</measure>
<measure number="2">
<note><pitch><step>D</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
<backup><duration>8</duration></backup>
<note><pitch><step>D</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><type>half</type><staff>2</staff></note>
${direction('<pedal type="stop" line="yes"/>', 2)}
<note><pitch><step>F</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><type>half</type><staff>2</staff></note></measure>
</part></score-partwise>`;

function count(xml: string, pattern: RegExp) {
  return (xml.match(pattern) ?? []).length;
}

/**
 * Each direction as kind:value@measure:position-in-quarters:staff, from a fresh import. A missing
 * `<staff>` means staff 1 in MusicXML, so both spellings summarize as staff 1.
 */
function directionSummary(xml: string) {
  const core = importMusicXmlToCore(xml);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const staff of core.score.parts[0]!.staves) {
    for (const measure of staff.measures) {
      for (const entry of measure.directions) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        const quarters = entry.timestampNum != null && entry.timestampDen
          ? (entry.timestampNum / entry.timestampDen) * 4
          : 0;
        result.push(`${entry.kind}:${entry.value ?? ''}@${measure.measureNumber}:${quarters}:${entry.staffIndex ?? 1}`);
      }
    }
  }
  return result.sort();
}

function editFirstNote(xml: string) {
  const state = buildDocumentState(xml);
  const part = state.coreDocument!.score.parts[0]!;
  const measure = part.staves[0]!.measures[0]!;
  const first = measure.voices[0]!.events[0]!;
  return applyDocumentCommands(state, [{
    type: 'changeNotePitch',
    coreEntityId: first.id,
    coreMeasureId: measure.id,
    corePartId: part.id,
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 2,
    step: 'E',
    octave: 5,
    alter: 0,
  } as never]);
}

test('import keeps pedal types and the beat position of mid-measure directions', () => {
  assert.deepEqual(directionSummary(GRAND_STAFF_XML), [
    'dynamics:p@1:0:2',
    'pedal:change@1:2:2',
    'pedal:start@1:0:2',
    'pedal:stop@2:2:2',
    'words:dolce@1:0:1',
  ]);
});

test('core export keeps lower-staff directions, their positions and pedal types', () => {
  const exported = exportCoreToMusicXml(GRAND_STAFF_XML, importMusicXmlToCore(GRAND_STAFF_XML));
  assert.equal(count(exported, /<pedal\b/g), 3);
  assert.equal(count(exported, /<dynamics>/g), 1);
  assert.equal(count(exported, /<words>dolce<\/words>/g), 1);
  assert.deepEqual(directionSummary(exported), directionSummary(GRAND_STAFF_XML));
});

test('editing a right-hand note keeps every left-hand dynamic and pedal mark', () => {
  const edited = editFirstNote(GRAND_STAFF_XML);
  assert.match(edited.xml, /<step>E<\/step><octave>5<\/octave>/);
  assert.deepEqual(directionSummary(edited.xml), directionSummary(GRAND_STAFF_XML));
});

test('a mid-measure direction on a two-voice staff is exported once', () => {
  const edited = editFirstNote(GRAND_STAFF_XML);
  assert.equal(count(edited.xml, /<pedal type="change"/g), 1);
});

test('a pedal added to the lower staff is written to the document', () => {
  const result = applyDocumentCommands(buildDocumentState(GRAND_STAFF_XML), [{
    type: 'addPedalSpan',
    staffIndex: 2,
    startMeasureNumber: 2,
    startTimestampNum: 0,
    startTimestampDen: 4,
    stopMeasureNumber: 2,
    stopTimestampNum: 3,
    stopTimestampDen: 4,
  } as never]);
  const summary = directionSummary(result.xml);
  assert.ok(summary.includes('pedal:start@2:0:2'), summary.join(', '));
  assert.ok(summary.includes('pedal:stop@2:3:2'), summary.join(', '));
});

test('files saved by earlier nex-note versions (cursor plus equal offset) keep their direction position', () => {
  const earlierExport = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note>
<direction placement="above"><direction-type><words>poco rit.</words></direction-type><offset>2</offset><staff>1</staff></direction>
<note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note>
</measure></part></score-partwise>`;
  assert.deepEqual(directionSummary(earlierExport), ['words:poco rit.@1:2:1']);
  const reexported = exportCoreToMusicXml(earlierExport, importMusicXmlToCore(earlierExport));
  assert.deepEqual(directionSummary(reexported), ['words:poco rit.@1:2:1']);
});
