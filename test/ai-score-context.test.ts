import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { buildAiScoreContext } from '../src/nex-note/context/build-ai-score-context.ts';

const MULTI_VOICE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Cello</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>2</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>2</duration></backup>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>2</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>2</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const EIGHT_MEASURE_MELODY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="3">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="4">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="5">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="6">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="7">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="8">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

test('buildAiScoreContext exposes primary voice previews and abc snippets', () => {
  const documentState = buildDocumentState(MULTI_VOICE_XML);
  const context = buildAiScoreContext(documentState);

  assert.ok(context.melodicContext);
  assert.equal(context.melodicContext?.primaryVoice?.partName, 'Piano');
  assert.equal(context.melodicContext?.primaryVoice?.staffIndex, 1);
  assert.equal(context.melodicContext?.primaryVoice?.voiceId, 1);
  assert.match(context.melodicContext?.primaryVoice?.preview ?? '', /m1:C5\/quarter D5\/quarter/);
  assert.match(context.melodicContext?.primaryVoice?.abcSnippet ?? '', /M:4\/4/);
  assert.match(context.melodicContext?.voicePreviews[0]?.abcSnippet ?? '', /K:C/);
});

test('buildAiScoreContext derives selected melody context from the selected voice scope', () => {
  const documentState = buildDocumentState(MULTI_VOICE_XML);
  const context = buildAiScoreContext(documentState, {
    partId: 'part:P1',
    staffIndex: 1,
    voiceId: 1,
    measureNumber: 1,
    measureRange: { start: 1, end: 1 },
    selectionCount: 2,
  });

  assert.ok(context.melodicContext?.selectedMelody);
  assert.equal(context.melodicContext?.selectedMelody?.scope, 'selection');
  assert.equal(context.melodicContext?.selectedMelody?.partId, 'P1');
  assert.deepEqual(context.melodicContext?.selectedMelody?.measureRange, { start: 1, end: 1 });
  assert.match(context.melodicContext?.selectedMelody?.preview ?? '', /^m1:C5\/quarter D5\/quarter$/);
  assert.match(context.melodicContext?.selectedMelody?.abcSnippet ?? '', /c2 d2 \|/);
});

test('buildAiScoreContext keeps a full eight-measure idea in melodic previews', () => {
  const documentState = buildDocumentState(EIGHT_MEASURE_MELODY_XML);
  const context = buildAiScoreContext(documentState);
  const preview = context.melodicContext?.primaryVoice?.preview ?? '';
  const abcSnippet = context.melodicContext?.primaryVoice?.abcSnippet ?? '';

  assert.match(preview, /m7:D4\/quarter E4\/quarter F4\/quarter G4\/quarter/);
  assert.match(preview, /m8:C4\/whole/);
  assert.doesNotMatch(preview, /\.\.\./);
  assert.match(abcSnippet, /D2 E2 F2 G2 \|/);
  assert.match(abcSnippet, /C8 \|/);
});
