import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';

import {
  buildGhostNoteSpatialIndex,
  buildGhostHorizontalQuantizer,
  buildGhostPreviewMetrics,
  constrainMouseEntryPitchResolution,
  filterSelectableRenderedGhostSnapPoints,
  getVisibleMeasureSelectionIds,
  quantizeGhostPitchIndex,
  bindResolvedEditTargetToGhost,
  rejectDistantTimestampSnap,
  resolveClickedRestAnchorGhostTarget,
  resolveEffectiveGhostSnap,
  resolveGhostCommittedPlacement,
  resolveNoteInputCommitTarget,
  resolveGhostPitchFromCalibration,
  resolvePreviewStemDirection,
  resolveGhostPreviewX,
  preferRenderedOnsetSnap,
  buildSemanticActiveAnchorDebugReport,
  buildSemanticGridDebugReport,
  resolveMinimumVisibleGhostX,
  resolveVisibleGhostSnapX,
  resolveSemanticAnchorHitRect,
  retargetGhostToAdvancedAnchor,
  shouldFindQuantizedGhostSnapFallback,
  alignReplaceGhostToRenderedSnap,
  captureMeasureRectForStaff,
  resolveGhostNoteTarget,
  resolveMouseEntryAlter,
  resolvePointerCommitGhostTargets,
  buildSemanticAnchorDebugBoxes,
  buildSemanticPitchDebugBands,
  buildSemanticSnapColumnDebugLines,
  ghostHasTraceQuantizedRestFallbackSnap,
} from '../components/ScoreEditor.tsx';
import { useNoteEditor, type SelectedNote } from '../hooks/useNoteEditor.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { validateScoreDocument } from '../src/score-core/validation/validate-score-document.ts';
import {
  buildRenderedGhostGrid,
  getRenderedGhostStaffPoints,
  type RenderedGhostGridPoint,
} from '../src/render-bridge/osmd/rendered-ghost-grid.ts';
import type { RenderedNote } from '../src/render-bridge/osmd/note-selection.ts';
import { buildInteractiveEditMap } from '../src/score-input/edit-map.ts';
import type { TimedEvent } from '../src/score-core/model/types.ts';
import { detectActiveRhythmicSegment, getEffectiveDuration } from '../src/score-core/rhythm-utils.ts';
import type { ScoreCommand } from '../src/shared/schemas/score-command.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>User Visible Matrix</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name><score-instrument id="P1-I1"><instrument-name>Flute</instrument-name></score-instrument></score-part>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const MULTI_VOICE_CLICK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Multi Voice Click Activation</work-title></work>
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
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const GUITAR_NOTATION_TAB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Electric Guitar</part-name></score-part>
    <score-part id="P2"><part-name>Electric Guitar TAB</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>B</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>B</step><alter>-1</alter><octave>3</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><rest/><duration>4</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note><pitch><step>B</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff><notations><technical><string>5</string><fret>14</fret></technical></notations></note>
      <note><pitch><step>B</step><alter>-1</alter><octave>3</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff><notations><technical><string>5</string><fret>13</fret></technical></notations></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff><notations><technical><string>3</string><fret>12</fret></technical></notations></note>
      <note><rest/><duration>4</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const TWO_STAFF_PIANO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

const TWO_STAFF_RANGE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff></note>
      <note><rest/><duration>2</duration><voice>1</voice><type>half</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

const TWO_STAFF_OCCUPIED_TARGET_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>E</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

const TWO_STAFF_CHORD_TARGET_REST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

const CHORD_DELETE_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const WHOLE_NOTE_INPUT_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const TAB_TECHNIQUE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note>
        <pitch><step>G</step><octave>2</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
        <notations>
          <technical>
            <string>6</string>
            <fret>3</fret>
            <hammer-on type="start">H</hammer-on>
            <pull-off type="start">P</pull-off>
          </technical>
        </notations>
      </note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const DIRECTION_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction placement="above">
        <direction-type><words>Allegro non troppo</words></direction-type>
        <staff>1</staff>
      </direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const DURATION_FROM_TYPE = {
  whole: '1',
  half: '2',
  quarter: '4',
  eighth: '8',
  '16th': '16',
  '32nd': '32',
  '64th': '64',
} as const;

const TUPLET_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>12</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="start" number="1"/></notations>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="stop" number="1"/></notations>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
      <note>
        <rest/>
        <duration>24</duration>
        <voice>1</voice>
        <type>half</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const FULL_REST_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note>
        <rest measure="yes"/>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const OVERFLOW_REST_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const SPLIT_TRAILING_REST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>8</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>2</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><rest/><duration>4</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

function makeKeyboardEvent(
  key: string,
  overrides: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>> & { code?: string } = {},
) {
  return {
    key,
    code: overrides.code ?? '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault() {},
    target: { tagName: 'DIV', isContentEditable: false, closest: () => null },
    ...overrides,
  } as unknown as KeyboardEvent;
}

function flattenVoiceEvents(xml: string) {
  const core = importMusicXmlToCore(xml);
  const events: TimedEvent[] = [];
  for (const measure of core.score.parts[0].staves[0].measures) {
    for (const voice of measure.voices) {
      for (const event of voice.events) {
        if (event) events.push(event);
      }
    }
  }
  return events;
}

function makeSelectedNotes(xml: string): SelectedNote[] {
  return flattenVoiceEvents(xml)
    .filter((event) => event.kind === 'note' || event.kind === 'rest')
    .map((event) => ({
    coreEntityId: event.id,
    coreVoiceId: `voice:${event.voiceId}`,
    coreMeasureId: `measure:${event.measureNumber}`,
    corePartId: 'P1',
    measureNumber: event.measureNumber,
    staffIndex: event.staffIndex,
    voiceId: event.voiceId,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
    step: event.kind === 'note' ? event.pitch.step : 'C',
    octave: event.kind === 'note' ? event.pitch.octave : 4,
    alter: event.kind === 'note' ? event.pitch.alter : 0,
    isRest: event.kind === 'rest',
    durationType: event.durationType,
    isDotted: event.isDotted ?? false,
    guitar: event.kind === 'note' ? event.guitar : undefined,
    graphicalNote: null,
  }));
}

function makeSelectedNotesFromAllParts(xml: string): SelectedNote[] {
  const core = importMusicXmlToCore(xml);
  const notes: SelectedNote[] = [];
  for (const part of core.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            notes.push({
              coreEntityId: event.id,
              coreVoiceId: voice.id,
              coreMeasureId: measure.id,
              corePartId: part.id,
              measureNumber: event.measureNumber,
              staffIndex: staff.staffIndex,
              voiceId: event.voiceId,
              timestampNum: event.timestampNum,
              timestampDen: event.timestampDen,
              step: event.kind === 'note' ? event.pitch.step : 'C',
              octave: event.kind === 'note' ? event.pitch.octave : 4,
              alter: event.kind === 'note' ? event.pitch.alter : 0,
              isRest: event.kind === 'rest',
              durationType: event.durationType,
              isDotted: event.isDotted ?? false,
              guitar: event.kind === 'note' ? event.guitar : undefined,
              graphicalNote: null,
            });
          }
        }
      }
    }
  }
  return notes;
}

