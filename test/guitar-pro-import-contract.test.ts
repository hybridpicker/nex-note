import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GUITAR_PRO_IMPORT_FIDELITY_PROMPT,
  collectGuitarProTechniqueFallbackWarnings,
  ensureGuitarProTabStaves,
  musicXmlHasTabStaff,
  normalizeConvertedMusicXml,
  stripTabParts,
} from '../lib/guitar-pro-import-contract.ts';
import { scoreToTabbedMusicXml } from '../lib/alphatab-guitar-pro-import.ts';
import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

const GUITAR_PRO_STYLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
    <score-part id="P2"><part-name>Guitar TAB</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <staff-details><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details>
        <clef><sign>TAB</sign></clef>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <notations><technical><string>1</string><fret>0</fret></technical></notations>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const GP_WITH_TECHNICAL_BUT_NO_TAB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <notations><technical><string>1</string><fret>0</fret></technical></notations>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <notations><technical><string>1</string><fret>1</fret></technical></notations>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

test('Guitar Pro import contract explicitly requires TAB preservation', () => {
  assert.match(GUITAR_PRO_IMPORT_FIDELITY_PROMPT, /Preserve .*TAB staff/i);
  assert.match(GUITAR_PRO_IMPORT_FIDELITY_PROMPT, /Guitar Pro/i);
  assert.match(GUITAR_PRO_IMPORT_FIDELITY_PROMPT, /string\/fret/i);
});

test('Guitar Pro conversion normalization preserves TAB staves', () => {
  const normalized = normalizeConvertedMusicXml(GUITAR_PRO_STYLE_XML, { preserveTabs: true });

  assert.equal(musicXmlHasTabStaff(normalized), true);
  assert.match(normalized, /<score-part id="P2">/);
  assert.match(normalized, /<part id="P2">/);
  assert.match(normalized, /<staff-type>tab<\/staff-type>/);
  assert.match(normalized, /<string>1<\/string>/);
  assert.match(normalized, /<fret>0<\/fret>/);
});

test('Guitar Pro conversion synthesizes a visible TAB staff from string and fret data when needed', () => {
  const normalized = ensureGuitarProTabStaves(GP_WITH_TECHNICAL_BUT_NO_TAB_XML);

  assert.equal(musicXmlHasTabStaff(normalized), true);
  assert.match(normalized, /<staves>2<\/staves>/);
  assert.match(normalized, /<staff-details number="2">/);
  assert.match(normalized, /<clef number="2"><sign>TAB<\/sign><line>5<\/line><\/clef>/);
  assert.match(normalized, /<backup><duration>2<\/duration><\/backup>/);
  assert.equal((normalized.match(/<staff>2<\/staff>/g) ?? []).length, 2);
  assert.equal((normalized.match(/<string>/g) ?? []).length, 4);
  assert.equal((normalized.match(/<fret>/g) ?? []).length, 4);
});

test('synthesized Guitar Pro TAB survives nex-note hydration and render XML export', () => {
  const normalized = ensureGuitarProTabStaves(GP_WITH_TECHNICAL_BUT_NO_TAB_XML);
  const documentState = buildDocumentState(normalized);

  assert.equal(musicXmlHasTabStaff(documentState.xml), true);
  assert.equal(documentState.coreDocument?.score.parts[0]?.staves.length, 2);
  assert.equal((documentState.xml.match(/<staff>2<\/staff>/g) ?? []).length, 2);
  assert.equal((documentState.xml.match(/<string>/g) ?? []).length, 4);
  assert.equal((documentState.xml.match(/<fret>/g) ?? []).length, 4);
});

