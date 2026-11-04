import test from 'node:test';
import assert from 'node:assert/strict';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';

/* Lyric melisma extenders and elisions survive import, export and edits (iteration 18). */

const LYRICS = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><lyric number="1"><syllabic>begin</syllabic><text>Glo</text></lyric><lyric number="2"><syllabic>single</syllabic><text>Ah</text><extend type="start"/></lyric></note>
<note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><lyric number="1"><syllabic>end</syllabic><text>ri</text><elision>‿</elision><syllabic>single</syllabic><text>a</text></lyric><lyric number="2"><extend type="continue"/></lyric></note>
<note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>in</text><extend/></lyric><lyric number="2"><extend type="stop"/></lyric></note>
<note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
</measure></part></score-partwise>`;

function lyricElements(xml: string) {
  return (xml.match(/<lyric\b[\s\S]*?<\/lyric>/g) ?? []).map((lyric) => lyric.replace(/\s+/g, ''));
}

const EXPECTED = [
  '<lyric><syllabic>begin</syllabic><text>Glo</text></lyric>',
  '<lyricnumber="2"><syllabic>single</syllabic><text>Ah</text><extendtype="start"/></lyric>',
  '<lyric><syllabic>end</syllabic><text>ri</text><elision>‿</elision><syllabic>single</syllabic><text>a</text></lyric>',
  '<lyricnumber="2"><extendtype="continue"/></lyric>',
  '<lyric><syllabic>single</syllabic><text>in</text><extend/></lyric>',
  '<lyricnumber="2"><extendtype="stop"/></lyric>',
];

test('extenders, extender-only verses and elisions survive export', () => {
  assert.deepEqual(lyricElements(exportCoreToMusicXml(LYRICS, importMusicXmlToCore(LYRICS))), EXPECTED);
});

test('an unrelated edit keeps extenders and elisions', () => {
  const state = buildDocumentState(LYRICS);
  const last = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[3]!;
  const edited = applyDocumentCommands(state, [{
    type: 'changeNotePitch', coreEntityId: last.id, measureNumber: 1, staffIndex: 1, voiceId: 1,
    timestampNum: last.timestampNum, timestampDen: last.timestampDen, step: 'G', octave: 5, alter: 0,
  } as never]);
  assert.deepEqual(lyricElements(edited.xml), EXPECTED);
});
