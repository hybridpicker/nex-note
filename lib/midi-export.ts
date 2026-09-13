import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from '@xmldom/xmldom';
import { Midi } from '@tonejs/midi';
import { importMusicXmlToCore } from '@/src/musicxml-adapter/import/import-musicxml';
import { getEffectiveMeasureTimingFromStaff } from '@/src/score-core/measure-timing';
import type { DirectionNode, MeasureNode, PartNode, StaffNode, TimedEvent } from '@/src/score-core/model/types';
import { cleanMuseScoreStderr } from './musescore-stderr';
import {
  musicXmlProgramToToneProgram,
  resolveInstrumentIdFromName,
  resolveMidiInstrumentSound,
  resolvePartInstrumentId,
  type MidiInstrumentSound,
} from './midi-instruments';

type XmlEl = XmlElement;

export { cleanMuseScoreStderr };

const MIDI_PPQ = 480;
const DEFAULT_TEMPO_BPM = 120;
const MIDI_TICKS_PER_WHOLE = MIDI_PPQ * 4;

const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export function formatMuseScoreMidiExportError(input: {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  timeoutMs: number;
}) {
  const cleanedStderr = cleanMuseScoreStderr(input.stderr);
  const reason = input.code === null
    ? `timed out after ${Math.round(input.timeoutMs / 1000)}s${input.signal ? ` (${input.signal})` : ''}`
    : `exited with code ${input.code}`;
  return `MuseScore MIDI export failed: ${reason}${cleanedStderr ? `: ${cleanedStderr}` : ''}`;
}

function directChildrenByTag(parent: XmlEl, tag: string) {
  const matches: XmlEl[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === 1 && (child as XmlEl).tagName === tag) matches.push(child as XmlEl);
  }
  return matches;
}

function directChildText(parent: XmlEl, tag: string) {
  return directChildrenByTag(parent, tag)[0]?.textContent ?? null;
}

function notePitchKey(note: XmlEl) {
  const pitch = directChildrenByTag(note, 'pitch')[0];
  if (!pitch) return null;
  const step = directChildText(pitch, 'step') ?? 'C';
  const alter = directChildText(pitch, 'alter') ?? '0';
  const octave = directChildText(pitch, 'octave') ?? '4';
  return `${step}:${alter}:${octave}`;
}

function hasDirectTieType(note: XmlEl, type: 'start' | 'stop') {
  return directChildrenByTag(note, 'tie').some((tie) => tie.getAttribute('type') === type);
}

function hasNotationTiedType(note: XmlEl, type: 'start' | 'stop') {
  return directChildrenByTag(note, 'notations')
    .some((notations) => Array.from(notations.getElementsByTagName('tied')).some((tied) => tied.getAttribute('type') === type));
}

function removeTieStartMarkers(note: XmlEl) {
  for (const tie of directChildrenByTag(note, 'tie')) {
    if (tie.getAttribute('type') === 'start') note.removeChild(tie);
  }
  for (const notations of directChildrenByTag(note, 'notations')) {
    const tiedToRemove = Array.from(notations.getElementsByTagName('tied')).filter((tied) => tied.getAttribute('type') === 'start');
    for (const tied of tiedToRemove) tied.parentNode?.removeChild(tied);
    if (!notations.childNodes.length) notations.parentNode?.removeChild(notations);
  }
}

function stripMalformedTieStarts(doc: XmlDocument) {
  let removed = 0;
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    const notes = Array.from(part.getElementsByTagName('note'));
    for (let index = 0; index < notes.length; index++) {
      const note = notes[index];
      if (!hasDirectTieType(note, 'start') && !hasNotationTiedType(note, 'start')) continue;

      const staff = directChildText(note, 'staff') ?? '1';
      const voice = directChildText(note, 'voice') ?? '1';
      const pitchKey = notePitchKey(note);
      if (!pitchKey) continue;

      let nextMatch: XmlEl | null = null;
      for (let nextIndex = index + 1; nextIndex < notes.length; nextIndex++) {
        const candidate = notes[nextIndex];
        if ((directChildText(candidate, 'staff') ?? '1') !== staff) continue;
        if ((directChildText(candidate, 'voice') ?? '1') !== voice) continue;
        const candidatePitch = notePitchKey(candidate);
        if (!candidatePitch) continue;
        if (candidatePitch === pitchKey) {
          nextMatch = candidate;
          break;
        }
      }

      const hasMatchingStop = nextMatch
        ? (hasDirectTieType(nextMatch, 'stop') || hasNotationTiedType(nextMatch, 'stop'))
        : false;

      if (!hasMatchingStop) {
        removeTieStartMarkers(note);
        removed++;
      }
    }
  }
  return removed;
}