function makeQuarterNoteMeasureXml(noteCount: number) {
  const steps = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const notes = Array.from({ length: noteCount }, (_, index) => {
    const step = steps[index % steps.length];
    return `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`;
  }).join('\n      ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>${noteCount}</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      ${notes}
    </measure>
  </part>
</score-partwise>`;
}

type HookValue = ReturnType<typeof useNoteEditor>;

function renderHook(initialXml: string) {
  const ref: { current: HookValue | null } = { current: null };
  let latestXml = initialXml;
  const previewedNotes: Array<SelectedNote | null> = [];
  const previewedNoteGroups: SelectedNote[][] = [];
  const appliedCommands: ScoreCommand[][] = [];
  const appliedMetas: Array<unknown> = [];

  function Harness() {
    const [document, setDocument] = React.useState(() => buildDocumentState(initialXml));
    latestXml = document.xml;
    ref.current = useNoteEditor(
      document.xml,
      document.coreDocument,
      (commands, meta) => {
        appliedCommands.push(commands);
        appliedMetas.push(meta ?? null);
        setDocument((current) => {
          const next = applyDocumentCommands(current, commands);
          latestXml = next.xml;
          return next;
        });
      },
      {
        onActiveNotePreview: (note) => {
          previewedNotes.push(note);
        },
        onActiveNotesPreview: (notes) => {
          previewedNoteGroups.push(notes);
          previewedNotes.push(notes.at(-1) ?? null);
        },
      },
    );
    return null;
  }

  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(React.createElement(Harness));
  });

  return {
    get current() {
      return ref.current!;
    },
    get xml() {
      return latestXml;
    },
    get previewedNotes() {
      return previewedNotes;
    },
    get previewedNoteGroups() {
      return previewedNoteGroups;
    },
    get appliedCommands() {
      return appliedCommands;
    },
    get appliedMetas() {
      return appliedMetas;
    },
    rerender() {
      act(() => {
        renderer?.update(React.createElement(Harness));
      });
    },
    unmount() {
      act(() => {
        renderer?.unmount();
      });
    },
  };
}

test('keyboard shortcuts toggle note-input, duration, dotted state, and entry mode', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.handleKeyDown(makeKeyboardEvent('7'));
    hook.current.handleKeyDown(makeKeyboardEvent('&', { code: 'Digit7' }));
    hook.current.handleKeyDown(makeKeyboardEvent('.'));
    hook.current.handleKeyDown(makeKeyboardEvent('I'));
  });

  assert.equal(hook.current.noteInputMode, true);
  assert.equal(hook.current.selectedDuration, '1');
  assert.equal(hook.current.isDotted, true);
  assert.equal(hook.current.entryMode, 'overwrite');
  hook.unmount();
});

test('Instrument Record uses the selected number-key duration and commits simultaneous notes as one chord transaction', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.handleKeyDown(makeKeyboardEvent('4'));
    hook.current.insertMidiChord([
      { midi: 67, step: 'G', octave: 4, alter: 0 },
      { midi: 60, step: 'C', octave: 4, alter: 0 },
      { midi: 64, step: 'E', octave: 4, alter: 0 },
    ]);
  });
  hook.rerender();

  const firstOnset = flattenVoiceEvents(hook.xml)
    .filter((event) => event.kind === 'note' && event.measureNumber === 1 && event.timestampNum === 0)
    .map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : '')
    .sort();
  assert.deepEqual(firstOnset, ['C4', 'E4', 'G4']);
  const firstOnsetDurations = flattenVoiceEvents(hook.xml)
    .filter((event) => event.kind === 'note' && event.measureNumber === 1 && event.timestampNum === 0)
    .map((event) => event.durationType);
  assert.deepEqual(firstOnsetDurations, ['eighth', 'eighth', 'eighth']);
  assert.equal(hook.current.selectedDuration, '8');
  assert.equal(hook.appliedCommands.length, 1);
  assert.equal(hook.appliedCommands[0]!.filter((command) => command.type === 'insertNoteAt').length, 2);
  assert.equal(hook.current.selectedNote?.timestampNum, 1);
  hook.unmount();
});

test('Instrument Record advances the rhythmic cursor after each melodic pitch', () => {
  const hook = renderHook(FULL_REST_XML);
  const melody = [
    { midi: 60, step: 'C', octave: 4, alter: 0 },
    { midi: 65, step: 'F', octave: 4, alter: 0 },
    { midi: 64, step: 'E', octave: 4, alter: 0 },
    { midi: 60, step: 'C', octave: 4, alter: 0 },
  ];

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.handleKeyDown(makeKeyboardEvent('4'));
  });
  for (const pitch of melody) {
    act(() => {
      hook.current.insertMidiChord([pitch]);
    });
    hook.rerender();
  }

  const recorded = flattenVoiceEvents(hook.xml)
    .filter((event): event is TimedEvent & { kind: 'note' } => (
      event.kind === 'note'
      && event.measureNumber === 1
    ))
    .sort((left, right) => (
      (left.timestampNum / left.timestampDen) - (right.timestampNum / right.timestampDen)
    ))
    .slice(0, 4)
    .map((event) => ({
      pitch: `${event.pitch.step}${event.pitch.octave}`,
      timestamp: event.timestampNum / event.timestampDen,
    }));

  assert.deepEqual(recorded, [
    { pitch: 'C4', timestamp: 0 },
    { pitch: 'F4', timestamp: 1 / 8 },
    { pitch: 'E4', timestamp: 2 / 8 },
    { pitch: 'C4', timestamp: 3 / 8 },
  ]);
  hook.unmount();
});

test('Instrument Record builds chord tones at one onset until Right Arrow advances', () => {
  const hook = renderHook(FULL_REST_XML);
  const chord = [
    { midi: 60, step: 'C', octave: 4, alter: 0 },
    { midi: 64, step: 'E', octave: 4, alter: 0 },
    { midi: 67, step: 'G', octave: 4, alter: 0 },
  ];

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.handleKeyDown(makeKeyboardEvent('5'));
  });
  for (const pitch of chord) {
    act(() => {
      hook.current.insertMidiChord([pitch], {
        addToMatchingChord: true,
        insertAtCursor: true,
        advanceCursor: false,
      });
    });
    hook.rerender();
  }

  const firstChord = flattenVoiceEvents(hook.xml)
    .filter((event): event is TimedEvent & { kind: 'note' } => (
      event.kind === 'note'
      && event.measureNumber === 1
      && event.timestampNum / event.timestampDen === 0
    ))
    .map((event) => `${event.pitch.step}${event.pitch.octave}`)
    .sort();
  assert.deepEqual(firstChord, ['C4', 'E4', 'G4']);
  assert.equal(
    (hook.current.selectedNote?.timestampNum ?? -1) / (hook.current.selectedNote?.timestampDen ?? 1),
    0,
  );

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowRight'));
  });
  hook.rerender();
  assert.equal(
    (hook.current.selectedNote?.timestampNum ?? -1) / (hook.current.selectedNote?.timestampDen ?? 1),
    1 / 4,
  );
  hook.unmount();
});

test('P toggles the QWERTY step keyboard and routes QWERTY piano keys through semantic note entry', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
    hook.current.handleKeyDown(makeKeyboardEvent('P'));
    hook.current.handleKeyDown(makeKeyboardEvent('J'));
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
  });
  hook.rerender();

  const insertedNotes = flattenVoiceEvents(hook.xml)
    .filter((event): event is TimedEvent & { kind: 'note' } => event.kind === 'note' && event.measureNumber === 1)
    .map((event) => `${event.pitch.step}${event.pitch.alter === 1 ? '#' : ''}${event.pitch.octave}`);

  assert.equal(hook.current.noteInputMode, true);
  assert.equal(hook.current.stepInputKeyboardMode, true);
  assert.deepEqual(insertedNotes, ['A#4', 'A4', 'D4', 'E4']);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('P'));
  });

  assert.equal(hook.current.stepInputKeyboardMode, false);
  hook.unmount();
});

test('QWERTY step input consumes a toolbar-armed accidental on its next successful pitch', () => {
  const hook = renderHook(SAMPLE_XML);
  const first = makeSelectedNotes(SAMPLE_XML).find((note) => !note.isRest);
  assert.ok(first);

  act(() => {
    hook.current.handleNoteClick(first);
    hook.current.handleKeyDown(makeKeyboardEvent('P'));
    hook.current.setAccidental('sharp');
    hook.current.handleKeyDown(makeKeyboardEvent('Z'));
  });
  hook.rerender();

  const entered = flattenVoiceEvents(hook.xml).find((event) => event.measureNumber === 1 && event.timestampNum === 0);
  assert.equal(entered?.kind === 'note' ? entered.pitch.alter : null, 1);
  assert.equal(entered?.kind === 'note' ? entered.writtenAccidental : null, 'sharp');
  assert.equal(hook.current.selectedAccidental, null);
  hook.unmount();
});

test('keyboard accidental shortcuts include double-flat and double-sharp entry', () => {
  const doubleFlatHook = renderHook(SAMPLE_XML);
  const doubleSharpHook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    doubleFlatHook.current.handleNoteClick(notes[0]);
    doubleFlatHook.current.handleKeyDown(makeKeyboardEvent('N'));
    doubleFlatHook.current.handleKeyDown(makeKeyboardEvent('–', { altKey: true, code: 'Minus' }));
    doubleFlatHook.current.handleKeyDown(makeKeyboardEvent('B'));
  });

  act(() => {
    doubleSharpHook.current.handleNoteClick(notes[0]);
    doubleSharpHook.current.handleKeyDown(makeKeyboardEvent('N'));
    doubleSharpHook.current.handleKeyDown(makeKeyboardEvent('≠', { altKey: true, code: 'Equal' }));
    doubleSharpHook.current.handleKeyDown(makeKeyboardEvent('F'));
  });

  assert.equal(doubleFlatHook.current.selectedAccidental, null);
  assert.equal(doubleSharpHook.current.selectedAccidental, null);

  const doubleFlatFirst = flattenVoiceEvents(doubleFlatHook.xml)[0];
  const doubleSharpFirst = flattenVoiceEvents(doubleSharpHook.xml)[0];
  assert.equal(doubleFlatFirst?.kind, 'note');
  assert.equal(doubleSharpFirst?.kind, 'note');
  if (doubleFlatFirst?.kind === 'note') {
    assert.equal(doubleFlatFirst.pitch.step, 'B');
    assert.equal(doubleFlatFirst.pitch.alter, -2);
    assert.equal(doubleFlatFirst.writtenAccidental, 'double-flat');
  }
  if (doubleSharpFirst?.kind === 'note') {
    assert.equal(doubleSharpFirst.pitch.step, 'F');
    assert.equal(doubleSharpFirst.pitch.alter, 2);
    assert.equal(doubleSharpFirst.writtenAccidental, 'double-sharp');
  }
  assert.match(doubleFlatHook.xml, /<accidental>flat-flat<\/accidental>/);
  assert.match(doubleSharpHook.xml, /<accidental>double-sharp<\/accidental>/);

  doubleFlatHook.unmount();
  doubleSharpHook.unmount();
});

test('insertGuitarFret preserves hammer-on and pull-off when replacing an existing TAB note', () => {
  const hook = renderHook(TAB_TECHNIQUE_XML);
  const [note] = makeSelectedNotes(TAB_TECHNIQUE_XML).filter((entry) => !entry.isRest);

  act(() => {
    hook.current.handleNoteClick(note);
    hook.current.insertGuitarFret(5, 7, 'standard');
  });

  const imported = importMusicXmlToCore(hook.xml);
  const event = imported.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
    .find((entry) => entry.kind === 'note');

  assert.deepEqual(event?.kind === 'note' ? event.guitar : null, {
    string: 5,
    fret: 7,
    techniques: ['hammer-on', 'pull-off'],
  });
  assert.match(hook.xml, /<hammer-on type="start">H<\/hammer-on>/);
  assert.match(hook.xml, /<pull-off type="start">P<\/pull-off>/);

  hook.unmount();
});

test('rapid keyboard entry uses the latest note-input duration without waiting for a rerender', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.handleKeyDown(makeKeyboardEvent('5'));
    hook.current.handleKeyDown(makeKeyboardEvent('B'));
  });
  hook.rerender();

  const firstVoiceNotes = flattenVoiceEvents(hook.xml).filter((event): event is TimedEvent & { kind: 'note' } => (
    event.voiceId === 1 && event.kind === 'note'
  ));
  assert.equal(firstVoiceNotes[0]?.pitch.step, 'B');
  assert.equal(firstVoiceNotes[0]?.durationType, 'quarter');
  assert.equal(hook.current.noteInputMode, true);
  assert.equal(hook.current.selectedDuration, '4');
  hook.unmount();
});

test('pitch key after measure-style click starts note input and keeps writing forward', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[2], {
      visualOnly: true,
      visualText: null,
      visualMeasureNumber: notes[2].measureNumber,
      visualStaffIndex: notes[2].staffIndex,
    });
    hook.current.handleKeyDown(makeKeyboardEvent('C'));
  });
  hook.rerender();

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('G'));
  });
  hook.rerender();

  const measureOneSteps = flattenVoiceEvents(hook.xml)
    .filter((event): event is TimedEvent & { kind: 'note' } => event.kind === 'note' && event.measureNumber === 1)
    .map((event) => event.pitch.step);

  assert.equal(hook.current.noteInputMode, true);
  assert.deepEqual(measureOneSteps, ['C', 'C', 'C', 'G']);
  hook.unmount();
});

test('pitch key on an active rest starts note input and replaces the rest', () => {
  const hook = renderHook(SAMPLE_XML);
  const rest = makeSelectedNotes(SAMPLE_XML).find((note) => note.isRest);
  assert.ok(rest);

  act(() => {
    hook.current.handleNoteClick(rest);
    hook.current.setDuration('4');
    hook.current.handleKeyDown(makeKeyboardEvent('C'));
  });
  hook.rerender();

  const replaced = flattenVoiceEvents(hook.xml).find((event) => (
    event.measureNumber === rest.measureNumber
    && event.staffIndex === rest.staffIndex
    && event.voiceId === rest.voiceId
    && event.timestampNum === rest.timestampNum
    && event.timestampDen === rest.timestampDen
  ));

  assert.equal(hook.current.noteInputMode, true);
  assert.equal(replaced?.kind, 'note');
  assert.equal(replaced?.kind === 'note' ? replaced.pitch.step : null, 'C');
  assert.equal(replaced?.durationType, 'quarter');
  hook.unmount();
});

test('toolbar duration change rewrites the selected note instead of only changing toolbar state', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.setDuration('16');
  });
  hook.rerender();

  const voiceEvents = flattenVoiceEvents(hook.xml).filter((event) => event.kind === 'note');
  assert.equal(voiceEvents[0]?.durationType, '16th');
  assert.equal(hook.current.selectedDuration, '16');
  hook.unmount();
});

test('mouse-style note placement overwrites the clicked rhythmic slot and advances input while keeping the entered note highlighted', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('4');
  });
  hook.rerender();

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      step: 'G',
      octave: 4,
      alter: 0,
    });
  });
  hook.rerender();

  const target = flattenVoiceEvents(hook.xml).find((event) => (
    event.kind === 'note'
    && event.measureNumber === 1
    && event.voiceId === 1
    && event.timestampNum === 2
    && event.timestampDen === 4
  ));
  assert.equal(target?.kind, 'note');
  if (target?.kind === 'note') {
    assert.equal(target.pitch.step, 'G');
    assert.equal(target.pitch.octave, 4);
  }
  assert.equal(hook.current.selectedNote?.measureNumber, 1);
  assert.equal(hook.current.selectedNote?.timestampNum, 3);
  assert.equal(hook.current.selectedNote?.timestampDen, 4);
  assert.equal(hook.current.noteInputAnchor?.timestampNum, 2);
  assert.equal(hook.current.noteInputAnchor?.step, 'G');
  assert.equal(hook.current.selectedDuration, '4');
  assert.equal(hook.previewedNotes.at(-1)?.step, 'G');
  hook.unmount();
});

test('mouse-style note placement clears persisted selection metadata while note input is active', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('4');
  });
  hook.rerender();

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      step: 'G',
      octave: 4,
      alter: 0,
    });
  });
  hook.rerender();

  assert.deepEqual(hook.appliedMetas.at(-1), { selectionAnchor: null });
  hook.unmount();
});

test('keyboard note input applies the selected duration even when overwriting an existing whole-note slot', () => {
  const hook = renderHook(WHOLE_NOTE_INPUT_XML);
  const notes = makeSelectedNotes(WHOLE_NOTE_INPUT_XML).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.handleKeyDown(makeKeyboardEvent('3'));
    hook.current.handleKeyDown(makeKeyboardEvent('D'));
  });
  hook.rerender();

  let voiceEvents = flattenVoiceEvents(hook.xml).filter((event): event is TimedEvent & { kind: 'note' } => (
    event.voiceId === 1 && event.kind === 'note'
  ));
  assert.equal(voiceEvents[0]?.pitch.step, 'D');
  assert.equal(voiceEvents[0]?.durationType, '16th');
  assert.equal(hook.current.selectedDuration, '16');

  act(() => {
    hook.current.handleNoteClick(makeSelectedNotes(hook.xml).filter((note) => !note.isRest)[1]);
    hook.current.setDuration('8');
    hook.current.handleKeyDown(makeKeyboardEvent('E'));
  });
  hook.rerender();

  voiceEvents = flattenVoiceEvents(hook.xml).filter((event): event is TimedEvent & { kind: 'note' } => (
    event.voiceId === 1 && event.kind === 'note'
  ));
  assert.equal(voiceEvents[1]?.pitch.step, 'E');
  assert.equal(voiceEvents[1]?.durationType, 'eighth');
  assert.equal(hook.current.selectedDuration, '8');
  hook.unmount();
});

test('mouse-style note placement advances from the final slot of measure 1 into measure 2 while keeping the entered note highlighted', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('4');
  });
  hook.rerender();

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 3,
      timestampDen: 4,
      step: 'B',
      octave: 4,
      alter: 0,
    });
  });
  hook.rerender();

  assert.equal(hook.current.selectedNote?.measureNumber, 2);
  assert.equal(hook.current.selectedNote?.timestampNum, 0);
  assert.equal(hook.current.selectedNote?.timestampDen, 4);
  assert.equal(hook.current.selectedNote?.voiceId, 1);
  assert.equal(hook.current.noteInputAnchor?.measureNumber, 1);
  assert.equal(hook.current.noteInputAnchor?.timestampNum, 3);
  assert.equal(hook.current.noteInputAnchor?.step, 'B');
  hook.unmount();
});

test('mouse-style note placement fails closed to the exact occupied slot unless replace or chord is explicitly overridden', () => {
  const insertHook = renderHook(SAMPLE_XML);

  act(() => {
    insertHook.current.handleKeyDown(makeKeyboardEvent('N'));
    insertHook.current.setDuration('4');
  });
  insertHook.rerender();

  act(() => {
    insertHook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      step: 'G',
      octave: 4,
      alter: 0,
    });
  });
  insertHook.rerender();

  const insertEvents = flattenVoiceEvents(insertHook.xml)
    .filter((event) => event.kind === 'note' && event.measureNumber === 1 && event.voiceId === 1)
    .sort((a, b) => a.timestampNum - b.timestampNum);
  assert.deepEqual(
    insertEvents.map((event) => `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}`),
    ['0/4:C4', '1/4:G4', '2/4:D4', '3/4:E4'],
  );
  assert.equal(insertHook.current.selectedNote?.timestampNum, 2);
  assert.equal(insertHook.current.noteInputAnchor?.timestampNum, 1);
  assert.equal(insertHook.current.noteInputAnchor?.step, 'G');
  insertHook.unmount();

  const overwriteHook = renderHook(SAMPLE_XML);

  act(() => {
    overwriteHook.current.handleKeyDown(makeKeyboardEvent('N'));
    overwriteHook.current.handleKeyDown(makeKeyboardEvent('I'));
    overwriteHook.current.setDuration('4');
  });
  overwriteHook.rerender();

  act(() => {
    overwriteHook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      step: 'A',
      octave: 4,
      alter: 0,
    });
  });
  overwriteHook.rerender();

  const overwriteEvents = flattenVoiceEvents(overwriteHook.xml)
    .filter((event) => event.kind === 'note' && event.measureNumber === 1 && event.voiceId === 1)
    .sort((a, b) => a.timestampNum - b.timestampNum);
  assert.deepEqual(
    overwriteEvents.map((event) => `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}`),
    ['0/4:C4', '1/4:A4', '2/4:D4', '3/4:E4'],
  );
  assert.equal(overwriteHook.current.selectedNote?.timestampNum, 2);
  assert.equal(overwriteHook.current.noteInputAnchor?.timestampNum, 1);
  assert.equal(overwriteHook.current.noteInputAnchor?.step, 'A');
  overwriteHook.unmount();
});

test('mouse placement mode can explicitly request replace or chord on the same onset', () => {
  const replaceHook = renderHook(SAMPLE_XML);

  act(() => {
    replaceHook.current.handleKeyDown(makeKeyboardEvent('N'));
    replaceHook.current.setDuration('4');
  });
  replaceHook.rerender();

  act(() => {
    replaceHook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      step: 'B',
      octave: 4,
      alter: 0,
      placementMode: 'replace',
    });
  });
  replaceHook.rerender();

  const replacedEvents = flattenVoiceEvents(replaceHook.xml)
    .filter((event) => event.kind === 'note' && event.measureNumber === 1 && event.voiceId === 1)
    .sort((a, b) => a.timestampNum - b.timestampNum);
  assert.deepEqual(
    replacedEvents.map((event) => `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}`),
    ['0/4:C4', '1/4:B4', '2/4:D4', '3/4:E4'],
  );
  replaceHook.unmount();

  const chordHook = renderHook(SAMPLE_XML);

  act(() => {
    chordHook.current.handleKeyDown(makeKeyboardEvent('N'));
    chordHook.current.setDuration('4');
  });
  chordHook.rerender();

  act(() => {
    chordHook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      step: 'G',
      octave: 4,
      alter: 0,
      placementMode: 'chord',
    });
  });
  chordHook.rerender();

  const chordEvents = flattenVoiceEvents(chordHook.xml)
    .filter((event): event is TimedEvent & { kind: 'note' } => (
      event.kind === 'note' && event.measureNumber === 1 && event.voiceId === 1
    ))
    .sort((a, b) => a.timestampNum - b.timestampNum || a.pitch.step.localeCompare(b.pitch.step));
  assert.equal(chordEvents.filter((event) => event.timestampNum === 1).length, 2);
  assert.deepEqual(
    chordEvents
      .filter((event): event is typeof chordEvents[number] => event.timestampNum === 1)
      .map((event) => `${event.pitch.step}${event.pitch.octave}`),
    ['C4', 'G4'],
  );
  chordHook.unmount();
});

test('note input preview includes every simultaneous tone after stacking more voices', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('4');
  });
  hook.rerender();

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      step: 'E',
      octave: 4,
      alter: 0,
      placementMode: 'chord',
    });
  });
  hook.rerender();

  assert.deepEqual(
    hook.previewedNoteGroups.at(-1)?.map((note) => `${note.step}${note.octave}`),
    ['C4', 'E4'],
  );

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      step: 'G',
      octave: 4,
      alter: 0,
      placementMode: 'chord',
    });
  });
  hook.rerender();

  assert.deepEqual(
    hook.previewedNoteGroups.at(-1)?.map((note) => `${note.step}${note.octave}`),
    ['C4', 'E4', 'G4'],
  );
  hook.unmount();
});

test('ghost preview positions follow the snapped rhythmic anchor during insert mode', () => {
  assert.equal(resolveGhostPreviewX({
    snappedPointX: 156,
    intentAnchorX: 20,
    fallbackX: 20,
    placementMode: 'insert',
  }), 156);
});

test('ghost preview positions stay centered on the notehead anchor while replacing or stacking voices', () => {
  assert.equal(resolveGhostPreviewX({
    snappedPointX: 156,
    intentAnchorX: 20,
    fallbackX: 20,
    placementMode: 'replace',
  }), 20);
  assert.equal(resolveGhostPreviewX({
    snappedPointX: 156,
    intentAnchorX: 20,
    fallbackX: 20,
    placementMode: 'chord',
  }), 20);
});

test('ghost preview uses anchor X instead of pointer fallback when no rendered snap is available', () => {
  assert.equal(resolveGhostPreviewX({
    snappedPointX: null,
    intentAnchorX: 196,
    fallbackX: 184,
    placementMode: 'insert',
  }), 196);
});

test('insert-mode committed placement keeps snapped timing and snapped X', () => {
  const resolved = resolveGhostCommittedPlacement({
    snappedPoint: {
      domX: 156,
      ratio: 1 / 4,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
    },
    placementIntent: {
      mode: 'insert',
      anchor: {
        x: 196,
        ratio: 2 / 4,
        voiceId: 1,
        timestampNum: 2,
        timestampDen: 4,
      },
      targetVoiceId: 1,
    },
    quantizedRatio: 2 / 4,
    fallbackX: 120,
    fallbackVoiceId: 1,
  });

  assert.deepEqual(resolved, {
    snappedRatio: 1 / 4,
    timestampNum: 1,
    timestampDen: 4,
    snappedX: 156,
    voiceId: 1,
  });
});

test('insert-mode committed placement uses anchor X instead of pointer fallback', () => {
  const resolved = resolveGhostCommittedPlacement({
    snappedPoint: null,
    placementIntent: {
      mode: 'insert',
      anchor: {
        x: 196,
        ratio: 3 / 4,
        voiceId: 1,
        timestampNum: 3,
        timestampDen: 4,
      },
      targetVoiceId: 1,
    },
    quantizedRatio: 3 / 4,
    fallbackX: 184,
    fallbackVoiceId: 1,
  });

  assert.deepEqual(resolved, {
    snappedRatio: 3 / 4,
    timestampNum: 3,
    timestampDen: 4,
    snappedX: 196,
    voiceId: 1,
  });
});

test('distant synthetic ghost snaps are rejected unless an explicit quantized snap exists', () => {
  const distantSnap = {
    domX: 285.18,
    ratio: 8 / 32,
    voiceId: 1,
    timestampNum: 8,
    timestampDen: 32,
    synthetic: true,
  };

  assert.equal(rejectDistantTimestampSnap(distantSnap, 319.15, 9 / 32), null);
  assert.equal(rejectDistantTimestampSnap(distantSnap, 300, 8 / 32), distantSnap);
  assert.equal(resolveEffectiveGhostSnap(distantSnap, null, {
    pointerX: 319.15,
    pointerRatio: 9 / 32,
  }), null);
});

test('selectable ghost snaps keep synthetic ticks for empty rhythmic slots', () => {
  const visibleRestSnap = {
    id: 'rest-start',
    synthetic: false,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 32,
  };
  const hiddenBeatSnap = {
    id: 'synthetic-quarter',
    synthetic: true,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
  };
  const duplicateSyntheticStart = {
    id: 'synthetic-start',
    synthetic: true,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 32,
  };

  assert.deepEqual(
    filterSelectableRenderedGhostSnapPoints([visibleRestSnap, hiddenBeatSnap, duplicateSyntheticStart]).map((point) => point.id),
    ['rest-start', 'synthetic-quarter'],
  );
  assert.deepEqual(
    filterSelectableRenderedGhostSnapPoints([hiddenBeatSnap]).map((point) => point.id),
    ['synthetic-quarter'],
  );
});

test('selectable ghost snaps expose one hover point per rhythmic unit across voices', () => {
  const snaps = filterSelectableRenderedGhostSnapPoints([
    {
      id: 'voice-2-same-beat',
      domX: 248,
      ratio: 1 / 4,
      voiceId: 2,
      timestampNum: 1,
      timestampDen: 4,
      synthetic: false,
      isRest: false,
    },
    {
      id: 'voice-1-same-beat',
      domX: 240,
      ratio: 1 / 4,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      synthetic: false,
      isRest: false,
    },
    {
      id: 'next-beat',
      domX: 300,
      ratio: 1 / 2,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 2,
      synthetic: false,
      isRest: true,
    },
  ]);

  assert.deepEqual(snaps.map((point) => point.id), ['voice-1-same-beat', 'next-beat']);
});

test('selectable ghost snaps prefer rendered noteheads over same-timestamp core fallbacks', () => {
  const snaps = filterSelectableRenderedGhostSnapPoints([
    {
      id: 'core:measure:P1:1:1:event:1:0:overflow:0',
      domX: 179.33,
      ratio: 0,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
      synthetic: false,
      isRest: false,
    },
    {
      id: 'measure:P1:1:1:event:1:0:overflow:0',
      domX: 216.39,
      ratio: 0,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
      synthetic: false,
      isRest: false,
    },
  ]);

  assert.equal(snaps.length, 1);
  assert.equal(snaps[0]?.id, 'measure:P1:1:1:event:1:0:overflow:0');
  assert.equal(snaps[0]?.domX, 216.39);
});

test('rendered snap rebound aligns chord ghosts to selectable rendered noteheads', () => {
  const staffPoints: RenderedGhostGridPoint[] = [
    {
      id: 'core:measure:P1:2:1:event:1:0:overflow:0',
      coreEntityId: 'measure:P1:2:1:event:1:0:overflow:0',
      corePartId: 'part:P1',
      measureId: 'measure:P1:2:1',
      measureNumber: 1,
      staffIndex: 2,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
      ratio: 0,
      domX: 184.67,
      domY: 266.44,
      isRest: false,
      synthetic: false,
    },
    {
      id: 'measure:P1:2:1:event:1:0:overflow:0',
      coreEntityId: 'measure:P1:2:1:event:1:0:overflow:0',
      corePartId: 'part:P1',
      measureId: 'measure:P1:2:1',
      measureNumber: 1,
      staffIndex: 2,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
      ratio: 0,
      domX: 201.74,
      domY: 244.01,
      isRest: false,
      synthetic: false,
    },
  ];
  const grid = {
    byMeasureId: new Map([
      ['measure:P1:2:1', {
        measureId: 'measure:P1:2:1',
        measureNumber: 1,
        corePartId: 'part:P1',
        points: staffPoints,
        byStaffIndex: new Map([
          [2, {
            staffIndex: 2,
            byVoiceId: new Map(),
            points: staffPoints,
          }],
        ]),
      }],
    ]),
  };

  const rebound = alignReplaceGhostToRenderedSnap({
    measureId: 'measure:P1:2:1',
    corePartId: 'part:P1',
    measureNumber: 1,
    pageIndex: 0,
    systemIndex: 0,
    staffIndex: 2,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 32,
    step: 'D',
    octave: 4,
    alter: 0,
    domCenter: { x: 184.67, y: 266.44 },
    domRect: { x: 173.17, y: 260, width: 23, height: 12 },
    previewLeft: 173.17,
    previewTop: 260,
    previewWidth: 23,
    previewHeight: 12,
    pointerX: 200.93,
    accidentalOffsetX: null,
    noteheadCenterX: 11.5,
    stemDirection: 'up',
    placementMode: 'chord',
    placementAnchorIsRest: false,
    ledgerLines: [],
    isGraceTarget: false,
    isTuplet: false,
    tupletLabel: null,
    reflowHints: [],
    resolvedTarget: {
      source: 'pointer',
      mode: 'chord',
      measureId: 'measure:P1:2:1',
      corePartId: 'part:P1',
      measureNumber: 1,
      staffIndex: 2,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
      ratio: 0,
      domX: 184.67,
      step: 'D',
      octave: 4,
      alter: 0,
      diagnostics: ['validation:chord-exact-note'],
    },
  } as never, grid as never);

  assert.equal(rebound?.domCenter.x, 201.74);
  assert.equal(rebound?.previewLeft, 190.24);
  assert.equal(rebound?.resolvedTarget?.measureId, 'measure:P1:2:1');
  assert.equal(rebound?.resolvedTarget?.corePartId, 'part:P1');
  assert.equal(rebound?.resolvedTarget?.measureNumber, 1);
  assert.equal(rebound?.resolvedTarget?.staffIndex, 2);
  assert.equal(rebound?.resolvedTarget?.domX, 201.74);
  assert.match(rebound?.resolvedTarget?.diagnostics.join(' ') ?? '', /rendered-snap-rebound/);
});

test('rendered snap rebound keeps the visible notehead on the semantic commit snap', () => {
  const staffPoints = [{
    id: 'snap:m3:s1:v1:1/4',
    coreEntityId: null,
    corePartId: 'part:P1',
    measureId: 'measure:P1:1:3',
    measureNumber: 3,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    ratio: 1 / 4,
    domX: 419.49,
    domY: 346.5,
    isRest: true,
    synthetic: true,
  }];
  const grid = {
    byMeasureId: new Map([
      ['measure:P1:1:3', {
        measureId: 'measure:P1:1:3',
        measureNumber: 3,
        corePartId: 'part:P1',
        points: staffPoints,
        byStaffIndex: new Map([
          [1, {
            staffIndex: 1,
            byVoiceId: new Map(),
            points: staffPoints,
          }],
        ]),
      }],
    ]),
  };

  const rebound = alignReplaceGhostToRenderedSnap({
    measureId: 'measure:P1:1:3',
    corePartId: 'part:P1',
    measureNumber: 3,
    pageIndex: 0,
    systemIndex: 0,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'G',
    octave: 4,
    alter: 0,
    domCenter: { x: 419.49, y: 346.5 },
    domRect: { x: 477.98, y: 346.5, width: 18, height: 40 },
    previewLeft: 477.98,
    previewTop: 346.5,
    previewWidth: 18,
    previewHeight: 40,
    pointerX: 483.48,
    accidentalOffsetX: 0,
    noteheadCenterX: 5.5,
    stemDirection: 'up',
    placementMode: 'insert',
    placementAnchorIsRest: true,
    semanticAnchorIsRest: true,
    ledgerLines: [],
    isGraceTarget: false,
    isTuplet: false,
    tupletLabel: null,
    reflowHints: [],
    resolvedTarget: {
      source: 'pointer',
      mode: 'insert',
      measureId: 'measure:P1:1:3',
      corePartId: 'part:P1',
      measureNumber: 3,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      ratio: 1 / 4,
      domX: 419.49,
      step: 'G',
      octave: 4,
      alter: 0,
      diagnostics: ['validation:insert-silent-span'],
    },
  } as never, grid as never);

  assert.equal(rebound?.domCenter.x, 419.49);
  assert.equal(rebound?.previewLeft, 413.99);
  assert.equal(rebound ? rebound.previewLeft + rebound.noteheadCenterX : null, 419.49);
  assert.equal(rebound?.resolvedTarget?.domX, 419.49);
});

test('insert-mode ghost placement uses an explicit same-timestamp synthetic snap for commit X', () => {
  const quantizedSyntheticSnap = {
    domX: 262.32,
    ratio: 3 / 4,
    voiceId: 1,
    timestampNum: 3,
    timestampDen: 4,
    synthetic: true,
  };
  const pointerX = 280.8;
  const effectiveSnap = resolveEffectiveGhostSnap(null, quantizedSyntheticSnap, {
    pointerX,
    pointerRatio: 3 / 4,
  });

  const resolved = resolveGhostCommittedPlacement({
    snappedPoint: effectiveSnap,
    placementIntent: {
      mode: 'insert',
      anchor: null,
      targetVoiceId: null,
    },
    quantizedRatio: 3 / 4,
    fallbackX: pointerX,
    fallbackVoiceId: 1,
  });

  assert.equal(effectiveSnap, quantizedSyntheticSnap);
  assert.equal(resolved.snappedX, quantizedSyntheticSnap.domX);
  assert.equal(resolved.snappedRatio, 3 / 4);
});

test('committed ghost placement keeps the active voice over a rest snap voice', () => {
  const resolved = resolveGhostCommittedPlacement({
    snappedPoint: {
      domX: 178.4,
      ratio: 0,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      synthetic: false,
    },
    placementIntent: {
      mode: 'replace',
      anchor: {
        x: 178.4,
        ratio: 0,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 4,
        isRest: true,
      },
      targetVoiceId: 2,
    },
    quantizedRatio: 0,
    fallbackX: 178.4,
    fallbackVoiceId: 2,
  });

  assert.equal(resolved.voiceId, 2);
  assert.equal(resolved.timestampNum, 0);
  assert.equal(resolved.timestampDen, 4);
});

test('committed insert placement keeps the active voice over a non-rest snap voice', () => {
  const resolved = resolveGhostCommittedPlacement({
    snappedPoint: {
      domX: 178.4,
      ratio: 0,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      synthetic: false,
    },
    placementIntent: {
      mode: 'insert',
      anchor: {
        x: 178.4,
        ratio: 0,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 4,
        isRest: false,
      },
      targetVoiceId: 2,
    },
    quantizedRatio: 0,
    fallbackX: 178.4,
    fallbackVoiceId: 2,
  });

  assert.equal(resolved.voiceId, 2);
  assert.equal(resolved.timestampNum, 0);
  assert.equal(resolved.timestampDen, 4);
});

test('distant whole-rest hover stays on the single real snap when no later slot exists', () => {
  const wholeRestPreferredSnap = {
    domX: 178.4,
    ratio: 0,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 32,
    synthetic: false,
    isRest: true,
  };
  const snapOptions = {
    pointerX: 256.91,
    pointerRatio: 3 / 4,
  };

  assert.equal(shouldFindQuantizedGhostSnapFallback(wholeRestPreferredSnap, snapOptions), true);

  const effectiveSnap = resolveEffectiveGhostSnap(
    wholeRestPreferredSnap,
    null,
    snapOptions,
  );
  const resolved = resolveGhostCommittedPlacement({
    snappedPoint: effectiveSnap,
    placementIntent: {
      mode: 'insert',
      anchor: null,
      targetVoiceId: null,
    },
    quantizedRatio: 3 / 4,
    fallbackX: snapOptions.pointerX,
    fallbackVoiceId: 1,
  });

  assert.equal(effectiveSnap, wholeRestPreferredSnap);
  assert.equal(resolved.snappedX, wholeRestPreferredSnap.domX);
  assert.equal(resolved.timestampNum, 0);
  assert.equal(resolved.timestampDen, 32);
});

test('rendered onset snap does not override an exact grid snap at a different timestamp', () => {
  const gridSnap = {
    domX: 212.25,
    domY: 411.01,
    ratio: 4 / 32,
    voiceId: 1,
    timestampNum: 4,
    timestampDen: 32,
    synthetic: false,
    isRest: false,
  };
  const renderedOnsetSnap = {
    domX: 212.25,
    domY: 411.01,
    ratio: 0,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 32,
    synthetic: false,
    isRest: false,
  };

  assert.equal(preferRenderedOnsetSnap(gridSnap, renderedOnsetSnap, 221.07), gridSnap);
});

test('semantic active anchor accepts an exact snap point inside a different timestamp hitbox', () => {
  const containingOnsetBox = {
    id: 'box:m2:s1:v1:0',
    measureId: 'measure:P1:1:2',
    measureNumber: 2,
    pageIndex: 0,
    systemIndex: 0,
    partId: 'part:P1',
    protectedSystemStart: false,
    measureLeft: 100,
    measureRight: 420,
    measureXStart: 100,
    measureXEnd: 420,
    measureDuration: 1,
    durationRatio: 4 / 32,
    xStartReason: 'normal-measure-left' as const,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 32,
    label: 'C4@0/32',
    isRest: false,
    hasRenderedVisual: true,
    rect: { x: 106.12, y: 338.5, width: 121.44, height: 82.5 },
    anchorRect: { x: 206.75, y: 405.51, width: 11, height: 11 },
    visualRect: { x: 206.75, y: 405.51, width: 11, height: 11 },
  };
  const target = {
    measureId: 'measure:P1:1:2',
    corePartId: 'part:P1',
    measureNumber: 2,
    pageIndex: 0,
    systemIndex: 0,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 4,
    timestampDen: 32,
    step: 'E',
    octave: 5,
    alter: 0,
    domCenter: { x: 212.25, y: 411.01 },
    domRect: { x: 195.75, y: 383.01, width: 33, height: 56 },
    previewLeft: 195.75,
    previewTop: 383.01,
    previewWidth: 33,
    previewHeight: 56,
    accidentalOffsetX: 0,
    noteheadCenterX: 16.5,
    stemDirection: 'up' as const,
    placementMode: 'chord' as const,
    ledgerLines: [],
  };
  const exactSnap = {
    id: 'snap:m2:s1:v1:4',
    measureId: 'measure:P1:1:2',
    measureNumber: 2,
    pageIndex: 0,
    systemIndex: 0,
    partId: 'part:P1',
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 4,
    timestampDen: 32,
    ratio: 4 / 32,
    x: 212.25,
    y: 411.01,
    isRest: false,
    synthetic: false,
    active: true,
    sourceCount: 1,
    distinctXCount: 1,
    suppressedSyntheticCount: 0,
    rawXs: [212.25],
    issue: null,
  };

  const withoutSnap = buildSemanticActiveAnchorDebugReport([containingOnsetBox], target);
  const withSnap = buildSemanticActiveAnchorDebugReport([containingOnsetBox], target, [exactSnap]);

  assert.equal(withoutSnap.issueCount, 2);
  assert.deepEqual(withoutSnap.issues.map((issue) => issue.split(' | ')[0]), [
    'hover target has no strict semantic snap',
    'hover target is inside a different semantic timestamp box',
  ]);
  assert.equal(withSnap.issueCount, 0);
  assert.equal(withSnap.strictSnapMatchCount, 1);
});

test('semantic grid Doctor reports snap lanes without matching grid boxes', () => {
  const snap = {
    id: 'snap:m1:p2:s1:v1:1/4',
    measureId: 'measure:P2:1:1',
    measureNumber: 1,
    pageIndex: 0,
    systemIndex: 0,
    partId: 'part:P2',
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    ratio: 0.25,
    x: 240,
    y: 420,
    isRest: false,
    synthetic: true,
    active: false,
    sourceCount: 1,
    distinctXCount: 1,
    suppressedSyntheticCount: 0,
    rawXs: [240],
    issue: null,
  };
  const report = buildSemanticGridDebugReport([], null, [snap] as never);

  assert.equal(report.invariantChecks.snapLaneMissingGridBoxCount, 1);
  assert.equal(report.issueCount, 1);
  assert.match(report.issues[0] ?? '', /semantic_snap_lane_missing_grid_box/);
  assert.match(report.issues[0] ?? '', /part=part:P2/);

  const box = {
    measureId: 'measure:P2:1:1',
    measureNumber: 1,
    pageIndex: 0,
    systemIndex: 0,
    partId: 'part:P2',
    protectedSystemStart: false,
    measureLeft: 200,
    measureRight: 300,
    measureXStart: 200,
    measureXEnd: 300,
    measureDuration: 1,
    durationRatio: 1,
    xStartReason: 'normal-measure-left',
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
    label: 'rest',
    isRest: true,
    hasRenderedVisual: false,
    duplicateOfEarlier: false,
    rect: { x: 200, y: 390, width: 100, height: 60 },
    anchorRect: { x: 200, y: 390, width: 100, height: 60 },
    visualRect: { x: 200, y: 390, width: 100, height: 60 },
  };
  const fixed = buildSemanticGridDebugReport([box] as never, null, [snap] as never);

  assert.equal(fixed.invariantChecks.snapLaneMissingGridBoxCount, 0);
  assert.equal(fixed.invariantChecks.snapLaneMisalignedGridBoxCount, 0);
  assert.equal(fixed.issueCount, 0);
});

test('semantic grid Doctor accepts snap lanes covered by the same semantic timestamp box despite synthetic snap Y drift', () => {
  const box = {
    measureId: 'measure:P1:1:1',
    measureNumber: 1,
    pageIndex: 0,
    systemIndex: 0,
    partId: 'part:P1',
    protectedSystemStart: false,
    measureLeft: 200,
    measureRight: 300,
    measureXStart: 200,
    measureXEnd: 300,
    measureDuration: 1,
    durationRatio: 1,
    xStartReason: 'normal-measure-left',
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
    label: 'rest',
    isRest: true,
    hasRenderedVisual: false,
    duplicateOfEarlier: false,
    rect: { x: 200, y: 100, width: 100, height: 60 },
    anchorRect: { x: 200, y: 100, width: 100, height: 60 },
    visualRect: { x: 200, y: 100, width: 100, height: 60 },
  };
  const snap = {
    id: 'snap:m1:p1:s1:v1:1/2',
    measureId: 'measure:P1:1:1',
    measureNumber: 1,
    pageIndex: 0,
    systemIndex: 0,
    partId: 'part:P1',
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 2,
    ratio: 0.5,
    x: 250,
    y: 420,
    isRest: false,
    synthetic: true,
    active: false,
    sourceCount: 1,
    distinctXCount: 1,
    suppressedSyntheticCount: 0,
    rawXs: [250],
    issue: null,
  };

  const report = buildSemanticGridDebugReport([box] as never, null, [snap] as never);

  assert.equal(report.invariantChecks.snapLaneMissingGridBoxCount, 0);
  assert.equal(report.invariantChecks.snapLaneMisalignedGridBoxCount, 0);
  assert.equal(report.issueCount, 0);
});

test('semantic grid Doctor accepts visible snap anchors outside their timestamp hitbox when timing matches', () => {
  const box = {
    measureId: 'measure:P1:1:21',
    measureNumber: 21,
    pageIndex: 0,
    systemIndex: 2,
    partId: 'part:P1',
    protectedSystemStart: false,
    measureLeft: 245.86,
    measureRight: 292,
    measureXStart: 245.86,
    measureXEnd: 292,
    measureDuration: 1,
    durationRatio: 0.25,
    xStartReason: 'normal-measure-left',
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 32,
    label: 'rest',
    isRest: true,
    hasRenderedVisual: true,
    duplicateOfEarlier: false,
    rect: { x: 245.86, y: 549.75, width: 46.14, height: 98.25 },
    anchorRect: { x: 245.86, y: 549.75, width: 46.14, height: 98.25 },
    visualRect: { x: 155.13, y: 600, width: 12, height: 16 },
  };
  const snap = {
    id: 'snap:m21:p1:s1:v1:0/32',
    measureId: 'measure:P1:1:21',
    measureNumber: 21,
    pageIndex: 0,
    systemIndex: 2,
    partId: 'part:P1',
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 32,
    ratio: 0,
    x: 155.13,
    y: 608,
    isRest: true,
    synthetic: false,
    active: false,
    sourceCount: 1,
    distinctXCount: 1,
    suppressedSyntheticCount: 0,
    rawXs: [155.13],
    issue: null,
  };

  const report = buildSemanticGridDebugReport([box] as never, null, [snap] as never);

  assert.equal(report.invariantChecks.snapLaneMissingGridBoxCount, 0);
  assert.equal(report.invariantChecks.snapLaneMisalignedGridBoxCount, 0);
  assert.equal(report.issueCount, 0);
});

test('semantic grid Doctor reports multi-X snap points for one rhythmic unit', () => {
  const snap = {
    id: 'snap:m1:p1:s1:v1:1/4',
    measureId: 'measure:P1:1:1',
    measureNumber: 1,
    pageIndex: 0,
    systemIndex: 0,
    partId: 'part:P1',
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    ratio: 0.25,
    x: 240,
    y: 120,
    isRest: false,
    synthetic: false,
    active: false,
    sourceCount: 2,
    distinctXCount: 2,
    suppressedSyntheticCount: 0,
    rawXs: [240, 248],
    issue: 'multi-x',
  };
  const report = buildSemanticGridDebugReport([], null, [snap] as never);

  assert.equal(report.snapIssueCount, 1);
  assert.equal(report.snapMultiXIssueCount, 1);
  assert.equal(report.snapIssues[0]?.code, 'snap_multi_x_rhythmic_position');
});

test('single real rest snap remains sticky when no later quantized snap exists', () => {
  const wholeRestSnap = {
    domX: 178.4,
    ratio: 0,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 32,
    synthetic: false,
    isRest: true,
  };
  const pointerX = 340;
  const effectiveSnap = resolveEffectiveGhostSnap(wholeRestSnap, null, {
    pointerX,
    pointerRatio: 3 / 4,
  });

  const resolved = resolveGhostCommittedPlacement({
    snappedPoint: effectiveSnap,
    placementIntent: {
      mode: 'replace',
      anchor: null,
      targetVoiceId: null,
    },
    quantizedRatio: 3 / 4,
    fallbackX: pointerX,
    fallbackVoiceId: 1,
  });

  assert.equal(effectiveSnap, wholeRestSnap);
  assert.equal(resolved.snappedX, wholeRestSnap.domX);
  assert.equal(resolved.timestampNum, 0);
  assert.equal(resolved.timestampDen, 32);
});

test('replace-mode committed placement still follows the canonical snapped slot', () => {
  const resolved = resolveGhostCommittedPlacement({
    snappedPoint: {
      domX: 156,
      ratio: 1 / 4,
      voiceId: 2,
      timestampNum: 1,
      timestampDen: 4,
    },
    placementIntent: {
      mode: 'replace',
      anchor: {
        x: 196,
        ratio: 2 / 4,
        voiceId: 1,
        timestampNum: 2,
        timestampDen: 4,
      },
      targetVoiceId: 1,
    },
    quantizedRatio: 2 / 4,
    fallbackX: 120,
    fallbackVoiceId: 2,
  });

  assert.deepEqual(resolved, {
    snappedRatio: 1 / 4,
    timestampNum: 1,
    timestampDen: 4,
    snappedX: 156,
    voiceId: 2,
  });
});

test('rest replace committed placement prefers the current rest anchor X over a stale snap', () => {
  const resolved = resolveGhostCommittedPlacement({
    snappedPoint: {
      domX: 252.39,
      ratio: 0,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
    },
    placementIntent: {
      mode: 'replace',
      anchor: {
        x: 266.04,
        ratio: 16 / 32,
        voiceId: 1,
        timestampNum: 16,
        timestampDen: 32,
        isRest: true,
      },
      targetVoiceId: 1,
    },
    quantizedRatio: 16 / 32,
    fallbackX: 252.39,
    fallbackVoiceId: 1,
  });

  assert.deepEqual(resolved, {
    snappedRatio: 16 / 32,
    timestampNum: 16,
    timestampDen: 32,
    snappedX: 266.04,
    voiceId: 1,
  });
});

test('synthetic beat snaps are not overridden by a nearby rest placement anchor', () => {
  const resolved = resolveGhostCommittedPlacement({
    snappedPoint: {
      domX: 242,
      ratio: 1 / 2,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 2,
      synthetic: true,
    },
    placementIntent: {
      mode: 'replace',
      anchor: {
        x: 238,
        ratio: 0,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 32,
        isRest: true,
      },
      targetVoiceId: 1,
    },
    quantizedRatio: 1 / 2,
    fallbackX: 240,
    fallbackVoiceId: 1,
  });

  assert.deepEqual(resolved, {
    snappedRatio: 1 / 2,
    timestampNum: 1,
    timestampDen: 2,
    snappedX: 242,
    voiceId: 1,
  });
});

test('semantic replace ghost drops stale previews inside a rest span', () => {
  const coreDocument = importMusicXmlToCore(FULL_REST_XML);
  const part = coreDocument.score.parts[0]!;
  const measure = part.staves[0]!.measures[0]!;
  const currentSlot = {
    id: `slot:${measure.id}:1:1/4`,
    measureId: measure.id,
    measureNumber: measure.measureNumber,
    corePartId: part.id,
    staffIndex: 1,
    timestampNum: 1,
    timestampDen: 4,
    ratio: 1 / 4,
    domX: 151.66,
    voiceIds: [1],
    synthetic: false,
  };
  const staffMap = {
    staffIndex: 1,
    slots: [currentSlot],
    slotsByTimestamp: new Map([['1/4', currentSlot]]),
    pitchLanes: [],
    pitchLanesByPitch: new Map(),
  };
  const editMap = {
    measures: new Map([[
      measure.id,
      {
        measureId: measure.id,
        measureNumber: measure.measureNumber,
        corePartId: part.id,
        staves: [staffMap],
        stavesByIndex: new Map([[1, staffMap]]),
      },
    ]]),
    measureOrder: [measure.id],
    diagnostics: [],
  };
  const staleGhost = {
    measureId: measure.id,
    corePartId: part.id,
    measureNumber: measure.measureNumber,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'E',
    octave: 4,
    alter: 0,
    domCenter: { x: 197.15, y: 178.94 },
    domRect: { x: 191.65, y: 160, width: 11, height: 38 },
    pointerX: 232.15,
    previewLeft: 191.65,
    previewTop: 160,
    previewWidth: 18,
    previewHeight: 40,
    accidentalOffsetX: 0,
    noteheadCenterX: 5.5,
    stemDirection: 'up' as const,
    placementMode: 'replace' as const,
    placementAnchorIsRest: true,
    semanticAnchorIsRest: true,
    semanticAnchorLabel: 'rest@8/32',
    ledgerLines: [],
    snapResolution: {
      resolver: 'advanced-retarget',
      effectiveSnap: {
        source: 'advanced-anchor',
        x: 197.15,
        ratio: 0.25,
        timestamp: '1/4',
        voice: 1,
        synthetic: true,
        isRest: false,
      },
      resolvedTarget: null,
      deltas: {
        ghostToSnap: 0,
      },
    },
  };

  const rebound = bindResolvedEditTargetToGhost(
    staleGhost,
    editMap,
    coreDocument,
    '4',
    false,
  );

  // Element-anchor rule: a stale preview pointing inside a rest span no longer
  // resolves to a target — the phantom mid-rest slot is dropped entirely.
  assert.equal(rebound, null);
});

test('ghost binding rejects semantic targets that are missing from the visible snap grid', () => {
  const coreDocument = importMusicXmlToCore(SAMPLE_XML);
  const measure = coreDocument.score.parts[0]!.staves[0]!.measures[0]!;
  const editMap = buildInteractiveEditMap({
    renderedGhostGrid: null,
    renderedNotes: [],
    measureOverlays: [{
      measureId: measure.id,
      measureNumber: measure.measureNumber,
      pageIndex: 0,
      systemIndex: 0,
    }],
  });
  const unmappedGhost = {
    measureId: measure.id,
    corePartId: coreDocument.score.parts[0]!.id,
    measureNumber: measure.measureNumber,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'D',
    octave: 4,
    alter: 0,
    domCenter: { x: 164, y: 82 },
    domRect: { x: 154, y: 64, width: 20, height: 36 },
    pointerX: 164,
    previewLeft: 154,
    previewTop: 64,
    previewWidth: 20,
    previewHeight: 36,
    accidentalOffsetX: 0,
    noteheadCenterX: 10,
    stemDirection: 'up' as const,
    placementMode: 'replace' as const,
    placementAnchorIsRest: false,
    semanticAnchorIsRest: false,
    ledgerLines: [],
  };

  const rebound = bindResolvedEditTargetToGhost(
    unmappedGhost,
    editMap,
    coreDocument,
    '4',
    false,
  );

  assert.equal(rebound, null);
});

test('ghost binding syncs an embedded resolved target after MuseScore chord promotion', () => {
  const coreDocument = importMusicXmlToCore(SAMPLE_XML);
  const measure = coreDocument.score.parts[0]!.staves[0]!.measures[0]!;
  const editMap = buildInteractiveEditMap({
    renderedGhostGrid: null,
    renderedNotes: [],
    measureOverlays: [{
      measureId: measure.id,
      measureNumber: measure.measureNumber,
      pageIndex: 0,
      systemIndex: 0,
    }],
  });

  const rebound = bindResolvedEditTargetToGhost({
    measureId: measure.id,
    corePartId: coreDocument.score.parts[0]!.id,
    measureNumber: measure.measureNumber,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'E',
    octave: 4,
    alter: 0,
    domCenter: { x: 164, y: 82 },
    domRect: { x: 154, y: 64, width: 20, height: 36 },
    pointerX: 164,
    previewLeft: 154,
    previewTop: 64,
    previewWidth: 20,
    previewHeight: 36,
    accidentalOffsetX: 0,
    noteheadCenterX: 10,
    stemDirection: 'up' as const,
    placementMode: 'chord' as const,
    placementAnchorIsRest: false,
    semanticAnchorIsRest: false,
    ledgerLines: [],
    resolvedTarget: {
      source: 'pointer',
      mode: 'replace',
      measureId: measure.id,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: measure.measureNumber,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      ratio: 0,
      domX: 164,
      step: 'E',
      octave: 4,
      alter: 0,
      diagnostics: [],
    },
  }, editMap, coreDocument, '4', false);

  assert.ok(rebound?.resolvedTarget);
  assert.equal(rebound.placementMode, 'chord');
  assert.equal(rebound.resolvedTarget.mode, 'chord');
  assert.equal(rebound.resolvedTarget.existingEventKind, 'note');
  assert.match(rebound.resolvedTarget.diagnostics.join(' '), /placement-mode-synced:replace->chord/);
  assert.match(rebound.resolvedTarget.diagnostics.join(' '), /validation:chord-exact-note/);
});

test('ghost binding can display a recent-commit chord over a stale rest-only snap', () => {
  const coreDocument = importMusicXmlToCore(FULL_REST_XML);
  const measure = coreDocument.score.parts[0]!.staves[0]!.measures[0]!;
  const editMap = buildInteractiveEditMap({
    renderedGhostGrid: null,
    renderedNotes: [],
    measureOverlays: [{
      measureId: measure.id,
      measureNumber: measure.measureNumber,
      pageIndex: 0,
      systemIndex: 0,
    }],
  });

  const rebound = bindResolvedEditTargetToGhost({
    measureId: measure.id,
    corePartId: coreDocument.score.parts[0]!.id,
    measureNumber: measure.measureNumber,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
    step: 'E',
    octave: 4,
    alter: 0,
    domCenter: { x: 164, y: 82 },
    domRect: { x: 154, y: 64, width: 20, height: 36 },
    pointerX: 164,
    previewLeft: 154,
    previewTop: 64,
    previewWidth: 20,
    previewHeight: 36,
    accidentalOffsetX: 0,
    noteheadCenterX: 10,
    stemDirection: 'up' as const,
    placementMode: 'chord' as const,
    placementAnchorIsRest: true,
    placementModePromotedByRecentCommit: true,
    semanticAnchorIsRest: true,
    ledgerLines: [],
    resolvedTarget: {
      source: 'pointer',
      mode: 'replace',
      measureId: measure.id,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: measure.measureNumber,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 1,
      ratio: 0,
      domX: 164,
      step: 'E',
      octave: 4,
      alter: 0,
      diagnostics: ['rest-only-snap-selected'],
    },
  }, editMap, coreDocument, '4', false);

  assert.ok(rebound?.resolvedTarget);
  assert.equal(rebound.placementMode, 'chord');
  assert.equal(rebound.resolvedTarget.mode, 'chord');
  assert.equal(rebound.resolvedTarget.existingEventKind, 'note');
  assert.match(rebound.resolvedTarget.diagnostics.join(' '), /validation:chord-recent-commit-anchor/);
});

test('advanced retarget keeps note anchors marked as notes for fresh multi-voice entry', () => {
  const point = {
    id: 'm1:1:1:0/4:note',
    coreEntityId: 'n1',
    corePartId: 'P1',
    measureId: 'm1',
    measureNumber: 1,
    pageIndex: 0,
    systemIndex: 0,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    ratio: 0,
    domX: 216,
    domY: 120,
    isRest: false,
    synthetic: false,
  };
  const retargeted = retargetGhostToAdvancedAnchor({
    renderedGhostGrid: {
      byMeasureId: new Map([[
        'm1',
        {
          measureId: 'm1',
          measureNumber: 1,
          corePartId: 'P1',
          points: [point],
          syntheticPoints: [],
          byStaffIndex: new Map([[
            1,
            {
              staffIndex: 1,
              points: [point],
              syntheticPoints: [],
              byVoiceId: new Map([[1, [point]]]),
              syntheticByVoiceId: new Map(),
            },
          ]]),
        },
      ]]),
    },
    pointerGhostAnchor: {
      coreEntityId: 'n1',
      coreMeasureId: 'm1',
      corePartId: 'P1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      step: 'G',
      octave: 4,
      alter: 0,
      isRest: false,
      graphicalNote: null,
    },
    pointerX: 216,
    resolvedGhost: {
      measureId: 'm1',
      corePartId: 'P1',
      measureNumber: 1,
      pageIndex: 0,
      systemIndex: 0,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      step: 'B',
      octave: 4,
      alter: 0,
      domCenter: { x: 242, y: 96 },
      domRect: { x: 236, y: 90, width: 12, height: 12 },
      previewLeft: 236,
      previewTop: 90,
      previewWidth: 16,
      previewHeight: 24,
      pointerX: 216,
      accidentalOffsetX: 0,
      noteheadCenterX: 6,
      stemDirection: 'up',
      placementMode: 'replace',
      placementAnchorIsRest: true,
      semanticAnchorIsRest: true,
      semanticAnchorLabel: 'rest@1/4',
      ledgerLines: [],
    },
  });

  assert.ok(retargeted);
  assert.equal(retargeted.domCenter.x, 216);
  assert.equal(retargeted.placementAnchorIsRest, false);
  assert.equal(retargeted.semanticAnchorIsRest, false);
});

test('clicking the visible rest glyph commits against the rest start snap', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
        <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
      </measure>
    </part>
  </score-partwise>`;
  const coreDocument = importMusicXmlToCore(xml);
  const part = coreDocument.score.parts[0]!;
  const measure = part.staves[0]!.measures[0]!;
  const voice = measure.voices[0]!;
  const [noteEvent, restEvent] = voice.events;
  assert.ok(noteEvent);
  assert.ok(restEvent);

  const selectedFromEvent = (event: TimedEvent): SelectedNote => ({
    coreEntityId: event.id,
    coreVoiceId: voice.id,
    coreMeasureId: measure.id,
    corePartId: part.id,
    measureNumber: event.measureNumber,
    staffIndex: event.staffIndex,
    voiceId: event.voiceId,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
    step: event.kind === 'note' ? event.pitch.step : 'C',
    octave: event.kind === 'note' ? event.pitch.octave : 4,
    alter: event.kind === 'note' ? event.pitch.alter : 0,
    isRest: event.kind === 'rest',
    durationType: event.durationType,
    isDotted: event.isDotted,
    graphicalNote: null,
  });
  const note = selectedFromEvent(noteEvent);
  const rest = selectedFromEvent(restEvent);
  const renderedNotes: RenderedNote[] = [
    {
      id: note.coreEntityId ?? 'note',
      coreEntityId: note.coreEntityId ?? null,
      note,
      svgCenter: { x: 120, y: 90 },
      domCenter: { x: 120, y: 90 },
      domRect: { x: 114, y: 75, width: 12, height: 30 },
      svgElement: null,
      tintElement: null,
    },
    {
      id: rest.coreEntityId ?? 'rest',
      coreEntityId: rest.coreEntityId ?? null,
      note: rest,
      svgCenter: { x: 252, y: 90 },
      domCenter: { x: 252, y: 90 },
      domRect: { x: 242, y: 82, width: 20, height: 16 },
      svgElement: null,
      tintElement: null,
    },
  ];
  const overlay = {
    measureId: measure.id,
    measureNumber: measure.measureNumber,
    systemIndex: 0,
    pageIndex: 0,
    widthWeight: 1,
    domRect: { x: 100, y: 50, width: 220, height: 80 },
    breakBefore: false,
    pageBreakBefore: false,
    staffSpacing: null,
    staffDetails: [{
      staffIndex: 1,
      topLineDomY: 70,
      bottomLineDomY: 110,
      lineDistanceDom: 10,
      lineCount: 5,
    }],
  };
  const renderedGhostGrid = buildRenderedGhostGrid(renderedNotes, {
    coreDocument,
    measureOverlays: [overlay],
    selectedDuration: '4',
  });
  const editMap = buildInteractiveEditMap({
    renderedGhostGrid,
    measureOverlays: [overlay],
    renderedNotes,
  });

  const clickedRestGhost = resolveClickedRestAnchorGhostTarget(
    rest,
    overlay,
    renderedGhostGrid,
    coreDocument,
    { x: 252, y: 90 },
    '4',
    null,
    1,
  );
  const rebound = bindResolvedEditTargetToGhost(clickedRestGhost, editMap, coreDocument, '4', false);

  assert.ok(clickedRestGhost);
  assert.ok(Number.isFinite(clickedRestGhost.domCenter.x));
  assert.ok(rebound?.resolvedTarget);
  assert.equal(rebound.resolvedTarget?.timestampNum, rest.timestampNum);
  assert.equal(rebound.resolvedTarget?.timestampDen, rest.timestampDen);
  assert.equal(rebound.resolvedTarget?.existingEventKind, 'rest');
  assert.match(rebound.resolvedTarget?.diagnostics.join(' ') ?? '', /validation:replace-rest-exact/);
});

