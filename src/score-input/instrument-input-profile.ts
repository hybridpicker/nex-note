/**
 * Input profiles for Instrument Record (`MIC REC`).
 *
 * `microphone` is the original path, tuned for an acoustic signal with auto
 * gain. `guitar-amp` is for a guitar amp that appears as a USB audio input
 * (Positive Grid Spark MINI, REACTOR 50): a line signal that must not be
 * auto-gained, written as guitar notation and heard down to B1.
 *
 * The profile is a shortcut, not a gate: guitar notation stays available on
 * the microphone path, and the note events it produces carry no trace of
 * which profile or device they came from.
 */

export type InstrumentInputProfile = 'microphone' | 'guitar-amp';

export interface AudioInputDeviceInfo {
  deviceId: string;
  label: string;
}

export interface RememberedInputDevice {
  deviceId: string;
  label: string;
}

export type AmpInputChoiceReason = 'remembered' | 'spark' | 'several-sparks' | 'not-found';

export interface AmpInputChoice {
  deviceId: string | null;
  reason: AmpInputChoiceReason;
}

/** Chromium lists the system default and communications inputs a second time under these ids. */
const ALIAS_DEVICE_IDS = new Set(['default', 'communications']);

/**
 * Chooses the amp input once device labels are known (only after the
 * microphone permission was granted). A remembered choice wins; otherwise the
 * input is chosen only when exactly one real device has "Spark" in its label.
 * Other amps, including the REACTOR, are chosen by hand and then remembered.
 */
export function pickAmpInputDevice(
  devices: AudioInputDeviceInfo[],
  remembered: RememberedInputDevice | null,
): AmpInputChoice {
  if (remembered) {
    const byId = devices.find((device) => device.deviceId === remembered.deviceId);
    if (byId) return { deviceId: byId.deviceId, reason: 'remembered' };
    const byLabel = remembered.label
      ? devices.find((device) => !ALIAS_DEVICE_IDS.has(device.deviceId) && device.label === remembered.label)
      : undefined;
    if (byLabel) return { deviceId: byLabel.deviceId, reason: 'remembered' };
  }
  const sparks = devices.filter((device) => (
    !ALIAS_DEVICE_IDS.has(device.deviceId) && /spark/i.test(device.label)
  ));
  if (sparks.length === 1) return { deviceId: sparks[0]!.deviceId, reason: 'spark' };
  return { deviceId: null, reason: sparks.length > 1 ? 'several-sparks' : 'not-found' };
}

export function audioConstraintsForProfile(
  profile: InstrumentInputProfile,
  deviceId?: string,
): MediaTrackConstraints {
  return {
    // Auto gain is meant for a microphone. On a line signal it pumps the
    // level between notes and hides the attack the amp tracker listens for.
    autoGainControl: profile === 'microphone',
    echoCancellation: false,
    noiseSuppression: false,
    channelCount: 1,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

/** The range each profile listens to, as sounding MIDI numbers. */
export function midiRangeForProfile(profile: InstrumentInputProfile) {
  return profile === 'guitar-amp'
    ? { minMidi: 35, maxMidi: 88 } // B1 (drop tunings, seven-string) to E6
    : { minMidi: 40, maxMidi: 88 };
}

/**
 * Whether switching Instrument Record off should also leave note input.
 * Only when Instrument Record switched note input on itself, and no other
 * record source (MIDI or microphone) still needs it. Note input the user
 * switched on before recording stays on.
 */
export function leavesNoteInputWithRecord(state: {
  noteInputStartedByRecord: boolean;
  noteInputMode: boolean;
  otherRecordSourceEnabled: boolean;
}) {
  return state.noteInputStartedByRecord && state.noteInputMode && !state.otherRecordSourceEnabled;
}

export type LineSignalQuality = 'silent' | 'too-low' | 'good' | 'too-high';

/** Below this the amp sends nothing usable: wrong input, or the guitar volume is down. */
export const LINE_SIGNAL_SILENT_DB = -85;
/** Played notes must reach the tracker's gate (dBFS RMS over 20 ms). */
export const LINE_SIGNAL_LOW_DB = -60;
/** A sample peak this close to full scale means the USB signal clips. */
export const LINE_SIGNAL_CLIP_PEAK_DB = -1;

/**
 * Level hints for a line signal without auto gain. They judge the loudest
 * moment of the last second or so (`heldRmsDb`, `heldPeakDb`), so the hint
 * describes how loud the notes are rather than the pause between them.
 */
export function classifyLineSignalLevel(heldRmsDb: number, heldPeakDb: number): LineSignalQuality {
  if (!Number.isFinite(heldRmsDb) || heldRmsDb <= LINE_SIGNAL_SILENT_DB) return 'silent';
  if (Number.isFinite(heldPeakDb) && heldPeakDb >= LINE_SIGNAL_CLIP_PEAK_DB) return 'too-high';
  if (heldRmsDb < LINE_SIGNAL_LOW_DB) return 'too-low';
  return 'good';
}

/** Keeps the loudest RMS and peak over a sliding time span. */
export class HeldLevelMeter {
  private readonly holdMs: number;
  private entries: Array<{ atMs: number; rmsDb: number; peakDb: number }> = [];

  constructor(holdMs = 1500) {
    this.holdMs = holdMs;
  }

  push(atMs: number, rmsDb: number, peakDb: number) {
    this.entries.push({ atMs, rmsDb, peakDb });
    const oldest = atMs - this.holdMs;
    while (this.entries.length > 0 && this.entries[0]!.atMs < oldest) this.entries.shift();
  }

  reset() {
    this.entries = [];
  }

  get rmsDb() {
    return this.entries.reduce((loudest, entry) => Math.max(loudest, entry.rmsDb), -140);
  }

  get peakDb() {
    return this.entries.reduce((loudest, entry) => Math.max(loudest, entry.peakDb), -140);
  }
}

export const INPUT_PROFILE_STORAGE_KEY = 'nex-note.instrument-record.input-profile';
export const AMP_INPUT_DEVICE_STORAGE_KEY = 'nex-note.instrument-record.amp-input';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readInputProfile(store: StorageLike | null = storage()): InstrumentInputProfile {
  try {
    return store?.getItem(INPUT_PROFILE_STORAGE_KEY) === 'guitar-amp' ? 'guitar-amp' : 'microphone';
  } catch {
    return 'microphone';
  }
}

export function writeInputProfile(profile: InstrumentInputProfile, store: StorageLike | null = storage()) {
  try {
    store?.setItem(INPUT_PROFILE_STORAGE_KEY, profile);
  } catch {
    // Storage can be blocked; the choice then lasts for this session only.
  }
}

export function readRememberedAmpInput(store: StorageLike | null = storage()): RememberedInputDevice | null {
  try {
    const raw = store?.getItem(AMP_INPUT_DEVICE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedInputDevice>;
    return typeof parsed.deviceId === 'string' && typeof parsed.label === 'string'
      ? { deviceId: parsed.deviceId, label: parsed.label }
      : null;
  } catch {
    return null;
  }
}

export function writeRememberedAmpInput(device: RememberedInputDevice, store: StorageLike | null = storage()) {
  try {
    store?.setItem(AMP_INPUT_DEVICE_STORAGE_KEY, JSON.stringify(device));
  } catch {
    // See writeInputProfile.
  }
}
