import { DOMParser, XMLSerializer, Document as XmlDocument } from '@xmldom/xmldom';
import { resolveGuitarFretPitch, resolveGuitarTuning } from '@/src/score-input/guitar-fretboard';

export type ArticulationKind =
  | 'staccato' | 'staccatissimo' | 'accent' | 'strong-accent' | 'tenuto' | 'fermata';

export type DynamicKind =
  | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff' | 'sfz';

export type BarlineKind =
  | 'regular' | 'double' | 'final' | 'repeat-start' | 'repeat-end';

export interface NoteLocator {
  coreEntityId?: string | null;
  coreMeasureId?: string | null;
  corePartId?: string | null;
  step?: string;
  octave?: number;
  alter?: number;
  isRest?: boolean;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
}

export interface NoteClipboardItem {
  isRest: boolean;
  step: string;
  octave: number;
  alter: number;
  durationType: string;
  isDotted: boolean;
  voiceId: number;
  staffIndex: number;
  measureNumber: number;
  timestampNum: number;
  timestampDen: number;
}

export interface NotePitchSnapshot {
  step: string;
  octave: number;
  alter: number;
  isRest: boolean;
}

export type NoteEditOperation =
  | ({ type: 'changeNotePitch'; step: string; octave: number; alter: number } & NoteLocator)
  | ({ type: 'changeNoteDuration'; durationType: string; isDotted?: boolean } & NoteLocator)
  | ({ type: 'deleteNote' } & NoteLocator)
  | ({ type: 'rippleDelete' } & NoteLocator)
  | { type: 'rippleDeleteRange'; range: { start: NoteLocator; end: NoteLocator } }
  | { type: 'insertNote'; coreMeasureId?: string | null; corePartId?: string | null; measureNumber: number; staffIndex: number; voiceId: number; afterTimestampNum: number; afterTimestampDen: number; step: string; octave: number; alter: number; durationType: string; isDotted?: boolean; notehead?: 'slash'; stem?: 'none'; guitar?: { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number; tuning?: string; techniques?: string[] } }
  | { type: 'insertRest'; coreMeasureId?: string | null; corePartId?: string | null; measureNumber: number; staffIndex: number; voiceId: number; afterTimestampNum: number; afterTimestampDen: number; durationType: string; isDotted?: boolean }
  | { type: 'insertNoteAt'; coreMeasureId?: string | null; corePartId?: string | null; measureNumber: number; staffIndex: number; voiceId: number; timestampNum: number; timestampDen: number; step: string; octave: number; alter: number; durationType: string; isDotted?: boolean; asChord?: boolean; preserveOverflow?: boolean; notehead?: 'slash'; stem?: 'none'; guitar?: { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number; tuning?: string; techniques?: string[] } }
  | { type: 'insertRestAt'; coreMeasureId?: string | null; corePartId?: string | null; measureNumber: number; staffIndex: number; voiceId: number; timestampNum: number; timestampDen: number; durationType: string; isDotted?: boolean }
  | ({ type: 'setNoteStyle'; notehead?: 'slash'; stem?: 'none' } & NoteLocator)
  | ({ type: 'setGuitarFret'; string: 1 | 2 | 3 | 4 | 5 | 6; fret: number; tuning?: string; techniques?: string[] } & NoteLocator)
  | ({ type: 'toggleGuitarTechnique'; technique: string } & NoteLocator)
  | ({ type: 'toggleArticulation'; articulation: ArticulationKind } & NoteLocator)
  | ({ type: 'clearArticulations' } & NoteLocator)
  | ({ type: 'addDynamic'; dynamic: DynamicKind; placement?: 'above' | 'below' } & NoteLocator)
  | ({ type: 'toggleTie' } & NoteLocator)
  | ({ type: 'setTiePlacement'; placement: 'above' | 'below' } & NoteLocator)
  | ({ type: 'toggleSlur'; stopLocator?: NoteLocator } & NoteLocator)
  | ({ type: 'setSlurPlacement'; placement: 'above' | 'below'; stopLocator: NoteLocator } & NoteLocator)
  | ({ type: 'transposeChromatic'; semitones: number } & NoteLocator)
  | { type: 'setBarline'; measureNumber: number; barline: BarlineKind };

/** Maps MusicXML note type names to their relative duration in quarter-note units */
const NOTE_TYPE_QUARTERS: Record<string, number> = {
  'maxima': 32, 'long': 16, 'breve': 8, 'whole': 4, 'half': 2,
  'quarter': 1, 'eighth': 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625,
};

let cachedReadXml = '';
let cachedReadDoc: XmlDocument | null = null;

function parseReadOnlyXml(xml: string): XmlDocument {
  if (cachedReadDoc && cachedReadXml === xml) return cachedReadDoc;
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  cachedReadXml = xml;
  cachedReadDoc = doc;
  return doc;
}

/** Get the first <divisions> value in the document. */
function getDivisions(doc: XmlDocument): number {
  const divEls = doc.getElementsByTagName('divisions');
  if (divEls.length === 0) return 1;
  return parseInt(divEls[0].textContent ?? '1', 10) || 1;
}

type XmlElementNode = NonNullable<XmlDocument['documentElement']>;

function getMeasureDurationDivisions(measure: XmlElementNode, divisions: number): number {
  const beats = parseInt(measure.getElementsByTagName('beats')[0]?.textContent ?? '4', 10) || 4;
  const beatType = parseInt(measure.getElementsByTagName('beat-type')[0]?.textContent ?? '4', 10) || 4;
  return Math.max(1, Math.round((beats * divisions * 4) / beatType));
}

/**
 * Find the <note> element in the given measure matching the given staff/voice/timestamp.
 * measureNumber is 1-based. staffIndex and voiceId are 1-based.
 * timestampNum/Den is the beat fraction within the measure (VoiceEntry.Timestamp from OSMD).
 */