test('beat-one rest eighth-note mouse ghost and commit share the rendered snap X', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest/><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const coreDocument = importMusicXmlToCore(xml);
  const part = coreDocument.score.parts[0]!;
  const measure = part.staves[0]!.measures[0]!;
  const voice = measure.voices[0]!;
  const restEvent = voice.events.find((event) => event.kind === 'rest')!;
  const rest: SelectedNote = {
    coreEntityId: restEvent.id,
    coreVoiceId: voice.id,
    coreMeasureId: measure.id,
    corePartId: part.id,
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: restEvent.timestampNum,
    timestampDen: restEvent.timestampDen,
    step: 'C',
    octave: 4,
    alter: 0,
    isRest: true,
    durationType: restEvent.durationType,
    isDotted: restEvent.isDotted,
    graphicalNote: null,
  };
  const renderedNotes: RenderedNote[] = [
    {
      id: rest.coreEntityId ?? 'beat-one-rest',
      coreEntityId: rest.coreEntityId ?? null,
      note: rest,
      svgCenter: { x: 214, y: 86 },
      domCenter: { x: 214, y: 86 },
      domRect: { x: 207, y: 80, width: 14, height: 12 },
      svgElement: null,
      tintElement: null,
    },
    ...(['C', 'D', 'E'] as const).map((step, index) => {
      const event = voice.events[index + 1]!;
      const x = 274 + (index * 54);
      return {
        id: event.id,
        coreEntityId: event.id,
        note: {
          coreEntityId: event.id,
          coreVoiceId: voice.id,
          coreMeasureId: measure.id,
          corePartId: part.id,
          measureNumber: 1,
          staffIndex: 1,
          voiceId: 1,
          timestampNum: event.timestampNum,
          timestampDen: event.timestampDen,
          step,
          octave: 4,
          alter: 0,
          isRest: false,
          durationType: event.durationType,
          isDotted: event.isDotted,
          graphicalNote: null,
        },
        svgCenter: { x, y: 86 },
        domCenter: { x, y: 86 },
        domRect: { x: x - 6, y: 80, width: 12, height: 12 },
        svgElement: null,
        tintElement: null,
      } satisfies RenderedNote;
    }),
  ];
  const overlay = {
    measureId: measure.id,
    measureNumber: 1,
    systemIndex: 0,
    pageIndex: 0,
    widthWeight: 1,
    domRect: { x: 160, y: 42, width: 250, height: 88 },
    breakBefore: false,
    pageBreakBefore: false,
    staffSpacing: null,
    staffDetails: [{
      staffIndex: 1,
      topLineDomY: 64,
      bottomLineDomY: 104,
      lineDistanceDom: 10,
      lineCount: 5,
    }],
  };
  const renderedGhostGrid = buildRenderedGhostGrid(renderedNotes, {
    coreDocument,
    measureOverlays: [overlay],
    selectedDuration: '8',
  });
  const snap = getRenderedGhostStaffPoints(renderedGhostGrid, measure.id, 1)
    .find((point) => point.isRest && point.ratio === 0);
  assert.ok(snap);
  const editMap = buildInteractiveEditMap({
    renderedGhostGrid,
    measureOverlays: [overlay],
    renderedNotes,
  });

  const clickedRestGhost = resolveClickedRestAnchorGhostTarget(
    rest,
    overlay,
    renderedGhostGrid,
    coreDocument,
    { x: snap.domX - 9, y: 87 },
    '8',
    null,
    1,
  );
  const rebound = alignReplaceGhostToRenderedSnap(
    bindResolvedEditTargetToGhost(clickedRestGhost, editMap, coreDocument, '8', false),
    renderedGhostGrid,
  );

  assert.ok(clickedRestGhost);
  assert.ok(rebound?.resolvedTarget);
  assert.equal(rebound.timestampNum, snap.timestampNum);
  assert.equal(rebound.timestampDen, snap.timestampDen);
  assert.equal(rebound.resolvedTarget.timestampNum, snap.timestampNum);
  assert.equal(rebound.resolvedTarget.timestampDen, snap.timestampDen);
  assert.equal(rebound.domCenter.x, snap.domX);
  assert.equal(rebound.previewLeft, snap.domX - rebound.noteheadCenterX);
  assert.equal(rebound.previewLeft + rebound.noteheadCenterX, snap.domX);
  assert.equal(rebound.resolvedTarget.domX, snap.domX);
  assert.equal(rebound.snapResolution?.effectiveSnap?.x, snap.domX);
  assert.equal(rebound.snapResolution?.resolvedTarget?.domX, snap.domX);
  assert.equal(rebound.snapResolution?.deltas?.visibleNoteheadToSnap, 0);
  assert.equal(rebound.snapResolution?.deltas?.commitToSnap, 0);
});

test('whole-rest pointer hover locks to the rest anchor', () => {
  const coreDocument = importMusicXmlToCore(FULL_REST_XML);
  const measureId = coreDocument.score.parts[0]!.staves[0]!.measures[0]!.id;
  const renderedNotes: RenderedNote[] = [{
    id: 'whole-rest',
    coreEntityId: 'whole-rest',
    note: {
      coreEntityId: 'whole-rest',
      coreMeasureId: measureId,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      step: 'C',
      octave: 4,
      alter: 0,
      isRest: true,
      graphicalNote: null,
    },
    svgCenter: { x: 180, y: 80 },
    domCenter: { x: 180, y: 80 },
    domRect: { x: 174, y: 74, width: 12, height: 12 },
    svgElement: null,
    tintElement: null,
  }];
  const overlay = {
    measureId,
    measureNumber: 1,
    systemIndex: 0,
    pageIndex: 0,
    widthWeight: 1,
    domRect: { x: 100, y: 40, width: 160, height: 80 },
    breakBefore: false,
    pageBreakBefore: false,
    staffSpacing: null,
    staffDetails: [{
      staffIndex: 1,
      topLineDomY: 60,
      bottomLineDomY: 100,
      lineDistanceDom: 10,
      lineCount: 5,
    }],
  };
  const renderedGhostGrid = buildRenderedGhostGrid(renderedNotes, {
    coreDocument,
    measureOverlays: [overlay],
    selectedDuration: '4',
  });
  assert.deepEqual(
    getRenderedGhostStaffPoints(renderedGhostGrid, measureId, 1).map((point) => `${point.timestampNum}/${point.timestampDen}`),
    ['0/4'],
  );

  const ghostIndex = buildGhostNoteSpatialIndex(renderedNotes, coreDocument, [overlay], renderedGhostGrid);
  const systemOverlays = [{
    systemIndex: 0,
    pageIndex: 0,
    measureNumbers: [1],
    domRect: { x: 100, y: 40, width: 160, height: 80 },
    totalWidthWeight: 1,
    defaultStaffSpacing: 80,
    collisionPressure: 0,
    collisionMode: 'balanced' as const,
    explicitBreakBefore: false,
    spacingGuideHeight: 0,
  }];
  const geometryProxy = {
    getDetailedContext: () => null,
  } as unknown as Parameters<typeof resolveGhostNoteTarget>[0];

  const target = resolveGhostNoteTarget(
    geometryProxy,
    renderedGhostGrid,
    ghostIndex,
    overlay,
    [overlay],
    systemOverlays,
    coreDocument,
    new Set(),
    { x: 140, y: 82 },
    null,
    null,
    '4',
    null,
    false,
    1,
    null,
    0,
    new Map([[1, overlay.staffDetails]]),
  );

  // Element-anchor rule: hovering anywhere inside a whole-measure rest locks
  // the ghost to the rest's start anchor — no quantized internal slots.
  assert.ok(target);
  assert.equal(target.timestampNum, 0);
  assert.equal(Math.round(target.domCenter.x), 180);
  assert.equal(target.resolvedTarget?.timestampNum, 0);
  assert.equal(target.resolvedTarget?.existingEventKind, 'rest');
  assert.equal(target.resolvedTarget?.diagnostics.includes('rest-only-snap-selected'), true);
  assert.equal(target.resolvedTarget?.diagnostics.includes('rest-only-quantized-internal-slot'), false);
  assert.equal(target.snapResolution?.effectiveSnap?.synthetic, false);
  assert.equal(target.snapResolution?.effectiveSnap?.timestamp, '0/4');
  assert.equal(target.snapResolution?.quantizedFallbackSnap ?? null, null);
});

test('ghost diagnostics accept quantized rest-only fallback snaps as represented slots', () => {
  assert.equal(ghostHasTraceQuantizedRestFallbackSnap({
    timestampNum: 1,
    timestampDen: 2,
    voiceId: 1,
    resolvedTarget: {
      diagnostics: ['rest-only-quantized-internal-slot'],
    },
    snapResolution: {
      quantizedFallbackSnap: {
        timestamp: '1/2',
        voice: 1,
        synthetic: true,
        x: 499.94,
      },
    },
  }), true);

  assert.equal(ghostHasTraceQuantizedRestFallbackSnap({
    timestampNum: 1,
    timestampDen: 2,
    voiceId: 1,
    resolvedTarget: {
      diagnostics: ['rest-only-quantized-internal-slot'],
    },
    snapResolution: {
      quantizedFallbackSnap: {
        timestamp: '1/4',
        voice: 1,
        synthetic: true,
        x: 499.94,
      },
    },
  }), false);

  assert.equal(ghostHasTraceQuantizedRestFallbackSnap({
    timestampNum: 1,
    timestampDen: 2,
    voiceId: 1,
    resolvedTarget: {
      diagnostics: ['rest-only-quantized-internal-slot'],
    },
    snapResolution: {
      quantizedFallbackSnap: {
        timestamp: '1/2',
        voice: 2,
        synthetic: true,
        x: 499.94,
      },
    },
  }), false);
});

test('whole-rest grid exposes no internal synthetic beat slots', () => {
  const coreDocument = importMusicXmlToCore(FULL_REST_XML);
  const measureId = coreDocument.score.parts[0]!.staves[0]!.measures[0]!.id;
  const renderedNotes: RenderedNote[] = [{
    id: 'whole-rest',
    coreEntityId: 'whole-rest',
    note: {
      coreEntityId: 'whole-rest',
      coreMeasureId: measureId,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      step: 'C',
      octave: 4,
      alter: 0,
      isRest: true,
      graphicalNote: null,
    },
    svgCenter: { x: 180, y: 80 },
    domCenter: { x: 180, y: 80 },
    domRect: { x: 174, y: 74, width: 12, height: 12 },
    svgElement: null,
    tintElement: null,
  }];
  const overlay = {
    measureId,
    measureNumber: 1,
    systemIndex: 0,
    pageIndex: 0,
    widthWeight: 1,
    domRect: { x: 100, y: 40, width: 160, height: 80 },
    breakBefore: false,
    pageBreakBefore: false,
    staffSpacing: null,
    staffDetails: [{
      staffIndex: 1,
      topLineDomY: 60,
      bottomLineDomY: 100,
      lineDistanceDom: 10,
      lineCount: 5,
    }],
  };
  const renderedGhostGrid = buildRenderedGhostGrid(renderedNotes, {
    coreDocument,
    measureOverlays: [overlay],
    selectedDuration: '4',
    exposeRestMeasureSlots: true,
  });
  const allPoints = getRenderedGhostStaffPoints(renderedGhostGrid, measureId, 1, { includeSynthetic: true });
  assert.deepEqual(
    allPoints.map((point) => `${point.timestampNum}/${point.timestampDen}:${point.synthetic ? 'synthetic' : 'rendered'}`),
    ['0/4:rendered'],
  );
  const editMap = buildInteractiveEditMap({
    renderedGhostGrid,
    measureOverlays: [overlay],
    renderedNotes,
  });

  const rebound = bindResolvedEditTargetToGhost({
    measureId,
    corePartId: coreDocument.score.parts[0]!.id,
    measureNumber: 1,
    pageIndex: 0,
    systemIndex: 0,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'D',
    octave: 4,
    alter: 0,
    domCenter: { x: 220, y: 82 },
    domRect: { x: 214, y: 76, width: 12, height: 12 },
    pointerX: 220,
    previewLeft: 214,
    previewTop: 76,
    previewWidth: 16,
    previewHeight: 24,
    accidentalOffsetX: 0,
    noteheadCenterX: 6,
    stemDirection: 'up',
    placementMode: 'replace',
    placementAnchorIsRest: true,
    semanticAnchorIsRest: true,
    ledgerLines: [],
    resolvedTarget: {
      source: 'pointer',
      mode: 'replace',
      measureId,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      ratio: 0.25,
      domX: 220,
      step: 'D',
      octave: 4,
      alter: 0,
      existingEventKind: 'rest',
      existingEventStartsAtTarget: true,
      diagnostics: ['rest-only-snap-selected', 'rest-only-quantized-internal-slot'],
    },
    snapResolution: {
      resolver: 'proxy',
      reason: 'rest-only snap selected',
      measureId,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestamp: '1/4',
      rawPointerX: 220,
      safePointerX: 220,
      pointerMeasureRatio: 0.25,
      fallbackQuantizedRatio: 0.25,
      quantizedRatio: 0.25,
      slotDuration: 0.25,
      segmentStartRatio: 0,
      maxStartRatio: 0.75,
      gridSnap: null,
      renderedOnsetSnap: null,
      preferredSnap: null,
      effectiveSnap: null,
      quantizedFallbackSnap: {
        timestamp: '1/4',
        voice: 1,
        synthetic: false,
        x: 220,
      },
      placementIntent: { mode: 'replace', targetVoiceId: 1, anchor: null },
      committed: { snappedX: 220, timestamp: '1/4', voiceId: 1 },
      visible: {
        domCenterX: 220,
        previewLeft: 214,
        noteheadCenterX: 6,
        visibleNoteheadX: 220,
        minimumVisibleX: null,
      },
      resolvedTarget: null,
      deltas: {},
    },
  }, editMap, coreDocument, '4', false);

  assert.equal(rebound, null);
});