test('alphaTab Guitar Pro fallback creates visible TAB staff from source string and fret data', () => {
  const xml = scoreToTabbedMusicXml({
    title: 'Fallback GP',
    tracks: [{
      name: 'Electric Guitar',
      isVisibleOnMultiTrack: true,
      staves: [{
        isStringed: true,
        showTablature: true,
        showStandardNotation: true,
        tuning: [64, 59, 55, 50, 45, 40],
        bars: [{
          voices: [{
            isEmpty: false,
            isRestOnly: false,
            beats: [
              {
                duration: 4,
                displayDuration: 960,
                dots: 0,
                isRest: false,
                notes: [{ string: 1, fret: 3, realValue: 43, isStringed: true }],
              },
              {
                duration: 4,
                displayDuration: 960,
                dots: 0,
                isRest: false,
                notes: [{ string: 6, fret: 0, realValue: 64, isStringed: true }],
              },
            ],
          }],
        }],
      }],
    }],
    masterBars: [{ timeSignatureNumerator: 2, timeSignatureDenominator: 4 }],
  });

  assert.equal(musicXmlHasTabStaff(xml), true);
  assert.match(xml, /<staff-type>tab<\/staff-type>/);
  assert.match(xml, /<staff>2<\/staff>/);
  assert.match(xml, /<credit-words[^>]*>Fallback GP<\/credit-words>/);
  assert.match(xml, /<staff-distance>64<\/staff-distance>/);
  assert.equal((xml.match(/<time>/g) ?? []).length, 1);
  assert.match(xml, /<string>6<\/string>/);
  assert.match(xml, /<fret>3<\/fret>/);
  assert.match(xml, /<string>1<\/string>/);
  assert.match(xml, /<fret>0<\/fret>/);

  const documentState = buildDocumentState(xml);
  assert.equal(documentState.coreDocument?.score.parts[0]?.staves.length, 2);
  assert.equal(musicXmlHasTabStaff(documentState.xml), true);
});

test('alphaTab Guitar Pro fallback keeps beamed short-note runs compact for OSMD', () => {
  const xml = scoreToTabbedMusicXml({
    title: 'Beamed GP',
    artist: 'Guitarist',
    tracks: [{
      name: 'Electric Guitar',
      isVisibleOnMultiTrack: true,
      staves: [{
        isStringed: true,
        showTablature: true,
        showStandardNotation: true,
        tuning: [64, 59, 55, 50, 45, 40],
        bars: [{
          voices: [{
            isEmpty: false,
            isRestOnly: false,
            beats: [
              { duration: 16, displayDuration: 240, dots: 0, isRest: false, notes: [{ string: 6, fret: 0, realValue: 64, isStringed: true }] },
              { duration: 16, displayDuration: 240, dots: 0, isRest: false, notes: [{ string: 6, fret: 1, realValue: 65, isStringed: true }] },
              { duration: 16, displayDuration: 240, dots: 0, isRest: false, notes: [{ string: 6, fret: 2, realValue: 66, isStringed: true }] },
              { duration: 16, displayDuration: 240, dots: 0, isRest: false, notes: [{ string: 6, fret: 3, realValue: 67, isStringed: true }] },
            ],
          }],
        }, {
          voices: [{
            isEmpty: false,
            isRestOnly: false,
            beats: [
              { duration: 16, displayDuration: 240, dots: 0, isRest: false, notes: [{ string: 6, fret: 4, realValue: 68, isStringed: true }] },
              { duration: 16, displayDuration: 240, dots: 0, isRest: false, notes: [{ string: 6, fret: 5, realValue: 69, isStringed: true }] },
            ],
          }],
        }],
      }],
    }],
    masterBars: [
      { timeSignatureNumerator: 4, timeSignatureDenominator: 4 },
      { timeSignatureNumerator: 4, timeSignatureDenominator: 4 },
    ],
  });

  assert.equal((xml.match(/<time>/g) ?? []).length, 1);
  assert.match(xml, /<credit-words[^>]*>Guitarist<\/credit-words>/);
  assert.equal((xml.match(/<beam number="1">begin<\/beam>/g) ?? []).length, 2);
  assert.equal((xml.match(/<beam number="2">begin<\/beam>/g) ?? []).length, 2);
  assert.equal((xml.match(/<beam number="1">end<\/beam>/g) ?? []).length, 2);
  assert.equal((xml.match(/<beam number="2">end<\/beam>/g) ?? []).length, 2);
  assert.equal((xml.match(/<stem>none<\/stem>/g) ?? []).length, 6);

  const documentState = buildDocumentState(xml);
  assert.equal((documentState.xml.match(/<time>/g) ?? []).length, 1);
  assert.ok((documentState.coreDocument?.beams.length ?? 0) >= 2);
});