function removeDirectChildrenByTag(parent: XmlEl, tag: string) {
  const toRemove = directChildrenByTag(parent, tag);
  for (const child of toRemove) {
    parent.removeChild(child);
  }
  return toRemove.length;
}

function stripPlaybackMetadata(doc: XmlDocument) {
  let removedTranspose = 0;
  let removedInstrumentSound = 0;
  let removedMidiDevice = 0;
  let removedMidiInstrument = 0;
  let removedVirtualInstrument = 0;

  for (const scorePart of Array.from(doc.getElementsByTagName('score-part'))) {
    for (const scoreInstrument of Array.from(scorePart.getElementsByTagName('score-instrument'))) {
      removedInstrumentSound += removeDirectChildrenByTag(scoreInstrument, 'instrument-sound');
      removedVirtualInstrument += removeDirectChildrenByTag(scoreInstrument, 'virtual-instrument');
    }
    removedMidiDevice += removeDirectChildrenByTag(scorePart, 'midi-device');
    removedMidiInstrument += removeDirectChildrenByTag(scorePart, 'midi-instrument');
  }

  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    const firstMeasure = Array.from(part.getElementsByTagName('measure'))[0] as XmlEl | undefined;
    const attributes = firstMeasure
      ? directChildrenByTag(firstMeasure, 'attributes')[0]
      : undefined;
    if (!attributes) continue;
    removedTranspose += removeDirectChildrenByTag(attributes, 'transpose');
  }

  return {
    removedTranspose,
    removedInstrumentSound,
    removedMidiDevice,
    removedMidiInstrument,
    removedVirtualInstrument,
  };
}

function normalizeName(value: string | null | undefined) {
  return (value ?? '').trim();
}

function tabBaseName(value: string) {
  return value
    .replace(/\b(tab|tablature)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function scorePartDisplayName(scorePart: XmlEl) {
  return normalizeName(directChildText(scorePart, 'part-name'))
    || normalizeName(scorePart.getElementsByTagName('instrument-name')[0]?.textContent)
    || normalizeName(scorePart.getAttribute('id'));
}

function partHasTabNotation(part: XmlEl | undefined) {
  if (!part) return false;
  return Array.from(part.getElementsByTagName('staff-type')).some((entry) => /tab/i.test(entry.textContent ?? ''))
    || Array.from(part.getElementsByTagName('clef')).some((entry) => /tab/i.test(entry.getElementsByTagName('sign')[0]?.textContent ?? ''));
}

function isTabScorePart(scorePart: XmlEl, part: XmlEl | undefined) {
  const name = scorePartDisplayName(scorePart);
  return /\b(tab|tablature)\b/i.test(name) || partHasTabNotation(part);
}

function playbackInstrumentForName(name: string): MidiInstrumentSound {
  return resolveMidiInstrumentSound(resolveInstrumentIdFromName(name));
}

function clampMidiNumber(value: number) {
  return Math.max(0, Math.min(127, Math.round(value)));
}

function pitchToMidiNumber(pitch: { step: string; alter: number; octave: number }) {
  const step = pitch.step.trim().toUpperCase();
  return clampMidiNumber(((pitch.octave + 1) * 12) + (STEP_TO_SEMITONE[step] ?? 0) + pitch.alter);
}

function divisionsToTicks(divisions: number, divisionsPerQuarter: number) {
  if (!Number.isFinite(divisions) || !Number.isFinite(divisionsPerQuarter) || divisionsPerQuarter <= 0) return 0;
  return Math.max(0, Math.round((divisions / divisionsPerQuarter) * MIDI_PPQ));
}

function fractionToTicks(numerator: number | undefined, denominator: number | undefined) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || !denominator) return 0;
  return Math.max(0, Math.round((numerator! / denominator!) * MIDI_TICKS_PER_WHOLE));
}

