import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';

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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

test('changeNoteDuration expands a note by consuming the following rhythmic slot', () => {
  const result = applyDocumentCommands({ xml: SAMPLE_XML, coreDocument: null }, [{
    type: 'changeNoteDuration',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    durationType: 'half',
    isDotted: false,
  }]);

  const voice = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0];
  assert.ok(voice);
  assert.equal(voice?.events[0].durationType, 'half');
  assert.equal(voice?.events[0].durationDivisions, 2);
  assert.equal(voice?.events[1].kind, 'note');
  assert.equal(voice?.events[1].kind === 'note' ? voice.events[1].pitch.step : null, 'E');
  assert.equal(voice?.events[1].timestampNum, 2);
  assert.equal(voice?.events[2].timestampNum, 3);
  assert.equal(voice?.events.length, 3);
});

test('changeNoteDuration can add or remove dotted state without losing pitch content', () => {
  const dotted = applyDocumentCommands({ xml: SAMPLE_XML, coreDocument: null }, [{
    type: 'changeNoteDuration',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    durationType: 'quarter',
    isDotted: true,
  }]);

  const event = dotted.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events[1];
  assert.equal(event?.durationType, 'quarter');
  assert.equal(event?.isDotted, true);
  assert.match(dotted.xml, /<dot\/>/);

  const undotted = applyDocumentCommands({ xml: dotted.xml, coreDocument: dotted.coreDocument }, [{
    type: 'changeNoteDuration',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    durationType: 'quarter',
    isDotted: false,
  }]);

  const undottedEvent = undotted.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events[1];
  assert.equal(undottedEvent?.durationType, 'quarter');
  assert.equal(Boolean(undottedEvent?.isDotted), false);
  assert.doesNotMatch(undotted.xml, /<note>[\s\S]*?<step>D<\/step>[\s\S]*?<dot\/>/);
});

test('changeNoteDuration keeps an eight-eighth 4/4 measure balanced by deleting the next eighth', () => {
  const eighthsXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands({ xml: eighthsXml, coreDocument: null }, [{
    type: 'changeNoteDuration',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 2,
    timestampDen: 8,
    durationType: 'quarter',
    isDotted: false,
  }]);

  const events = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events ?? [];
  const pitched = events.filter((event) => event.kind === 'note').map((event) => event.pitch.step);
  const summary = events.map((event) => ({
    timestampNum: event.timestampNum,
    durationDivisions: event.durationDivisions,
    durationType: event.durationType,
    pitch: event.kind === 'note' ? event.pitch.step : 'rest',
  }));

  assert.deepEqual(summary, [
    { timestampNum: 0, durationDivisions: 1, durationType: 'eighth', pitch: 'C' },
    { timestampNum: 1, durationDivisions: 1, durationType: 'eighth', pitch: 'D' },
    { timestampNum: 2, durationDivisions: 2, durationType: 'quarter', pitch: 'E' },
    { timestampNum: 4, durationDivisions: 1, durationType: 'eighth', pitch: 'G' },
    { timestampNum: 5, durationDivisions: 1, durationType: 'eighth', pitch: 'A' },
    { timestampNum: 6, durationDivisions: 1, durationType: 'eighth', pitch: 'B' },
    { timestampNum: 7, durationDivisions: 1, durationType: 'eighth', pitch: 'C' },
  ]);
  assert.ok(!pitched.includes('F'));
  assert.ok(!result.diagnostics.some((diagnostic) => ['voice_overlap', 'measure_balance'].includes(diagnostic.code)));
});