export function findNoteElement(
  doc: XmlDocument,
  opts: {
    corePartId?: string | null;
    coreMeasureId?: string | null;
    measureNumber: number;
    staffIndex: number;
    voiceId: number;
    timestampNum: number;
    timestampDen: number;
  }
): XmlDocument['documentElement'] | null {
  const { corePartId, measureNumber, staffIndex, voiceId, timestampNum, timestampDen } = opts;
  const divisions = getDivisions(doc);

  // Target duration offset in divisions from start of measure
  const targetOffset = Math.round((timestampNum / Math.max(timestampDen, 1)) * divisions * 4);

  const partMatches = (partId: string | null | undefined) => {
    if (!corePartId) return true;
    if (!partId) return false;
    if (partId === corePartId) return true;
    return `part:${partId}` === corePartId || partId === corePartId.replace(/^part:/, '');
  };
  const parts = Array.from(doc.getElementsByTagName('part'));
  const measures = parts
    .filter((part) => partMatches(part.getAttribute('id')))
    .flatMap((part) => Array.from(part.getElementsByTagName('measure')));
  let targetMeasure: typeof measures[0] | null = null;
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    const num = parseInt(m.getAttribute('number') ?? '0', 10);
    if (num === measureNumber) { targetMeasure = m; break; }
  }
  if (!targetMeasure) return null;

  let cursorOffset = 0;

  for (let i = 0; i < targetMeasure.childNodes.length; i++) {
    const childNode = targetMeasure.childNodes[i];
    if (!childNode || childNode.nodeType !== 1) continue;
    const child = childNode as unknown as Element;

    if (child.tagName === 'backup') {
      const dur = parseInt(child.getElementsByTagName('duration')[0]?.textContent ?? '0', 10) || 0;
      cursorOffset = Math.max(0, cursorOffset - dur);
      continue;
    }

    if (child.tagName === 'forward') {
      const dur = parseInt(child.getElementsByTagName('duration')[0]?.textContent ?? '0', 10) || 0;
      cursorOffset += dur;
      continue;
    }

    if (child.tagName !== 'note') {
      continue;
    }

    const note = child;
    const staffEl = note.getElementsByTagName('staff')[0];
    const voiceEl = note.getElementsByTagName('voice')[0];
    const noteStaff = staffEl ? parseInt(staffEl.textContent ?? '1', 10) : 1;
    const noteVoice = voiceEl ? parseInt(voiceEl.textContent ?? '1', 10) : 1;
    const isChord = note.getElementsByTagName('chord').length > 0;
    const noteOffset = isChord ? cursorOffset : cursorOffset;

    if (noteStaff === staffIndex && noteVoice === voiceId) {
      if (Math.abs(noteOffset - targetOffset) < 1) return note as unknown as XmlDocument['documentElement'];
    }

    if (!isChord) {
      const durationEl = note.getElementsByTagName('duration')[0];
      const dur = durationEl ? parseInt(durationEl.textContent ?? '0', 10) : 0;
      cursorOffset += dur;
    }
  }

  return null;
}

function findMeasureForLocator(doc: XmlDocument, locator: NoteLocator): XmlElementNode | null {
  const partMatches = (partId: string | null | undefined) => {
    if (!locator.corePartId) return true;
    if (!partId) return false;
    if (partId === locator.corePartId) return true;
    return `part:${partId}` === locator.corePartId || partId === locator.corePartId.replace(/^part:/, '');
  };
  const parts = Array.from(doc.getElementsByTagName('part')).filter((part) => partMatches(part.getAttribute('id')));
  for (const part of parts) {
    const measure = Array.from(part.getElementsByTagName('measure')).find((entry) => (
      parseInt(entry.getAttribute('number') ?? '0', 10) === locator.measureNumber
    ));
    if (measure) return measure;
  }
  return null;
}

function findMeasureForScopedEdit(
  doc: XmlDocument,
  operation: { corePartId?: string | null; measureNumber: number },
): XmlElementNode | null {
  const partMatches = (partId: string | null | undefined) => {
    if (!operation.corePartId) return true;
    if (!partId) return false;
    if (partId === operation.corePartId) return true;
    return `part:${partId}` === operation.corePartId || partId === operation.corePartId.replace(/^part:/, '');
  };
  const parts = Array.from(doc.getElementsByTagName('part')).filter((part) => partMatches(part.getAttribute('id')));
  for (const part of parts) {
    const measure = Array.from(part.getElementsByTagName('measure')).find((entry) => (
      parseInt(entry.getAttribute('number') ?? '0', 10) === operation.measureNumber
    ));
    if (measure) return measure;
  }
  return null;
}

function removeDirectChildrenByTag(node: XmlElementNode, tag: string) {
  Array.from(node.childNodes).forEach((child) => {
    const element = child as XmlElementNode;
    if (element?.nodeType === 1 && element.tagName === tag) node.removeChild(element);
  });
}

function setNoteDurationElements(
  doc: XmlDocument,
  note: XmlElementNode,
  durationType: string,
  durationDivisions: number,
  isDotted: boolean | undefined,
) {
  const typeEl = note.getElementsByTagName('type')[0];
  if (typeEl) {
    typeEl.textContent = durationType;
  } else {
    const nextSibling = note.getElementsByTagName('staff')[0] ?? null;
    const createdType = doc.createElement('type');
    createdType.textContent = durationType;
    note.appendChild(createdType);
    if (nextSibling) note.insertBefore(createdType, nextSibling);
  }

  const durationEl = note.getElementsByTagName('duration')[0];
  if (durationEl) durationEl.textContent = String(durationDivisions);

  const existingDots = Array.from(note.getElementsByTagName('dot'));
  existingDots.forEach((dot) => note.removeChild(dot));
  if (isDotted) note.appendChild(doc.createElement('dot'));
}

function measureHasTabStaff(measure: XmlElementNode) {
  return Array.from(measure.getElementsByTagName('clef')).some((clef) => (
    (clef.getElementsByTagName('sign')[0]?.textContent ?? '').toUpperCase() === 'TAB'
  )) || Array.from(measure.getElementsByTagName('staff-details')).some((details) => (
    (details.getElementsByTagName('staff-type')[0]?.textContent ?? '').toLowerCase() === 'tab'
  ));
}

function isTabStaff(measure: XmlElementNode, staffIndex: number) {
  return Array.from(measure.getElementsByTagName('clef')).some((clef) => (
    parseInt(clef.getAttribute('number') ?? '1', 10) === staffIndex
    && (clef.getElementsByTagName('sign')[0]?.textContent ?? '').toUpperCase() === 'TAB'
  )) || Array.from(measure.getElementsByTagName('staff-details')).some((details) => (
    parseInt(details.getAttribute('number') ?? '1', 10) === staffIndex
    && (details.getElementsByTagName('staff-type')[0]?.textContent ?? '').toLowerCase() === 'tab'
  ));
}

/** Convert a MusicXML note type string to duration in divisions */
export function noteTypeToDivisions(type: string, divisions: number): number {
  const quarters = NOTE_TYPE_QUARTERS[type] ?? 1;
  return Math.round(quarters * divisions);
}

export function extractNoteClipboardItem(xml: string, locator: NoteLocator): NoteClipboardItem | null {
  const doc = parseReadOnlyXml(xml);
  const note = findNoteElement(doc, locator);
  if (!note) return null;
  const pitch = note.getElementsByTagName('pitch')[0];
  const step = pitch?.getElementsByTagName('step')[0]?.textContent ?? 'C';
  const octave = parseInt(pitch?.getElementsByTagName('octave')[0]?.textContent ?? '4', 10) || 4;
  const alter = parseInt(pitch?.getElementsByTagName('alter')[0]?.textContent ?? '0', 10) || 0;
  const type = note.getElementsByTagName('type')[0]?.textContent ?? 'quarter';
  const voiceId = parseInt(note.getElementsByTagName('voice')[0]?.textContent ?? String(locator.voiceId), 10) || locator.voiceId;
  const staffIndex = parseInt(note.getElementsByTagName('staff')[0]?.textContent ?? String(locator.staffIndex), 10) || locator.staffIndex;
  return {
    isRest: note.getElementsByTagName('rest').length > 0 || !pitch,
    step,
    octave,
    alter,
    durationType: type,
    isDotted: note.getElementsByTagName('dot').length > 0,
    voiceId,
    staffIndex,
    measureNumber: locator.measureNumber,
    timestampNum: locator.timestampNum,
    timestampDen: locator.timestampDen,
  };
}