function eventOffsetTicks(event: TimedEvent) {
  return fractionToTicks(event.timestampNum, event.timestampDen);
}

function eventDurationTicks(event: TimedEvent) {
  return Math.max(1, fractionToTicks(event.durationDivisions, event.timestampDen));
}

function measureFallbackDurationTicks(measure: MeasureNode) {
  const eventEnd = measure.voices.reduce((maxEnd, voice) => (
    voice.events.reduce((voiceEnd, event) => Math.max(
      voiceEnd,
      eventOffsetTicks(event) + eventDurationTicks(event),
    ), maxEnd)
  ), 0);
  return Math.max(eventEnd, MIDI_PPQ * 4);
}

function buildMeasureTiming(staff: StaffNode) {
  const startTicks = new Map<string, number>();
  let cursorTicks = 0;

  for (const measure of staff.measures) {
    const timing = getEffectiveMeasureTimingFromStaff(staff, { measureId: measure.id });
    const duration = timing
      ? divisionsToTicks(timing.durationDivisions, timing.divisions)
      : measureFallbackDurationTicks(measure);
    const safeDuration = Math.max(1, duration || measureFallbackDurationTicks(measure));
    startTicks.set(measure.id, cursorTicks);
    cursorTicks += safeDuration;
  }

  return { startTicks };
}

function tempoFromDirection(direction: DirectionNode) {
  if (direction.kind !== 'metronome') return null;
  const bpm = Number.parseFloat(direction.value ?? '');
  return Number.isFinite(bpm) && bpm > 0 ? bpm : null;
}

function collectFallbackTempoEvents(parts: PartNode[]) {
  const events = new Map<number, number>();

  for (const part of parts) {
    for (const staff of part.staves) {
      const timing = buildMeasureTiming(staff);
      for (const measure of staff.measures) {
        const measureStart = timing.startTicks.get(measure.id) ?? 0;
        for (const direction of measure.directions) {
          const bpm = tempoFromDirection(direction);
          if (!bpm) continue;
          const ticks = measureStart + fractionToTicks(direction.timestampNum, direction.timestampDen);
          if (!events.has(ticks)) events.set(ticks, bpm);
        }
      }
    }
  }

  if (!events.has(0)) events.set(0, DEFAULT_TEMPO_BPM);
  return [...events.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ticks, bpm]) => ({ ticks, bpm }));
}

function collectFallbackTimeSignatureEvents(parts: PartNode[]) {
  const events = new Map<number, number[]>();

  for (const part of parts) {
    for (const staff of part.staves) {
      const timing = buildMeasureTiming(staff);
      for (const measure of staff.measures) {
        const measureStart = timing.startTicks.get(measure.id) ?? 0;
        for (const attributes of measure.attributes) {
          const time = attributes.time;
          if (!time?.beats || !time.beatType) continue;
          if (!events.has(measureStart)) events.set(measureStart, [time.beats, time.beatType]);
        }
      }
    }
  }

  if (!events.has(0)) events.set(0, [4, 4]);
  return [...events.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ticks, timeSignature]) => ({ ticks, timeSignature }));
}

function nextMidiChannel(index: number) {
  const channel = index % 15;
  return channel >= 9 ? channel + 1 : channel;
}

function trackNameForStaff(part: PartNode, staff: StaffNode) {
  return part.staves.length > 1 ? `${part.name} staff ${staff.staffIndex}` : part.name;
}