test('whole-rest semantic rest hover stays locked to the rest anchor', () => {
  const coreDocument = importMusicXmlToCore(FULL_REST_XML);
  const measure = coreDocument.score.parts[0]!.staves[0]!.measures[0]!;
  const measureId = measure.id;
  const renderedNotes: RenderedNote[] = [{
    id: 'whole-rest',
    coreEntityId: 'whole-rest',
    note: {
      coreEntityId: 'whole-rest',
      coreMeasureId: measureId,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      step: 'C',
      octave: 4,
      alter: 0,
      isRest: true,
      graphicalNote: null,
    },
    svgCenter: { x: 190.22, y: 80 },
    domCenter: { x: 190.22, y: 80 },
    domRect: { x: 165.56, y: 70, width: 99.32, height: 20 },
    svgElement: null,
    tintElement: null,
  }];
  const overlay = {
    measureId,
    measureNumber: 1,
    systemIndex: 0,
    pageIndex: 0,
    widthWeight: 1,
    domRect: { x: 165.56, y: 40, width: 99.32, height: 80 },
    breakBefore: false,
    pageBreakBefore: false,
    staffSpacing: null,
    staffDetails: [{
      staffIndex: 1,
      topLineDomY: 60,
      bottomLineDomY: 100,
      lineDistanceDom: 10,
      lineCount: 5,
    }],
  };
  const renderedGhostGrid = buildRenderedGhostGrid(renderedNotes, {
    coreDocument,
    measureOverlays: [overlay],
    selectedDuration: '4',
  });
  const restSnap = getRenderedGhostStaffPoints(renderedGhostGrid, measureId, 1)[0];
  if (!restSnap) throw new Error('Missing rendered whole-rest snap');
  const bodyHoverPoint = { x: restSnap.domX + 28, y: 82 };
  const ghostIndex = buildGhostNoteSpatialIndex(renderedNotes, coreDocument, [overlay], renderedGhostGrid);
  const systemOverlays = [{
    systemIndex: 0,
    pageIndex: 0,
    measureNumbers: [1],
    domRect: { x: 100, y: 40, width: 180, height: 80 },
    totalWidthWeight: 1,
    defaultStaffSpacing: 80,
    collisionPressure: 0,
    collisionMode: 'balanced' as const,
    explicitBreakBefore: false,
    spacingGuideHeight: 0,
  }];
  const context = {
    measure: {
      ...overlay,
      activeTuplets: [],
      timeSignature: { beats: 4, beatType: 4 },
      measureDurationRatio: 1,
      isVirtual: false,
    },
    staff: overlay.staffDetails[0]!,
    relX: (bodyHoverPoint.x - overlay.domRect.x) / overlay.domRect.width,
    relY: (bodyHoverPoint.y - overlay.domRect.y) / overlay.domRect.height,
    staffStep: 4,
    musicalTime: { num: 0, den: 1 },
    snapPoint: null,
    activeTuplet: null,
  };
  const geometryProxy = {
    getDetailedContext: () => context,
  } as unknown as Parameters<typeof resolveGhostNoteTarget>[0];

  const target = resolveGhostNoteTarget(
    geometryProxy,
    renderedGhostGrid,
    ghostIndex,
    overlay,
    [overlay],
    systemOverlays,
    coreDocument,
    new Set(),
    bodyHoverPoint,
    null,
    null,
    '4',
    null,
    false,
    1,
    1,
    0,
    new Map([[1, overlay.staffDetails]]),
  );

  // Element-anchor rule: the ghost preview and committed target both stay
  // locked to the rest's start anchor. No pointer-quantized internals.
  assert.ok(target);
  assert.equal(Math.round(target.domCenter.x), Math.round(restSnap.domX));
  assert.equal(target.timestampNum, 0);
  assert.equal(target.resolvedTarget?.timestampNum, 0);
  assert.equal(target.resolvedTarget?.existingEventKind, 'rest');
  assert.equal(target.resolvedTarget?.diagnostics.includes('rest-only-snap-selected'), true);
  assert.equal(target.resolvedTarget?.diagnostics.includes('rest-only-quantized-internal-slot'), false);
  assert.equal(target.snapResolution?.effectiveSnap?.synthetic, false);
  assert.equal(target.snapResolution?.quantizedFallbackSnap ?? null, null);
  assert.equal(target.snapResolution?.effectiveSnap?.timestamp, '0/4');
  assert.equal(target.snapResolution?.visible.domCenterX, Number(restSnap.domX.toFixed(2)));
  assert.ok(['0/1', '0/4'].includes(target.snapResolution?.committed.timestamp ?? ''));
  assert.ok(Math.abs(bodyHoverPoint.x - target.domCenter.x) > 20);
  assert.equal(target.snapResolution?.resolver, 'proxy');
});

test('note-input commit preserves the clicked visible ghost target', () => {
  const visibleGhost = {
    measureId: 'm1',
    corePartId: 'p1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'C',
    octave: 4,
    alter: 0,
    domCenter: { x: 100, y: 80 },
    domRect: { x: 90, y: 70, width: 20, height: 20 },
    previewLeft: 90,
    previewTop: 70,
    previewWidth: 20,
    previewHeight: 20,
    accidentalOffsetX: 0,
    noteheadCenterX: 10,
    stemDirection: 'up' as const,
    placementMode: 'replace' as const,
    ledgerLines: [],
    resolvedTarget: {
      source: 'pointer' as const,
      mode: 'replace' as const,
      measureId: 'm1',
      corePartId: 'p1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      ratio: 0,
      domX: 100,
      allowOccupiedInsert: false,
      step: 'C',
      octave: 4,
      alter: 0,
      diagnostics: [],
    },
  };
  const resolvedGhost = {
    ...visibleGhost,
    timestampNum: 1,
    step: 'D',
    domCenter: { x: 140, y: 72 },
    domRect: { x: 130, y: 62, width: 20, height: 20 },
    previewLeft: 130,
    previewTop: 62,
    resolvedTarget: {
      ...visibleGhost.resolvedTarget,
      timestampNum: 1,
      ratio: 0.25,
      domX: 140,
      step: 'D',
    },
  };

  const clickedVisible = resolveNoteInputCommitTarget({
    ...visibleGhost,
    resolvedTarget: {
      ...visibleGhost.resolvedTarget,
      step: 'B',
      octave: 2,
      diagnostics: ['validation:replace-rest-exact'],
    },
  }, resolvedGhost);
  assert.ok(clickedVisible);
  assert.equal(clickedVisible.step, 'C');
  assert.equal(clickedVisible.octave, 4);
  assert.equal(clickedVisible.resolvedTarget?.step, 'C');
  assert.equal(clickedVisible.resolvedTarget?.octave, 4);
  assert.match(clickedVisible.resolvedTarget?.diagnostics.join(' ') ?? '', /visible-ghost-commit-locked/);
  assert.deepEqual(resolveNoteInputCommitTarget(null, resolvedGhost), resolvedGhost);
  assert.equal(resolveNoteInputCommitTarget(visibleGhost, null)?.resolvedTarget?.step, 'C');
  assert.equal(resolveNoteInputCommitTarget(null, null), null);
});

test('clicked bass rest anchor resolves pitch directly from the hovered staff lane', () => {
  const coreDocument = {
    score: {
      parts: [{
        id: 'part:P1',
        sourcePartId: 'P1',
        staves: [{
          staffIndex: 2,
          measures: [{
            id: 'measure:P1:1:2',
            measureNumber: 1,
            attributes: [{ clefs: [{ staffIndex: 2, sign: 'F', line: 4 }] }],
            voices: [],
          }],
        }],
      }],
    },
  } as any;
  const anchor: SelectedNote = {
    coreEntityId: 'rest-1',
    coreMeasureId: 'measure:P1:1:2',
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 2,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 32,
    step: 'C',
    octave: 4,
    alter: 0,
    isRest: true,
    durationType: 'whole',
    isDotted: false,
    graphicalNote: null,
  };
  const overlay = {
    measureId: 'measure:P1:1:2',
    measureNumber: 1,
    systemIndex: 0,
    pageIndex: 0,
    domRect: { x: 100, y: 200, width: 220, height: 90 },
    staffDetails: [{
      staffIndex: 2,
      topLineDomY: 240,
      bottomLineDomY: 280,
      lineDistanceDom: 10,
      lineCount: 5,
    }],
  } as any;
  const point = {
    id: 'rest-snap',
    coreEntityId: 'rest-1',
    corePartId: 'part:P1',
    measureId: 'measure:P1:1:2',
    measureNumber: 1,
    pageIndex: 0,
    systemIndex: 0,
    staffIndex: 2,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 32,
    ratio: 0,
    domX: 220,
    domY: 260,
    isRest: true,
    synthetic: false,
  };
  const renderedGhostGrid = {
    byMeasureId: new Map([['measure:P1:1:2', {
      measureId: 'measure:P1:1:2',
      measureNumber: 1,
      corePartId: 'part:P1',
      points: [point],
      syntheticPoints: [],
      byStaffIndex: new Map([[2, {
        staffIndex: 2,
        points: [point],
        syntheticPoints: [],
        byVoiceId: new Map([[1, [point]]]),
        syntheticByVoiceId: new Map(),
      }]]),
    }]]),
  } as any;

  const target = resolveClickedRestAnchorGhostTarget(
    anchor,
    overlay,
    renderedGhostGrid,
    coreDocument,
    { x: 220, y: 250 },
    '4',
    null,
    1,
  );

  assert.ok(target);
  assert.equal(target.step, 'F');
  assert.equal(target.octave, 3);
  assert.equal(target.staffIndex, 2);
  assert.equal(target.domCenter.y, 250);
});

test('clicked rest anchor does not override a primary pointer insert target at a different timestamp', () => {
  const primaryResolvedGhostTarget = {
    measureId: 'm3',
    corePartId: 'p1',
    measureNumber: 3,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'G',
    octave: 4,
    alter: 0,
    domCenter: { x: 220, y: 80 },
    domRect: { x: 210, y: 70, width: 20, height: 20 },
    previewLeft: 210,
    previewTop: 70,
    previewWidth: 20,
    previewHeight: 20,
    accidentalOffsetX: 0,
    noteheadCenterX: 10,
    stemDirection: 'up' as const,
    placementMode: 'insert' as const,
    ledgerLines: [],
    resolvedTarget: {
      source: 'pointer' as const,
      mode: 'insert' as const,
      measureId: 'm3',
      corePartId: 'p1',
      measureNumber: 3,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      ratio: 0.25,
      domX: 220,
      step: 'G',
      octave: 4,
      alter: 0,
      diagnostics: ['rest-only-quantized-internal-slot'],
    },
  };
  const clickedRestResolvedGhostTarget = {
    ...primaryResolvedGhostTarget,
    timestampNum: 0,
    domCenter: { x: 180, y: 80 },
    domRect: { x: 170, y: 70, width: 20, height: 20 },
    previewLeft: 170,
    placementMode: 'replace' as const,
    resolvedTarget: {
      ...primaryResolvedGhostTarget.resolvedTarget,
      mode: 'replace' as const,
      timestampNum: 0,
      ratio: 0,
      domX: 180,
      diagnostics: ['validation:replace-rest-exact'],
    },
  };

  const resolved = resolvePointerCommitGhostTargets(
    primaryResolvedGhostTarget as never,
    clickedRestResolvedGhostTarget as never,
    primaryResolvedGhostTarget as never,
    clickedRestResolvedGhostTarget as never,
  );

  assert.equal(resolved.primaryResolvedBeatsClickedRest, true);
  assert.equal(resolved.resolvedGhostTarget, primaryResolvedGhostTarget);
  assert.equal(resolved.commitGhostCandidate, primaryResolvedGhostTarget);
});

test('note-input commit locks the clicked visible ghost pitch over an underlying chord tone', () => {
  const visibleGhost = {
    measureId: 'm1',
    corePartId: 'p1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'C',
    octave: 4,
    alter: 0,
    domCenter: { x: 100, y: 80 },
    domRect: { x: 90, y: 70, width: 20, height: 20 },
    previewLeft: 90,
    previewTop: 70,
    previewWidth: 20,
    previewHeight: 20,
    accidentalOffsetX: 0,
    noteheadCenterX: 10,
    stemDirection: 'up' as const,
    placementMode: 'replace' as const,
    ledgerLines: [],
    resolvedTarget: {
      source: 'pointer' as const,
      mode: 'replace' as const,
      measureId: 'm1',
      corePartId: 'p1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      ratio: 0,
      domX: 100,
      allowOccupiedInsert: false,
      step: 'C',
      octave: 4,
      alter: 0,
      diagnostics: ['visible-old-pitch'],
    },
  };
  const currentPointerGhost = {
    ...visibleGhost,
    step: 'E',
    octave: 4,
    domCenter: { x: 104, y: 60 },
    domRect: { x: 94, y: 50, width: 20, height: 20 },
    previewLeft: 94,
    previewTop: 50,
    resolvedTarget: {
      ...visibleGhost.resolvedTarget,
      domX: 104,
      step: 'E',
      octave: 4,
      diagnostics: ['current-pointer-pitch'],
    },
  };

  const committed = resolveNoteInputCommitTarget(visibleGhost, currentPointerGhost);

  assert.ok(committed);
  assert.equal(committed.step, 'C');
  assert.equal(committed.octave, 4);
  assert.equal(committed.resolvedTarget?.step, 'C');
  assert.equal(committed.resolvedTarget?.octave, 4);
  assert.equal(committed.timestampNum, 0);
  assert.equal(committed.resolvedTarget?.timestampNum, 0);
  assert.equal(committed.domCenter.x, 100);
  assert.equal(committed.domCenter.y, 80);
  assert.match(committed.resolvedTarget?.diagnostics.join(' ') ?? '', /visible-ghost-commit-locked/);
  assert.match(committed.resolvedTarget?.diagnostics.join(' ') ?? '', /visible-ghost-pitch-locked/);
});

test('plain arrow pitch edits mirror only the matching chord tone to paired guitar TAB', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Guitar + TAB</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <staff-details number="2"><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details>
        <clef number="2"><sign>TAB</sign><line>5</line></clef>
      </attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><chord/><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>3</string><fret>0</fret></technical></notations></note>
      <note><chord/><pitch><step>B</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>2</string><fret>0</fret></technical></notations></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>2</staff><notations><technical><string>1</string><fret>0</fret></technical></notations></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const hook = renderHook(xml);
  const upperE = makeSelectedNotes(xml).find((note) => (
    !note.isRest
    && note.staffIndex === 1
    && note.step === 'E'
    && note.octave === 5
  ));
  assert.ok(upperE);

  act(() => {
    hook.current.handleNoteClick(upperE ?? null);
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowDown'));
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const notationChord = core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
    .filter((event): event is Extract<TimedEvent, { kind: 'note' }> => event.kind === 'note' && event.timestampNum === 0);
  const tabChord = core.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events
    .filter((event): event is Extract<TimedEvent, { kind: 'note' }> => event.kind === 'note' && event.timestampNum === 0);

  assert.deepEqual(
    notationChord.map((event) => `${event.pitch.step}${event.pitch.alter === 1 ? '#' : ''}${event.pitch.octave}`),
    ['G4', 'B4', 'D#5'],
  );
  assert.deepEqual(
    tabChord.map((event) => `${event.pitch.step}${event.pitch.alter === 1 ? '#' : ''}${event.pitch.octave}`),
    ['G3', 'B3', 'D#4'],
  );
  assert.ok(tabChord[2]?.guitar);
  assert.equal(hook.current.selectedNotes.length, 1);
  assert.equal(hook.current.selectedNote?.step, 'D');
  assert.equal(hook.current.selectedNote?.alter, 1);
  hook.unmount();
});

test('measure selections are visually suppressed while note input is active', () => {
  const visible = getVisibleMeasureSelectionIds(
    ['m1', 'm2', 'm3'],
    null,
    [],
    false,
  );
  const suppressed = getVisibleMeasureSelectionIds(
    ['m1', 'm2', 'm3'],
    makeSelectedNotes(SAMPLE_XML)[0] ?? null,
    makeSelectedNotes(SAMPLE_XML).slice(0, 2),
    true,
  );

  assert.deepEqual(visible, ['m1', 'm2', 'm3']);
  assert.deepEqual(suppressed, []);
});

test('mouse-style replacement resolves the replaced pitch when note input is off', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      step: 'A',
      octave: 4,
      alter: 0,
      placementMode: 'replace',
    });
  });
  hook.rerender();

  assert.equal(hook.current.selectedNote?.measureNumber, 1);
  assert.equal(hook.current.selectedNote?.timestampNum, 1);
  assert.equal(hook.current.selectedNote?.timestampDen, 4);
  assert.equal(hook.current.selectedNote?.step, 'A');
  assert.equal(hook.current.selectedNote?.octave, 4);
  hook.unmount();
});

test('mouse-style note placement resolves the inserted note in the correct part when parallel parts share the same timestamp', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Upper</part-name></score-part>
    <score-part id="P2"><part-name>Lower</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>E</step><octave>2</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const core = importMusicXmlToCore(xml);
  const lowerPart = core.score.parts[1]!;
  const lowerMeasure = lowerPart.staves[0]!.measures[0]!;
  const hook = renderHook(xml);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('4');
  });
  hook.rerender();

  act(() => {
    hook.current.placeNoteAt({
      corePartId: lowerPart.id,
      coreMeasureId: lowerMeasure.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      step: 'C',
      octave: 4,
      alter: 0,
    });
  });
  hook.rerender();

  assert.ok(hook.current.selectedNote);
  assert.equal(hook.current.selectedNote?.corePartId, lowerPart.id);
  assert.equal(hook.current.selectedNote?.coreMeasureId, lowerMeasure.id);
  assert.ok(hook.current.noteInputAnchor);
  assert.equal(hook.current.noteInputAnchor?.corePartId, lowerPart.id);
  assert.equal(hook.current.noteInputAnchor?.coreMeasureId, lowerMeasure.id);
  hook.unmount();
});

test('toolbar duration changes stay scoped to the selected part when parallel parts share a timestamp', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Upper</part-name></score-part>
    <score-part id="P2"><part-name>Lower</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const core = importMusicXmlToCore(xml);
  const lowerPart = core.score.parts[1]!;
  const lowerMeasure = lowerPart.staves[0]!.measures[0]!;
  const lowerEvent = lowerMeasure.voices[0]!.events[0]!;
  const hook = renderHook(xml);

  act(() => {
    hook.current.handleNoteClick({
      coreEntityId: lowerEvent.id,
      coreVoiceId: lowerMeasure.voices[0]!.id,
      coreMeasureId: lowerMeasure.id,
      corePartId: lowerPart.id,
      measureNumber: lowerEvent.measureNumber,
      staffIndex: lowerEvent.staffIndex,
      voiceId: lowerEvent.voiceId,
      timestampNum: lowerEvent.timestampNum,
      timestampDen: lowerEvent.timestampDen,
      step: lowerEvent.kind === 'note' ? lowerEvent.pitch.step : 'C',
      octave: lowerEvent.kind === 'note' ? lowerEvent.pitch.octave : 4,
      alter: lowerEvent.kind === 'note' ? lowerEvent.pitch.alter : 0,
      isRest: lowerEvent.kind === 'rest',
      graphicalNote: null,
    });
    hook.current.setDuration('4');
  });
  hook.rerender();

  const durationCommand = hook.appliedCommands.flat().find((command) => command.type === 'changeNoteDuration');
  assert.equal(durationCommand?.type, 'changeNoteDuration');
  assert.equal(durationCommand.corePartId, lowerPart.id);
  assert.equal(durationCommand.coreMeasureId, lowerMeasure.id);
  assert.equal(durationCommand.coreEntityId, lowerEvent.id);
  assert.equal(durationCommand.durationType, 'quarter');
  assert.equal(hook.current.noteInputMode, false);
  hook.unmount();
});

test('toolbar duration changes keep notation and TAB events separated when ids would otherwise collide', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
</score-partwise>`;
  const core = importMusicXmlToCore(xml);
  const notationPart = core.score.parts[1]!;
  const notationMeasure = notationPart.staves[0]!.measures[0]!;
  const notationEvent = notationMeasure.voices[0]!.events[0]!;
  const tabEvent = core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  assert.notEqual(notationEvent.id, tabEvent.id);
  const hook = renderHook(xml);

  act(() => {
    hook.current.handleNoteClick({
      coreEntityId: notationEvent.id,
      measureNumber: notationEvent.measureNumber,
      staffIndex: notationEvent.staffIndex,
      voiceId: notationEvent.voiceId,
      timestampNum: notationEvent.timestampNum,
      timestampDen: notationEvent.timestampDen,
      step: notationEvent.kind === 'note' ? notationEvent.pitch.step : 'C',
      octave: notationEvent.kind === 'note' ? notationEvent.pitch.octave : 4,
      alter: notationEvent.kind === 'note' ? notationEvent.pitch.alter : 0,
      isRest: notationEvent.kind === 'rest',
      graphicalNote: null,
    });
    hook.current.setDuration('4');
  });
  hook.rerender();

  const durationCommand = hook.appliedCommands.flat().find((command) => command.type === 'changeNoteDuration');
  assert.equal(durationCommand?.type, 'changeNoteDuration');
  assert.equal(durationCommand.corePartId, notationPart.id);
  assert.equal(durationCommand.coreMeasureId, notationMeasure.id);
  assert.equal(durationCommand.coreEntityId, notationEvent.id);
  const nextCore = importMusicXmlToCore(hook.xml);
  assert.equal(nextCore.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.durationType, 'eighth');
  assert.equal(nextCore.score.parts[1]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.durationType, 'quarter');
  hook.unmount();
});

test('mouse pointer ghost target uses the clicked part instead of the stale selected part', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Trumpet in Bb 1</part-name></score-part>
    <score-part id="P2"><part-name>Horn in Bb 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const core = importMusicXmlToCore(xml);
  const trumpetPart = core.score.parts[0]!;
  const hornPart = core.score.parts[1]!;
  const trumpetMeasure = trumpetPart.staves[0]!.measures[0]!;
  const hornMeasure = hornPart.staves[0]!.measures[0]!;
  const trumpetEvent = trumpetMeasure.voices[0]!.events[0]!;
  const hornEvent = hornMeasure.voices[0]!.events[0]!;
  assert.equal(trumpetEvent.kind, 'note');
  assert.equal(hornEvent.kind, 'note');

  const selectedTrumpet: SelectedNote = {
    coreEntityId: trumpetEvent.id,
    coreVoiceId: trumpetMeasure.voices[0]!.id,
    coreMeasureId: trumpetMeasure.id,
    corePartId: trumpetPart.id,
    measureNumber: trumpetEvent.measureNumber,
    staffIndex: trumpetEvent.staffIndex,
    voiceId: trumpetEvent.voiceId,
    timestampNum: trumpetEvent.timestampNum,
    timestampDen: trumpetEvent.timestampDen,
    step: trumpetEvent.pitch.step,
    octave: trumpetEvent.pitch.octave,
    alter: trumpetEvent.pitch.alter,
    isRest: false,
    graphicalNote: null,
  };
  const renderedNotes: RenderedNote[] = [
    {
      id: trumpetEvent.id,
      coreEntityId: trumpetEvent.id,
      note: selectedTrumpet,
      svgCenter: { x: 180, y: 80 },
      domCenter: { x: 180, y: 80 },
      domRect: { x: 174, y: 74, width: 12, height: 12 },
      svgElement: null,
      tintElement: null,
    },
    {
      id: hornEvent.id,
      coreEntityId: hornEvent.id,
      note: {
        coreEntityId: hornEvent.id,
        coreVoiceId: hornMeasure.voices[0]!.id,
        coreMeasureId: hornMeasure.id,
        corePartId: hornPart.id,
        measureNumber: hornEvent.measureNumber,
        staffIndex: hornEvent.staffIndex,
        voiceId: hornEvent.voiceId,
        timestampNum: hornEvent.timestampNum,
        timestampDen: hornEvent.timestampDen,
        step: hornEvent.pitch.step,
        octave: hornEvent.pitch.octave,
        alter: hornEvent.pitch.alter,
        isRest: false,
        graphicalNote: null,
      },
      svgCenter: { x: 180, y: 220 },
      domCenter: { x: 180, y: 220 },
      domRect: { x: 174, y: 214, width: 12, height: 12 },
      svgElement: null,
      tintElement: null,
    },
  ];
  const hornStaff = {
    staffIndex: 1,
    topLineDomY: 200,
    bottomLineDomY: 240,
    lineDistanceDom: 10,
    lineCount: 5,
  };
  const overlays = [
    {
      measureId: trumpetMeasure.id,
      measureNumber: 1,
      systemIndex: 0,
      pageIndex: 0,
      widthWeight: 1,
      domRect: { x: 100, y: 40, width: 220, height: 90 },
      breakBefore: false,
      pageBreakBefore: false,
      staffSpacing: null,
      staffDetails: [{
        staffIndex: 1,
        topLineDomY: 60,
        bottomLineDomY: 100,
        lineDistanceDom: 10,
        lineCount: 5,
      }],
    },
    {
      measureId: hornMeasure.id,
      measureNumber: 1,
      systemIndex: 0,
      pageIndex: 0,
      widthWeight: 1,
      domRect: { x: 100, y: 180, width: 220, height: 90 },
      breakBefore: false,
      pageBreakBefore: false,
      staffSpacing: null,
      staffDetails: [hornStaff],
    },
  ] as Parameters<typeof buildGhostNoteSpatialIndex>[2];
  const renderedGhostGrid = buildRenderedGhostGrid(renderedNotes, {
    coreDocument: core,
    measureOverlays: overlays,
    selectedDuration: '4',
  });
  const ghostIndex = buildGhostNoteSpatialIndex(renderedNotes, core, overlays, renderedGhostGrid);
  const hornContext = {
    measure: {
      ...overlays[1]!,
      staffDetails: [hornStaff],
      activeTuplets: [],
      timeSignature: { beats: 4, beatType: 4 },
      measureDurationRatio: 1,
      isVirtual: false,
    },
    staff: hornStaff,
    relX: (180 - overlays[1]!.domRect.x) / overlays[1]!.domRect.width,
    relY: (220 - overlays[1]!.domRect.y) / overlays[1]!.domRect.height,
    staffStep: 4,
    musicalTime: { num: 0, den: 1 },
    snapPoint: null,
    activeTuplet: null,
  };
  const geometryProxy = {
    getDetailedContext: () => hornContext,
  } as unknown as Parameters<typeof resolveGhostNoteTarget>[0];
  const systemOverlays = [{
    systemIndex: 0,
    pageIndex: 0,
    measureNumbers: [1],
    domRect: { x: 90, y: 30, width: 250, height: 260 },
    totalWidthWeight: 1,
    defaultStaffSpacing: 80,
    collisionPressure: 0,
    collisionMode: 'balanced' as const,
    explicitBreakBefore: false,
    spacingGuideHeight: 0,
  }];

  const target = resolveGhostNoteTarget(
    geometryProxy,
    renderedGhostGrid,
    ghostIndex,
    overlays[1]!,
    overlays,
    systemOverlays,
    core,
    new Set(),
    { x: 180, y: 220 },
    null,
    selectedTrumpet,
    '4',
    null,
    false,
    1,
    null,
    0,
    null,
  );

  assert.ok(target);
  assert.equal(target.corePartId, hornPart.id);
  assert.equal(target.measureId, hornMeasure.id);
  assert.equal(target.staffIndex, 1);
  assert.equal(target.voiceId, 1);
});

test('mouse-style note placement can target every visible part, measure, and voice independently', () => {
  const parts = ['Trumpet in Bb 1', 'Trumpet in Bb 2', 'Horn in Bb 1', 'Trombone'].map((name, index) => {
    const partId = `P${index + 1}`;
    const measures = [1, 2].map((measureNumber) => `
    <measure number="${measureNumber}">
      ${measureNumber === 1 ? `<attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>${name === 'Trombone' ? 'F' : 'G'}</sign><line>${name === 'Trombone' ? '4' : '2'}</line></clef>
      </attributes>` : ''}
      <note><pitch><step>C</step><octave>${name === 'Trombone' ? '3' : '4'}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>E</step><octave>${name === 'Trombone' ? '3' : '4'}</octave></pitch><duration>4</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
    </measure>`).join('');
    return { partId, name, measures };
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    ${parts.map((part) => `<score-part id="${part.partId}"><part-name>${part.name}</part-name></score-part>`).join('\n    ')}
  </part-list>
  ${parts.map((part) => `<part id="${part.partId}">${part.measures}</part>`).join('\n  ')}
</score-partwise>`;
  const core = importMusicXmlToCore(xml);
  const hook = renderHook(xml);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('4');
  });
  hook.rerender();

  for (const part of core.score.parts) {
    for (const measure of part.staves[0]!.measures) {
      for (const voiceId of [1, 2]) {
        act(() => {
          hook.current.placeNoteAt({
            corePartId: part.id,
            coreMeasureId: measure.id,
            measureNumber: measure.measureNumber,
            staffIndex: 1,
            voiceId,
            timestampNum: 0,
            timestampDen: 1,
            step: voiceId === 1 ? 'D' : 'F',
            octave: part.name === 'Trombone' ? 3 : 4,
            alter: 0,
            placementMode: 'replace',
          });
        });
        hook.rerender();

        assert.equal(hook.current.selectedNote?.corePartId, part.id);
        assert.equal(hook.current.selectedNote?.coreMeasureId, measure.id);
        assert.equal(hook.current.selectedNote?.voiceId, voiceId);
        assert.equal(hook.current.noteInputAnchor?.corePartId, part.id);
        assert.equal(hook.current.noteInputAnchor?.coreMeasureId, measure.id);
        assert.equal(hook.current.noteInputAnchor?.voiceId, voiceId);
      }
    }
  }

  hook.unmount();
});

