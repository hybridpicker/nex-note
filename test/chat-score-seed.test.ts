import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveChatScoreXml } from '../src/nex-note/server/resolve-chat-score-xml.ts';

const EXISTING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
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
        <rest />
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

test('resolveChatScoreXml preserves explicitly provided xml', () => {
  const resolved = resolveChatScoreXml({
    message: 'Arrangiere diese Melodie: C4 D4 E4 G4',
    xml: EXISTING_XML,
  });

  assert.equal(resolved, EXISTING_XML);
});

test('resolveChatScoreXml seeds a starter score for inline melody arrangement requests', () => {
  const resolved = resolveChatScoreXml({
    message: 'Arrangiere diese Melodie fuer Klavier: C4 D4 E4 G4 | E4 D4 C4',
  });

  assert.ok(resolved);
  assert.match(resolved ?? '', /Chat Arrangement Sketch/);
  assert.match(resolved ?? '', /<part-name>Piano<\/part-name>/);
  assert.ok((resolved?.match(/<measure\b/g) ?? []).length >= 4);
});

test('resolveChatScoreXml stays empty when no score and no inline melody are available', () => {
  const resolved = resolveChatScoreXml({
    message: 'Bitte aendere den Titel.',
  });

  assert.equal(resolved, null);
});
