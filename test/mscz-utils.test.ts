import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

import {
  compareVersionNumbers,
  formatMsczVersionMismatchError,
  inspectMsczArchive,
  normalizeMuseScoreScoreVersion,
  shouldRejectMsczForCliVersion,
} from '@/lib/mscz-utils';

async function buildMscz(xml: string) {
  const zip = new JSZip();
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container>
  <rootfiles>
    <rootfile full-path="score.mscx"/>
  </rootfiles>
</container>`);
  zip.file('score.mscx', xml);
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('inspectMsczArchive reads MuseScore score and program versions', async () => {
  const buffer = await buildMscz(`<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.60">
  <programVersion>4.6.5</programVersion>
  <Score/>
</museScore>`);

  const info = await inspectMsczArchive(buffer);

  assert.equal(info.filename, 'score.mscx');
  assert.equal(info.scoreVersion, '4.60');
  assert.equal(info.programVersion, '4.6.5');
});

test('shouldRejectMsczForCliVersion flags files saved by a newer MuseScore', () => {
  const archive = { scoreVersion: '4.60', programVersion: '4.6.5' };

  assert.equal(compareVersionNumbers('4.6.5', '4.4.4'), 1);
  assert.equal(normalizeMuseScoreScoreVersion('4.60'), '4.6.0');
  assert.equal(shouldRejectMsczForCliVersion(archive, '4.4.4'), true);
  assert.equal(shouldRejectMsczForCliVersion(archive, '4.6.0'), false);
  assert.equal(shouldRejectMsczForCliVersion(archive, '4.6.5'), false);
  assert.equal(shouldRejectMsczForCliVersion(archive, '4.7.0'), false);
});

test('formatMsczVersionMismatchError names the file and server MuseScore versions', () => {
  const message = formatMsczVersionMismatchError({
    archive: { scoreVersion: '4.60', programVersion: '4.6.5' },
    cliVersion: '4.4.4',
  });

  assert.match(message, /saved by MuseScore 4\.6\.5/);
  assert.match(message, /file format 4\.60/);
  assert.match(message, /server converter is MuseScore 4\.4\.4/);
  assert.match(message, /MusicXML\/MXL/);
});