test('mouse-style note placement advances across the measure boundary when the next lane slot is in measure 2', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.handleKeyDown(makeKeyboardEvent('I'));
    hook.current.setDuration('4');
  });
  hook.rerender();

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 3,
      timestampDen: 4,
      step: 'B',
      octave: 4,
      alter: 0,
    });
  });
  hook.rerender();

  assert.equal(hook.current.selectedNote?.measureNumber, 2);
  assert.equal(hook.current.selectedNote?.timestampNum, 0);
  assert.equal(hook.current.selectedNote?.timestampDen, 4);
  assert.equal(hook.current.noteInputAnchor?.measureNumber, 1);
  assert.equal(hook.current.noteInputAnchor?.timestampNum, 3);
  assert.equal(hook.current.noteInputAnchor?.step, 'B');
  hook.unmount();
});

test('mouse-style note placement preserves pitch through the legacy fallback path', () => {
  const unsafeXml = SAMPLE_XML.replace('<attributes>', '<attributes><staff-details><staff-lines>5</staff-lines></staff-details>');
  const hook = renderHook(unsafeXml);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('4');
  });
  hook.rerender();

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      step: 'A',
      octave: 4,
      alter: 0,
    });
  });
  hook.rerender();

  const target = flattenVoiceEvents(hook.xml).find((event) => (
    event.kind === 'note'
    && event.measureNumber === 1
    && event.voiceId === 1
    && event.timestampNum === 2
    && event.timestampDen === 4
  ));
  assert.equal(target?.kind, 'note');
  if (target?.kind === 'note') {
    assert.equal(target.pitch.step, 'A');
    assert.equal(target.pitch.octave, 4);
  }
  hook.unmount();
});

test('mouse-style rest replacement splits a full-measure rest without losing the remaining silence', () => {
  const hook = renderHook(FULL_REST_XML);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('4');
  });
  hook.rerender();

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      step: 'C',
      octave: 4,
      alter: 0,
      placementMode: 'replace',
    });
  });
  hook.rerender();

  const events = flattenVoiceEvents(hook.xml)
    .filter((event) => event.measureNumber === 1 && event.voiceId === 1)
    .sort((a, b) => a.timestampNum - b.timestampNum);

  assert.deepEqual(
    events.map((event) => (
      `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}:${event.durationDivisions}`
    )),
    ['0/4:C4:1', '1/4:rest:1', '2/4:rest:2'],
  );
  hook.unmount();
});

test('step-time input is restricted to rhythmic anchors and splits padding rests on entry', () => {
  const hook = renderHook(FULL_REST_XML);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('4');
  });
  hook.rerender();

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      step: 'C',
      octave: 4,
      alter: 0,
      placementMode: 'replace',
    });
  });
  hook.rerender();

  const afterFirstInput = flattenVoiceEvents(hook.xml)
    .filter((event) => event.measureNumber === 1 && event.voiceId === 1)
    .sort((a, b) => a.timestampNum - b.timestampNum);
  assert.deepEqual(
    afterFirstInput.map((event) => (
      `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}:${event.durationType ?? 'none'}`
    )),
    ['0/4:C4:quarter', '1/4:rest:quarter', '2/4:rest:half'],
  );

  const xmlBeforeInvalidInput = hook.xml;
  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 8,
      step: 'D',
      octave: 4,
      alter: 0,
      placementMode: 'replace',
    });
  });
  hook.rerender();
  assert.equal(hook.xml, xmlBeforeInvalidInput);

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      step: 'E',
      octave: 4,
      alter: 0,
      placementMode: 'replace',
    });
  });
  hook.rerender();

  const afterSecondInput = flattenVoiceEvents(hook.xml)
    .filter((event) => event.measureNumber === 1 && event.voiceId === 1)
    .sort((a, b) => a.timestampNum - b.timestampNum);
  assert.deepEqual(
    afterSecondInput.map((event) => (
      `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}:${event.durationType ?? 'none'}`
    )),
    ['0/4:C4:quarter', '1/4:rest:quarter', '2/4:E4:quarter', '3/4:rest:quarter'],
  );
  hook.unmount();
});

test('note input previews and highlights the entered note while advancing the input cursor', () => {
  const hook = renderHook(FULL_REST_XML);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('8');
    hook.current.handleKeyDown(makeKeyboardEvent('C'));
  });
  hook.rerender();

  assert.equal(hook.current.selectedNote?.isRest, true);
  assert.equal(hook.current.selectedNote?.measureNumber, 1);
  assert.equal(hook.current.selectedNote?.timestampNum, 1);
  assert.equal(hook.current.selectedNote?.timestampDen, 8);
  assert.equal(hook.current.noteInputAnchor?.isRest, false);
  assert.equal(hook.current.noteInputAnchor?.timestampNum, 0);
  assert.equal(hook.current.noteInputAnchor?.step, 'C');
  assert.equal(hook.current.noteInputAnchor?.durationType, 'eighth');
  assert.equal(hook.previewedNotes.at(-1)?.step, 'C');

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('D'));
  });
  hook.rerender();

  const events = flattenVoiceEvents(hook.xml)
    .filter((event) => event.measureNumber === 1 && event.voiceId === 1)
    .sort((a, b) => a.timestampNum / a.timestampDen - b.timestampNum / b.timestampDen);

  assert.deepEqual(
    events.map((event) => (
      `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}:${event.durationType ?? 'none'}`
    )),
    ['0/8:C4:eighth', '1/8:D4:eighth', '2/8:rest:quarter', '4/8:rest:half'],
  );
  assert.equal(hook.current.selectedNote?.isRest, true);
  assert.equal(hook.current.selectedNote?.timestampNum, 2);
  assert.equal(hook.current.selectedNote?.timestampDen, 8);
  assert.equal(hook.current.noteInputAnchor?.isRest, false);
  assert.equal(hook.current.noteInputAnchor?.step, 'D');
  assert.equal(hook.current.noteInputAnchor?.timestampNum, 1);
  assert.equal(hook.current.noteInputAnchor?.timestampDen, 8);
  assert.equal(hook.previewedNotes.at(-1)?.step, 'D');
  hook.unmount();
});

test('mouse-style full-rest replacement at beat 3 is rejected because it is not a rest anchor', () => {
  const hook = renderHook(FULL_REST_XML);
  const originalXml = hook.xml;

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('4');
  });
  hook.rerender();

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      step: 'G',
      octave: 4,
      alter: 0,
      placementMode: 'replace',
    });
  });
  hook.rerender();

  const events = flattenVoiceEvents(hook.xml)
    .filter((event) => event.measureNumber === 1 && event.voiceId === 1)
    .sort((a, b) => a.timestampNum - b.timestampNum);

  assert.equal(hook.xml, originalXml);
  assert.deepEqual(
    events.map((event) => (
      `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}:${event.durationDivisions}:${event.durationType ?? 'none'}`
    )),
    ['0/4:rest:4:whole'],
  );
  assert.equal(events.some((event) => event.durationType === '64th'), false);
  assert.equal(events.length, 1);
  hook.unmount();
});

test('mouse-style rest replacement rewrites a trailing split eighth rest at 12/32', () => {
  const hook = renderHook(SPLIT_TRAILING_REST_XML);
  const anchor = makeSelectedNotes(hook.xml).find((note) => (
    !note.isRest
    && note.measureNumber === 1
    && note.timestampNum === 8
    && note.timestampDen === 32
  ));

  assert.ok(anchor);

  act(() => {
    hook.current.handleNoteClick(anchor ?? null);
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('8');
  });
  hook.rerender();

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 12,
      timestampDen: 32,
      step: 'C',
      octave: 4,
      alter: 0,
      placementMode: 'replace',
    });
  });
  hook.rerender();

  const updatedVoiceEvents = flattenVoiceEvents(hook.xml).filter((event) => event.measureNumber === 1 && event.voiceId === 1);
  const trailingSlot = updatedVoiceEvents.find((event) => event.timestampNum === 12 && event.timestampDen === 32);

  assert.equal(trailingSlot?.kind, 'note');
  if (trailingSlot?.kind === 'note') {
    assert.equal(trailingSlot.pitch.step, 'C');
    assert.equal(trailingSlot.pitch.octave, 4);
    assert.equal(trailingSlot.durationType, 'eighth');
  }
  assert.equal(updatedVoiceEvents.some((event) => event.kind === 'rest' && event.timestampNum === 12 && event.timestampDen === 32), false);
  hook.unmount();
});

test('mouse-style rest placement rejects overfill safely without mutating the measure', () => {
  const hook = renderHook(OVERFLOW_REST_XML);
  const originalXml = hook.xml;

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('2');
  });
  hook.rerender();

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 3,
      timestampDen: 4,
      step: 'B',
      octave: 4,
      alter: 0,
      placementMode: 'replace',
    });
  });
  hook.rerender();

  assert.equal(hook.xml, originalXml);

  const events = flattenVoiceEvents(hook.xml)
    .filter((event) => event.voiceId === 1)
    .sort((a, b) => a.measureNumber - b.measureNumber || a.timestampNum - b.timestampNum);

  assert.equal(events.some((event) => event.kind === 'note' && event.measureNumber === 1 && event.timestampNum === 3), false);
  assert.equal(events.some((event) => event.kind === 'note' && event.measureNumber === 1 && event.pitch.step === 'B'), false);
  hook.unmount();
});

test('failed overfill attempts do not poison later note entry in the same measure', () => {
  const hook = renderHook(OVERFLOW_REST_XML);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.setDuration('2');
  });
  hook.rerender();

  act(() => {
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 3,
      timestampDen: 4,
      step: 'B',
      octave: 4,
      alter: 0,
      placementMode: 'replace',
    });
  });
  hook.rerender();

  act(() => {
    hook.current.setDuration('4');
    hook.current.placeNoteAt({
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 3,
      timestampDen: 4,
      step: 'B',
      octave: 4,
      alter: 0,
      placementMode: 'replace',
    });
  });
  hook.rerender();

  const measureOneVoice = flattenVoiceEvents(hook.xml)
    .filter((event) => event.measureNumber === 1 && event.voiceId === 1)
    .sort((a, b) => a.timestampNum - b.timestampNum);

  assert.deepEqual(
    measureOneVoice.map((event) => (
      `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}:${event.durationDivisions}`
    )),
    ['0/4:C4:1', '1/4:D4:1', '2/4:E4:1', '3/4:B4:1'],
  );
  assert.equal(measureOneVoice.some((event) => event.durationType === '64th'), false);
  hook.unmount();
});

test('entering note input without a selection anchors the cursor on the first slot', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.toggleNoteInput();
  });

  assert.equal(hook.current.noteInputMode, true);
  assert.equal(hook.current.selectedNote?.measureNumber, 1);
  assert.equal(hook.current.selectedNote?.timestampNum, 0);
  hook.unmount();
});

test('chord input toggle remains available from toolbar and keyboard shortcut', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.toggleChordInputMode();
  });
  assert.equal(hook.current.chordInputMode, true);

  act(() => {
    hook.current.toggleChordInputMode();
  });
  assert.equal(hook.current.chordInputMode, false);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('H', { metaKey: true, shiftKey: true }));
  });
  assert.equal(hook.current.chordInputMode, true);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('H', { metaKey: true, shiftKey: true }));
  });
  assert.equal(hook.current.chordInputMode, false);
  hook.unmount();
});

test('selection keyboard navigation covers next, range, measure jump, select-all, and escape', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowRight'));
  });
  assert.equal(hook.current.selectedNote?.step, 'C');
  assert.equal(hook.current.selectedNote?.timestampNum, 1);
  assert.equal(hook.previewedNotes.at(-1)?.timestampNum, 1);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowRight', { shiftKey: true }));
  });
  assert.equal(hook.current.selectedNotes.length, 2);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowRight', { metaKey: true }));
  });
  assert.equal(hook.current.selectedNote?.measureNumber, 2);
  assert.equal(hook.current.selectedNote?.step, 'F');
  assert.equal(hook.previewedNotes.at(-1)?.measureNumber, 2);
  assert.equal(hook.previewedNotes.at(-1)?.step, 'F');

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('A', { metaKey: true }));
  });
  assert.equal(hook.current.selectedNotes.length, 8);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('Escape'));
  });
  assert.equal(hook.current.selectedNote, null);
  assert.equal(hook.current.selectedNotes.length, 0);
  assert.equal(hook.current.noteInputMode, false);
  hook.unmount();
});

test('MuseScore-style cross-staff shortcut moves a selected note onto an adjacent resting staff', () => {
  const hook = renderHook(TWO_STAFF_PIANO_XML);
  const notes = makeSelectedNotes(TWO_STAFF_PIANO_XML).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowDown', { metaKey: true, shiftKey: true }));
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const upperEvents = core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  const lowerEvents = core.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events;
  assert.equal(upperEvents[0]?.kind, 'rest');
  assert.equal(lowerEvents[0]?.kind, 'note');
  assert.equal(lowerEvents[0]?.staffIndex, 2);
  if (lowerEvents[0]?.kind === 'note') {
    assert.equal(lowerEvents[0].pitch.step, 'C');
    assert.equal(lowerEvents[0].pitch.octave, 5);
  }
  assert.equal(hook.current.selectedNote?.staffIndex, 2);
  assert.equal(hook.previewedNotes.at(-1)?.staffIndex, 2);
  hook.unmount();
});

test('MuseScore-style cross-staff shortcut moves a selected note range onto adjacent resting slots', () => {
  const hook = renderHook(TWO_STAFF_RANGE_XML);
  const upperNotes = makeSelectedNotes(TWO_STAFF_RANGE_XML)
    .filter((note) => !note.isRest && note.staffIndex === 1);

  act(() => {
    hook.current.handleNoteClick(upperNotes[0]);
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowRight', { shiftKey: true }));
  });
  assert.equal(hook.current.selectedNotes.length, 2);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowDown', { metaKey: true, shiftKey: true }));
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const upperEvents = core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  const lowerEvents = core.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events;
  assert.deepEqual(upperEvents.slice(0, 2).map((event) => event.kind), ['rest', 'rest']);
  assert.deepEqual(lowerEvents.slice(0, 2).map((event) => event.kind), ['note', 'note']);
  assert.deepEqual(lowerEvents.slice(0, 2).map((event) => event.kind === 'note' ? event.pitch.step : 'rest'), ['C', 'D']);
  assert.equal(hook.current.selectedNotes.length, 2);
  assert.deepEqual(hook.current.selectedNotes.map((note) => note.staffIndex), [2, 2]);
  assert.equal(hook.current.selectedNote?.staffIndex, 2);
  assert.equal(hook.previewedNotes.at(-1)?.staffIndex, 2);
  hook.unmount();
});

test('MuseScore-style cross-staff shortcut keeps rests selectable on an adjacent resting staff', () => {
  const hook = renderHook(TWO_STAFF_RANGE_XML);
  const upperRest = makeSelectedNotes(TWO_STAFF_RANGE_XML)
    .find((note) => note.isRest && note.staffIndex === 1 && note.timestampNum === 2);
  assert.ok(upperRest);

  act(() => {
    hook.current.handleNoteClick(upperRest);
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowDown', { metaKey: true, shiftKey: true }));
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const lowerEvents = core.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events;
  assert.equal(lowerEvents[2]?.kind, 'rest');
  assert.equal(hook.current.selectedNote?.isRest, true);
  assert.equal(hook.current.selectedNote?.staffIndex, 2);
  assert.equal(hook.current.selectedNote?.timestampNum, 2);
  assert.equal(hook.previewedNotes.at(-1)?.staffIndex, 2);
  hook.unmount();
});

test('MuseScore-style cross-staff shortcut moves mixed note and rest ranges', () => {
  const hook = renderHook(TWO_STAFF_RANGE_XML);
  const upperRange = makeSelectedNotes(TWO_STAFF_RANGE_XML)
    .filter((note) => note.staffIndex === 1 && note.timestampNum <= 2);
  assert.equal(upperRange.length, 3);

  act(() => {
    hook.current.handleNoteClick(upperRange[0], { selectionNotes: upperRange });
  });
  hook.rerender();
  assert.equal(hook.current.selectedNotes.length, 3);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowDown', { metaKey: true, shiftKey: true }));
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const upperEvents = core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  const lowerEvents = core.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events;
  assert.deepEqual(upperEvents.slice(0, 3).map((event) => event.kind), ['rest', 'rest', 'rest']);
  assert.deepEqual(lowerEvents.slice(0, 3).map((event) => event.kind), ['note', 'note', 'rest']);
  assert.deepEqual(hook.current.selectedNotes.map((note) => note.staffIndex), [2, 2, 2]);
  assert.equal(hook.current.selectedNotes.at(-1)?.isRest, true);
  assert.equal(hook.previewedNotes.at(-1)?.staffIndex, 2);
  hook.unmount();
});

test('MuseScore-style cross-staff shortcut adds a moved note as a chord tone on an occupied adjacent staff', () => {
  const hook = renderHook(TWO_STAFF_OCCUPIED_TARGET_XML);
  const upperNotes = makeSelectedNotes(TWO_STAFF_OCCUPIED_TARGET_XML)
    .filter((note) => !note.isRest && note.staffIndex === 1);

  act(() => {
    hook.current.handleNoteClick(upperNotes[0]);
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowDown', { metaKey: true, shiftKey: true }));
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const upperEvents = core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  const lowerEvents = core.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events;
  const lowerChord = lowerEvents.filter((event) => event.kind === 'note' && event.timestampNum === 0);
  assert.equal(upperEvents[0]?.kind, 'rest');
  assert.equal(lowerChord.length, 2);
  assert.deepEqual(
    lowerChord.map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}:${event.isChord ? 'chord' : 'root'}` : 'rest'),
    ['E3:root', 'C5:chord'],
  );
  assert.equal(hook.current.selectedNote?.staffIndex, 2);
  assert.equal(hook.previewedNotes.at(-1)?.staffIndex, 2);
  hook.unmount();
});

test('MuseScore-style cross-staff shortcut moves a selected chord onto an adjacent resting staff', () => {
  const hook = renderHook(TWO_STAFF_CHORD_TARGET_REST_XML);
  const upperChord = makeSelectedNotes(TWO_STAFF_CHORD_TARGET_REST_XML)
    .filter((note) => !note.isRest && note.staffIndex === 1 && note.timestampNum === 0);
  assert.equal(upperChord.length, 2);

  act(() => {
    hook.current.handleNoteClick(upperChord[0], { selectionNotes: upperChord });
  });
  hook.rerender();
  assert.equal(hook.current.selectedNotes.length, 2);
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowDown', { metaKey: true, shiftKey: true }));
  });
  hook.rerender();
  assert.equal(hook.current.selectedNote?.staffIndex, 2);

  const core = importMusicXmlToCore(hook.xml);
  const upperEvents = core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  const lowerEvents = core.score.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events;
  const lowerChord = lowerEvents.filter((event) => event.kind === 'note' && event.timestampNum === 0);
  assert.equal(upperEvents[0]?.kind, 'rest');
  assert.equal(lowerChord.length, 2);
  assert.deepEqual(
    lowerChord.map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}:${event.isChord ? 'chord' : 'root'}` : 'rest'),
    ['C5:root', 'E5:chord'],
  );
  assert.equal(hook.current.selectedNotes.length, 2);
  assert.deepEqual(hook.current.selectedNotes.map((note) => note.staffIndex), [2, 2]);
  assert.equal(hook.current.selectedNote?.staffIndex, 2);
  assert.equal(hook.previewedNotes.at(-1)?.staffIndex, 2);
  hook.unmount();
});

test('accidental, pitch, and chromatic arrow edits produce the expected notated pitch', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[3]);
  });
  act(() => {
    hook.current.changePitch('E', 'sharp');
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowUp'));
  });
  hook.rerender();

  const voiceEvents = flattenVoiceEvents(hook.xml).filter((event) => event.kind === 'note');
  const edited = voiceEvents[3];
  assert.equal(edited.pitch.step, 'F');
  assert.equal(edited.pitch.alter, 1);
  assert.equal(edited.pitch.octave, 4);
  assert.equal(hook.previewedNotes.at(-1)?.step, 'F');
  assert.equal(hook.previewedNotes.at(-1)?.alter, 1);
  assert.equal(hook.previewedNotes.at(-1)?.octave, 4);
  hook.unmount();
});

test('selected notes can be adjusted directly through toolbar-style accidental and dotted actions', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.setAccidental('sharp');
  });
  hook.rerender();

  let voiceEvents = flattenVoiceEvents(hook.xml).filter((event): event is TimedEvent & { kind: 'note' } => event.kind === 'note');
  assert.equal(voiceEvents[0]?.pitch.step, 'C');
  assert.equal(voiceEvents[0]?.pitch.alter, 1);
  assert.equal(hook.current.selectedAccidental, 'sharp');

  act(() => {
    hook.current.toggleDotted();
  });
  hook.rerender();

  voiceEvents = flattenVoiceEvents(hook.xml).filter((event): event is TimedEvent & { kind: 'note' } => event.kind === 'note');
  assert.equal(Boolean(voiceEvents[0]?.isDotted), true);
  assert.equal(hook.current.isDotted, true);
  hook.unmount();
});

test('MuseScore accidental shortcuts toggle flat, natural, and sharp entry state', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('+'));
  });
  hook.rerender();

  let voiceEvents = flattenVoiceEvents(hook.xml).filter((event): event is TimedEvent & { kind: 'note' } => event.kind === 'note');
  assert.equal(voiceEvents[0]?.pitch.alter, 1);
  assert.equal(hook.current.selectedAccidental, 'sharp');

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('='));
  });
  hook.rerender();

  voiceEvents = flattenVoiceEvents(hook.xml).filter((event): event is TimedEvent & { kind: 'note' } => event.kind === 'note');
  assert.equal(voiceEvents[0]?.pitch.alter ?? 0, 0);
  assert.equal(voiceEvents[0]?.writtenAccidental, 'natural');
  assert.equal(hook.current.selectedAccidental, 'natural');

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('-'));
  });
  hook.rerender();

  voiceEvents = flattenVoiceEvents(hook.xml).filter((event): event is TimedEvent & { kind: 'note' } => event.kind === 'note');
  assert.equal(voiceEvents[0]?.pitch.alter, -1);
  assert.equal(hook.current.selectedAccidental, 'flat');

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('-'));
  });
  hook.rerender();

  voiceEvents = flattenVoiceEvents(hook.xml).filter((event): event is TimedEvent & { kind: 'note' } => event.kind === 'note');
  assert.equal(voiceEvents[0]?.pitch.alter ?? 0, 0);
  assert.equal(hook.current.selectedAccidental, null);
  hook.unmount();
});

test('note input can insert pitched notes, rests, and overwrite the selected slot', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.setVoice(2);
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.handleKeyDown(makeKeyboardEvent('5'));
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('B'));
  });
  hook.rerender();

  const insertedVoiceEvents = flattenVoiceEvents(hook.xml).filter((event) => event.voiceId === 2);
  assert.ok(insertedVoiceEvents.length > 0);
  assert.equal(insertedVoiceEvents[0].kind, 'note');
  if (insertedVoiceEvents[0]?.kind === 'note') {
    assert.equal(insertedVoiceEvents[0].pitch.step, 'B');
  }
  assert.equal(hook.current.noteInputAnchor?.step, 'B');

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowUp', { shiftKey: true }));
  });
  hook.rerender();

  const octaveShiftedVoiceEvents = flattenVoiceEvents(hook.xml).filter((event) => event.voiceId === 2);
  const shiftedInput = octaveShiftedVoiceEvents.find((event) => event.kind === 'note' && event.pitch.step === 'B');
  assert.equal(hook.current.noteInputAnchor?.step, 'B');
  assert.equal(hook.current.noteInputAnchor?.octave, 4);
  assert.equal(shiftedInput?.kind === 'note' ? shiftedInput.pitch.octave : null, 4);

  act(() => {
    hook.current.handleNoteClick(makeSelectedNotes(hook.xml)[0]);
  });
  act(() => {
    hook.current.insertRest();
  });
  hook.rerender();
  assert.match(hook.xml, /<rest\/>/);

  const voiceOneD = makeSelectedNotes(hook.xml).find((note) => (
    note.voiceId === 1
    && note.measureNumber === 1
    && note.timestampNum === 1
    && note.timestampDen === 4
  ));
  assert.ok(voiceOneD);
  act(() => {
    hook.current.handleNoteClick(voiceOneD);
    hook.current.setVoice(1);
  });
  act(() => {
    hook.current.toggleEntryMode();
  });
  act(() => {
    hook.current.insertNote('F', 4);
  });
  hook.rerender();

  const overwrittenVoiceOneSlot = flattenVoiceEvents(hook.xml).find((event) => (
    event.voiceId === 1
    && event.measureNumber === 1
    && event.timestampNum === 1
    && event.timestampDen === 4
  ));
  assert.equal(overwrittenVoiceOneSlot?.kind, 'note');
  assert.equal(overwrittenVoiceOneSlot?.kind === 'note' ? overwrittenVoiceOneSlot.pitch.step : null, 'F');
  hook.unmount();
});

test('note input click activation moves the blue anchor and arrow edits the clicked note', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.handleKeyDown(makeKeyboardEvent('5'));
    hook.current.handleKeyDown(makeKeyboardEvent('B'));
  });
  hook.rerender();

  assert.equal(hook.current.noteInputMode, true);
  assert.equal(hook.current.noteInputAnchor?.step, 'B');

  act(() => {
    hook.current.handleNoteClick(makeSelectedNotes(hook.xml).filter((note) => !note.isRest)[1]);
  });
  hook.rerender();

  assert.equal(hook.current.selectedNote?.timestampNum, 1);
  assert.equal(hook.current.noteInputAnchor?.timestampNum, 1);
  assert.equal(hook.current.noteInputAnchor?.step, 'C');

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowUp'));
  });
  hook.rerender();

  const edited = flattenVoiceEvents(hook.xml)
    .filter((event): event is TimedEvent & { kind: 'note' } => event.kind === 'note')
    .find((event) => event.timestampNum === 1 && event.timestampDen === 4);
  assert.equal(edited?.pitch.step, 'C');
  assert.equal(edited?.pitch.alter, 1);
  assert.equal(hook.current.noteInputAnchor?.timestampNum, 1);
  assert.equal(hook.current.noteInputAnchor?.step, 'C');
  assert.equal(hook.current.noteInputAnchor?.alter, 1);
  hook.unmount();
});

test('note input click activation updates the clicked voice anchor without XML mutation', () => {
  const hook = renderHook(MULTI_VOICE_CLICK_XML);
  const notes = makeSelectedNotes(MULTI_VOICE_CLICK_XML).filter((note) => !note.isRest);
  const voiceOneTarget = notes.find((note) => note.voiceId === 1 && note.timestampNum === 1);
  const voiceTwoTarget = notes.find((note) => note.voiceId === 2 && note.timestampNum === 1);

  assert.ok(voiceOneTarget);
  assert.ok(voiceTwoTarget);

  act(() => {
    hook.current.handleNoteClick(voiceOneTarget ?? null);
    hook.current.setVoice(1);
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
  });
  hook.rerender();

  const baselineXml = hook.xml;
  const baselineNoteCounts = flattenVoiceEvents(hook.xml)
    .filter((event) => event.kind === 'note')
    .reduce<Record<number, number>>((counts, event) => {
      counts[event.voiceId] = (counts[event.voiceId] ?? 0) + 1;
      return counts;
    }, {});

  act(() => {
    hook.current.handleNoteClick(voiceTwoTarget ?? null);
  });
  hook.rerender();

  assert.equal(hook.xml, baselineXml);
  assert.deepEqual(
    flattenVoiceEvents(hook.xml)
      .filter((event) => event.kind === 'note')
      .reduce<Record<number, number>>((counts, event) => {
        counts[event.voiceId] = (counts[event.voiceId] ?? 0) + 1;
        return counts;
      }, {}),
    baselineNoteCounts,
  );
  assert.equal(hook.current.selectedNote?.voiceId, 2);
  assert.equal(hook.current.selectedNote?.step, 'A');
  assert.equal(hook.current.selectedNotes.length, 1);
  assert.equal(hook.current.selectedNotes[0]?.voiceId, 2);
  assert.equal(hook.current.noteInputAnchor?.voiceId, 2);
  assert.equal(hook.current.noteInputAnchor?.step, 'A');
  assert.equal(hook.current.selectedVoice, 2);

  act(() => {
    hook.current.handleNoteClick(voiceOneTarget ?? null);
  });
  hook.rerender();

  assert.equal(hook.xml, baselineXml);
  assert.equal(hook.current.selectedNote?.voiceId, 1);
  assert.equal(hook.current.selectedNote?.step, 'D');
  assert.equal(hook.current.selectedNotes.length, 1);
  assert.equal(hook.current.selectedNotes[0]?.voiceId, 1);
  assert.equal(hook.current.noteInputAnchor?.voiceId, 1);
  assert.equal(hook.current.noteInputAnchor?.step, 'D');
  assert.equal(hook.current.selectedVoice, 1);
  hook.unmount();
});

