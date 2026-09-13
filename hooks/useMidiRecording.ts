'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MidiTakeRecorder, quantizeMidiTake, type RecordedMidiNote } from '@/src/score-input/midi-recording';
import type { SelectedNote } from './useNoteEditor';
import type { ScoreCommand } from '@/src/shared/schemas/score-command';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';

export function useMidiRecording(active: boolean, selected: SelectedNote | null, documentIdentity: ScoreDocumentModel | null) {
  const [bpm, setBpm] = useState(100);
  const [countIn, setCountIn] = useState(4);
  const [grid, setGrid] = useState(4);
  const [phase, setPhase] = useState<'idle' | 'count-in' | 'recording' | 'review'>('idle');
  const [beat, setBeat] = useState(0);
  const [take, setTake] = useState<{ notes: RecordedMidiNote[]; startMs: number; bpm: number; anchor: SelectedNote; documentIdentity: ScoreDocumentModel | null; id: string; lengthQuarters: number } | null>(null);
  const [message, setMessage] = useState('');
  const recordingRef = useRef<{ recorder: MidiTakeRecorder; anchor: SelectedNote; documentIdentity: ScoreDocumentModel | null; bpm: number; id: string } | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const generationRef = useRef(0);
  const armingRef = useRef(false);
  const stopClock = useCallback(() => { if (clockRef.current) clearInterval(clockRef.current); clockRef.current = null; void audioRef.current?.close(); audioRef.current = null; }, []);
  const cancel = useCallback(() => { generationRef.current++; armingRef.current = false; recordingRef.current = null; stopClock(); setPhase('idle'); }, [stopClock]);
  const start = useCallback(async () => {
    if (!active || !selected) { setMessage('Enable MIDI Note Input and select the recording start.'); return; }
    if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300 || !Number.isInteger(countIn) || countIn < 0 || countIn > 16) { setMessage('Choose 20–300 BPM and 0–16 count-in beats.'); return; }
    cancel();
    armingRef.current = true;
    setTake(null); setMessage(''); setPhase('count-in');
    const generation = generationRef.current;
    let ac: AudioContext;
    try {
      ac = new AudioContext();
      audioRef.current = ac;
      await ac.resume();
    } catch {
      if (generation === generationRef.current) { cancel(); setMessage('Audio could not start. Enable audio and try recording again.'); }
      return;
    }
    if (generation !== generationRef.current) { if (ac.state !== 'closed') void ac.close(); return; }
    armingRef.current = false;
    const beatMs = 60000 / bpm;
    const startMs = performance.now() + countIn * beatMs;
    const audioStart = ac.currentTime;
    recordingRef.current = { recorder: new MidiTakeRecorder(startMs), anchor: { ...selected, graphicalNote: null }, documentIdentity, bpm, id: crypto.randomUUID() };
    setTake(null); setMessage(''); setPhase(countIn ? 'count-in' : 'recording');
    let nextBeat = 0;
    const tick = () => {
      while (audioStart + nextBeat * beatMs / 1000 < ac.currentTime + .1) {
        const when = audioStart + nextBeat * beatMs / 1000;
        if (when >= ac.currentTime - .02) {
          const oscillator = ac.createOscillator(); const gain = ac.createGain();
          oscillator.frequency.value = nextBeat % 4 === 0 ? 1200 : 800;
          gain.gain.setValueAtTime(.08, Math.max(ac.currentTime, when));
          gain.gain.exponentialRampToValueAtTime(.001, Math.max(ac.currentTime, when) + .04);
          oscillator.connect(gain); gain.connect(ac.destination);
          oscillator.start(Math.max(ac.currentTime, when)); oscillator.stop(Math.max(ac.currentTime, when) + .045);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        }
        nextBeat++;
      }
      setBeat(Math.max(0, Math.floor((performance.now() - startMs) / beatMs) + 1));
      if (performance.now() >= startMs) setPhase('recording');
    };
    tick(); clockRef.current = setInterval(tick, 25);
  }, [active, selected, documentIdentity, bpm, countIn, cancel]);
  const stop = useCallback(() => {
    const session = recordingRef.current; if (!session) { if (armingRef.current) cancel(); return; }
    const notes = session.recorder.finish(performance.now());
    recordingRef.current = null; stopClock(); setPhase('review');
    setTake({ notes, startMs: session.recorder.startMs, bpm: session.bpm, anchor: session.anchor, documentIdentity: session.documentIdentity, id: session.id, lengthQuarters: 0 });
  }, [stopClock, cancel]);
  const onMessage = useCallback((data: ArrayLike<number>, timeStamp: number) => {
    if (armingRef.current) return true;
    if (!recordingRef.current) return false;
    recordingRef.current.recorder.accept(data, timeStamp);
    return true;
  }, []);
  const buildCommand = useCallback((): ScoreCommand | null => {
    if (!take || !take.notes.length) { setMessage('The take contains no notes.'); return null; }
    if (take.documentIdentity !== documentIdentity) { setMessage('The score changed after this take. Record again at the intended position.'); return null; }
    const notes = quantizeMidiTake(take.notes, take.startMs, take.bpm, grid);
    const lengthTicks = Math.max(...notes.map(n => n.startTick + n.durationTicks), Math.ceil(take.lengthQuarters * grid));
    return { type: 'replaceMidiPassage', corePartId: take.anchor.corePartId, coreMeasureId: take.anchor.coreMeasureId, measureNumber: take.anchor.measureNumber, staffIndex: take.anchor.staffIndex, voiceId: take.anchor.voiceId, timestampNum: take.anchor.timestampNum, timestampDen: take.anchor.timestampDen, takeId: take.id, ticksPerQuarter: grid, lengthTicks, notes };
  }, [take, documentIdentity, grid]);
  const applied = useCallback((nextDocument: ScoreDocumentModel | null, lengthQuarters: number) => { setTake(t => t ? { ...t, documentIdentity: nextDocument, lengthQuarters } : null); setMessage('Take applied. Change quantization and apply again to correct it.'); }, []);
  useEffect(() => { if (!active) cancel(); }, [active, cancel]);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') cancel(); };
    window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hidden);
    return () => { generationRef.current++; armingRef.current = false; recordingRef.current = null; stopClock(); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden); };
  }, [cancel, stopClock]);
  return { bpm, setBpm, countIn, setCountIn, grid, setGrid, phase, beat, start, stop, cancel, onMessage, buildCommand, applied, message, noteCount: take?.notes.length ?? 0 };
}