test('changeNoteDuration keeps legacy notation plus TAB staves rhythmically aligned', () => {
  const tabXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <staff-details number="2"><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff><beam number="1">begin</beam></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff><beam number="1">continue</beam></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff><beam number="1">continue</beam></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff><beam number="1">end</beam></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <backup><duration>8</duration></backup>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>5</string><fret>12</fret></technical></notations></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>5</string><fret>13</fret></technical></notations></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>4</string><fret>12</fret></technical></notations></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>4</string><fret>13</fret></technical></notations></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>3</string><fret>12</fret></technical></notations></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>3</string><fret>14</fret></technical></notations></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>2</string><fret>12</fret></technical></notations></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>2</staff><notations><technical><string>2</string><fret>13</fret></technical></notations></note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands({ xml: tabXml, coreDocument: null }, [{
    type: 'changeNoteDuration',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 2,
    timestampDen: 8,
    durationType: 'quarter',
    isDotted: false,
  }]);

  const notes = Array.from(result.xml.matchAll(/<note>[\s\S]*?<\/note>/g)).map((match) => match[0]);
  const notationNotes = notes.filter((note) => /<staff>1<\/staff>/.test(note));
  const tabNotes = notes.filter((note) => /<staff>2<\/staff>/.test(note));
  const summarize = (note: string) => ({
    step: note.match(/<step>([^<]+)/)?.[1] ?? 'rest',
    duration: note.match(/<duration>([^<]+)/)?.[1],
    type: note.match(/<type>([^<]+)/)?.[1],
  });

  assert.deepEqual(notationNotes.map(summarize), [
    { step: 'C', duration: '1', type: 'eighth' },
    { step: 'D', duration: '1', type: 'eighth' },
    { step: 'E', duration: '2', type: 'quarter' },
    { step: 'G', duration: '1', type: 'eighth' },
    { step: 'A', duration: '1', type: 'eighth' },
    { step: 'B', duration: '1', type: 'eighth' },
    { step: 'C', duration: '1', type: 'eighth' },
  ]);
  assert.deepEqual(tabNotes.map(summarize), [
    { step: 'C', duration: '1', type: 'eighth' },
    { step: 'D', duration: '1', type: 'eighth' },
    { step: 'E', duration: '2', type: 'quarter' },
    { step: 'G', duration: '1', type: 'eighth' },
    { step: 'A', duration: '1', type: 'eighth' },
    { step: 'B', duration: '1', type: 'eighth' },
    { step: 'C', duration: '1', type: 'eighth' },
  ]);
  assert.doesNotMatch(result.xml, /<step>F<\/step>/);
  assert.doesNotMatch(result.xml, /<step>E<\/step><octave>4<\/octave><\/pitch><duration>2<\/duration><voice>1<\/voice><type>quarter<\/type><beam/);
  assert.ok(!result.diagnostics.some((diagnostic) => ['voice_overlap', 'measure_balance'].includes(diagnostic.code)));
});

test('changeNoteDuration updates every note in a chord and consumes the following slot once', () => {
  const chordXml = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands({ xml: chordXml, coreDocument: null }, [{
    type: 'changeNoteDuration',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    durationType: 'half',
    isDotted: false,
  }]);

  const voice = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0];
  assert.ok(voice);
  assert.equal(voice?.events[0].durationType, 'half');
  assert.equal(voice?.events[1].durationType, 'half');
  assert.equal(voice?.events[0].durationDivisions, 2);
  assert.equal(voice?.events[1].durationDivisions, 2);
  assert.equal(voice?.events[2].timestampNum, 2);
  assert.equal(voice?.events[2].kind, 'rest');
});

test('changeNoteDuration clamps an expanded note to the remaining measure space', () => {
  const result = applyDocumentCommands({ xml: SAMPLE_XML, coreDocument: null }, [{
    type: 'changeNoteDuration',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 3,
    timestampDen: 4,
    durationType: 'half',
    isDotted: true,
  }]);

  const voice = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0];
  const tail = voice?.events.find((event) => event.timestampNum === 3);
  assert.equal(tail?.durationType, 'half');
  assert.equal(tail?.isDotted, true);
  assert.equal(tail?.durationDivisions, 1);
});