test('alphaTab Guitar Pro fallback preserves beat-level eighth beams and hammer/pull markings', () => {
  const pullStart = { string: 4, fret: 5, realValue: 60, isStringed: true } as any;
  const pullStop = { string: 4, fret: 4, realValue: 59, isStringed: true } as any;
  const hammerStart = { string: 5, fret: 5, realValue: 64, isStringed: true } as any;
  const hammerStop = { string: 5, fret: 7, realValue: 66, isStringed: true } as any;
  pullStart.hammerPullDestination = pullStop;
  pullStart.isHammerPullOrigin = true;
  pullStart.hasEffectSlur = true;
  pullStop.hammerPullOrigin = pullStart;
  hammerStart.hammerPullDestination = hammerStop;
  hammerStart.isHammerPullOrigin = true;
  hammerStart.hasEffectSlur = true;
  hammerStop.hammerPullOrigin = hammerStart;

  const xml = scoreToTabbedMusicXml({
    title: 'Legato GP',
    tracks: [{
      name: 'Jazz Guitar',
      isVisibleOnMultiTrack: true,
      staves: [{
        isStringed: true,
        showTablature: true,
        showStandardNotation: true,
        tuning: [64, 59, 55, 50, 45, 40],
        bars: [{
          voices: [{
            isEmpty: false,
            isRestOnly: false,
            beats: [
              { duration: 8, displayDuration: 480, displayStart: 0, dots: 0, isRest: false, notes: [{ string: 3, fret: 4, realValue: 54, isStringed: true }] },
              { duration: 8, displayDuration: 480, displayStart: 480, dots: 0, isRest: false, notes: [pullStart] },
              { duration: 8, displayDuration: 480, displayStart: 960, dots: 0, isRest: false, notes: [pullStop] },
              { duration: 8, displayDuration: 480, displayStart: 1440, dots: 0, isRest: false, notes: [{ string: 3, fret: 7, realValue: 57, isStringed: true }] },
              { duration: 8, displayDuration: 480, displayStart: 1920, dots: 0, isRest: false, notes: [hammerStart] },
              { duration: 8, displayDuration: 480, displayStart: 2400, dots: 0, isRest: false, notes: [hammerStop] },
              { duration: 8, displayDuration: 480, displayStart: 2880, dots: 0, isRest: false, notes: [{ string: 6, fret: 5, realValue: 69, isStringed: true }] },
              { duration: 8, displayDuration: 480, displayStart: 3360, dots: 0, isRest: false, notes: [{ string: 6, fret: 7, realValue: 71, isStringed: true }] },
            ],
          }],
        }],
      }],
    }],
    masterBars: [{ timeSignatureNumerator: 4, timeSignatureDenominator: 4 }],
  });

  assert.equal((xml.match(/<beam number="1">begin<\/beam>/g) ?? []).length, 4);
  assert.equal((xml.match(/<beam number="1">end<\/beam>/g) ?? []).length, 4);
  assert.doesNotMatch(xml, /<beam number="1">continue<\/beam>/);
  assert.match(xml, /<pull-off number="1" type="start">P<\/pull-off>/);
  assert.match(xml, /<pull-off number="1" type="stop">P<\/pull-off>/);
  assert.match(xml, /<hammer-on number="2" type="start">H<\/hammer-on>/);
  assert.match(xml, /<hammer-on number="2" type="stop">H<\/hammer-on>/);
  assert.equal((xml.match(/<slur number="1" type="start"/g) ?? []).length, 1);
  assert.equal((xml.match(/<slur number="1" type="stop"/g) ?? []).length, 1);

  const documentState = buildDocumentState(xml);
  assert.equal((documentState.coreDocument?.slurs.length ?? 0) >= 2, true);
  assert.match(documentState.xml, /<pull-off type="start">P<\/pull-off>/);
  assert.match(documentState.xml, /<pull-off type="stop">P<\/pull-off>/);
  assert.match(documentState.xml, /<hammer-on type="start">H<\/hammer-on>/);
  assert.match(documentState.xml, /<hammer-on type="stop">H<\/hammer-on>/);
});