export function buildFallbackMidiFromMusicXml(xml: string) {
  const core = importMusicXmlToCore(xml);
  const midi = new Midi();
  midi.name = core.metadata.title ?? 'Nex Note fallback MIDI';
  midi.header.tempos = collectFallbackTempoEvents(core.score.parts);
  midi.header.timeSignatures = collectFallbackTimeSignatureEvents(core.score.parts);
  midi.header.update();

  let noteCount = 0;
  let channelIndex = 0;

  for (const part of core.score.parts) {
    const playbackInstrument = resolveMidiInstrumentSound(resolvePartInstrumentId(part));
    for (const staff of part.staves) {
      const playableEvents = staff.measures.flatMap((measure) => (
        measure.voices.flatMap((voice) => voice.events.filter((event) => event.kind === 'note' && !event.hidden))
      ));
      if (playableEvents.length === 0) continue;

      const track = midi.addTrack();
      track.name = trackNameForStaff(part, staff);
      track.channel = playbackInstrument.percussion ? 9 : nextMidiChannel(channelIndex++);
      track.instrument.number = musicXmlProgramToToneProgram(playbackInstrument.midiProgram);

      const timing = buildMeasureTiming(staff);
      const voiceIds = [...new Set(staff.measures.flatMap(measure => measure.voices.map(voice => voice.voiceId)))];
      for (const voiceId of voiceIds) {
        const entries = staff.measures.flatMap(measure => (measure.voices.find(voice => voice.voiceId === voiceId)?.events ?? [])
          .filter((event): event is Extract<TimedEvent, { kind: 'note' }> => event.kind === 'note' && !event.hidden)
          .map(event => ({ event, ticks: (timing.startTicks.get(measure.id) ?? 0) + eventOffsetTicks(event) })));
        const rendered: Array<{ midi: number; ticks: number; durationTicks: number; velocity: number }> = [];
        const pendingTies = new Map<number, typeof rendered[number]>();
        const graceGroups = new Map<number, typeof entries>();
        for (const entry of entries) if (entry.event.durationDivisions === 0) {
          const group = graceGroups.get(entry.ticks) ?? []; group.push(entry); graceGroups.set(entry.ticks, group);
        }
        const graceBudgets = new Map<number, number>();
        for (const [ticks, graces] of graceGroups) {
          const anchors = entries.filter(entry => entry.ticks === ticks && entry.event.durationDivisions > 0);
          if (!anchors.length) continue;
          const budget = Math.min(Math.floor(Math.min(...anchors.map(entry => eventDurationTicks(entry.event))) / 2), graces.length * MIDI_PPQ / 8);
          if (budget < graces.length) continue;
          graceBudgets.set(ticks, budget);
          graces.forEach((entry, index) => {
            const start = Math.round(index * budget / graces.length);
            const end = Math.round((index + 1) * budget / graces.length);
            rendered.push({ midi: pitchToMidiNumber(entry.event.pitch), ticks: ticks + start, durationTicks: end - start, velocity: .65 });
          });
        }
        for (const { event, ticks } of entries) {
          if (event.durationDivisions === 0) continue;
          const pitch = pitchToMidiNumber(event.pitch);
          // Round absolute endpoints, so unusual tuplets do not accumulate tick drift.
          const durationTicks = Math.max(1, fractionToTicks(event.timestampNum + event.durationDivisions, event.timestampDen) - eventOffsetTicks(event));
          const tied = pendingTies.get(pitch);
          const continuation = tied && tied.ticks + tied.durationTicks === ticks;
          const delay = continuation ? 0 : graceBudgets.get(ticks) ?? 0;
          const note = continuation ? tied : { midi: pitch, ticks: ticks + delay, durationTicks: durationTicks - delay, velocity: .8 };
          if (continuation) note.durationTicks += durationTicks;
          else rendered.push(note);
          if (event.tieStart) pendingTies.set(pitch, note);
          else pendingTies.delete(pitch);
        }
        for (const note of rendered) { track.addNote(note); noteCount++; }
      }
    }
  }

  if (noteCount === 0) {
    throw new Error('Internal MIDI fallback could not find playable notes in the score.');
  }

  return {
    data: midi.toArray(),
    noteCount,
    trackCount: midi.tracks.length,
  };
}

function appendTextElement(doc: XmlDocument, parent: XmlEl, tagName: string, text: string) {
  const child = doc.createElement(tagName);
  child.appendChild(doc.createTextNode(text));
  parent.appendChild(child);
  return child;
}

function appendMidiInstrument(doc: XmlDocument, scorePart: XmlEl, partId: string, instrument: MidiInstrumentSound, melodicChannelIndex: number) {
  const midiInstrument = doc.createElement('midi-instrument');
  midiInstrument.setAttribute('id', `${partId}-I1`);
  const midiChannel = instrument.percussion ? 10 : nextMidiChannel(melodicChannelIndex) + 1;
  appendTextElement(doc, midiInstrument, 'midi-channel', String(midiChannel));
  appendTextElement(doc, midiInstrument, 'midi-program', String(instrument.midiProgram));
  appendTextElement(doc, midiInstrument, 'volume', '78.7402');
  appendTextElement(doc, midiInstrument, 'pan', '0');
  scorePart.appendChild(midiInstrument);
}

