import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { buildPartsArchive } from '../lib/parts-archive.ts';

const measure = '<measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>';
const xml = `<?xml version="1.0"?><score-partwise version="3.1"><part-list>
<score-part id="P1"><part-name>Flute</part-name></score-part>
<score-part id="P2"><part-name>Flute</part-name></score-part>
</part-list><part id="P1">${measure}</part><part id="P2">${measure}</part></score-partwise>`;

test('parts archive contains one single-part file per score part, with unique names', async () => {
  const { bytes, entries } = await buildPartsArchive(xml, 'quartet.musicxml');
  assert.equal(entries.length, 2);
  assert.notEqual(entries[0].filename, entries[1].filename);
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  assert.equal(names.length, 2);
  for (const [index, name] of names.entries()) {
    const content = await zip.files[name].async('string');
    assert.equal((content.match(/<part id=/g) ?? []).length, 1, `${name} keeps exactly one part`);
    assert.equal((content.match(/<score-part /g) ?? []).length, 1);
    assert.ok(index < 2);
  }
});

test('parts archive rejects scores without parts', async () => {
  await assert.rejects(() => buildPartsArchive('<score-partwise><part-list/></score-partwise>', 'x.xml'), /no parts/);
});