test('alphaTab Guitar Pro fallback preserves advanced TAB techniques through core MusicXML export', () => {
  const bendNote = {
    string: 3,
    fret: 7,
    realValue: 57,
    isStringed: true,
    hasBend: true,
    bendType: 4,
    bendStyle: 1,
    bendPoints: [
      { offset: 0, value: 0 },
      { offset: 30, value: 4 },
      { offset: 60, value: 0 },
    ],
    maxBendPoint: { offset: 30, value: 4 },
  } as any;
  const slidePalmNote = {
    string: 2,
    fret: 8,
    realValue: 63,
    isStringed: true,
    slideOutType: 2,
    isPalmMute: true,
  } as any;
  const deadLetRingNote = {
    string: 4,
    fret: 5,
    realValue: 60,
    isStringed: true,
    isDead: true,
    isLetRing: true,
  } as any;
  const harmonicGraceNote = {
    string: 1,
    fret: 12,
    realValue: 76,
    isStringed: true,
    harmonicType: 3,
    harmonicValue: 12,
  } as any;

  const xml = scoreToTabbedMusicXml({
    title: 'Technique GP',
    tracks: [{
      name: 'Lead Guitar',
      isVisibleOnMultiTrack: true,
      staves: [{
        isStringed: true,
        showTablature: true,
        showStandardNotation: true,
        tuning: [64, 59, 55, 50, 45, 40],
        bars: [{
          voices: [{
            isEmpty: false,
            isRestOnly: false,
            beats: [
              { duration: 16, displayDuration: 0, graceType: 2, dots: 0, isRest: false, notes: [harmonicGraceNote] },
              { duration: 4, displayDuration: 960, displayStart: 0, dots: 0, isRest: false, notes: [bendNote] },
              { duration: 4, displayDuration: 960, displayStart: 960, dots: 0, isRest: false, notes: [slidePalmNote] },
              { duration: 4, displayDuration: 960, displayStart: 1920, dots: 0, isRest: false, notes: [deadLetRingNote] },
              { duration: 4, displayDuration: 960, displayStart: 2880, dots: 0, isRest: false, notes: [{ string: 6, fret: 3, realValue: 67, isStringed: true }] },
            ],
          }],
        }],
      }],
    }],
    masterBars: [{ timeSignatureNumerator: 4, timeSignatureDenominator: 4 }],
  });

  assert.match(xml, /<bend>\s*<bend-alter>1<\/bend-alter>\s*<\/bend>/);
  assert.match(xml, /<slide type="start"\/>/);
  assert.match(xml, /<other-technical>p\.m\.<\/other-technical>/);
  assert.match(xml, /<other-technical>let ring<\/other-technical>/);
  assert.match(xml, /<mute\/>/);
  assert.match(xml, /<harmonic>\s*<artificial\/>\s*<\/harmonic>/);
  assert.match(xml, /<grace slash="yes"\/>/);
  assert.match(xml, /<other-technical>gp:bend-type=BendRelease<\/other-technical>/);
  assert.match(xml, /<other-technical>gp:bend-style=Gradual<\/other-technical>/);
  assert.match(xml, /<other-technical>gp:bend-points=30:4,60:0<\/other-technical>/);
  assert.match(xml, /<other-technical>gp:slide-out=Legato<\/other-technical>/);
  assert.match(xml, /<other-technical>gp:harmonic-type=Pinch<\/other-technical>/);

  const warnings = collectGuitarProTechniqueFallbackWarnings(xml);
  assert.ok(warnings.some((warning) => warning.includes('bend-type=BendRelease')));
  assert.ok(warnings.some((warning) => warning.includes('slide-out=Legato')));

  const core = importMusicXmlToCore(xml);
  const tabStaffEvents = core.score.parts[0]?.staves[1]?.measures[0]?.voices
    .flatMap((voice) => voice.events)
    .filter((event) => event.kind === 'note') ?? [];
  const techniques = new Set(tabStaffEvents.flatMap((event) => event.kind === 'note' ? event.guitar?.techniques ?? [] : []));
  assert.ok(techniques.has('bend'));
  assert.ok(techniques.has('slide'));
  assert.ok(techniques.has('palm-mute'));
  assert.ok(techniques.has('let-ring'));
  assert.ok(techniques.has('dead-note'));
  assert.ok(techniques.has('harmonic'));

  const exported = exportCoreToMusicXml(xml, core);
  assert.match(exported, /<bend>\s*<bend-alter>1<\/bend-alter>\s*<\/bend>/);
  assert.match(exported, /<slide type="start"\/>/);
  assert.match(exported, /<other-technical>p\.m\.<\/other-technical>/);
  assert.match(exported, /<other-technical>let ring<\/other-technical>/);
  assert.match(exported, /<mute\/>/);
  assert.match(exported, /<harmonic>\s*<natural\/>\s*<\/harmonic>/);
  assert.match(exported, /<grace slash="yes"\/>/);
  assert.match(exported, /<other-technical>gp:bend-type=BendRelease<\/other-technical>/);
  assert.match(exported, /<other-technical>gp:bend-style=Gradual<\/other-technical>/);
  assert.match(exported, /<other-technical>gp:bend-points=30:4,60:0<\/other-technical>/);
  assert.match(exported, /<other-technical>gp:slide-out=Legato<\/other-technical>/);
  assert.match(exported, /<other-technical>gp:harmonic-type=Pinch<\/other-technical>/);
});