export function extractNotePitchSnapshot(xml: string, locator: NoteLocator): NotePitchSnapshot | null {
  const doc = parseReadOnlyXml(xml);
  const note = findNoteElement(doc, locator);
  if (!note) return null;
  const pitch = note.getElementsByTagName('pitch')[0];
  return {
    isRest: note.getElementsByTagName('rest').length > 0 || !pitch,
    step: pitch?.getElementsByTagName('step')[0]?.textContent ?? 'C',
    octave: parseInt(pitch?.getElementsByTagName('octave')[0]?.textContent ?? '4', 10) || 4,
    alter: parseInt(pitch?.getElementsByTagName('alter')[0]?.textContent ?? '0', 10) || 0,
  };
}

function warnMissingNote(op: NoteLocator, context: string) {
  // eslint-disable-next-line no-console
  console.warn('[nex-note:note-editor] target note not found', {
    context,
    measureNumber: op.measureNumber,
    staffIndex: op.staffIndex,
    voiceId: op.voiceId,
    timestampNum: op.timestampNum,
    timestampDen: op.timestampDen,
  });
}

/** Apply a single note edit operation to the XML string, returning the patched XML. */
export function applyNoteEdit(xml: string, op: NoteEditOperation): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const divisions = getDivisions(doc);
  const editedMeasures = new Set<El>();

  if (op.type === 'changeNotePitch') {
    const note = findNoteElement(doc, op);
    if (note) {
      const existing = note.getElementsByTagName('pitch')[0];
      if (existing) {
        const stepEl = existing.getElementsByTagName('step')[0];
        const octaveEl = existing.getElementsByTagName('octave')[0];
        const alterEl = existing.getElementsByTagName('alter')[0];
        if (stepEl) stepEl.textContent = op.step;
        if (octaveEl) octaveEl.textContent = String(op.octave);
        if (op.alter !== 0) {
          if (alterEl) {
            alterEl.textContent = String(op.alter);
          } else {
            const a = doc.createElement('alter');
            a.textContent = String(op.alter);
            existing.insertBefore(a, octaveEl ?? null);
          }
        } else if (alterEl) {
          existing.removeChild(alterEl);
        }
      }
      // Remove <rest/> if present (turning rest into pitched note)
      const restEl = note.getElementsByTagName('rest')[0];
      if (restEl) note.removeChild(restEl);
      const measure = findMeasureForLocator(doc, op);
      if (measure) editedMeasures.add(measure as El);
    } else {
      warnMissingNote(op, 'changeNotePitch');
    }
  } else if (op.type === 'changeNoteDuration') {
    const note = findNoteElement(doc, op);
    if (note) {
      const measure = findMeasureForLocator(doc, op);
      const baseDuration = noteTypeToDivisions(op.durationType, divisions);
      const requestedDuration = op.isDotted ? Math.round(baseDuration * 1.5) : baseDuration;
      const previousDuration = parseInt(note.getElementsByTagName('duration')[0]?.textContent ?? '0', 10) || 0;
      const measureDuration = measure ? getMeasureDurationDivisions(measure, divisions) : Number.POSITIVE_INFINITY;
      const targetOffset = Math.round((op.timestampNum / Math.max(op.timestampDen, 1)) * divisions * 4);
      const nextDuration = Math.max(1, Math.min(requestedDuration, Math.max(1, measureDuration - targetOffset)));
      const eventsBeforeChange = measure ? collectMeasureVoiceEvents(measure) : [];
      setNoteDurationElements(doc, note, op.durationType, nextDuration, op.isDotted);

      if (measure && nextDuration > previousDuration) {
        consumeFollowingLegacyDurationSlots(doc, measure, op, targetOffset, previousDuration, nextDuration, note, eventsBeforeChange);
      } else if (measure) {
        removeLegacyBeamTagsForVoice(measure, op.staffIndex, op.voiceId);
      }
      if (measure) editedMeasures.add(measure as El);
    } else {
      warnMissingNote(op, 'changeNoteDuration');
    }
  } else if (op.type === 'deleteNote') {
    const note = findNoteElement(doc, op);
    if (note && note.parentNode) {
      const durationEl = note.getElementsByTagName('duration')[0];
      const typeEl = note.getElementsByTagName('type')[0];
      const dur = durationEl?.textContent ?? String(divisions);
      const typ = typeEl?.textContent ?? 'quarter';
      const voiceEl = note.getElementsByTagName('voice')[0];
      const staffEl = note.getElementsByTagName('staff')[0];

      const rest = doc.createElement('note');
      const restTag = doc.createElement('rest');
      rest.appendChild(restTag);
      const durNew = doc.createElement('duration');
      durNew.textContent = dur;
      rest.appendChild(durNew);
      if (voiceEl) {
        const v = doc.createElement('voice');
        v.textContent = voiceEl.textContent ?? '1';
        rest.appendChild(v);
      }
      const typeNew = doc.createElement('type');
      typeNew.textContent = typ;
      rest.appendChild(typeNew);
      if (staffEl) {
        const s = doc.createElement('staff');
        s.textContent = staffEl.textContent ?? '1';
        rest.appendChild(s);
      }

      note.parentNode.replaceChild(rest, note);
      const measure = findMeasureForLocator(doc, op);
      if (measure) editedMeasures.add(measure as El);
    } else {
      warnMissingNote(op, 'deleteNote');
    }
  } else if (op.type === 'toggleArticulation') {
    const note = findNoteElement(doc, op);
    if (note) toggleArticulationOnNote(doc, note, op.articulation);
    else warnMissingNote(op, 'toggleArticulation');
  } else if (op.type === 'clearArticulations') {
    const note = findNoteElement(doc, op);
    if (note) clearArticulationsOnNote(note);
    else warnMissingNote(op, 'clearArticulations');
  } else if (op.type === 'addDynamic') {
    const note = findNoteElement(doc, op);
    if (note) insertDynamicBeforeNote(doc, note, op.dynamic, op.staffIndex, op.placement);
    else warnMissingNote(op, 'addDynamic');
  } else if (op.type === 'toggleTie') {
    const note = findNoteElement(doc, op);
    if (note) toggleTieOnNote(doc, note);
    else warnMissingNote(op, 'toggleTie');
  } else if (op.type === 'setTiePlacement') {
    const note = findNoteElement(doc, op);
    if (note) setTiePlacementOnNote(doc, note, op.placement);
    else warnMissingNote(op, 'setTiePlacement');
  } else if (op.type === 'transposeChromatic') {
    const note = findNoteElement(doc, op);
    if (note) transposeNoteChromatically(doc, note, op.semitones);
    else warnMissingNote(op, 'transposeChromatic');
  } else if (op.type === 'setGuitarFret') {
    const note = findNoteElement(doc, op);
    if (note) {
      const tuning = resolveGuitarTuning(op.tuning);
      const pitch = resolveGuitarFretPitch(op.string, op.fret, tuning);
      setNotePitchElements(doc, note, pitch);
      setGuitarTechnicalElements(doc, note, op.string, pitch.fret, op.techniques);

      const measure = findMeasureForLocator(doc, op);
      const paired = measure ? findPairedTabNotationNote(measure, op) : null;
      if (paired) {
        setNotePitchElements(doc, paired.note, pitch);
        if (paired.isTab) {
          setGuitarTechnicalElements(doc, paired.note, op.string, pitch.fret, op.techniques);
        }
      }
    } else {
      warnMissingNote(op, 'setGuitarFret');
    }
  } else if (op.type === 'setBarline') {
    setMeasureRightBarline(doc, op.measureNumber, op.barline);
  } else if (op.type === 'insertNote' || op.type === 'insertRest' || op.type === 'insertNoteAt' || op.type === 'insertRestAt') {
    const targetMeasure = findMeasureForScopedEdit(doc, op);
    if (targetMeasure) {
      const note = buildInsertedNote(doc, divisions, op);
      if (op.type === 'insertNoteAt' || op.type === 'insertRestAt') {
        const insertedIntoSpanningRest = splitAbsoluteInsertAcrossSpanningRest(
          doc,
          targetMeasure as El,
          op,
          note,
        );
        if (!insertedIntoSpanningRest) {
          const placement = findAbsoluteInsertionPoint(doc, targetMeasure as El, {
            measureNumber: op.measureNumber,
            staffIndex: op.staffIndex,
            voiceId: op.voiceId,
            timestampNum: op.timestampNum,
            timestampDen: op.timestampDen,
          });
          if (placement?.parentNode) {
            placement.parentNode.insertBefore(note, placement);
          } else {
            targetMeasure.appendChild(note);
          }
        }
      } else {
        const anchor = findNoteElement(doc, {
          corePartId: op.corePartId,
          coreMeasureId: op.coreMeasureId,
          measureNumber: op.measureNumber,
          staffIndex: op.staffIndex,
          voiceId: op.voiceId,
          timestampNum: op.afterTimestampNum,
          timestampDen: op.afterTimestampDen,
        });
        if (!anchor) {
          // eslint-disable-next-line no-console
          console.warn('[nex-note:note-editor] anchor note not found for insertion', {
            context: op.type,
            measureNumber: op.measureNumber,
            staffIndex: op.staffIndex,
            voiceId: op.voiceId,
            afterTimestampNum: op.afterTimestampNum,
            afterTimestampDen: op.afterTimestampDen,
          });
        }
        const insertionPoint = anchor ? findLastChordSibling(anchor as El) : null;
        if (insertionPoint?.parentNode) {
          if (insertionPoint.nextSibling) insertionPoint.parentNode.insertBefore(note, insertionPoint.nextSibling);
          else insertionPoint.parentNode.appendChild(note);
        } else {
          const notesList = targetMeasure.getElementsByTagName('note');
          const lastNote = notesList.length > 0 ? notesList[notesList.length - 1] : null;
          if (lastNote?.nextSibling) targetMeasure.insertBefore(note, lastNote.nextSibling);
          else targetMeasure.appendChild(note);
        }
      }
      editedMeasures.add(targetMeasure as El);
    }
  }

  for (const measure of editedMeasures) {
    normalizeLegacyMeasureVoices(doc, measure, divisions);
  }
  pruneDanglingLegacyTies(doc);

  const serialized = new XMLSerializer().serializeToString(doc);
  if (serialized.startsWith('<?xml')) return serialized;
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + serialized;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers — articulations, dynamics, ties, transpose, barlines
// ─────────────────────────────────────────────────────────────────────────────