function removeDuplicateTabPlaybackParts(doc: XmlDocument) {
  const scoreParts = Array.from(doc.getElementsByTagName('score-part')) as XmlEl[];
  const parts = Array.from(doc.getElementsByTagName('part')) as XmlEl[];
  const partById = new Map(parts.map((part) => [part.getAttribute('id') ?? '', part] as const));
  const tabPartIds = new Set(
    scoreParts
      .filter((scorePart) => isTabScorePart(scorePart, partById.get(scorePart.getAttribute('id') ?? '')))
      .map((scorePart) => scorePart.getAttribute('id') ?? '')
      .filter(Boolean),
  );
  if (tabPartIds.size === 0) return [];

  const nonTabBaseNames = new Set(
    scoreParts
      .filter((scorePart) => !tabPartIds.has(scorePart.getAttribute('id') ?? ''))
      .map((scorePart) => tabBaseName(scorePartDisplayName(scorePart)))
      .filter(Boolean),
  );
  const removed: Array<{ id: string; name: string }> = [];

  for (const scorePart of scoreParts) {
    const id = scorePart.getAttribute('id') ?? '';
    if (!tabPartIds.has(id)) continue;
    const name = scorePartDisplayName(scorePart);
    const base = tabBaseName(name);
    const hasNotationPartner = nonTabBaseNames.has(base) || (/guitar/i.test(name) && [...nonTabBaseNames].some((entry) => /guitar/i.test(entry)));
    if (!hasNotationPartner) continue;

    const part = partById.get(id);
    scorePart.parentNode?.removeChild(scorePart);
    part?.parentNode?.removeChild(part);
    removed.push({ id, name });
  }

  return removed;
}

export function sanitizeXmlForMidiExport(xml: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const renamedParts: Array<{ id: string; from: string; to: string }> = [];
  const renamedInstruments: Array<{ id: string; from: string; to: string }> = [];
  const removedMalformedTieStarts = stripMalformedTieStarts(doc);
  const strippedPlaybackMetadata = stripPlaybackMetadata(doc);
  const removedDuplicateTabParts = removeDuplicateTabPlaybackParts(doc);

  let melodicChannelIndex = 0;
  for (const scorePart of Array.from(doc.getElementsByTagName('score-part'))) {
    const partId = scorePart.getAttribute('id') ?? 'unknown';
    const partName = scorePart.getElementsByTagName('part-name')[0];
    const currentPartName = normalizeName(partName?.textContent);
    const targetPlayback = playbackInstrumentForName(currentPartName);
    const targetPlaybackName = targetPlayback.displayName;
    if (partName?.textContent && partName.textContent !== targetPlaybackName) {
      renamedParts.push({ id: partId, from: partName.textContent, to: targetPlaybackName });
      partName.textContent = targetPlaybackName;
    }

    const instrumentName = scorePart.getElementsByTagName('instrument-name')[0];
    const currentInstrumentName = normalizeName(instrumentName?.textContent);
    const targetInstrument = playbackInstrumentForName(currentInstrumentName || currentPartName);
    const targetInstrumentName = targetInstrument.displayName;
    if (instrumentName?.textContent && instrumentName.textContent !== targetInstrumentName) {
      renamedInstruments.push({ id: partId, from: instrumentName.textContent, to: targetInstrumentName });
      instrumentName.textContent = targetInstrumentName;
    }
    appendMidiInstrument(doc, scorePart as XmlEl, partId, targetInstrument, melodicChannelIndex);
    if (!targetInstrument.percussion) melodicChannelIndex += 1;
  }

  const sanitized = new XMLSerializer().serializeToString(doc);
  return {
    xml: sanitized.startsWith('<?xml') ? sanitized : `<?xml version="1.0" encoding="UTF-8"?>\n${sanitized}`,
    renamedParts,
    renamedInstruments,
    removedDuplicateTabParts,
    removedMalformedTieStarts,
    strippedPlaybackMetadata,
  };
}