test('alphaTab Guitar Pro fallback exports triplet feel as MusicXML swing playback', () => {
  const xml = scoreToTabbedMusicXml({
    title: 'Swing GP',
    tracks: [{
      name: 'Electric Guitar',
      isVisibleOnMultiTrack: true,
      staves: [{
        isStringed: true,
        showTablature: true,
        showStandardNotation: true,
        tuning: [64, 59, 55, 50, 45, 40],
        bars: [{
          voices: [{
            isEmpty: false,
            isRestOnly: false,
            beats: [
              { duration: 8, displayDuration: 480, dots: 0, isRest: false, notes: [{ string: 6, fret: 0, realValue: 64, isStringed: true }] },
              { duration: 8, displayDuration: 480, dots: 0, isRest: false, notes: [{ string: 6, fret: 2, realValue: 66, isStringed: true }] },
            ],
          }],
        }],
      }],
    }],
    masterBars: [{ timeSignatureNumerator: 4, timeSignatureDenominator: 4, tripletFeel: 2 }],
  });

  assert.match(xml, /<swing>/);
  assert.match(xml, /<first>2<\/first>/);
  assert.match(xml, /<second>1<\/second>/);
  assert.match(xml, /<swing-type>eighth<\/swing-type>/);

  const core = importMusicXmlToCore(xml);
  assert.equal(core.swingRatio, 2 / 3);
  assert.equal(core.swingUnit, 'eighth');
});

test('legacy tab stripping still removes TAB parts when explicitly requested', () => {
  const stripped = stripTabParts(GUITAR_PRO_STYLE_XML);

  assert.equal(musicXmlHasTabStaff(stripped), false);
  assert.match(stripped, /<score-part id="P1">/);
  assert.match(stripped, /<part id="P1">/);
  assert.doesNotMatch(stripped, /<score-part id="P2">/);
  assert.doesNotMatch(stripped, /<part id="P2">/);
});