type El = ReturnType<XmlDocument['createElement']>;

function buildInsertedNote(
  doc: XmlDocument,
  divisions: number,
  op: Extract<NoteEditOperation, { type: 'insertNote' | 'insertRest' | 'insertNoteAt' | 'insertRestAt' }>,
): El {
  const baseDur = noteTypeToDivisions(op.durationType, divisions);
  const dur = op.isDotted ? Math.round(baseDur * 1.5) : baseDur;
  const note = doc.createElement('note');

  if (op.type === 'insertNote' || op.type === 'insertNoteAt') {
    const pitch = doc.createElement('pitch');
    const stepEl = doc.createElement('step');
    stepEl.textContent = op.step;
    pitch.appendChild(stepEl);
    if (op.alter !== 0) {
      const alterEl = doc.createElement('alter');
      alterEl.textContent = String(op.alter);
      pitch.appendChild(alterEl);
    }
    const octEl = doc.createElement('octave');
    octEl.textContent = String(op.octave);
    pitch.appendChild(octEl);
    note.appendChild(pitch);
  } else {
    note.appendChild(doc.createElement('rest'));
  }

  const durEl = doc.createElement('duration');
  durEl.textContent = String(dur);
  note.appendChild(durEl);
  const voiceEl = doc.createElement('voice');
  voiceEl.textContent = String(op.voiceId);
  note.appendChild(voiceEl);
  const typeEl = doc.createElement('type');
  typeEl.textContent = op.durationType;
  note.appendChild(typeEl);
  if (op.isDotted) note.appendChild(doc.createElement('dot'));
  const staffEl = doc.createElement('staff');
  staffEl.textContent = String(op.staffIndex);
  note.appendChild(staffEl);
  if ((op.type === 'insertNote' || op.type === 'insertNoteAt') && op.guitar) {
    setGuitarTechnicalElements(doc, note, op.guitar.string, op.guitar.fret, op.guitar.techniques);
  }
  return note;
}

function describeDurationFragments(divisions: number, durationDivisions: number) {
  const candidates = Object.entries(NOTE_TYPE_QUARTERS)
    .flatMap(([type, quarters]) => {
      const baseDuration = Math.round(quarters * divisions);
      const dottedDuration = Math.round(quarters * divisions * 1.5);
      return [
        baseDuration > 0 ? { durationDivisions: baseDuration, type, dotted: false } : null,
        dottedDuration > baseDuration ? { durationDivisions: dottedDuration, type, dotted: true } : null,
      ];
    })
    .filter((entry): entry is { durationDivisions: number; type: string; dotted: boolean } => Boolean(entry))
    .sort((left, right) => (
      right.durationDivisions - left.durationDivisions
      || Number(left.dotted) - Number(right.dotted)
    ));

  const fragments: Array<{ durationDivisions: number; type?: string; dotted?: boolean }> = [];
  let remaining = durationDivisions;

  while (remaining > 0) {
    const candidate = candidates.find((entry) => entry.durationDivisions <= remaining);
    if (!candidate) {
      fragments.push({ durationDivisions: remaining });
      break;
    }
    fragments.push(candidate);
    remaining -= candidate.durationDivisions;
  }

  return fragments;
}

function buildRestNote(
  doc: XmlDocument,
  voiceId: number,
  staffIndex: number,
  fragment: { durationDivisions: number; type?: string; dotted?: boolean },
): El {
  const note = doc.createElement('note');
  note.appendChild(doc.createElement('rest'));

  const durationEl = doc.createElement('duration');
  durationEl.textContent = String(fragment.durationDivisions);
  note.appendChild(durationEl);

  const voiceEl = doc.createElement('voice');
  voiceEl.textContent = String(voiceId);
  note.appendChild(voiceEl);

  if (fragment.type) {
    const typeEl = doc.createElement('type');
    typeEl.textContent = fragment.type;
    note.appendChild(typeEl);
  }

  if (fragment.dotted) note.appendChild(doc.createElement('dot'));

  const staffEl = doc.createElement('staff');
  staffEl.textContent = String(staffIndex);
  note.appendChild(staffEl);
  return note;
}