test('insertNoteAt splits overflow into the next measure with a tie instead of clamping the duration', () => {
  const result = applyDocumentCommands({ xml: SAMPLE_XML, coreDocument: null }, [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 3,
    timestampDen: 4,
    step: 'B',
    octave: 4,
    alter: 0,
    durationType: 'half',
    isDotted: false,
  }]);

  const measures = result.coreDocument?.score.parts[0].staves[0].measures ?? [];
  assert.equal(measures.length, 2);

  const firstVoice = measures[0]?.voices[0];
  const secondVoice = measures[1]?.voices[0];
  const firstFragment = firstVoice?.events.find((event) => event.kind === 'note' && event.timestampNum === 3 && event.pitch.step === 'B');
  const secondFragment = secondVoice?.events.find((event) => event.kind === 'note' && event.timestampNum === 0 && event.pitch.step === 'B');
  const shiftedTail = secondVoice?.events.find((event) => event.kind === 'note' && event.timestampNum === 1 && event.pitch.step === 'F');
  const trailingRest = secondVoice?.events.find((event) => event.kind === 'rest' && event.timestampNum === 2);

  assert.equal(firstFragment?.durationType, 'quarter');
  assert.equal(firstFragment?.durationDivisions, 1);
  assert.equal(firstFragment?.tieStart, true);
  assert.equal(secondFragment?.durationType, 'quarter');
  assert.equal(secondFragment?.durationDivisions, 1);
  assert.equal(Boolean(secondFragment?.tieStart), false);
  assert.ok(shiftedTail);
  assert.equal(trailingRest?.durationType, 'half');
  assert.equal(trailingRest?.durationDivisions, 2);
  assert.match(result.xml, /<tie type="start"\/>/);
  assert.match(result.xml, /<tie type="stop"\/>/);
});

test('insertNoteAt with preserveOverflow false rejects note-entry overflow in a full 4/4 measure', () => {
  const eighthsXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands({ xml: eighthsXml, coreDocument: null }, [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 8,
    step: 'D',
    octave: 5,
    alter: 0,
    durationType: 'eighth',
    isDotted: false,
    preserveOverflow: false,
  }]);

  const measures = result.coreDocument?.score.parts[0].staves[0].measures ?? [];
  const events = measures[0]?.voices[0]?.events ?? [];
  assert.equal(measures.length, 1);
  assert.equal(events.length, 8);
  assert.equal(events.reduce((sum, event) => sum + event.durationDivisions, 0), 8);
  assert.equal(events.some((event) => event.kind === 'note' && event.pitch.octave === 5 && event.pitch.step === 'D'), false);
});

test('insertNoteAt normalizes displaced notes that straddle the next measure', () => {
  const straddleXml = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands({ xml: straddleXml, coreDocument: null }, [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'B',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  }]);

  const measures = result.coreDocument?.score.parts[0].staves[0].measures ?? [];
  const firstVoice = measures[0]?.voices[0];
  const secondVoice = measures[1]?.voices[0];
  const firstE = firstVoice?.events.find((event) => event.kind === 'note' && event.pitch.step === 'E');
  const secondE = secondVoice?.events.find((event) => event.kind === 'note' && event.pitch.step === 'E');

  assert.equal(firstE?.timestampNum, 3);
  assert.equal(firstE?.durationDivisions, 1);
  assert.equal(firstE?.tieStart, true);
  assert.equal(secondE?.timestampNum, 0);
  assert.equal(secondE?.durationDivisions, 1);
  assert.equal(Boolean(secondE?.tieStart), false);
  assert.ok(!result.diagnostics.some((diagnostic) => ['voice_overlap', 'measure_balance', 'tie_continuity'].includes(diagnostic.code)));
});