test('note input replaces a selected rest slot instead of inserting after it', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);
  const rest = notes.find((note) => note.measureNumber === 2 && note.isRest);

  assert.ok(rest);

  act(() => {
    hook.current.handleNoteClick(rest ?? null);
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
  });
  act(() => {
    hook.current.insertNote('C', 4);
  });
  hook.rerender();

  const updatedVoiceEvents = flattenVoiceEvents(hook.xml).filter((event) => event.measureNumber === 2 && event.voiceId === 1);
  const replacedSlot = updatedVoiceEvents.find((event) => event.timestampNum === 2 && event.timestampDen === 4);

  assert.equal(replacedSlot?.kind, 'note');
  if (replacedSlot?.kind === 'note') {
    assert.equal(replacedSlot.pitch.step, 'C');
    assert.equal(replacedSlot.pitch.octave, 4);
  }
  assert.equal(updatedVoiceEvents.some((event) => event.kind === 'rest' && event.timestampNum === 2 && event.timestampDen === 4), false);
  hook.unmount();
});

test('Delete shortcut removes the selected note and clears the selection anchor', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);
  const baselineCount = flattenVoiceEvents(hook.xml).filter((event) => event.kind === 'note').length;

  act(() => {
    hook.current.handleNoteClick(notes[1]);
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('Delete'));
  });
  hook.rerender();

  const remainingCount = flattenVoiceEvents(hook.xml).filter((event) => event.kind === 'note').length;
  assert.equal(remainingCount, baselineCount - 1);
  assert.equal(hook.current.selectedNote, null);
  assert.equal(hook.current.selectedNotes.length, 0);
  hook.unmount();
});

test('Delete shortcut removes only the selected chord tone', () => {
  const chordToneHook = renderHook(CHORD_DELETE_XML);
  const chordNotes = makeSelectedNotes(chordToneHook.xml)
    .filter((note) => !note.isRest && note.timestampNum === 0);
  const chordTone = chordNotes.find((note) => note.step === 'E');

  assert.ok(chordTone);

  act(() => {
    chordToneHook.current.handleNoteClick(chordTone ?? null, { selectionNotes: chordNotes });
  });
  assert.equal(chordToneHook.current.selectedNotes.length, 2);
  act(() => {
    chordToneHook.current.handleKeyDown(makeKeyboardEvent('Delete'));
  });
  chordToneHook.rerender();

  const chordToneCore = importMusicXmlToCore(chordToneHook.xml);
  const chordToneEvents = chordToneCore.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  const remainingChordToneStart = chordToneEvents.filter((event) => (
    event.timestampNum === 0
    && event.kind === 'note'
  ));
  assert.deepEqual(
    remainingChordToneStart.map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}:${event.isChord ? 'chord' : 'root'}` : 'rest'),
    ['C4:root'],
  );
  assert.equal(chordToneEvents.some((event) => event.kind === 'rest' && event.timestampNum === 0), false);
  chordToneHook.unmount();

  const rootHook = renderHook(CHORD_DELETE_XML);
  const root = makeSelectedNotes(rootHook.xml)
    .find((note) => !note.isRest && note.step === 'C' && note.timestampNum === 0);

  assert.ok(root);

  act(() => {
    rootHook.current.handleNoteClick(root ?? null);
  });
  act(() => {
    rootHook.current.handleKeyDown(makeKeyboardEvent('Delete'));
  });
  rootHook.rerender();

  const rootCore = importMusicXmlToCore(rootHook.xml);
  const rootEvents = rootCore.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  const remainingRootStart = rootEvents.filter((event) => (
    event.timestampNum === 0
    && event.kind === 'note'
  ));
  assert.deepEqual(
    remainingRootStart.map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}:${event.isChord ? 'chord' : 'root'}` : 'rest'),
    ['E4:root'],
  );
  assert.equal(rootEvents.some((event) => event.kind === 'rest' && event.timestampNum === 0), false);
  rootHook.unmount();
});

test('Cmd+Shift+Delete clears the selected measure voice to a full-measure rest', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[2]);
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('Delete', { metaKey: true, shiftKey: true }));
  });
  hook.rerender();

  const measureOneEvents = flattenVoiceEvents(hook.xml)
    .filter((event) => event.measureNumber === 1 && event.staffIndex === 1 && event.voiceId === 1);
  assert.equal(measureOneEvents.length, 1);
  assert.equal(measureOneEvents[0]?.kind, 'rest');
  assert.equal(measureOneEvents[0]?.timestampNum, 0);
  assert.equal(measureOneEvents[0]?.durationDivisions, 4);
  assert.equal(measureOneEvents[0]?.durationType, 'whole');
  assert.equal(hook.current.selectedNote?.isRest, true);
  assert.equal(hook.current.selectedNote?.measureNumber, 1);
  hook.unmount();
});

test('Cut shortcut copies the selection to the clipboard and deletes the selected note', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);
  const baselineCount = flattenVoiceEvents(hook.xml).filter((event) => event.kind === 'note').length;

  act(() => {
    hook.current.handleNoteClick(notes[1]);
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('x', { metaKey: true }));
  });
  hook.rerender();

  const remainingCount = flattenVoiceEvents(hook.xml).filter((event) => event.kind === 'note').length;
  assert.equal(remainingCount, baselineCount - 1);
  assert.equal(hook.current.clipboardCount, 1);
  assert.equal(hook.current.selectedNote, null);
  assert.equal(hook.current.selectedNotes.length, 0);
  hook.unmount();
});

test('Score copy shortcut yields to a visible text selection', () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  try {
    Object.assign(globalThis, {
      window: {
        getSelection() {
          return {
            isCollapsed: false,
            toString: () => 'assistant response text',
          };
        },
      },
    });

    const hook = renderHook(SAMPLE_XML);
    const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);
    let prevented = false;

    act(() => {
      hook.current.handleNoteClick(notes[1]);
    });
    act(() => {
      const event = makeKeyboardEvent('c', { metaKey: true }) as KeyboardEvent & { preventDefault: () => void };
      event.preventDefault = () => { prevented = true; };
      hook.current.handleKeyDown(event);
    });
    hook.rerender();

    assert.equal(prevented, false);
    assert.equal(hook.current.clipboardCount, 0);
    hook.unmount();
  } finally {
    Object.assign(globalThis, { window: previousWindow });
  }
});

test('Shift+X toggles slash notehead style through the semantic command path', () => {
  const hook = renderHook(SAMPLE_XML);
  const note = makeSelectedNotes(SAMPLE_XML).filter((entry) => !entry.isRest)[1]!;

  act(() => {
    hook.current.handleNoteClick({ ...note, coreMeasureId: null, corePartId: null });
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('X', { shiftKey: true }));
  });
  hook.rerender();

  let edited = flattenVoiceEvents(hook.xml).find((event) => (
    event.kind === 'note'
    && event.measureNumber === note.measureNumber
    && event.staffIndex === note.staffIndex
    && event.voiceId === note.voiceId
    && event.timestampNum === note.timestampNum
  ));
  assert.equal(edited?.notehead, 'slash');

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('X', { shiftKey: true }));
  });
  hook.rerender();

  edited = flattenVoiceEvents(hook.xml).find((event) => (
    event.kind === 'note'
    && event.measureNumber === note.measureNumber
    && event.staffIndex === note.staffIndex
    && event.voiceId === note.voiceId
    && event.timestampNum === note.timestampNum
  ));
  assert.equal(edited?.notehead, undefined);
  hook.unmount();
});

test('visual text deletion removes the selected direction without deleting nearby notes', () => {
  const hook = renderHook(DIRECTION_XML);
  const notes = makeSelectedNotes(DIRECTION_XML).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[0], {
      visualOnly: true,
      visualText: 'Allegro non troppo',
      visualMeasureNumber: 1,
      visualStaffIndex: 1,
    });
  });
  act(() => {
    hook.current.deleteSelectedNote();
  });
  hook.rerender();

  assert.match(hook.xml, /<note><pitch><step>C<\/step><octave>4<\/octave><\/pitch>/);
  assert.doesNotMatch(hook.xml, /Allegro non troppo/);
  hook.unmount();
});

test('MuseScore duration shortcuts mutate the last entered note through a reusable matrix', () => {
  const scenarios = [
    {
      name: 'Q halves the last entered note',
      keys: [makeKeyboardEvent('Q')],
      expectedType: 'eighth',
      expectedDotted: false,
    },
    {
      name: 'W doubles the last entered note',
      keys: [makeKeyboardEvent('W')],
      expectedType: 'half',
      expectedDotted: false,
    },
    {
      name: 'Shift+Q removes the dot before shrinking further',
      keys: [makeKeyboardEvent('.', {}), makeKeyboardEvent('Q', { shiftKey: true })],
      expectedType: 'eighth',
      expectedDotted: true,
    },
    {
      name: 'Shift+W adds a dot to the last entered note',
      keys: [makeKeyboardEvent('W', { shiftKey: true })],
      expectedType: 'quarter',
      expectedDotted: true,
    },
    {
      name: 'Q uses the last entered note duration instead of the currently selected future duration',
      keys: [makeKeyboardEvent('3'), makeKeyboardEvent('Q')],
      expectedType: 'eighth',
      expectedDotted: false,
    },
    {
      name: 'Command+Q remains reserved for the macOS quit action',
      keys: [makeKeyboardEvent('Q', { metaKey: true })],
      expectedType: 'quarter',
      expectedDotted: false,
    },
    {
      name: 'Control+Q remains reserved for the Windows and Linux quit action',
      keys: [makeKeyboardEvent('Q', { ctrlKey: true })],
      expectedType: 'quarter',
      expectedDotted: false,
    },
  ] as const;

  for (const scenario of scenarios) {
    const hook = renderHook(SAMPLE_XML);

    act(() => {
      hook.current.handleNoteClick(makeSelectedNotes(SAMPLE_XML)[0]);
      hook.current.handleKeyDown(makeKeyboardEvent('N'));
      hook.current.handleKeyDown(makeKeyboardEvent('C'));
    });
    for (const key of scenario.keys) {
      act(() => {
        hook.current.handleKeyDown(key);
      });
    }
    hook.rerender();

    const events = flattenVoiceEvents(hook.xml).filter((event) => event.measureNumber === 1 && event.voiceId === 1);
    const first = events[0];
    assert.equal(first.durationType, scenario.expectedType, scenario.name);
    assert.equal(Boolean(first.isDotted), scenario.expectedDotted, scenario.name);
    assert.equal(hook.current.selectedDuration, DURATION_FROM_TYPE[scenario.expectedType], scenario.name);
    hook.unmount();
  }
});

test('note input keeps the chosen duration while moving the selection', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.handleKeyDown(makeKeyboardEvent('7'));
  });
  act(() => {
    hook.current.handleNoteClick(notes[3]);
  });

  assert.equal(hook.current.noteInputMode, true);
  assert.equal(hook.current.selectedDuration, '1');
  hook.unmount();
});

test('note-input duration edits the visibly selected notation part instead of a stale TAB anchor', () => {
  const hook = renderHook(GUITAR_NOTATION_TAB_XML);
  const notes = makeSelectedNotesFromAllParts(GUITAR_NOTATION_TAB_XML);
  const notationG = notes.find((note) => note.corePartId === 'part:P1' && note.step === 'G' && note.timestampNum === 3);
  const tabG = notes.find((note) => note.corePartId === 'part:P2' && note.step === 'G' && note.timestampNum === 3);
  assert.ok(notationG);
  assert.ok(tabG);

  act(() => {
    hook.current.handleNoteClick(tabG);
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.handleNoteClick(notationG);
    hook.current.setDuration('4');
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const eventSummary = core.score.parts.flatMap((part) => (
    part.staves.flatMap((staff) => (
      staff.measures.flatMap((measure) => (
        measure.voices.flatMap((voice) => voice.events.map((event) => ({
          partId: part.id,
          event,
        })))
      ))
    ))
  ));
  const notationEdited = eventSummary.find(({ partId, event }) => (
    partId === 'part:P1' && event.kind === 'note' && event.pitch.step === 'G'
  ))?.event;
  const tabUnchanged = eventSummary.find(({ partId, event }) => (
    partId === 'part:P2' && event.kind === 'note' && event.pitch.step === 'G'
  ))?.event;

  assert.equal(notationEdited?.durationType, 'quarter');
  assert.equal(tabUnchanged?.durationType, 'eighth');
  assert.equal(hook.current.noteInputAnchor?.corePartId, 'part:P1');
  hook.unmount();
});

test('MuseScore long duration keys change the active duration to breve and long', () => {
  const hook = renderHook(SAMPLE_XML);
  let prevented = 0;

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
    hook.current.handleKeyDown(makeKeyboardEvent('5'));
  });

  act(() => {
    const breveKey = makeKeyboardEvent('8') as KeyboardEvent & { preventDefault: () => void };
    breveKey.preventDefault = () => { prevented += 1; };
    hook.current.handleKeyDown(breveKey);
  });
  assert.equal(hook.current.selectedDuration, 'breve');

  act(() => {
    const longaKey = makeKeyboardEvent(')', { code: 'Digit9' }) as KeyboardEvent & { preventDefault: () => void };
    longaKey.preventDefault = () => { prevented += 1; };
    hook.current.handleKeyDown(longaKey);
  });
  assert.equal(hook.current.selectedDuration, 'long');
  assert.equal(prevented, 2);
  hook.unmount();
});

test('MuseScore-style keyboard entry supports repeat, octave, and voice shortcuts', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('N'));
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('2', { ctrlKey: true, altKey: true }));
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('6'));
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('.'));
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('C'));
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('3'));
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('R'));
  });
  hook.rerender();

  const repeatedHalfDottedC = hook.xml.match(/<note>[\s\S]*?<pitch><step>C<\/step><octave>4<\/octave><\/pitch>[\s\S]*?<voice>2<\/voice>[\s\S]*?<type>half<\/type>[\s\S]*?<dot\/>[\s\S]*?<\/note>/g) ?? [];
  assert.equal(repeatedHalfDottedC.length >= 1, true);
  assert.equal(hook.current.selectedDuration, '16');
  assert.equal(hook.current.isDotted, true);

  act(() => {
    hook.current.handleNoteClick(makeSelectedNotes(hook.xml)[0]);
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowUp', { metaKey: true }));
  });
  hook.rerender();

  assert.ok(hook.current.selectedNote);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('3', { ctrlKey: true, altKey: true }));
  });
  assert.equal(hook.current.selectedVoice, 3);
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('§', { ctrlKey: true, altKey: true, code: 'Digit4' }));
  });
  assert.equal(hook.current.selectedVoice, 4);
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('¡', { ctrlKey: true, altKey: true }));
  });
  assert.equal(hook.current.selectedVoice, 1);
  hook.unmount();
});

test('transpose and articulations apply to the full semantic selection', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => note.measureNumber === 1 && !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.handleNoteClick(notes[2], { range: true });
  });
  act(() => {
    hook.current.transposeSemitones(2);
  });
  act(() => {
    hook.current.toggleArticulation('staccato');
  });
  hook.rerender();

  const updatedEvents = flattenVoiceEvents(hook.xml).filter((event) => event.measureNumber === 1 && event.voiceId === 1);
  const pitched = updatedEvents.filter((event) => event.kind === 'note');
  assert.deepEqual(
    pitched.slice(0, 3).map((event) => `${event.pitch.step}${event.pitch.alter === 1 ? '#' : ''}`),
    ['D', 'D', 'E'],
  );
  assert.match(hook.xml, /<staccato\/>/);
  hook.unmount();
});

test('keyboard articulation shortcuts use the semantic toggle path', () => {
  const hook = renderHook(SAMPLE_XML);
  const note = makeSelectedNotes(SAMPLE_XML).filter((entry) => !entry.isRest)[0]!;

  act(() => {
    hook.current.handleNoteClick(note);
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('S', { shiftKey: true }));
    hook.current.handleKeyDown(makeKeyboardEvent('>', { shiftKey: true, code: 'Period' }));
    hook.current.handleKeyDown(makeKeyboardEvent('^', { shiftKey: true, code: 'Digit6' }));
    hook.current.handleKeyDown(makeKeyboardEvent('_', { shiftKey: true, code: 'Minus' }));
  });
  hook.rerender();

  assert.match(hook.xml, /<staccato\/>/);
  assert.match(hook.xml, /<accent\/>/);
  assert.match(hook.xml, /<strong-accent\/>/);
  assert.match(hook.xml, /<tenuto\/>/);
  hook.unmount();
});

test('slurs span the selected semantic range in exported MusicXML', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => note.measureNumber === 1 && !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[1]);
  });
  act(() => {
    hook.current.handleNoteClick(notes[3], { range: true });
  });
  act(() => {
    hook.current.toggleSlur();
  });
  hook.rerender();
  assert.match(hook.xml, /<slur number="1" type="start"/);
  assert.match(hook.xml, /<slur number="1" type="stop"/);
  hook.unmount();
});

test('grace notes and barlines are encoded into exported MusicXML', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.addGraceNoteAtSelection();
  });
  act(() => {
    hook.current.setBarline('repeat-end');
  });
  hook.rerender();

  assert.match(hook.xml, /<grace slash="yes"\/>/);
  assert.match(hook.xml, /<barline location="right">/);
  assert.match(hook.xml, /<repeat direction="backward"\/>/);
  hook.unmount();
});

test('barline tools prefer the visual measure context over the note anchor', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0], {
      visualOnly: false,
      visualMeasureNumber: 2,
      visualStaffIndex: 1,
    });
  });
  act(() => {
    hook.current.setBarline('double');
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const measures = core.score.parts[0].staves[0].measures;
  assert.equal(measures[0].rightBarline, undefined);
  assert.equal(measures[1].rightBarline, 'double');
  hook.unmount();
});

test('slash shortcut adds a grace note at the current selection', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('/'));
  });
  hook.rerender();

  assert.match(hook.xml, /<grace slash="yes"\/>/);
  hook.unmount();
});

test('chord input inserts a simultaneous chord note without shifting the voice timeline', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.toggleNoteInput();
  });
  act(() => {
    hook.current.toggleChordInputMode();
  });
  act(() => {
    hook.current.insertNote('E', 4);
  });
  hook.rerender();

  const measureOneVoice = flattenVoiceEvents(hook.xml).filter((event) => event.measureNumber === 1 && event.voiceId === 1);
  assert.equal(measureOneVoice.filter((event) => event.timestampNum === 0).length, 2);
  assert.match(hook.xml, /<note><pitch><step>C<\/step><octave>4<\/octave><\/pitch>[\s\S]*?<note><chord\/><pitch><step>E<\/step><octave>4<\/octave><\/pitch>/);
  hook.unmount();
});

test('Alt/Option interval entry builds a diatonic chord above the most recently entered note', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
    hook.current.toggleNoteInput();
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('£', { altKey: true, code: 'Digit3' }));
  });
  hook.rerender();

  let onsetNotes = flattenVoiceEvents(hook.xml).filter((event) => (
    event.measureNumber === 1 && event.voiceId === 1 && event.timestampNum === 0 && event.kind === 'note'
  ));
  assert.deepEqual(onsetNotes.map((event) => event.kind === 'note' ? event.pitch.step : null), ['C', 'E']);
  assert.equal(hook.current.selectedNote?.step, 'E');
  assert.equal(hook.current.selectedNote?.timestampNum, 0);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('3', { altKey: true, code: 'Digit3' }));
  });
  hook.rerender();

  onsetNotes = flattenVoiceEvents(hook.xml).filter((event) => (
    event.measureNumber === 1 && event.voiceId === 1 && event.timestampNum === 0 && event.kind === 'note'
  ));
  assert.deepEqual(onsetNotes.map((event) => event.kind === 'note' ? event.pitch.step : null), ['C', 'E', 'G']);
  assert.equal(hook.current.selectedNote?.step, 'G');
  assert.equal(hook.current.selectedNote?.timestampNum, 0);
  hook.unmount();
});

test('T in note input creates and advances a complete tied chord as one transaction', () => {
  const hook = renderHook(SAMPLE_XML);
  const first = makeSelectedNotes(SAMPLE_XML).find((note) => (
    note.measureNumber === 1 && note.timestampNum === 0 && !note.isRest
  ));
  assert.ok(first);

  act(() => {
    hook.current.handleNoteClick(first);
    hook.current.toggleNoteInput();
    hook.current.handleKeyDown(makeKeyboardEvent('E', { shiftKey: true }));
  });
  hook.rerender();
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('4'));
    hook.current.toggleTie();
  });
  hook.rerender();

  const measure = importMusicXmlToCore(hook.xml).score.parts[0]!.staves[0]!.measures[0]!;
  const sourceChord = measure.voices[0]!.events.filter((event) => event.kind === 'note' && event.timestampNum === 0);
  const tiedChord = measure.voices[0]!.events.filter((event) => (
    event.kind === 'note' && event.timestampNum / event.timestampDen === 1 / 4
  ));
  assert.deepEqual(sourceChord.map((event) => event.kind === 'note' ? event.pitch.step : null), ['C', 'E']);
  assert.equal(sourceChord.every((event) => event.tieStart), true);
  assert.deepEqual(tiedChord.map((event) => event.kind === 'note' ? event.pitch.step : null), ['C', 'E']);
  assert.equal(tiedChord.every((event) => event.durationType === 'eighth'), true);
  assert.equal((hook.xml.match(/<tied type="start"\/>/g) ?? []).length, 2);
  assert.equal((hook.xml.match(/<tied type="stop"\/>/g) ?? []).length, 2);
  assert.equal(
    (hook.current.selectedNote?.timestampNum ?? 0) / (hook.current.selectedNote?.timestampDen ?? 1),
    3 / 8,
  );
  assert.equal(hook.current.noteInputAnchor?.step, 'C');

  const tiedEntryCommands = hook.appliedCommands.at(-1) ?? [];
  assert.equal(tiedEntryCommands.filter((command) => command.type === 'replaceWithRest').length, 1);
  assert.equal(tiedEntryCommands.filter((command) => command.type === 'insertNoteAt').length, 2);
  assert.equal(tiedEntryCommands.filter((command) => command.type === 'toggleTie').length, 2);
  hook.unmount();
});

test('T in note input creates a tied continuation across a measure boundary', () => {
  const hook = renderHook(SAMPLE_XML);
  const finalMeasureOneNote = makeSelectedNotes(SAMPLE_XML).find((note) => (
    !note.isRest
    && note.measureNumber === 1
    && note.timestampNum / note.timestampDen === 3 / 4
  ));
  assert.ok(finalMeasureOneNote);

  act(() => {
    hook.current.handleNoteClick(finalMeasureOneNote);
  });
  hook.rerender();
  act(() => {
    hook.current.toggleNoteInput();
  });
  hook.rerender();
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('T'));
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const source = core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events
    .find((event) => event.kind === 'note' && event.timestampNum / event.timestampDen === 3 / 4);
  const target = core.score.parts[0]!.staves[0]!.measures[1]!.voices[0]!.events
    .find((event) => event.kind === 'note' && event.timestampNum === 0);
  assert.equal(source?.kind === 'note' ? source.pitch.step : null, 'E');
  assert.equal(source?.tieStart, true);
  assert.equal(target?.kind === 'note' ? target.pitch.step : null, 'E');
  assert.match(hook.xml, /<tie type="start"\/>/);
  assert.match(hook.xml, /<tied type="stop"\/>/);
  assert.equal(hook.current.selectedNote?.measureNumber, 2);
  assert.equal(
    (hook.current.selectedNote?.timestampNum ?? 0) / (hook.current.selectedNote?.timestampDen ?? 1),
    1 / 4,
  );
  hook.unmount();
});

test('interval entry spells the added tone from the active key signature', () => {
  const gMajorXml = SAMPLE_XML.replace('<fifths>0</fifths>', '<fifths>1</fifths>');
  const hook = renderHook(gMajorXml);
  const e4 = makeSelectedNotes(gMajorXml).find((note) => (
    note.measureNumber === 1 && note.timestampNum === 3 && note.step === 'E'
  ));
  assert.ok(e4);

  act(() => {
    hook.current.handleNoteClick(e4);
    hook.current.handleKeyDown(makeKeyboardEvent('2', { altKey: true, code: 'Digit2' }));
  });
  hook.rerender();

  const onsetNotes = flattenVoiceEvents(hook.xml).filter((event) => (
    event.measureNumber === 1 && event.voiceId === 1 && event.timestampNum === 3 && event.kind === 'note'
  ));
  assert.deepEqual(onsetNotes.map((event) => (
    event.kind === 'note' ? `${event.pitch.step}:${event.pitch.alter}` : null
  )), ['E:0', 'F:1']);
  assert.equal(hook.current.selectedNote?.step, 'F');
  assert.equal(hook.current.selectedNote?.alter, 1);
  hook.unmount();
});

test('A-G note input chooses the closest octave and Shift+A-G stacks above the chord', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
    hook.current.toggleNoteInput();
  });
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('B'));
    hook.current.handleKeyDown(makeKeyboardEvent('A'));
  });
  hook.rerender();

  let events = flattenVoiceEvents(hook.xml).filter((event) => event.measureNumber === 1 && event.voiceId === 1);
  const first = events.find((event) => event.timestampNum === 0);
  const second = events.find((event) => event.timestampNum === 1);
  assert.equal(first?.kind === 'note' ? `${first.pitch.step}${first.pitch.octave}` : null, 'B3');
  assert.equal(second?.kind === 'note' ? `${second.pitch.step}${second.pitch.octave}` : null, 'A3');

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('B', { shiftKey: true }));
  });
  hook.rerender();
  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('C', { shiftKey: true }));
  });
  hook.rerender();

  events = flattenVoiceEvents(hook.xml).filter((event) => (
    event.measureNumber === 1 && event.voiceId === 1 && event.timestampNum === 2 && event.kind === 'note'
  ));
  assert.deepEqual(events.map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : null), [
    'D4',
    'B4',
    'C5',
  ]);
  assert.equal(hook.current.selectedNote?.step, 'C');
  assert.equal(hook.current.selectedNote?.octave, 5);
  assert.equal(hook.current.selectedNote?.timestampNum, 2);
  hook.unmount();
});

test('input by duration prepares a three-note chord and commits it atomically with a duration key', () => {
  const hook = renderHook(SAMPLE_XML);
  const first = makeSelectedNotes(SAMPLE_XML).find((note) => note.measureNumber === 1 && note.timestampNum === 0);
  assert.ok(first);

  act(() => {
    hook.current.handleNoteClick(first ?? null);
    hook.current.handleKeyDown(makeKeyboardEvent('M'));
    hook.current.handleKeyDown(makeKeyboardEvent('C'));
    hook.current.handleKeyDown(makeKeyboardEvent('E', { shiftKey: true }));
    hook.current.handleKeyDown(makeKeyboardEvent('G', { shiftKey: true }));
  });
  hook.rerender();

  assert.equal(hook.current.inputByDurationMode, true);
  assert.equal(hook.current.preparedDurationPitchLabel, 'C4+E4+G4');
  assert.equal(hook.appliedCommands.length, 0);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('5', { code: 'Digit5' }));
  });
  hook.rerender();

  const chord = flattenVoiceEvents(hook.xml).filter((event) => (
    event.kind === 'note'
    && event.measureNumber === 1
    && event.voiceId === 1
    && event.timestampNum === 0
  ));
  assert.deepEqual(chord.map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : null), [
    'C4',
    'E4',
    'G4',
  ]);
  assert.equal(chord.every((event) => event.durationType === 'quarter'), true);
  assert.equal(hook.appliedCommands.length, 1);
  hook.unmount();
});

test('input by duration consumes an armed accidental on only the next prepared tone', () => {
  const hook = renderHook(SAMPLE_XML);
  const first = makeSelectedNotes(SAMPLE_XML).find((note) => note.measureNumber === 1 && note.timestampNum === 0);
  assert.ok(first);

  act(() => {
    hook.current.handleNoteClick(first ?? null);
    hook.current.handleKeyDown(makeKeyboardEvent('M'));
    hook.current.handleKeyDown(makeKeyboardEvent('+'));
    hook.current.handleKeyDown(makeKeyboardEvent('C'));
    hook.current.handleKeyDown(makeKeyboardEvent('E', { shiftKey: true }));
  });
  hook.rerender();

  assert.equal(hook.current.preparedDurationPitchLabel, 'C♯4+E4');
  assert.equal(hook.current.selectedAccidental, null);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('5', { code: 'Digit5' }));
  });
  hook.rerender();

  const chord = flattenVoiceEvents(hook.xml).filter((event) => (
    event.kind === 'note'
    && event.measureNumber === 1
    && event.voiceId === 1
    && event.timestampNum === 0
  ));
  assert.deepEqual(chord.map((event) => event.kind === 'note'
    ? `${event.pitch.step}:${event.pitch.alter}:${event.writtenAccidental ?? 'implicit'}`
    : null), [
    'C:0:implicit',
    'C:1:sharp',
    'E:0:implicit',
  ]);
  hook.unmount();
});

