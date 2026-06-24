import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_NXN_SESSION,
  NXN_MIME_TYPE,
  NxnFileError,
  buildNxnFilename,
  createNxnBlob,
  createNxnFile,
  parseNxnText,
  readNxnFile,
  serializeNxnFile,
} from '../lib/nxn-file.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Native NXN Test</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
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

test('createNxnFile builds a v1 payload around the raw score document with default session state', () => {
  const document = importMusicXmlToCore(SAMPLE_XML);
  const nxn = createNxnFile({
    document,
    sourceMusicXml: SAMPLE_XML,
  });

  assert.equal(nxn.format, 'nxn');
  assert.equal(nxn.version, 1);
  assert.deepEqual(nxn.session, DEFAULT_NXN_SESSION);
  assert.equal(nxn.sourceMusicXml, SAMPLE_XML);
  assert.deepEqual(nxn.document, document);
});

test('serializeNxnFile round-trips document and session state through JSON text', () => {
  const document = importMusicXmlToCore(SAMPLE_XML);
  document.fermataEventIds.add(document.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.id);
  const selectionAnchor = {
    entityIds: ['event:1'],
    anchorEntityId: 'event:1',
    anchorLocator: {
      coreMeasureId: 'measure:1',
      corePartId: 'part:1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 2,
      timestampNum: 1,
      timestampDen: 4,
    },
    selectionLocators: [{
      coreMeasureId: 'measure:1',
      corePartId: 'part:1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 2,
      timestampNum: 1,
      timestampDen: 4,
    }],
  };

  const text = serializeNxnFile({
    document,
    sourceMusicXml: SAMPLE_XML,
    session: {
      selectionAnchor,
      viewMode: 'page',
      zoomPercent: 135,
      selectedDuration: '8',
      selectedVoice: 2,
    },
  });

  const parsed = parseNxnText(text);
  assert.equal(parsed.document.metadata.title, 'Native NXN Test');
  assert.ok(parsed.document.fermataEventIds instanceof Set);
  assert.equal(parsed.document.fermataEventIds.size, 1);
  assert.deepEqual(parsed.session, {
    selectionAnchor,
    viewMode: 'page',
    zoomPercent: 135,
    selectedDuration: '8',
    selectedVoice: 2,
  });
  assert.equal(parsed.sourceMusicXml, SAMPLE_XML);
  assert.match(exportCoreToMusicXml(SAMPLE_XML, parsed.document), /<fermata\/>/);
});

test('parseNxnText normalizes legacy JSON object fermata ids into a Set', () => {
  const text = serializeNxnFile({
    document: importMusicXmlToCore(SAMPLE_XML),
    sourceMusicXml: SAMPLE_XML,
  });
  const legacy = JSON.parse(text);
  legacy.document.fermataEventIds = {};

  const parsed = parseNxnText(JSON.stringify(legacy));

  assert.ok(parsed.document.fermataEventIds instanceof Set);
  assert.doesNotThrow(() => exportCoreToMusicXml(SAMPLE_XML, parsed.document));
});

test('nxn session preserves MuseScore long duration selections', () => {
  const document = importMusicXmlToCore(SAMPLE_XML);
  const text = serializeNxnFile({
    document,
    sourceMusicXml: SAMPLE_XML,
    session: {
      selectedDuration: 'long',
    },
  });

  const parsed = parseNxnText(text);

  assert.equal(parsed.session.selectedDuration, 'long');
});

test('readNxnFile rejects wrong extensions and unsupported versions', async () => {
  const document = importMusicXmlToCore(SAMPLE_XML);
  const validText = serializeNxnFile({
    document,
    sourceMusicXml: SAMPLE_XML,
  });

  await assert.rejects(
    () => readNxnFile({
      name: 'study.musicxml',
      text: async () => validText,
    }),
    (error: unknown) => error instanceof NxnFileError && error.message.includes('.nxn'),
  );

  const invalidVersion = JSON.stringify({
    ...JSON.parse(validText),
    version: 2,
  });

  await assert.rejects(
    () => readNxnFile({
      name: 'study.nxn',
      text: async () => invalidVersion,
    }),
    (error: unknown) => error instanceof NxnFileError && error.message.includes('version'),
  );
});

test('createNxnBlob and buildNxnFilename produce browser-saveable .nxn output', async () => {
  const document = importMusicXmlToCore(SAMPLE_XML);
  const blob = createNxnBlob({
    document,
    sourceMusicXml: SAMPLE_XML,
  });

  assert.equal(blob.type, NXN_MIME_TYPE);
  assert.equal(buildNxnFilename('Lead Sheet.musicxml'), 'Lead Sheet.nxn');
  assert.equal(buildNxnFilename('Lead Sheet'), 'Lead Sheet.nxn');

  const parsed = parseNxnText(await blob.text());
  assert.equal(parsed.format, 'nxn');
  assert.equal(parsed.version, 1);
});