test('insertNoteAt remaps slur stops to the last fragment of a displaced split note', () => {
  const state = buildDocumentState(`<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`);
  const coreDocument = structuredClone(state.coreDocument!);
  const events = coreDocument.score.parts[0].staves[0].measures[0].voices[0].events;
  const start = events.find((event) => event.kind === 'note' && event.pitch.step === 'C')!;
  const stop = events.find((event) => event.kind === 'note' && event.pitch.step === 'E')!;
  coreDocument.slurs.push({
    id: 'slur:test:c-to-e',
    number: 1,
    startEventId: start.id,
    stopEventId: stop.id,
  });

  const result = applyDocumentCommands({ xml: state.xml, sourceMusicXml: state.sourceMusicXml, coreDocument }, [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'B',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  }]);

  const slur = result.coreDocument?.slurs.find((entry) => entry.id === 'slur:test:c-to-e');
  const firstE = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events
    .find((event) => event.kind === 'note' && event.pitch.step === 'E');
  const secondE = result.coreDocument?.score.parts[0].staves[0].measures[1].voices[0].events
    .find((event) => event.kind === 'note' && event.pitch.step === 'E');

  assert.equal(slur?.startEventId, start.id);
  assert.equal(firstE?.id, stop.id);
  assert.equal(slur?.stopEventId, secondE?.id);
  assert.ok(!result.diagnostics.some((diagnostic) => diagnostic.code === 'dangling_slur'));
});

test('insertNoteAt leaves displaced tuplet events unsplit so invalid spillover is diagnosable', () => {
  const state = buildDocumentState(`<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`);
  const coreDocument = structuredClone(state.coreDocument!);
  const events = coreDocument.score.parts[0].staves[0].measures[0].voices[0].events;
  const d = events.find((event) => event.kind === 'note' && event.pitch.step === 'D')!;
  const e = events.find((event) => event.kind === 'note' && event.pitch.step === 'E')!;
  coreDocument.tuplets.push({
    id: 'tuplet:test:guard',
    number: 1,
    eventIds: [d.id, e.id],
    actualNotes: 2,
    normalNotes: 1,
  });

  const result = applyDocumentCommands({ xml: state.xml, sourceMusicXml: state.sourceMusicXml, coreDocument }, [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'B',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  }]);

  const firstVoice = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0];
  const displacedTupletE = firstVoice?.events.find((event) => event.id === e.id);

  assert.equal(displacedTupletE?.timestampNum, 3);
  assert.equal(displacedTupletE?.durationDivisions, 2);
  assert.equal(result.coreDocument?.tuplets.find((tuplet) => tuplet.id === 'tuplet:test:guard')?.eventIds.includes(e.id), true);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'measure_balance'));
});

test('Ripple Delete pulls subsequent events left across measure boundaries', () => {
  const twoMeasureXml = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands({ xml: twoMeasureXml, coreDocument: null }, [{
    type: 'rippleDelete',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 3,
    timestampDen: 4,
  }]);

  const measures = result.coreDocument?.score.parts[0].staves[0].measures ?? [];
  const firstVoice = measures[0]?.voices[0];
  const secondVoice = measures[1]?.voices[0];
  const pulledG = firstVoice?.events.find((event) => event.kind === 'note' && event.pitch.step === 'G');
  const shiftedA = secondVoice?.events.find((event) => event.kind === 'note' && event.pitch.step === 'A');

  assert.equal(pulledG?.measureNumber, 1);
  assert.equal(pulledG?.timestampNum, 3);
  assert.equal(shiftedA?.measureNumber, 2);
  assert.equal(shiftedA?.timestampNum, 0);
  assert.ok(!secondVoice?.events.some((event) => event.kind === 'note' && event.pitch.step === 'G'));
});