test('input by duration prepares a rest and commits it only when a duration is chosen', () => {
  const hook = renderHook(SAMPLE_XML);
  const first = makeSelectedNotes(SAMPLE_XML).find((note) => note.measureNumber === 1 && note.timestampNum === 0);
  assert.ok(first);
  const before = hook.xml;

  act(() => {
    hook.current.handleNoteClick(first ?? null);
    hook.current.handleKeyDown(makeKeyboardEvent('M'));
    hook.current.handleKeyDown(makeKeyboardEvent('0', { code: 'Digit0' }));
  });
  hook.rerender();

  assert.equal(hook.current.preparedDurationPitchLabel, 'REST');
  assert.equal(hook.xml, before);
  assert.equal(hook.appliedCommands.length, 0);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('4', { code: 'Digit4' }));
  });
  hook.rerender();

  const entered = flattenVoiceEvents(hook.xml).find((event) => (
    event.measureNumber === 1
    && event.voiceId === 1
    && event.timestampNum === 0
  ));
  assert.equal(entered?.kind, 'rest');
  assert.equal(entered?.durationType, 'eighth');
  assert.equal(hook.appliedCommands.length, 1);
  hook.unmount();
});

test('duration-first pitch cursor arrows and Backspace correct the prepared chord without editing the score', () => {
  const hook = renderHook(SAMPLE_XML);
  const before = hook.xml;

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('M'));
    hook.current.handleKeyDown(makeKeyboardEvent('E', { shiftKey: true }));
    hook.current.handleKeyDown(makeKeyboardEvent('G', { shiftKey: true }));
    hook.current.handleKeyDown(makeKeyboardEvent('Backspace'));
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowUp'));
    hook.current.handleKeyDown(makeKeyboardEvent('ArrowUp', { ctrlKey: true }));
  });
  hook.rerender();

  assert.equal(hook.current.preparedDurationPitchLabel, 'C4+F5');
  assert.equal(hook.xml, before);
  assert.equal(hook.appliedCommands.length, 0);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('5', { code: 'Digit5' }));
  });
  hook.rerender();

  const chord = flattenVoiceEvents(hook.xml).filter((event) => (
    event.kind === 'note'
    && event.measureNumber === 1
    && event.voiceId === 1
    && event.timestampNum === 0
  ));
  assert.deepEqual(chord.map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : null), [
    'C4',
    'F5',
  ]);
  assert.equal(hook.appliedCommands.length, 1);
  hook.unmount();
});

test('duration-first cursor arrows always move chromatically by one semitone', () => {
  const hook = renderHook(SAMPLE_XML);
  const before = hook.xml;

  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('M')); });
  hook.rerender();
  assert.equal(hook.current.preparedDurationPitchLabel, 'C4');

  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('ArrowUp')); });
  hook.rerender();
  assert.equal(hook.current.preparedDurationPitchLabel, 'C♯4');

  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('ArrowUp')); });
  hook.rerender();
  assert.equal(hook.current.preparedDurationPitchLabel, 'D4');

  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('ArrowDown')); });
  hook.rerender();
  assert.equal(hook.current.preparedDurationPitchLabel, 'C♯4');
  assert.equal(hook.xml, before);
  assert.equal(hook.appliedCommands.length, 0);
  hook.unmount();
});

test('note input arrow keys repitch an activated existing note even while duration-first input is armed', () => {
  const upHook = renderHook(SAMPLE_XML);
  const downHook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);
  const target = notes.find((note) => note.timestampNum === 2 && note.timestampDen === 4);
  assert.ok(target);

  act(() => {
    upHook.current.handleKeyDown(makeKeyboardEvent('M'));
    upHook.current.handleNoteClick(target ?? null);
    upHook.current.handleKeyDown(makeKeyboardEvent('ArrowUp'));
  });
  upHook.rerender();

  act(() => {
    downHook.current.handleKeyDown(makeKeyboardEvent('M'));
    downHook.current.handleNoteClick(target ?? null);
    downHook.current.handleKeyDown(makeKeyboardEvent('ArrowDown'));
  });
  downHook.rerender();

  const findEditedPitch = (xml: string) => flattenVoiceEvents(xml).find((event) => (
    event.kind === 'note'
    && event.measureNumber === 1
    && event.voiceId === 1
    && event.timestampNum === 2
    && event.timestampDen === 4
  ));
  const raised = findEditedPitch(upHook.xml);
  const lowered = findEditedPitch(downHook.xml);
  assert.deepEqual(
    raised?.kind === 'note' ? raised.pitch : null,
    { step: 'D', alter: 1, octave: 4 },
  );
  assert.deepEqual(
    lowered?.kind === 'note' ? lowered.pitch : null,
    { step: 'C', alter: 1, octave: 4 },
  );
  assert.equal(upHook.current.noteInputAnchor?.alter, 1);
  assert.equal(downHook.current.noteInputAnchor?.step, 'C');
  assert.equal(downHook.current.noteInputAnchor?.alter, 1);
  assert.equal(upHook.current.preparedDurationPitchLabel, 'C4');
  assert.equal(downHook.current.preparedDurationPitchLabel, 'C4');
  assert.equal(upHook.appliedCommands.length, 1);
  assert.equal(downHook.appliedCommands.length, 1);
  upHook.unmount();
  downHook.unmount();
});

test('re-entering note input activates the current selection instead of a stale prior input note', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => !note.isRest);
  const priorInput = notes.find((note) => note.timestampNum === 0 && note.timestampDen === 4);
  const target = notes.find((note) => note.timestampNum === 2 && note.timestampDen === 4);
  assert.ok(priorInput);
  assert.ok(target);

  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('N')); });
  hook.rerender();
  act(() => { hook.current.handleNoteClick(priorInput ?? null); });
  hook.rerender();
  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('N')); });
  hook.rerender();
  act(() => { hook.current.handleNoteClick(target ?? null); });
  hook.rerender();
  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('N')); });
  hook.rerender();
  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('ArrowUp')); });
  hook.rerender();

  const editedNotes = flattenVoiceEvents(hook.xml).filter((event) => (
    event.kind === 'note' && event.measureNumber === 1 && event.voiceId === 1
  ));
  const unchangedPrior = editedNotes.find((event) => event.timestampNum === 0 && event.timestampDen === 4);
  const raisedTarget = editedNotes.find((event) => event.timestampNum === 2 && event.timestampDen === 4);
  assert.deepEqual(
    unchangedPrior?.kind === 'note' ? unchangedPrior.pitch : null,
    { step: 'C', alter: 0, octave: 4 },
  );
  assert.deepEqual(
    raisedTarget?.kind === 'note' ? raisedTarget.pitch : null,
    { step: 'D', alter: 1, octave: 4 },
  );
  assert.equal(hook.current.noteInputAnchor?.timestampNum, 2);
  assert.equal(hook.current.noteInputAnchor?.alter, 1);
  assert.equal(hook.appliedCommands.length, 1);
  hook.unmount();
});

test('note input arrow keys transpose every note in an active multi-note selection', () => {
  const hook = renderHook(CHORD_DELETE_XML);
  const chordNotes = makeSelectedNotes(CHORD_DELETE_XML)
    .filter((note) => !note.isRest && note.timestampNum === 0);
  assert.equal(chordNotes.length, 2);

  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('N')); });
  hook.rerender();
  act(() => {
    hook.current.handleNoteClick(chordNotes[1] ?? null, { selectionNotes: chordNotes });
  });
  hook.rerender();
  assert.equal(hook.current.selectedNotes.length, 2);

  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('ArrowUp')); });
  hook.rerender();
  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('ArrowUp')); });
  hook.rerender();

  const movedChord = flattenVoiceEvents(hook.xml)
    .filter((event) => event.kind === 'note' && event.timestampNum === 0)
    .map((event) => event.kind === 'note' ? event.pitch : null);
  assert.deepEqual(movedChord, [
    { step: 'D', alter: 0, octave: 4 },
    { step: 'F', alter: 1, octave: 4 },
  ]);
  assert.equal(hook.current.selectedNotes.length, 2);
  assert.equal(hook.current.noteInputAnchor?.step, 'F');
  assert.equal(hook.current.noteInputAnchor?.alter, 1);
  assert.equal(hook.appliedCommands.length, 2);
  hook.unmount();
});

test('note input arrows repitch the active tone after newly entered chord tones regenerate entity ids', () => {
  const hook = renderHook(SAMPLE_XML);
  const first = makeSelectedNotes(SAMPLE_XML)
    .find((note) => !note.isRest && note.measureNumber === 1 && note.timestampNum === 0);
  assert.ok(first);

  act(() => { hook.current.handleNoteClick(first ?? null); });
  hook.rerender();
  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('N')); });
  hook.rerender();
  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('3', { altKey: true, code: 'Digit3' })); });
  hook.rerender();
  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('3', { altKey: true, code: 'Digit3' })); });
  hook.rerender();

  assert.equal(hook.current.noteInputAnchor?.step, 'G');
  const staleActiveEntityId = hook.current.noteInputAnchor?.coreEntityId;

  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('ArrowUp')); });
  hook.rerender();

  const chordPitches = flattenVoiceEvents(hook.xml)
    .filter((event) => event.kind === 'note' && event.measureNumber === 1 && event.timestampNum === 0)
    .map((event) => event.kind === 'note' ? event.pitch : null);
  assert.deepEqual(chordPitches, [
    { step: 'C', alter: 0, octave: 4 },
    { step: 'E', alter: 0, octave: 4 },
    { step: 'G', alter: 1, octave: 4 },
  ]);
  assert.equal(hook.current.noteInputAnchor?.step, 'G');
  assert.equal(hook.current.noteInputAnchor?.alter, 1);
  assert.notEqual(hook.current.noteInputAnchor?.coreEntityId, staleActiveEntityId);
  assert.equal(hook.current.selectedNotes.length, 1);
  assert.equal(hook.appliedCommands.at(-1)?.[0]?.type, 'transposeChromatic');

  act(() => { hook.current.handleKeyDown(makeKeyboardEvent('ArrowDown')); });
  hook.rerender();
  const restoredChordPitches = flattenVoiceEvents(hook.xml)
    .filter((event) => event.kind === 'note' && event.measureNumber === 1 && event.timestampNum === 0)
    .map((event) => event.kind === 'note' ? event.pitch : null);
  assert.deepEqual(restoredChordPitches, [
    { step: 'C', alter: 0, octave: 4 },
    { step: 'E', alter: 0, octave: 4 },
    { step: 'G', alter: 0, octave: 4 },
  ]);
  assert.equal(hook.current.selectedNotes.length, 1);
  assert.equal(hook.current.noteInputAnchor?.step, 'G');
  assert.equal(hook.current.noteInputAnchor?.alter, 0);
  hook.unmount();
});

test('duration-first three-note entry stays atomic and isolated in voice 2', () => {
  const xml = MULTI_VOICE_CLICK_XML.replace(
    '<note><pitch><step>G</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>',
    '<note><rest/><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>',
  );
  const hook = renderHook(xml);
  const voiceTwoRest = makeSelectedNotes(xml).find((note) => (
    note.measureNumber === 1 && note.voiceId === 2 && note.timestampNum === 0 && note.isRest
  ));
  assert.ok(voiceTwoRest);

  act(() => {
    hook.current.handleNoteClick(voiceTwoRest ?? null);
    hook.current.handleKeyDown(makeKeyboardEvent('2', { code: 'Digit2', ctrlKey: true, altKey: true }));
    hook.current.handleKeyDown(makeKeyboardEvent('M'));
    hook.current.handleKeyDown(makeKeyboardEvent('C'));
    hook.current.handleKeyDown(makeKeyboardEvent('E', { shiftKey: true }));
    hook.current.handleKeyDown(makeKeyboardEvent('G', { shiftKey: true }));
    hook.current.handleKeyDown(makeKeyboardEvent('5', { code: 'Digit5' }));
  });
  hook.rerender();

  const onset = flattenVoiceEvents(hook.xml).filter((event) => (
    event.kind === 'note' && event.measureNumber === 1 && event.timestampNum === 0
  ));
  const voiceOne = onset.filter((event) => event.voiceId === 1);
  const voiceTwo = onset.filter((event) => event.voiceId === 2);
  assert.deepEqual(voiceOne.map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : null), ['C4']);
  assert.deepEqual(voiceTwo.map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : null), [
    'C4',
    'E4',
    'G4',
  ]);
  assert.equal(voiceTwo.every((event) => event.durationType === 'quarter'), true);
  assert.equal(hook.appliedCommands.length, 1);
  hook.unmount();
});

test('A-G note input follows the active key signature when no accidental is armed', () => {
  const gMajorXml = SAMPLE_XML.replace('<fifths>0</fifths>', '<fifths>1</fifths>');
  const hook = renderHook(gMajorXml);
  const first = makeSelectedNotes(gMajorXml).find((note) => note.measureNumber === 1 && note.timestampNum === 0);
  assert.ok(first);

  act(() => {
    hook.current.handleNoteClick(first);
    hook.current.toggleNoteInput();
    hook.current.handleKeyDown(makeKeyboardEvent('F'));
  });
  hook.rerender();

  const entered = flattenVoiceEvents(hook.xml).find((event) => (
    event.measureNumber === 1 && event.voiceId === 1 && event.timestampNum === 0
  ));
  assert.equal(entered?.kind === 'note' ? `${entered.pitch.step}:${entered.pitch.alter}:${entered.pitch.octave}` : null, 'F:1:4');
  hook.unmount();
});

test('armed accidentals are one-shot while measure carry preserves sounding pitch and resets at the barline', () => {
  const gMajorXml = SAMPLE_XML.replace('<fifths>0</fifths>', '<fifths>1</fifths>');
  const hook = renderHook(gMajorXml);
  const first = makeSelectedNotes(gMajorXml).find((note) => note.measureNumber === 1 && note.timestampNum === 0);
  assert.ok(first);

  act(() => {
    hook.current.handleNoteClick(first);
    hook.current.toggleNoteInput();
    hook.current.handleKeyDown(makeKeyboardEvent('='));
  });
  assert.equal(hook.current.selectedAccidental, 'natural');

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('F'));
  });
  hook.rerender();
  assert.equal(hook.current.selectedAccidental, null, 'the explicit natural is consumed by the successful note');

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('F'));
  });
  hook.rerender();

  let events = flattenVoiceEvents(hook.xml).filter((event) => event.kind === 'note');
  const firstMeasureFs = events.filter((event) => (
    event.measureNumber === 1
    && event.voiceId === 1
    && event.pitch.step === 'F'
    && event.pitch.octave === 4
  ));
  assert.deepEqual(firstMeasureFs.slice(0, 2).map((event) => ({
    alter: event.pitch.alter,
    writtenAccidental: event.writtenAccidental,
  })), [{
    alter: 0,
    writtenAccidental: 'natural',
  }, {
    alter: 0,
    writtenAccidental: undefined,
  }]);
  assert.equal((hook.xml.match(/<accidental>natural<\/accidental>/g) ?? []).length, 1);
  assert.equal(resolveMouseEntryAlter({
    selectedAccidental: null,
    coreDocument: importMusicXmlToCore(hook.xml),
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    timestampNum: 2,
    timestampDen: 4,
    step: 'F',
    octave: 4,
  }), 0, 'mouse ghost spelling follows the same measure carry as keyboard entry');
  assert.equal(resolveMouseEntryAlter({
    selectedAccidental: 'flat',
    coreDocument: importMusicXmlToCore(hook.xml),
    corePartId: 'part:P1',
    measureNumber: 1,
    staffIndex: 1,
    timestampNum: 2,
    timestampDen: 4,
    step: 'F',
    octave: 4,
  }), -1, 'an armed mouse accidental overrides carried spelling for the preview and commit');

  const measureTwoFirst = makeSelectedNotes(hook.xml).find((note) => note.measureNumber === 2 && note.timestampNum === 0);
  assert.ok(measureTwoFirst);
  act(() => {
    hook.current.handleNoteClick(measureTwoFirst);
    hook.current.handleKeyDown(makeKeyboardEvent('F'));
  });
  hook.rerender();

  events = flattenVoiceEvents(hook.xml).filter((event) => event.kind === 'note');
  const resetF = events.find((event) => event.measureNumber === 2 && event.timestampNum === 0);
  assert.equal(resetF?.kind === 'note' ? resetF.pitch.alter : null, 1);
  assert.equal(resetF?.kind === 'note' ? resetF.writtenAccidental : null, undefined);
  assert.deepEqual(
    hook.appliedCommands.slice(0, 2).map((commands) => commands[0]?.type === 'changeNotePitch'
      ? commands[0].writtenAccidental
      : null),
    ['natural', undefined],
  );
  hook.unmount();
});

test('J cycles enharmonic spellings without changing pitch or entity identity', () => {
  const cSharpXml = SAMPLE_XML.replace(
    '<pitch><step>C</step><octave>4</octave></pitch>',
    '<pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>',
  );
  const hook = renderHook(cSharpXml);
  const first = makeSelectedNotes(cSharpXml).find((note) => note.measureNumber === 1 && note.timestampNum === 0);
  assert.ok(first?.coreEntityId);
  const entityId = first.coreEntityId;

  act(() => hook.current.handleNoteClick(first));
  hook.rerender();
  act(() => hook.current.handleKeyDown(makeKeyboardEvent('j')));
  hook.rerender();
  let selected = hook.current.selectedNote;
  assert.deepEqual(selected ? { step: selected.step, alter: selected.alter, octave: selected.octave } : null, {
    step: 'D', alter: -1, octave: 4,
  });
  assert.equal(selected?.coreEntityId, entityId);

  act(() => hook.current.handleKeyDown(makeKeyboardEvent('j')));
  hook.rerender();
  selected = hook.current.selectedNote;
  assert.deepEqual(selected ? { step: selected.step, alter: selected.alter, octave: selected.octave } : null, {
    step: 'B', alter: 2, octave: 3,
  });

  act(() => hook.current.handleKeyDown(makeKeyboardEvent('j')));
  hook.rerender();
  selected = hook.current.selectedNote;
  assert.deepEqual(selected ? { step: selected.step, alter: selected.alter, octave: selected.octave } : null, {
    step: 'C', alter: 1, octave: 4,
  });
  assert.equal(selected?.coreEntityId, entityId);
  assert.deepEqual(hook.appliedCommands.map((batch) => batch.length), [1, 1, 1]);
  hook.unmount();
});

test('J respells an entire semantic selection independently in one transaction', () => {
  const chromaticXml = SAMPLE_XML
    .replace(
      '<pitch><step>C</step><octave>4</octave></pitch>',
      '<pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>',
    )
    .replace(
      '<pitch><step>D</step><octave>4</octave></pitch>',
      '<pitch><step>D</step><alter>1</alter><octave>4</octave></pitch>',
    );
  const hook = renderHook(chromaticXml);
  const targets = makeSelectedNotes(chromaticXml).filter((note) => (
    note.measureNumber === 1 && (note.timestampNum === 0 || note.timestampNum === 2)
  ));
  assert.equal(targets.length, 2);

  act(() => {
    hook.current.handleNoteClick(targets[0]!);
    hook.current.handleNoteClick(targets[1]!, { additive: true });
  });
  hook.rerender();
  const rangeAnchorId = hook.current.selection.anchorEntityId;
  act(() => hook.current.respellEnharmonically());
  hook.rerender();

  const notes = flattenVoiceEvents(hook.xml).filter((event) => (
    event.kind === 'note' && event.measureNumber === 1 && (event.timestampNum === 0 || event.timestampNum === 2)
  ));
  assert.deepEqual(notes.map((event) => event.kind === 'note'
    ? `${event.pitch.step}:${event.pitch.alter}:${event.pitch.octave}`
    : null), ['D:-1:4', 'E:-1:4']);
  assert.equal(hook.appliedCommands.length, 1);
  assert.equal(hook.appliedCommands[0]?.length, 2);
  assert.equal(hook.current.selectedNotes.length, 2);
  assert.equal(hook.current.selection.anchorEntityId, rangeAnchorId);
  hook.unmount();
});

test('J respells selected chord tones together without moving their onset', () => {
  const chordXml = CHORD_DELETE_XML.replace(
    '<pitch><step>C</step><octave>4</octave></pitch>',
    '<pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>',
  );
  const hook = renderHook(chordXml);
  const chord = makeSelectedNotes(chordXml).filter((note) => note.measureNumber === 1 && note.timestampNum === 0);
  assert.equal(chord.length, 2);

  act(() => {
    hook.current.handleNoteClick(chord[0]!);
    hook.current.handleNoteClick(chord[1]!, { additive: true });
  });
  hook.rerender();
  act(() => hook.current.respellEnharmonically());
  hook.rerender();

  const respelled = flattenVoiceEvents(hook.xml).filter((event) => (
    event.kind === 'note' && event.measureNumber === 1 && event.timestampNum === 0
  ));
  assert.deepEqual(respelled.map((event) => event.kind === 'note'
    ? `${event.pitch.step}:${event.pitch.alter}:${event.pitch.octave}@${event.timestampNum}`
    : null), ['D:-1:4@0', 'F:-1:4@0']);
  assert.equal(hook.appliedCommands.length, 1);
  assert.equal(hook.appliedCommands[0]?.length, 2);
  hook.unmount();
});