function collectMeasureVoiceEvents(measure: El) {
  const events: Array<{
    node: El;
    startOffset: number;
    durationDivisions: number;
    staffIndex: number;
    voiceId: number;
    isChord: boolean;
    isRest: boolean;
    hasGuitarTechnical: boolean;
  }> = [];
  let cursorOffset = 0;

  for (let i = 0; i < measure.childNodes.length; i++) {
    const childNode = measure.childNodes[i];
    if (!childNode || childNode.nodeType !== 1) continue;
    const child = childNode as unknown as El;

    if (child.tagName === 'backup') {
      const duration = parseInt(child.getElementsByTagName('duration')[0]?.textContent ?? '0', 10) || 0;
      cursorOffset = Math.max(0, cursorOffset - duration);
      continue;
    }

    if (child.tagName === 'forward') {
      const duration = parseInt(child.getElementsByTagName('duration')[0]?.textContent ?? '0', 10) || 0;
      cursorOffset += duration;
      continue;
    }

    if (child.tagName !== 'note') continue;

    const durationDivisions = parseInt(child.getElementsByTagName('duration')[0]?.textContent ?? '0', 10) || 0;
    const isChord = child.getElementsByTagName('chord').length > 0;
    events.push({
      node: child,
      startOffset: cursorOffset,
      durationDivisions,
      staffIndex: parseInt(child.getElementsByTagName('staff')[0]?.textContent ?? '1', 10) || 1,
      voiceId: parseInt(child.getElementsByTagName('voice')[0]?.textContent ?? '1', 10) || 1,
      isChord,
      isRest: child.getElementsByTagName('rest').length > 0 || child.getElementsByTagName('pitch').length === 0,
      hasGuitarTechnical: child.getElementsByTagName('technical').length > 0,
    });

    if (!isChord) cursorOffset += durationDivisions;
  }

  return events;
}

function isMeasureCursorNode(node: unknown) {
  const element = node as El | null | undefined;
  return element?.nodeType === 1
    && (element.tagName === 'note' || element.tagName === 'backup' || element.tagName === 'forward');
}

function createBackup(doc: XmlDocument, durationDivisions: number) {
  const backup = doc.createElement('backup');
  const duration = doc.createElement('duration');
  duration.textContent = String(durationDivisions);
  backup.appendChild(duration);
  return backup;
}

function measureInsertionReference(measure: El) {
  for (let index = 0; index < measure.childNodes.length; index += 1) {
    const child = measure.childNodes[index] as El;
    if (child?.nodeType === 1 && child.tagName === 'barline' && child.getAttribute('location') === 'right') {
      return child;
    }
  }
  return null;
}

function normalizeLegacyMeasureVoices(doc: XmlDocument, measure: El, divisions: number) {
  const measureDuration = getMeasureDurationDivisions(measure, divisions);
  const events = collectMeasureVoiceEvents(measure)
    .filter((event) => event.durationDivisions > 0)
    .sort((left, right) => (
      left.staffIndex - right.staffIndex
      || left.voiceId - right.voiceId
      || left.startOffset - right.startOffset
      || Number(left.isChord) - Number(right.isChord)
    ));
  if (events.length === 0) return;

  const grouped = new Map<string, typeof events>();
  for (const event of events) {
    const key = `${event.staffIndex}:${event.voiceId}`;
    const group = grouped.get(key) ?? [];
    group.push(event);
    grouped.set(key, group);
  }

  const rebuiltNodes: El[] = [];
  const groups = [...grouped.values()].sort((left, right) => (
    (left[0]?.staffIndex ?? 1) - (right[0]?.staffIndex ?? 1)
    || (left[0]?.voiceId ?? 1) - (right[0]?.voiceId ?? 1)
  ));

  groups.forEach((group, groupIndex) => {
    let cursor = 0;
    let lastRootStart: number | null = null;
    const staffIndex = group[0]?.staffIndex ?? 1;
    const voiceId = group[0]?.voiceId ?? 1;

    for (const event of group) {
      if (event.isChord) {
        if (lastRootStart === event.startOffset) rebuiltNodes.push(event.node);
        continue;
      }

      const startOffset = Math.max(0, Math.min(event.startOffset, measureDuration));
      if (startOffset < cursor || startOffset >= measureDuration) continue;

      if (startOffset > cursor) {
        const gapDuration = startOffset - cursor;
        for (const fragment of describeDurationFragments(divisions, gapDuration)) {
          rebuiltNodes.push(buildRestNote(doc, voiceId, staffIndex, fragment));
        }
      }

      const clampedDuration = Math.max(1, Math.min(event.durationDivisions, measureDuration - startOffset));
      if (clampedDuration !== event.durationDivisions) {
        const described = describeDurationFragments(divisions, clampedDuration)[0];
        setNoteDurationElements(
          doc,
          event.node,
          described?.type ?? event.node.getElementsByTagName('type')[0]?.textContent ?? 'quarter',
          clampedDuration,
          described?.dotted,
        );
      }
      rebuiltNodes.push(event.node);
      cursor = startOffset + clampedDuration;
      lastRootStart = startOffset;
    }

    if (cursor < measureDuration) {
      const gapDuration = measureDuration - cursor;
      for (const fragment of describeDurationFragments(divisions, gapDuration)) {
        rebuiltNodes.push(buildRestNote(doc, voiceId, staffIndex, fragment));
      }
    }

    if (groupIndex < groups.length - 1) {
      rebuiltNodes.push(createBackup(doc, measureDuration));
    }
  });

  Array.from(measure.childNodes).forEach((child) => {
    if (isMeasureCursorNode(child)) measure.removeChild(child);
  });

  const ref = measureInsertionReference(measure);
  for (const node of rebuiltNodes) {
    measure.insertBefore(node, ref);
  }
}

function ensureDirectChild(doc: XmlDocument, parent: XmlElementNode, tag: string) {
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    const child = parent.childNodes[index] as XmlElementNode;
    if (child?.nodeType === 1 && child.tagName === tag) return child;
  }
  const created = doc.createElement(tag);
  parent.appendChild(created);
  return created;
}

function setNotePitchElements(
  doc: XmlDocument,
  note: XmlElementNode,
  pitch: { step: string; octave: number; alter: number },
) {
  const restEl = note.getElementsByTagName('rest')[0];
  if (restEl) note.removeChild(restEl);

  let pitchEl = note.getElementsByTagName('pitch')[0] as XmlElementNode | undefined;
  if (!pitchEl) {
    pitchEl = doc.createElement('pitch');
    note.insertBefore(pitchEl, note.firstChild);
  }

  ensureDirectChild(doc, pitchEl, 'step').textContent = pitch.step;
  const existingAlter = pitchEl.getElementsByTagName('alter')[0];
  if (pitch.alter !== 0) {
    const alterEl = existingAlter ?? doc.createElement('alter');
    alterEl.textContent = String(pitch.alter);
    if (!existingAlter) pitchEl.insertBefore(alterEl, pitchEl.getElementsByTagName('octave')[0] ?? null);
  } else if (existingAlter) {
    pitchEl.removeChild(existingAlter);
  }
  ensureDirectChild(doc, pitchEl, 'octave').textContent = String(pitch.octave);
}