test('Ripple Delete returns correct selectionRemap targeting the successor', () => {
  const state = buildDocumentState(`<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`);
  const voice = state.coreDocument!.score.parts[0].staves[0].measures[0].voices[0];
  const deleted = voice.events.find((event) => event.kind === 'note' && event.pitch.step === 'D')!;
  const successor = voice.events.find((event) => event.kind === 'note' && event.pitch.step === 'E')!;

  const result = applyDocumentCommands(state, [{
    type: 'rippleDelete',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: deleted.timestampNum,
    timestampDen: deleted.timestampDen,
  }]);

  assert.equal(result.selectionRemap[deleted.id], successor.id);
});

test('collapseTiedFragmentsAcrossMeasures merges valid tied notes after ripple shift', () => {
  const tiedXml = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note>
        <pitch><step>B</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
        <tie type="start"/>
        <notations><tied type="start"/></notations>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>B</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
        <tie type="stop"/>
        <notations><tied type="stop"/></notations>
      </note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands({ xml: tiedXml, coreDocument: null }, [{
    type: 'rippleDelete',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 2,
    timestampDen: 4,
  }]);

  const measures = result.coreDocument?.score.parts[0].staves[0].measures ?? [];
  const firstVoice = measures[0]?.voices[0];
  const secondVoice = measures[1]?.voices[0];
  const mergedB = firstVoice?.events.find((event) => event.kind === 'note' && event.pitch.step === 'B');
  const trailingB = secondVoice?.events.find((event) => event.kind === 'note' && event.pitch.step === 'B');
  const shiftedE = secondVoice?.events.find((event) => event.kind === 'note' && event.pitch.step === 'E');

  assert.equal(mergedB?.timestampNum, 2);
  assert.equal(mergedB?.durationDivisions, 2);
  assert.equal(Boolean(mergedB?.tieStart), false);
  assert.equal(trailingB, undefined);
  assert.equal(shiftedE?.timestampNum, 0);
  assert.ok(!result.diagnostics.some((diagnostic) => diagnostic.code === 'tie_continuity'));
});

test('insertNoteAt converts fractional timestamps into measure divisions before inserting', () => {
  const result = applyDocumentCommands({ xml: SAMPLE_XML, coreDocument: null }, [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 2,
    timestampDen: 4,
    step: 'B',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  }]);

  const voice = result.coreDocument?.score.parts[0].staves[0].measures[0].voices[0];
  const inserted = voice?.events.find((event) => event.kind === 'note' && event.pitch.step === 'B');
  assert.equal(inserted?.timestampNum, 2);
  assert.equal(inserted?.timestampDen, 4);
});

test('insertNoteAt upgrades low divisions before inserting an eighth note into a rest', () => {
  const restXml = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note><rest/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

  const result = applyDocumentCommands({ xml: restXml, coreDocument: null }, [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'C',
    octave: 4,
    alter: 0,
    durationType: 'eighth',
    isDotted: false,
  }]);

  const measure = result.coreDocument?.score.parts[0].staves[0].measures[0];
  const events = measure?.voices[0].events ?? [];
  const inserted = events.find((event) => event.kind === 'note' && event.pitch.step === 'C');
  const rests = events.filter((event) => event.kind === 'rest');

  assert.equal(measure?.attributes[0]?.divisions, 2);
  assert.equal(inserted?.durationType, 'eighth');
  assert.equal(inserted?.durationDivisions, 1);
  assert.deepEqual(
    rests.map((event) => ({
      timestampNum: event.timestampNum,
      timestampDen: event.timestampDen,
      durationDivisions: event.durationDivisions,
      durationType: event.durationType,
    })),
    [
      { timestampNum: 1, timestampDen: 8, durationDivisions: 1, durationType: 'eighth' },
      { timestampNum: 2, timestampDen: 8, durationDivisions: 2, durationType: 'quarter' },
      { timestampNum: 4, timestampDen: 8, durationDivisions: 4, durationType: 'half' },
    ],
  );
  assert.ok(!events.some((event) => event.durationType === '64th'));
  assert.match(result.xml, /<divisions>2<\/divisions>/);
  assert.match(result.xml, /<type>eighth<\/type>/);
});