test('J expands a selected tied note across the barline and preserves tie continuity atomically', () => {
  const tiedXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><tie type="start"/><voice>1</voice><type>whole</type><notations><tied type="start"/></notations></note>
    </measure>
    <measure number="2">
      <note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><tie type="stop"/><voice>1</voice><type>whole</type><notations><tied type="stop"/></notations></note>
    </measure>
  </part>
</score-partwise>`;
  const hook = renderHook(tiedXml);
  const first = makeSelectedNotes(tiedXml).find((note) => note.measureNumber === 1);
  assert.ok(first);

  act(() => hook.current.handleNoteClick(first));
  hook.rerender();
  act(() => hook.current.handleKeyDown(makeKeyboardEvent('j')));
  hook.rerender();

  const notes = flattenVoiceEvents(hook.xml).filter((event) => event.kind === 'note');
  assert.deepEqual(notes.map((event) => event.kind === 'note'
    ? `${event.pitch.step}:${event.pitch.alter}:${event.pitch.octave}`
    : null), ['D:-1:4', 'D:-1:4']);
  assert.equal(notes[0]?.tieStart, true);
  assert.equal(hook.appliedCommands.length, 1);
  assert.equal(hook.appliedCommands[0]?.length, 2);
  assert.ok(!buildDocumentState(hook.xml).diagnostics.some((diagnostic) => diagnostic.code === 'tie_continuity'));
  hook.unmount();
});

test('same-pitch note-name replacement advances without creating a history command', () => {
  const hook = renderHook(SAMPLE_XML);
  const first = makeSelectedNotes(SAMPLE_XML).find((note) => note.measureNumber === 1 && note.timestampNum === 0);
  assert.ok(first);
  const initialXml = hook.xml;

  act(() => {
    hook.current.handleNoteClick(first);
    hook.current.toggleNoteInput();
    hook.current.handleKeyDown(makeKeyboardEvent('C'));
  });
  assert.equal(hook.xml, initialXml);
  assert.equal(hook.appliedCommands.length, 0);
  assert.equal(hook.current.selectedNote?.timestampNum, 1);
  assert.equal(hook.current.noteInputAnchor?.timestampNum, 0);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('C'));
  });
  assert.equal(hook.xml, initialXml);
  assert.equal(hook.appliedCommands.length, 0);
  assert.equal(hook.current.selectedNote?.timestampNum, 2);
  assert.equal(hook.current.noteInputAnchor?.timestampNum, 1);

  act(() => {
    hook.current.handleKeyDown(makeKeyboardEvent('E'));
  });
  hook.rerender();
  assert.notEqual(hook.xml, initialXml);
  assert.equal(hook.appliedCommands.length, 1);
  assert.equal(hook.current.selectedNote?.timestampNum, 3);
  assert.equal(hook.current.noteInputAnchor?.step, 'E');
  hook.unmount();
});

test('rest input applies the active duration and advances across matching rests without extra history', () => {
  const hook = renderHook(OVERFLOW_REST_XML);
  const first = makeSelectedNotes(OVERFLOW_REST_XML).find((note) => note.measureNumber === 1 && note.timestampNum === 0);
  assert.ok(first);

  act(() => {
    hook.current.handleNoteClick(first);
    hook.current.toggleNoteInput();
    hook.current.handleKeyDown(makeKeyboardEvent('4'));
    hook.current.insertRest();
  });
  hook.rerender();

  const enteredRest = flattenVoiceEvents(hook.xml).find((event) => (
    event.measureNumber === 1 && event.voiceId === 1 && event.timestampNum === 0
  ));
  assert.equal(enteredRest?.kind, 'rest');
  assert.equal(enteredRest?.durationType, 'eighth');
  assert.equal(hook.appliedCommands.length, 1);
  assert.equal(hook.appliedCommands[0]?.[0]?.type, 'replaceWithRest');

  const matchingRest = makeSelectedNotes(hook.xml).find((note) => (
    note.isRest
    && note.measureNumber === 2
    && note.timestampNum / note.timestampDen === 1 / 4
  ));
  assert.ok(matchingRest);
  act(() => {
    hook.current.handleNoteClick(matchingRest);
    hook.current.handleKeyDown(makeKeyboardEvent('5'));
  });
  const xmlBeforeMatchingRest = hook.xml;
  const historyBeforeMatchingRest = hook.appliedCommands.length;
  act(() => {
    hook.current.insertRest();
  });

  assert.equal(hook.xml, xmlBeforeMatchingRest);
  assert.equal(hook.appliedCommands.length, historyBeforeMatchingRest);
  assert.equal(hook.current.selectedNote?.measureNumber, 2);
  assert.equal(
    (hook.current.selectedNote?.timestampNum ?? 0) / (hook.current.selectedNote?.timestampDen ?? 1),
    2 / 4,
  );
  assert.equal(hook.current.noteInputAnchor?.isRest, true);
  assert.deepEqual(hook.previewedNoteGroups.at(-1), []);
  hook.unmount();
});

test('Cmd/Ctrl+Shift+A-G reaches explicit cursor pitch entry instead of clipboard commands', () => {
  const hook = renderHook(SAMPLE_XML);
  const first = makeSelectedNotes(SAMPLE_XML).find((note) => note.measureNumber === 1 && note.timestampNum === 0);
  assert.ok(first);

  act(() => {
    hook.current.handleNoteClick(first);
    hook.current.toggleNoteInput();
    hook.current.handleKeyDown(makeKeyboardEvent('C', { metaKey: true, shiftKey: true }));
  });
  hook.rerender();

  const onsetNotes = flattenVoiceEvents(hook.xml).filter((event) => (
    event.measureNumber === 1 && event.voiceId === 1 && event.timestampNum === 0 && event.kind === 'note'
  ));
  assert.deepEqual(onsetNotes.map((event) => event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : null), [
    'C4',
    'C5',
  ]);
  assert.equal(hook.current.selectedNote?.octave, 5);
  assert.equal(hook.appliedCommands.at(-1)?.some((command) => command.type === 'insertNoteAt'), true);
  hook.unmount();
});

test('quick tuplet insert divides one selected rhythmic slot into a balanced triplet', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML).filter((note) => note.measureNumber === 1 && !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.addTupletToSelection('triplet');
  });
  hook.rerender();

  assert.match(hook.xml, /<actual-notes>3<\/actual-notes>/);
  assert.match(hook.xml, /<normal-notes>2<\/normal-notes>/);
  assert.match(hook.xml, /<tuplet number="1" type="start"/);
  assert.match(hook.xml, /<tuplet number="1" type="stop"/);
  const core = importMusicXmlToCore(hook.xml);
  const tuplet = core.tuplets[0]!;
  assert.equal(tuplet.eventIds.filter((eventId) => {
    const events = core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
    return events.some((event) => event.id === eventId && !event.isChord);
  }).length, 3);
  assert.deepEqual(validateScoreDocument(core).filter((entry) => entry.level === 'error'), []);
  hook.unmount();
});

test('MuseScore tuplet shortcuts divide one compatible anchor for ratios 2 through 9', () => {
  const normalNotesByActual = new Map([
    [2, 3],
    [3, 2],
    [4, 3],
    [5, 4],
    [6, 4],
    [7, 4],
    [8, 6],
    [9, 8],
  ]);

  for (const [actualNotes, normalNotes] of normalNotesByActual) {
    const xml = normalNotes === 3 || normalNotes === 6
      ? `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>2</divisions><time><beats>3</beats><beat-type>8</beat-type></time></attributes>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration><voice>1</voice><type>quarter</type><dot/><staff>1</staff></note>
</measure></part></score-partwise>`
      : makeQuarterNoteMeasureXml(1);
    const hook = renderHook(xml);
    const notes = makeSelectedNotes(xml).filter((note) => note.measureNumber === 1 && !note.isRest);

    act(() => {
      hook.current.handleNoteClick(notes[0]);
    });
    act(() => {
      hook.current.handleKeyDown(makeKeyboardEvent(String(actualNotes), {
        ctrlKey: actualNotes % 2 === 0,
        metaKey: actualNotes % 2 !== 0,
        code: `Digit${actualNotes}`,
      }));
    });
    hook.rerender();

    assert.match(hook.xml, new RegExp(`<actual-notes>${actualNotes}</actual-notes>`));
    assert.match(hook.xml, new RegExp(`<normal-notes>${normalNotes}</normal-notes>`));
    assert.match(hook.xml, /<tuplet number="1" type="start"/);
    assert.match(hook.xml, /<tuplet number="1" type="stop"/);
    const core = importMusicXmlToCore(hook.xml);
    assert.equal(core.tuplets[0]!.eventIds.filter((id) => (
      core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events.some((event) => event.id === id && !event.isChord)
    )).length, actualNotes);
    assert.deepEqual(validateScoreDocument(core).filter((entry) => entry.level === 'error'), []);
    hook.unmount();
  }
});

test('ghost horizontal quantization follows irregular anchor spacing instead of flattening the whole measure', () => {
  const quantizer = buildGhostHorizontalQuantizer(
    1,
    0.25,
    [
      { ratio: 0.25, x: 120 },
      { ratio: 0.5, x: 175 },
      { ratio: 0.75, x: 310 },
    ],
    { x: 40, width: 340 },
  );

  assert.equal(quantizer.snapRatio(168), 0.5);
  assert.equal(quantizer.snapRatio(295), 0.75);
  assert.ok(Math.abs(quantizer.xFromRatio(0.5) - 175) < 0.001);
});

test('ghost horizontal quantization falls back to a stable measure grid when no onset anchors exist', () => {
  const quantizer = buildGhostHorizontalQuantizer(1, 0.25, [], { x: 40, width: 320 });

  assert.equal(quantizer.snapRatio(41), 0);
  assert.equal(quantizer.snapRatio(126), 0.25);
  assert.equal(quantizer.snapRatio(281), 0.75);
  assert.ok(Math.abs(quantizer.xFromRatio(0.5) - 240) < 0.001);
});

test('ghost horizontal quantization does not let a lone start anchor collapse beat 1 toward the center', () => {
  const quantizer = buildGhostHorizontalQuantizer(4, 1, [], { x: 100, width: 400 });
  const anchoredQuantizer = buildGhostHorizontalQuantizer(4, 1, [{ ratio: 0, x: 300 }], { x: 100, width: 400 });

  assert.equal(quantizer.snapRatio(120), 0);
  assert.equal(anchoredQuantizer.snapRatio(120), 0);
});

test('ghost horizontal quantization applies a leading inset for anchorless system-start measures', () => {
  const defaultQuantizer = buildGhostHorizontalQuantizer(4, 1, [], { x: 100, width: 400 });
  const insetQuantizer = buildGhostHorizontalQuantizer(
    4,
    1,
    [],
    { x: 100, width: 400 },
    null,
    { left: 104, right: 12 },
  );

  assert.equal(defaultQuantizer.snapRatio(220), 1);
  assert.equal(insetQuantizer.snapRatio(220), 0);
});

test('semantic anchor debug hitboxes stay partitioned when noteheads visually overhang adjacent slots', () => {
  const firstSlot = { x: 100, y: 20, width: 20, height: 80 };
  const secondSlot = { x: 120, y: 20, width: 20, height: 80 };
  const firstVisual = { x: 114, y: 42, width: 18, height: 12 };
  const secondVisual = { x: 116, y: 42, width: 18, height: 12 };

  const firstHit = resolveSemanticAnchorHitRect({
    zoneHitRect: firstSlot,
    visualRect: firstVisual,
    isRest: false,
    hasRenderedVisual: true,
  });
  const secondHit = resolveSemanticAnchorHitRect({
    zoneHitRect: secondSlot,
    visualRect: secondVisual,
    isRest: false,
    hasRenderedVisual: true,
  });

  assert.equal(firstHit.x + firstHit.width, secondHit.x);
  assert.equal(
    Math.max(0, Math.min(firstHit.x + firstHit.width, secondHit.x + secondHit.width) - Math.max(firstHit.x, secondHit.x)),
    0,
  );
  assert.ok(firstVisual.x + firstVisual.width > secondHit.x);
  assert.ok(secondVisual.x < firstHit.x + firstHit.width);
});

test('staff capture rects use visual row order when parts repeat local staff indexes', () => {
  const staffRows = [650, 730, 810].map((centerY) => ({
    staffIndex: 1,
    topLineDomY: centerY - 20,
    bottomLineDomY: centerY + 20,
    lineDistanceDom: 10,
    lineCount: 5,
  }));
  const tromboneRect = captureMeasureRectForStaff(
    { x: 100, y: 642, width: 54, height: 136 },
    staffRows[1]!,
    staffRows,
  );
  const tptRect = captureMeasureRectForStaff(
    { x: 100, y: 722, width: 54, height: 136 },
    staffRows[2]!,
    staffRows,
  );

  assert.ok(tromboneRect);
  assert.ok(tptRect);
  assert.ok(tromboneRect.y + tromboneRect.height <= tptRect.y + 0.75);
  assert.ok(tromboneRect.height < 136);
  assert.ok(tptRect.height < 136);
});

test('semantic anchor grid boxes stay on the core measure row when a rendered rest y drifts to another part', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Trumpet in Bb 1</part-name></score-part>
    <score-part id="P2"><part-name>Trombone</part-name></score-part>
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
</score-partwise>`;
  const core = importMusicXmlToCore(xml);
  const topPart = core.score.parts[0]!;
  const lowerPart = core.score.parts[1]!;
  const topMeasure = topPart.staves[0]!.measures[0]!;
  const lowerMeasure = lowerPart.staves[0]!.measures[0]!;
  const topVoice = topMeasure.voices[0]!;
  const lowerVoice = lowerMeasure.voices[0]!;
  const topEvent = topVoice.events[0]!;
  const lowerEvent = lowerVoice.events[0]!;

  const selectedRest = (
    event: TimedEvent,
    partId: string,
    measureId: string,
    voiceId: string,
  ): SelectedNote => ({
    coreEntityId: event.id,
    coreVoiceId: voiceId,
    coreMeasureId: measureId,
    corePartId: partId,
    measureNumber: event.measureNumber,
    staffIndex: event.staffIndex,
    voiceId: event.voiceId,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
    step: 'C',
    octave: 4,
    alter: 0,
    isRest: true,
    durationType: event.durationType,
    graphicalNote: null,
  });

  const topStaff = {
    staffIndex: 1,
    topLineDomY: 80,
    bottomLineDomY: 120,
    lineDistanceDom: 10,
    lineCount: 5,
  };
  const lowerStaff = {
    staffIndex: 1,
    topLineDomY: 220,
    bottomLineDomY: 260,
    lineDistanceDom: 10,
    lineCount: 5,
  };
  const overlays = [
    {
      measureId: topMeasure.id,
      measureNumber: 1,
      systemIndex: 0,
      pageIndex: 0,
      domRect: { x: 100, y: 60, width: 220, height: 80 },
      widthWeight: 1,
      breakBefore: false,
      pageBreakBefore: false,
      staffSpacing: null,
      staffDetails: [topStaff],
    },
    {
      measureId: lowerMeasure.id,
      measureNumber: 1,
      systemIndex: 0,
      pageIndex: 0,
      domRect: { x: 100, y: 200, width: 220, height: 80 },
      widthWeight: 1,
      breakBefore: false,
      pageBreakBefore: false,
      staffSpacing: null,
      staffDetails: [lowerStaff],
    },
  ] as Parameters<typeof buildGhostNoteSpatialIndex>[2];
  const renderedNotes = [
    {
      id: topEvent.id,
      coreEntityId: topEvent.id,
      note: selectedRest(topEvent, topPart.id, topMeasure.id, topVoice.id),
      svgCenter: { x: 170, y: 240 },
      domCenter: { x: 170, y: 240 },
      domRect: { x: 160, y: 232, width: 20, height: 16 },
      svgElement: null,
      tintElement: null,
    },
    {
      id: lowerEvent.id,
      coreEntityId: lowerEvent.id,
      note: selectedRest(lowerEvent, lowerPart.id, lowerMeasure.id, lowerVoice.id),
      svgCenter: { x: 170, y: 240 },
      domCenter: { x: 170, y: 240 },
      domRect: { x: 160, y: 232, width: 20, height: 16 },
      svgElement: null,
      tintElement: null,
    },
  ] as Parameters<typeof buildGhostNoteSpatialIndex>[0];

  const ghostIndex = buildGhostNoteSpatialIndex(renderedNotes, core, overlays);
  const boxes = buildSemanticAnchorDebugBoxes({
    ghostIndex,
    container: null,
    measureOverlays: overlays,
    coreDocument: core,
    staffDetailsByMeasure: new Map([[1, [topStaff, lowerStaff]]]),
    viewportBox: { width: 1000, height: 1000, scrollLeft: 0, scrollTop: 0 },
    graceEventIds: new Set(),
  });

  const topBox = boxes.find((box) => box.measureId === topMeasure.id && box.partId === topPart.id);
  const lowerBox = boxes.find((box) => box.measureId === lowerMeasure.id && box.partId === lowerPart.id);

  assert.ok(topBox);
  assert.ok(lowerBox);
  assert.equal(topBox.rect.y, 60);
  assert.ok(topBox.rect.y + topBox.rect.height <= lowerStaff.topLineDomY - 1);
  assert.ok(lowerBox.rect.y >= topBox.rect.y + topBox.rect.height - 0.75);
  assert.ok(lowerBox.rect.y < lowerStaff.topLineDomY);
});

test('system-start ghost visibility clamps to protected start instead of first pitched anchor', () => {
  const minimumX = resolveMinimumVisibleGhostX(
    {
      measureNumber: 1,
      breakBefore: false,
      domRect: { x: 163.03, y: 148.5, width: 420, height: 78 },
    },
    [
      { ratio: 0.75, x: 260.79, voiceId: 1, timestampNum: 24, timestampDen: 32, isRest: false },
    ],
  );

  assert.ok(minimumX != null);
  assert.ok(Math.abs(minimumX - 251.79) < 0.001);
});

test('visible ghost notehead remains on its snap point even when a protected-start minimum exists', () => {
  assert.equal(resolveVisibleGhostSnapX({
    snappedX: 232,
    minimumVisibleX: 251.79,
    synthetic: true,
  }), 232);
});

test('ghost note spatial index keeps equally numbered measures from different parts in separate buckets', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Upper</part-name></score-part>
    <score-part id="P2"><part-name>Lower</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>2</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const core = importMusicXmlToCore(xml);
  const upperMeasure = core.score.parts[0]!.staves[0]!.measures[0]!;
  const lowerMeasure = core.score.parts[1]!.staves[0]!.measures[0]!;
  const upperEvent = upperMeasure.voices[0]!.events[0]!;
  const lowerEvent = lowerMeasure.voices[0]!.events[0]!;

  const renderedNotes = [
    {
      id: upperEvent.id,
      coreEntityId: upperEvent.id,
      note: {
        coreEntityId: upperEvent.id,
        coreVoiceId: upperMeasure.voices[0]!.id,
        coreMeasureId: upperMeasure.id,
        corePartId: core.score.parts[0]!.id,
        measureNumber: upperEvent.measureNumber,
        staffIndex: upperEvent.staffIndex,
        voiceId: upperEvent.voiceId,
        timestampNum: upperEvent.timestampNum,
        timestampDen: upperEvent.timestampDen,
        step: upperEvent.kind === 'note' ? upperEvent.pitch.step : 'C',
        octave: upperEvent.kind === 'note' ? upperEvent.pitch.octave : 4,
        alter: upperEvent.kind === 'note' ? upperEvent.pitch.alter : 0,
        isRest: false,
        graphicalNote: null,
      },
      svgCenter: { x: 120, y: 80 },
      domCenter: { x: 120, y: 80 },
      domRect: { x: 114, y: 74, width: 12, height: 12 },
      svgElement: null,
      tintElement: null,
    },
    {
      id: lowerEvent.id,
      coreEntityId: lowerEvent.id,
      note: {
        coreEntityId: lowerEvent.id,
        coreVoiceId: lowerMeasure.voices[0]!.id,
        coreMeasureId: lowerMeasure.id,
        corePartId: core.score.parts[1]!.id,
        measureNumber: lowerEvent.measureNumber,
        staffIndex: lowerEvent.staffIndex,
        voiceId: lowerEvent.voiceId,
        timestampNum: lowerEvent.timestampNum,
        timestampDen: lowerEvent.timestampDen,
        step: lowerEvent.kind === 'note' ? lowerEvent.pitch.step : 'C',
        octave: lowerEvent.kind === 'note' ? lowerEvent.pitch.octave : 4,
        alter: lowerEvent.kind === 'note' ? lowerEvent.pitch.alter : 0,
        isRest: false,
        graphicalNote: null,
      },
      svgCenter: { x: 120, y: 220 },
      domCenter: { x: 120, y: 220 },
      domRect: { x: 114, y: 214, width: 12, height: 12 },
      svgElement: null,
      tintElement: null,
    },
  ] as Parameters<typeof buildGhostNoteSpatialIndex>[0];

  const overlays = [
    {
      measureId: upperMeasure.id,
      measureNumber: 1,
      systemIndex: 0,
      pageIndex: 0,
      domRect: { x: 100, y: 40, width: 220, height: 120 },
      widthWeight: 1,
    },
    {
      measureId: lowerMeasure.id,
      measureNumber: 1,
      systemIndex: 1,
      pageIndex: 0,
      domRect: { x: 100, y: 180, width: 220, height: 120 },
      widthWeight: 1,
    },
  ] as Parameters<typeof buildGhostNoteSpatialIndex>[2];

  const index = buildGhostNoteSpatialIndex(renderedNotes, core, overlays);

  assert.equal(index.byMeasureId.get(upperMeasure.id)?.length, 1);
  assert.equal(index.byMeasureId.get(lowerMeasure.id)?.length, 1);
  assert.equal(index.byMeasureId.get(upperMeasure.id)?.[0]?.semantic.corePartId, core.score.parts[0]!.id);
  assert.equal(index.byMeasureId.get(lowerMeasure.id)?.[0]?.semantic.corePartId, core.score.parts[1]!.id);
  assert.equal(index.bySystemStaff.get(`0:${core.score.parts[0]!.id}:1`)?.length, 1);
  assert.equal(index.bySystemStaff.get(`1:${core.score.parts[1]!.id}:1`)?.length, 1);
  assert.equal(index.bySystemStaff.get(`0:${core.score.parts[1]!.id}:1`), undefined);
  assert.equal(index.bySystemStaff.get(`1:${core.score.parts[0]!.id}:1`), undefined);
});

test('ghost note spatial index does not canonicalize a rendered rest glyph into a note at the same timestamp', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const core = importMusicXmlToCore(xml);
  const measure = core.score.parts[0]!.staves[0]!.measures[0]!;

  const renderedNotes = [{
    id: 'stale-rest-glyph',
    coreEntityId: null,
    note: {
      coreEntityId: null,
      coreVoiceId: null,
      coreMeasureId: measure.id,
      corePartId: core.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      step: 'C',
      octave: 4,
      alter: 0,
      isRest: true,
      graphicalNote: null,
    },
    svgCenter: { x: 180, y: 80 },
    domCenter: { x: 180, y: 80 },
    domRect: { x: 170, y: 74, width: 20, height: 12 },
    svgElement: null,
    tintElement: null,
  }] as Parameters<typeof buildGhostNoteSpatialIndex>[0];
  const overlays = [{
    measureId: measure.id,
    measureNumber: 1,
    systemIndex: 0,
    pageIndex: 0,
    domRect: { x: 100, y: 40, width: 220, height: 120 },
    widthWeight: 1,
  }] as Parameters<typeof buildGhostNoteSpatialIndex>[2];

  const index = buildGhostNoteSpatialIndex(renderedNotes, core, overlays);
  const entry = index.byMeasureId.get(measure.id)?.[0];
  const coreNote = measure.voices[0]!.events.find((event) => event.kind === 'note')!;

  assert.equal(entry?.semantic.isRest, true);
  assert.notEqual(entry?.semantic.coreEntityId, coreNote.id);
});

test('ghost pitch quantization snaps to discrete staff steps beyond the sampled staff range', () => {
  const quantized = quantizeGhostPitchIndex(74, 30, 110, [
    { index: 30, y: 110 },
    { index: 31, y: 104 },
    { index: 32, y: 98 },
    { index: 33, y: 92 },
  ]);

  assert.equal(quantized.targetIndex, 36);
  assert.equal(quantized.snappedY, 74);
  assert.equal(quantized.stepPx, 6);
});

test('ghost pitch calibration resolves treble-clef pitches from pointer Y instead of collapsing to the middle line', () => {
  const resolved = resolveGhostPitchFromCalibration({
    pointerY: 86,
    clef: { sign: 'G', line: 2 },
    fallbackStaffStep: 4,
    fallbackSnappedY: 74,
    samples: [
      { index: 38, y: 50 }, // F5 top line
      { index: 37, y: 56 },
      { index: 36, y: 62 },
      { index: 35, y: 68 },
      { index: 34, y: 74 }, // B4 middle line
      { index: 33, y: 80 },
      { index: 32, y: 86 },
    ],
  });

  assert.equal(resolved.targetPitch.step, 'G');
  assert.equal(resolved.targetPitch.octave, 4);
  assert.equal(resolved.staffStep, 6);
  assert.equal(resolved.snappedY, 86);
  assert.equal(resolved.usedCalibration, true);
});

test('ghost pitch calibration resolves bass-clef pitches from pointer Y instead of reusing treble-like defaults', () => {
  const resolved = resolveGhostPitchFromCalibration({
    pointerY: 86,
    clef: { sign: 'F', line: 4 },
    fallbackStaffStep: 4,
    fallbackSnappedY: 74,
    samples: [
      { index: 26, y: 50 }, // A3 top line
      { index: 25, y: 56 },
      { index: 24, y: 62 },
      { index: 23, y: 68 },
      { index: 22, y: 74 }, // D3 middle line
      { index: 21, y: 80 },
      { index: 20, y: 86 },
    ],
  });

  assert.equal(resolved.targetPitch.step, 'B');
  assert.equal(resolved.targetPitch.octave, 2);
  assert.equal(resolved.staffStep, 6);
  assert.equal(resolved.snappedY, 86);
  assert.equal(resolved.usedCalibration, true);
});

test('mouse entry pitch falls back when calibration escapes the visible staff range', () => {
  const constrained = constrainMouseEntryPitchResolution({
    resolution: {
      targetPitch: { step: 'C', octave: 0, diatonicIndex: 0 },
      snappedY: 371,
      staffStep: 40,
      usedCalibration: true,
    },
    clef: { sign: 'G', line: 2 },
    fallbackStaffStep: 6,
    fallbackSnappedY: 371,
    lineCount: 5,
  });

  assert.equal(constrained.targetPitch.step, 'G');
  assert.equal(constrained.targetPitch.octave, 4);
  assert.equal(constrained.staffStep, 6);
  assert.equal(constrained.snappedY, 371);
  assert.equal(constrained.usedCalibration, false);
});

test('semantic pitch debug bands expose bass ledger pitch lanes', () => {
  const coreDocument = {
    score: {
      parts: [{
        id: 'P1',
        sourcePartId: 'P1',
        staves: [{
          staffIndex: 2,
          measures: [{
            id: 'm1s2',
            measureNumber: 1,
            attributes: [{ clefs: [{ staffIndex: 2, sign: 'F', line: 4 }] }],
            voices: [],
          }],
        }],
      }],
    },
  } as any;
  const bands = buildSemanticPitchDebugBands({
    coreDocument,
    measureOverlays: [{
      measureId: 'm1s2',
      measureNumber: 1,
      pageIndex: 0,
      systemIndex: 0,
      domRect: { x: 40, y: 80, width: 220, height: 90 },
      staffDetails: [{
        staffIndex: 2,
        topLineDomY: 100,
        bottomLineDomY: 140,
        lineDistanceDom: 10,
        lineCount: 5,
      }],
    } as any],
    staffDetailsByMeasure: new Map([[1, [{
      staffIndex: 2,
      topLineDomY: 100,
      bottomLineDomY: 140,
      lineDistanceDom: 10,
      lineCount: 5,
    }]]]),
  });

  const a1 = bands.find((band) => band.staffIndex === 2 && band.pitch === 'A1');
  assert.ok(a1);
  assert.equal(a1.staffStep, 14);
  assert.equal(a1.centerY, 170);
  assert.equal(a1.rect.x, 40);
  assert.equal(a1.rect.width, 220);
  assert.ok(bands.some((band) => band.pitch === 'F1' && band.staffStep === 16));
  assert.equal(bands.some((band) => band.staffStep === 17), false);
});

test('semantic snap column debug lines span the whole rendered system', () => {
  const lines = buildSemanticSnapColumnDebugLines({
    snapPoints: [{
      id: 'snap-upper',
      measureId: 'm1s1',
      measureNumber: 1,
      pageIndex: 0,
      systemIndex: 0,
      partId: 'part:P1',
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      ratio: 0,
      x: 180,
      y: 120,
      isRest: false,
      synthetic: false,
      active: false,
      sourceCount: 1,
      distinctXCount: 1,
      suppressedSyntheticCount: 0,
      rawXs: [180],
      issue: null,
    }, {
      id: 'snap-lower',
      measureId: 'm1s2',
      measureNumber: 1,
      pageIndex: 0,
      systemIndex: 0,
      partId: 'part:P1',
      staffIndex: 2,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      ratio: 0,
      x: 180,
      y: 260,
      isRest: true,
      synthetic: false,
      active: true,
      sourceCount: 1,
      distinctXCount: 1,
      suppressedSyntheticCount: 0,
      rawXs: [180],
      issue: null,
    }] as any,
    systemOverlays: [{
      systemIndex: 0,
      pageIndex: 0,
      measureNumbers: [1],
      domRect: { x: 40, y: 80, width: 480, height: 260 },
      totalWidthWeight: 1,
      defaultStaffSpacing: 80,
      collisionPressure: 0,
      collisionMode: 'balanced',
      explicitBreakBefore: false,
      spacingGuideHeight: 0,
    }],
    measureOverlays: [],
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.x, 180);
  assert.equal(lines[0]!.top, 80);
  assert.equal(lines[0]!.bottom, 340);
  assert.deepEqual(lines[0]!.staves, [1, 2]);
  assert.equal(lines[0]!.active, true);
});

test('ghost preview metrics reserve horizontal room for accidentals before placement', () => {
  const natural = buildGhostPreviewMetrics(120, 90, 0, false, '4', 'up');
  const sharp = buildGhostPreviewMetrics(120, 90, 1, false, '4', 'up');
  const doubleFlat = buildGhostPreviewMetrics(120, 90, -2, true, '8', 'up');

  assert.equal(natural.previewLeft, 114.5);
  assert.ok(sharp.previewLeft < natural.previewLeft);
  assert.ok(sharp.previewWidth > natural.previewWidth);
  assert.ok(doubleFlat.previewWidth > sharp.previewWidth);
});

test('ghost preview metrics reserve extra left and lower room for down-stems', () => {
  const up = buildGhostPreviewMetrics(120, 90, 0, false, '8', 'up');
  const down = buildGhostPreviewMetrics(120, 90, 0, false, '8', 'down');

  assert.ok(down.previewLeft < up.previewLeft);
  assert.ok(down.previewHeight > up.previewHeight);
  assert.ok(down.noteheadCenterX > up.noteheadCenterX);
});

test('ghost preview metrics keep MuseScore long durations visible and finite', () => {
  const whole = buildGhostPreviewMetrics(120, 90, 0, false, '1', 'up');
  const breve = buildGhostPreviewMetrics(120, 90, 0, false, 'breve', 'up');
  const longa = buildGhostPreviewMetrics(120, 90, 0, false, 'long', 'down');

  assert.ok(Number.isFinite(breve.previewWidth));
  assert.ok(Number.isFinite(longa.previewWidth));
  assert.ok(breve.previewWidth > whole.previewWidth);
  assert.ok(longa.previewWidth > breve.previewWidth);
  assert.ok(longa.previewHeight > breve.previewHeight);
});

test('preview stem direction follows staff position and multi-voice defaults', () => {
  assert.equal(resolvePreviewStemDirection({ staffStep: 8, voiceId: 1 }), 'up');
  assert.equal(resolvePreviewStemDirection({ staffStep: 4, voiceId: 1 }), 'down');
  assert.equal(resolvePreviewStemDirection({ staffStep: 8, voiceId: 2 }), 'down');
});

test('detectActiveRhythmicSegment returns a tuplet segment for cursor ratios inside a triplet span', () => {
  const core = importMusicXmlToCore(TUPLET_XML);
  const measureId = core.score.parts[0]!.staves[0]!.measures[0]!.id;

  const insideTuplet = detectActiveRhythmicSegment(core, measureId, 1, 1, { num: 1, den: 12 });
  const outsideTuplet = detectActiveRhythmicSegment(core, measureId, 1, 1, { num: 1, den: 2 });

  assert.equal(insideTuplet.type, 'tuplet');
  assert.deepEqual(insideTuplet.timeScaling, { num: 2, den: 3 });
  assert.deepEqual(insideTuplet.start, { num: 0, den: 1 });
  assert.deepEqual(insideTuplet.end, { num: 1, den: 4 });
  assert.equal(outsideTuplet.type, 'base');
});

test('getEffectiveDuration scales durations inside tuplets', () => {
  const straight = getEffectiveDuration('8', false, null);
  const triplet = getEffectiveDuration('8', false, {
    timeScaling: { num: 2, den: 3 },
  });
  const dottedTripletQuarter = getEffectiveDuration('4', true, {
    timeScaling: { num: 2, den: 3 },
  });
  const breve = getEffectiveDuration('breve', false, null);
  const longa = getEffectiveDuration('long', false, null);
  const dottedBreve = getEffectiveDuration('breve', true, null);

  assert.deepEqual(straight, { num: 1, den: 8 });
  assert.deepEqual(triplet, { num: 1, den: 12 });
  assert.deepEqual(dottedTripletQuarter, { num: 1, den: 4 });
  assert.deepEqual(breve, { num: 2, den: 1 });
  assert.deepEqual(longa, { num: 4, den: 1 });
  assert.deepEqual(dottedBreve, { num: 3, den: 1 });
});

test('nested tuplets resolve to the innermost segment and compound time scaling', () => {
  const core = {
    score: {
      id: 'score',
      parts: [{
        id: 'part',
        staves: [{
          id: 'staff',
          staffIndex: 1,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{ id: 'a1', time: { beats: 4, beatType: 4 }, divisions: 12, clefs: [] }],
            voices: [{
              id: 'v1',
              voiceId: 1,
              events: [
                { id: 'e1', staffIndex: 1, voiceId: 1, measureNumber: 1, timestampNum: 0, timestampDen: 12, durationDivisions: 2 },
                { id: 'e2', staffIndex: 1, voiceId: 1, measureNumber: 1, timestampNum: 2, timestampDen: 12, durationDivisions: 2 },
                { id: 'e3', staffIndex: 1, voiceId: 1, measureNumber: 1, timestampNum: 4, timestampDen: 12, durationDivisions: 2 },
                { id: 'e4', staffIndex: 1, voiceId: 1, measureNumber: 1, timestampNum: 6, timestampDen: 12, durationDivisions: 1 },
                { id: 'e5', staffIndex: 1, voiceId: 1, measureNumber: 1, timestampNum: 7, timestampDen: 12, durationDivisions: 1 },
                { id: 'e6', staffIndex: 1, voiceId: 1, measureNumber: 1, timestampNum: 8, timestampDen: 12, durationDivisions: 1 },
                { id: 'e7', staffIndex: 1, voiceId: 1, measureNumber: 1, timestampNum: 9, timestampDen: 12, durationDivisions: 1 },
                { id: 'e8', staffIndex: 1, voiceId: 1, measureNumber: 1, timestampNum: 10, timestampDen: 12, durationDivisions: 1 },
              ],
            }],
          }],
        }],
      }],
    },
    tuplets: [
      { id: 'outer', number: 1, eventIds: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'], actualNotes: 8, normalNotes: 6 },
      { id: 'inner', number: 2, eventIds: ['e4', 'e5', 'e6', 'e7', 'e8'], actualNotes: 5, normalNotes: 4 },
    ],
  } as any;

  const segment = detectActiveRhythmicSegment(core, 'm1', 1, 1, { num: 7, den: 12 });
  const nestedDuration = getEffectiveDuration('8', false, {
    timeScaling: segment.timeScaling,
    parent: segment.parent,
  } as any);

  assert.equal(segment.type, 'tuplet');
  assert.deepEqual(segment.timeScaling, { num: 4, den: 5 });
  assert.equal(segment.parent?.type, 'tuplet');
  assert.deepEqual(segment.parent?.timeScaling, { num: 3, den: 4 });
  assert.equal(segment.depth, 2);
  assert.deepEqual(nestedDuration, { num: 3, den: 40 });
});