function setGuitarTechnicalElements(
  doc: XmlDocument,
  note: XmlElementNode,
  string: 1 | 2 | 3 | 4 | 5 | 6,
  fret: number,
  techniques: string[] | undefined,
) {
  const notations = ensureDirectChild(doc, note, 'notations');
  const technical = ensureDirectChild(doc, notations, 'technical');
  ensureDirectChild(doc, technical, 'string').textContent = String(string);
  ensureDirectChild(doc, technical, 'fret').textContent = String(fret);

  if (!techniques) return;
  for (const tag of ['hammer-on', 'pull-off', 'bend', 'harmonic', 'mute', 'up-bow', 'down-bow', 'other-technical']) {
    Array.from(technical.getElementsByTagName(tag)).forEach((entry) => technical.removeChild(entry));
  }
  const techniqueSet = new Set(techniques);
  if (techniqueSet.has('hammer-on')) {
    const hammerOn = doc.createElement('hammer-on');
    hammerOn.setAttribute('type', 'start');
    hammerOn.textContent = 'H';
    technical.appendChild(hammerOn);
  }
  if (techniqueSet.has('pull-off')) {
    const pullOff = doc.createElement('pull-off');
    pullOff.setAttribute('type', 'start');
    pullOff.textContent = 'P';
    technical.appendChild(pullOff);
  }
  if (techniqueSet.has('bend')) technical.appendChild(doc.createElement('bend'));
  if (techniqueSet.has('harmonic')) technical.appendChild(doc.createElement('harmonic'));
  if (techniqueSet.has('dead-note')) technical.appendChild(doc.createElement('mute'));
  if (techniqueSet.has('pick-up')) technical.appendChild(doc.createElement('up-bow'));
  if (techniqueSet.has('pick-down')) technical.appendChild(doc.createElement('down-bow'));
  if (techniqueSet.has('palm-mute')) {
    const other = doc.createElement('other-technical');
    other.textContent = 'p.m.';
    technical.appendChild(other);
  }
  if (techniqueSet.has('let-ring')) {
    const other = doc.createElement('other-technical');
    other.textContent = 'let ring';
    technical.appendChild(other);
  }
}

function findPairedTabNotationNote(
  measure: El,
  op: Extract<NoteEditOperation, { type: 'setGuitarFret' }>,
) {
  const divisions = getDivisions(measure.ownerDocument as XmlDocument);
  const targetOffset = Math.round((op.timestampNum / Math.max(op.timestampDen, 1)) * divisions * 4);
  const sourceIsTab = isTabStaff(measure, op.staffIndex);
  const candidates = collectMeasureVoiceEvents(measure)
    .filter((event) => (
      event.staffIndex !== op.staffIndex
      && event.voiceId === op.voiceId
      && event.startOffset === targetOffset
      && !event.isRest
      && isTabStaff(measure, event.staffIndex) !== sourceIsTab
    ))
    .sort((left, right) => Math.abs(left.staffIndex - op.staffIndex) - Math.abs(right.staffIndex - op.staffIndex));
  const paired = candidates[0];
  return paired ? { note: paired.node, isTab: isTabStaff(measure, paired.staffIndex) } : null;
}

function removeLegacyBeamTagsForVoice(measure: El, staffIndex: number, voiceId: number) {
  for (const event of collectMeasureVoiceEvents(measure)) {
    if (event.staffIndex !== staffIndex || event.voiceId !== voiceId) continue;
    removeDirectChildrenByTag(event.node, 'beam');
  }
}

function consumeFollowingLegacyDurationSlots(
  doc: XmlDocument,
  measure: El,
  op: Extract<NoteEditOperation, { type: 'changeNoteDuration' }>,
  targetOffset: number,
  previousDuration: number,
  nextDuration: number,
  primaryNote: XmlElementNode,
  eventsBeforeChange = collectMeasureVoiceEvents(measure),
) {
  const consumedStart = targetOffset + previousDuration;
  const consumedEnd = targetOffset + nextDuration;
  const events = eventsBeforeChange;
  const tabLinkedStaffs = new Set<number>();
  const hasTab = measureHasTabStaff(measure);

  if (hasTab) {
    for (const event of events) {
      if (
        event.voiceId === op.voiceId
        && event.startOffset === targetOffset
        && event.staffIndex !== op.staffIndex
        && event.hasGuitarTechnical
      ) {
        tabLinkedStaffs.add(event.staffIndex);
      }
    }
  }

  const affectedStaffs = new Set<number>([op.staffIndex, ...tabLinkedStaffs]);
  for (const event of events) {
    if (!affectedStaffs.has(event.staffIndex) || event.voiceId !== op.voiceId) continue;

    if (event.startOffset === targetOffset && (event.node === primaryNote || tabLinkedStaffs.has(event.staffIndex))) {
      setNoteDurationElements(doc, event.node, op.durationType, nextDuration, op.isDotted);
    }

    removeDirectChildrenByTag(event.node, 'beam');
  }

  for (const event of [...events].reverse()) {
    if (!affectedStaffs.has(event.staffIndex) || event.voiceId !== op.voiceId) continue;
    if (event.isChord) continue;
    if (event.startOffset < consumedStart || event.startOffset >= consumedEnd) continue;
    if (event.node.parentNode) event.node.parentNode.removeChild(event.node);
  }
}

function splitAbsoluteInsertAcrossSpanningRest(
  doc: XmlDocument,
  measure: El,
  op: Extract<NoteEditOperation, { type: 'insertNoteAt' | 'insertRestAt' }>,
  insertedNote: El,
) {
  const divisions = getDivisions(doc);
  const targetOffset = Math.round((op.timestampNum / Math.max(op.timestampDen, 1)) * divisions * 4);
  const baseDuration = noteTypeToDivisions(op.durationType, divisions);
  const insertedDuration = op.isDotted ? Math.round(baseDuration * 1.5) : baseDuration;
  const spanningRest = collectMeasureVoiceEvents(measure).find((event) => (
    event.staffIndex === op.staffIndex
    && event.voiceId === op.voiceId
    && event.isRest
    && !event.isChord
    && event.startOffset <= targetOffset
    && event.startOffset + event.durationDivisions >= targetOffset + insertedDuration
  ));

  if (!spanningRest?.node.parentNode) return false;

  const leadingDuration = Math.max(0, targetOffset - spanningRest.startOffset);
  const trailingDuration = Math.max(
    0,
    (spanningRest.startOffset + spanningRest.durationDivisions) - (targetOffset + insertedDuration),
  );

  const parent = spanningRest.node.parentNode;
  for (const fragment of describeDurationFragments(divisions, leadingDuration)) {
    parent.insertBefore(buildRestNote(doc, op.voiceId, op.staffIndex, fragment), spanningRest.node);
  }
  parent.insertBefore(insertedNote, spanningRest.node);
  for (const fragment of describeDurationFragments(divisions, trailingDuration)) {
    parent.insertBefore(buildRestNote(doc, op.voiceId, op.staffIndex, fragment), spanningRest.node);
  }
  parent.removeChild(spanningRest.node);
  return true;
}

function findAbsoluteInsertionPoint(
  doc: XmlDocument,
  measure: El,
  target: NoteLocator,
): El | null {
  const divisions = getDivisions(doc);
  const targetOffset = Math.round((target.timestampNum / Math.max(target.timestampDen, 1)) * divisions * 4);
  let cursorOffset = 0;

  for (let i = 0; i < measure.childNodes.length; i++) {
    const childNode = measure.childNodes[i];
    if (!childNode || childNode.nodeType !== 1) continue;
    const child = childNode as unknown as El;

    if (child.tagName === 'backup') {
      const dur = parseInt(child.getElementsByTagName('duration')[0]?.textContent ?? '0', 10) || 0;
      cursorOffset = Math.max(0, cursorOffset - dur);
      continue;
    }

    if (child.tagName === 'forward') {
      const dur = parseInt(child.getElementsByTagName('duration')[0]?.textContent ?? '0', 10) || 0;
      cursorOffset += dur;
      continue;
    }

    if (child.tagName !== 'note') continue;

    const noteStaff = parseInt(child.getElementsByTagName('staff')[0]?.textContent ?? '1', 10) || 1;
    const noteVoice = parseInt(child.getElementsByTagName('voice')[0]?.textContent ?? '1', 10) || 1;
    const isChord = child.getElementsByTagName('chord').length > 0;
    const duration = parseInt(child.getElementsByTagName('duration')[0]?.textContent ?? '0', 10) || 0;

    if (noteStaff === target.staffIndex && noteVoice === target.voiceId && cursorOffset >= targetOffset) {
      return child;
    }

    if (!isChord) cursorOffset += duration;
  }

  return null;
}

function findLastChordSibling(note: El): El {
  let current = note;
  while (current.nextSibling) {
    const next = current.nextSibling as El;
    if (next.nodeType === 1 && next.tagName === 'note' && next.getElementsByTagName('chord').length > 0) {
      current = next;
      continue;
    }
    break;
  }
  return current;
}

/** Get or create a direct child element with the given tag name. */
function getOrCreateChild(doc: XmlDocument, parent: El, tag: string): El {
  const existing = parent.getElementsByTagName(tag)[0];
  if (existing && existing.parentNode === parent) return existing as El;
  const created = doc.createElement(tag);
  parent.appendChild(created);
  return created;
}

/** Articulations that live inside <notations><articulations>. */
const ARTICULATION_IN_ARTICULATIONS = new Set<string>([
  'staccato', 'staccatissimo', 'accent', 'strong-accent', 'tenuto',
]);

function toggleArticulationOnNote(doc: XmlDocument, note: El, kind: string) {
  const notations = getOrCreateChild(doc, note, 'notations');

  if (kind === 'fermata') {
    // Fermata is a direct child of <notations>
    const existing = notations.getElementsByTagName('fermata');
    if (existing.length > 0) {
      for (let i = existing.length - 1; i >= 0; i--) {
        existing[i].parentNode?.removeChild(existing[i]);
      }
    } else {
      notations.appendChild(doc.createElement('fermata'));
    }
    cleanEmptyNotations(note);
    return;
  }

  if (!ARTICULATION_IN_ARTICULATIONS.has(kind)) return;

  const articulations = getOrCreateChild(doc, notations, 'articulations');
  const existing = articulations.getElementsByTagName(kind);
  if (existing.length > 0) {
    for (let i = existing.length - 1; i >= 0; i--) {
      existing[i].parentNode?.removeChild(existing[i]);
    }
  } else {
    articulations.appendChild(doc.createElement(kind));
  }
  cleanEmptyNotations(note);
}

function clearArticulationsOnNote(note: El) {
  const notations = note.getElementsByTagName('notations');
  for (let i = 0; i < notations.length; i++) {
    const n = notations[i];
    const arts = n.getElementsByTagName('articulations');
    for (let j = arts.length - 1; j >= 0; j--) arts[j].parentNode?.removeChild(arts[j]);
    const fermatas = n.getElementsByTagName('fermata');
    for (let j = fermatas.length - 1; j >= 0; j--) fermatas[j].parentNode?.removeChild(fermatas[j]);
  }
  cleanEmptyNotations(note);
}

function cleanEmptyNotations(note: El) {
  const notations = note.getElementsByTagName('notations');
  for (let i = notations.length - 1; i >= 0; i--) {
    const n = notations[i];
    // Remove empty <articulations>
    const arts = n.getElementsByTagName('articulations');
    for (let j = arts.length - 1; j >= 0; j--) {
      if (!arts[j].hasChildNodes()) arts[j].parentNode?.removeChild(arts[j]);
    }
    if (!n.hasChildNodes()) n.parentNode?.removeChild(n);
  }
}

function insertDynamicBeforeNote(
  doc: XmlDocument,
  note: El,
  dynamic: string,
  staffIndex: number,
  placement: 'above' | 'below' = 'below',
) {
  const direction = doc.createElement('direction');
  direction.setAttribute('placement', placement);
  const dt = doc.createElement('direction-type');
  const dyn = doc.createElement('dynamics');
  dyn.appendChild(doc.createElement(dynamic));
  dt.appendChild(dyn);
  direction.appendChild(dt);
  const staff = doc.createElement('staff');
  staff.textContent = String(staffIndex);
  direction.appendChild(staff);
  note.parentNode?.insertBefore(direction, note);
}

function toggleTieOnNote(doc: XmlDocument, note: El) {
  // Inspect existing <tie> elements (direct children)
  const existingTies: El[] = [];
  for (let i = 0; i < note.childNodes.length; i++) {
    const c = note.childNodes[i] as El;
    if (c.nodeType === 1 && c.tagName === 'tie') existingTies.push(c);
  }
  const hasStart = existingTies.some(t => t.getAttribute('type') === 'start');

  if (hasStart) {
    // Remove tie start + matching tied start in notations
    for (const t of existingTies) {
      if (t.getAttribute('type') === 'start') t.parentNode?.removeChild(t);
    }
    const notations = note.getElementsByTagName('notations');
    for (let i = 0; i < notations.length; i++) {
      const tieds = notations[i].getElementsByTagName('tied');
      for (let j = tieds.length - 1; j >= 0; j--) {
        if (tieds[j].getAttribute('type') === 'start') tieds[j].parentNode?.removeChild(tieds[j]);
      }
    }
    cleanEmptyNotations(note);
    return;
  }

  // Add tie start — insert before <voice> if possible for spec-compliance
  const tie = doc.createElement('tie');
  tie.setAttribute('type', 'start');
  const voiceEl = note.getElementsByTagName('voice')[0] ?? null;
  note.insertBefore(tie, voiceEl);

  // Add <tied type="start"/> inside notations
  const notations = getOrCreateChild(doc, note, 'notations');
  const tied = doc.createElement('tied');
  tied.setAttribute('type', 'start');
  notations.appendChild(tied);
}

function setTiePlacementOnNote(doc: XmlDocument, note: El, placement: 'above' | 'below') {
  const directTieStart = Array.from(note.childNodes).some((node) => {
    const element = node as El;
    return element.nodeType === 1 && element.tagName === 'tie' && element.getAttribute('type') === 'start';
  });
  const notations = getOrCreateChild(doc, note, 'notations');
  const tiedStarts = Array.from(notations.getElementsByTagName('tied'))
    .filter((tied) => tied.getAttribute('type') === 'start');
  if (!directTieStart && tiedStarts.length === 0) {
    cleanEmptyNotations(note);
    return;
  }

  const targets = tiedStarts.length > 0 ? tiedStarts : [doc.createElement('tied')];
  targets.forEach((tied) => {
    tied.setAttribute('type', 'start');
    tied.setAttribute('placement', placement);
    if (!tied.parentNode) notations.appendChild(tied);
  });
}

function notePitchKey(note: El) {
  const pitch = note.getElementsByTagName('pitch')[0];
  if (!pitch) return null;
  const step = pitch.getElementsByTagName('step')[0]?.textContent ?? '';
  const alter = parseInt(pitch.getElementsByTagName('alter')[0]?.textContent ?? '0', 10) || 0;
  const octave = parseInt(pitch.getElementsByTagName('octave')[0]?.textContent ?? '4', 10) || 4;
  return `${step}:${alter}:${octave}`;
}

function noteHasTieStart(note: El) {
  return Array.from(note.childNodes).some((child) => {
    const element = child as El;
    return element?.nodeType === 1 && element.tagName === 'tie' && element.getAttribute('type') === 'start';
  });
}

function removeTieStartFromNote(note: El) {
  Array.from(note.childNodes).forEach((child) => {
    const element = child as El;
    if (element?.nodeType === 1 && element.tagName === 'tie' && element.getAttribute('type') === 'start') {
      note.removeChild(element);
    }
  });
  const notations = Array.from(note.getElementsByTagName('notations')) as El[];
  for (const notation of notations) {
    const tieds = Array.from(notation.getElementsByTagName('tied')) as El[];
    for (const tied of tieds) {
      if (tied.getAttribute('type') === 'start') tied.parentNode?.removeChild(tied);
    }
  }
  cleanEmptyNotations(note);
}

function pruneDanglingLegacyTies(doc: XmlDocument) {
  const parts = Array.from(doc.getElementsByTagName('part'));
  for (const part of parts) {
    const byVoice = new Map<string, Array<{
      node: El;
      measureNumber: number;
      startOffset: number;
      pitchKey: string | null;
    }>>();
    const measures = Array.from(part.getElementsByTagName('measure'));
    for (const measure of measures) {
      const measureNumber = parseInt(measure.getAttribute('number') ?? '0', 10) || 0;
      for (const event of collectMeasureVoiceEvents(measure as El)) {
        const pitchKey = notePitchKey(event.node);
        if (!pitchKey) {
          removeTieStartFromNote(event.node);
          continue;
        }
        const key = `${event.staffIndex}:${event.voiceId}`;
        const refs = byVoice.get(key) ?? [];
        refs.push({
          node: event.node,
          measureNumber,
          startOffset: event.startOffset,
          pitchKey,
        });
        byVoice.set(key, refs);
      }
    }

    for (const refs of byVoice.values()) {
      const ordered = refs.sort((left, right) => (
        left.measureNumber - right.measureNumber
        || left.startOffset - right.startOffset
      ));
      for (const ref of ordered) {
        if (!noteHasTieStart(ref.node)) continue;
        const later = ordered.filter((candidate) => (
          candidate.measureNumber > ref.measureNumber
          || (candidate.measureNumber === ref.measureNumber && candidate.startOffset > ref.startOffset)
        ));
        const next = later[0];
        const continues = Boolean(next && later
          .filter((candidate) => candidate.measureNumber === next.measureNumber && candidate.startOffset === next.startOffset)
          .some((candidate) => candidate.pitchKey === ref.pitchKey));
        if (!continues) removeTieStartFromNote(ref.node);
      }
    }
  }
}

// Chromatic semitone index within an octave — prefer sharps when accidental needed
const STEP_TO_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SEMITONE_TO_STEP_ALTER: Array<{ step: string; alter: number }> = [
  { step: 'C', alter: 0 }, { step: 'C', alter: 1 }, { step: 'D', alter: 0 }, { step: 'D', alter: 1 },
  { step: 'E', alter: 0 }, { step: 'F', alter: 0 }, { step: 'F', alter: 1 }, { step: 'G', alter: 0 },
  { step: 'G', alter: 1 }, { step: 'A', alter: 0 }, { step: 'A', alter: 1 }, { step: 'B', alter: 0 },
];

function transposeNoteChromatically(doc: XmlDocument, note: El, semitones: number) {
  const pitch = note.getElementsByTagName('pitch')[0];
  if (!pitch) return; // rest
  const stepEl = pitch.getElementsByTagName('step')[0];
  const octaveEl = pitch.getElementsByTagName('octave')[0];
  const alterEl = pitch.getElementsByTagName('alter')[0];
  if (!stepEl || !octaveEl) return;
  const step = (stepEl.textContent ?? 'C').toUpperCase();
  const octave = parseInt(octaveEl.textContent ?? '4', 10);
  const alter = alterEl ? parseInt(alterEl.textContent ?? '0', 10) : 0;

  const midi = (STEP_TO_SEMITONE[step] ?? 0) + alter + octave * 12;
  const nextMidi = midi + semitones;
  const nextOctave = Math.floor(nextMidi / 12);
  const chroma = ((nextMidi % 12) + 12) % 12;
  const { step: newStep, alter: newAlter } = SEMITONE_TO_STEP_ALTER[chroma];

  stepEl.textContent = newStep;
  octaveEl.textContent = String(nextOctave);
  if (newAlter !== 0) {
    if (alterEl) {
      alterEl.textContent = String(newAlter);
    } else {
      const a = doc.createElement('alter');
      a.textContent = String(newAlter);
      pitch.insertBefore(a, octaveEl);
    }
  } else if (alterEl) {
    pitch.removeChild(alterEl);
  }
}

function setMeasureRightBarline(doc: XmlDocument, measureNumber: number, kind: BarlineKind) {
  const measures = doc.getElementsByTagName('measure');
  let target: El | null = null;
  for (let i = 0; i < measures.length; i++) {
    if (parseInt(measures[i].getAttribute('number') ?? '0', 10) === measureNumber) {
      target = measures[i] as El;
      break;
    }
  }
  if (!target) return;

  // Remove existing right-location barlines
  const existing = target.getElementsByTagName('barline');
  for (let i = existing.length - 1; i >= 0; i--) {
    if (existing[i].getAttribute('location') === 'right') {
      existing[i].parentNode?.removeChild(existing[i]);
    }
  }

  if (kind === 'regular') return; // "regular" = no explicit barline element

  const barline = doc.createElement('barline');
  barline.setAttribute('location', 'right');
  const barStyle = doc.createElement('bar-style');
  if (kind === 'double') barStyle.textContent = 'light-light';
  else if (kind === 'final' || kind === 'repeat-end') barStyle.textContent = 'light-heavy';
  else if (kind === 'repeat-start') barStyle.textContent = 'heavy-light';
  barline.appendChild(barStyle);

  if (kind === 'repeat-end') {
    const repeat = doc.createElement('repeat');
    repeat.setAttribute('direction', 'backward');
    barline.appendChild(repeat);
  } else if (kind === 'repeat-start') {
    // Repeat-start logically goes on left of the *next* measure; for
    // UI simplicity we emit it on the right of the current measure.
    const repeat = doc.createElement('repeat');
    repeat.setAttribute('direction', 'forward');
    barline.appendChild(repeat);
  }

  target.appendChild(barline);
}
