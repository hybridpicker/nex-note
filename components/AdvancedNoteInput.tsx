'use client';
import { useState } from 'react';
import type { useMidiRecording } from '@/hooks/useMidiRecording';
import type { SelectedNote } from '@/hooks/useNoteEditor';
import type { ScoreDocumentModel, TimedEvent } from '@/src/score-core/model/types';
import type { NoteLocatorLike, ScoreCommand } from '@/src/shared/schemas/score-command';
import { prepareDocumentCommands, type PreparedDocumentCommands } from '@/src/score-core/commands/apply-document-commands';

interface Props {
  xml: string;
  document: ScoreDocumentModel;
  selected: SelectedNote | null;
  selection: SelectedNote[];
  apply: (commands: ScoreCommand[], prepared: PreparedDocumentCommands) => boolean;
  recording: ReturnType<typeof useMidiRecording>;
  midi: { enabled: boolean; status: string; toggle: () => void; devices: Array<{ id: string; name: string }>; selectedDeviceId: string; selectDevice: (id: string) => void };
}
export function AdvancedNoteInput({ xml, document, selected, selection, apply, midi, recording }: Props) {
  const [actual, setActual] = useState(3);
  const [normal, setNormal] = useState(2);
  const [unitPitch, setUnitPitch] = useState('C');
  const [unitOctave, setUnitOctave] = useState(4);
  const [unitAlter, setUnitAlter] = useState(0);
  const [groups, setGroups] = useState('3+2');
  const [beatType, setBeatType] = useState(8);
  const [scope, setScope] = useState<'voice' | 'instrument' | 'score'>('voice');
  const [stopBar, setStopBar] = useState<number | null>(null);
  const [durationType, setDurationType] = useState('quarter');
  const [message, setMessage] = useState('');
  const [activeGrace, setActiveGrace] = useState<string | null>(null);
  const part = document.score.parts.find(p => p.id === selected?.corePartId) ?? document.score.parts[0];
  const staff = part?.staves.find(s => s.staffIndex === selected?.staffIndex);
  const measure = staff?.measures.find(m => m.measureNumber === selected?.measureNumber);
  const voice = measure?.voices.find(v => v.voiceId === selected?.voiceId);
  const endMeasure = stopBar ?? staff?.measures.at(-1)?.measureNumber ?? 1;
  const graceIds = new Set(document.graceNotes.map(g => g.eventId));
  const graceNotes = voice?.events.filter(e => graceIds.has(e.id) && selected && e.timestampNum / e.timestampDen === selected.timestampNum / selected.timestampDen) ?? [];
  const grace = graceNotes.find(e => e.id === activeGrace);
  const locator = (event?: TimedEvent): NoteLocatorLike => ({ coreEntityId: event?.id ?? selected?.coreEntityId, corePartId: part?.id, coreMeasureId: measure?.id, measureNumber: event?.measureNumber ?? selected!.measureNumber, staffIndex: event?.staffIndex ?? selected!.staffIndex, voiceId: event?.voiceId ?? selected!.voiceId, timestampNum: event?.timestampNum ?? selected!.timestampNum, timestampDen: event?.timestampDen ?? selected!.timestampDen });
  const run = (commands: ScoreCommand[]) => {
    try {
      const proposal = prepareDocumentCommands({ xml, coreDocument: document }, commands);
      const rejection = proposal.result.diagnostics.find(d => d.code.endsWith('_rejected'));
      if (rejection) { setMessage(rejection.message); return; }
      if (proposal.result.xml === xml) { setMessage('No change at this selection.'); return; }
      setMessage(apply(commands, proposal) ? 'Applied as one Undo action.' : 'The score validation did not accept this change.');
    } catch { setMessage('Check the ratio, grouping, and selected range. No changes were made.'); }
  };
  const addTuplet = (convertRange: boolean) => {
    if (!selected) return;
    const ordered = (selection.length ? selection : [selected]).slice().sort((a, b) => a.timestampNum / a.timestampDen - b.timestampNum / b.timestampDen);
    if (ordered.some(n => n.measureNumber !== selected.measureNumber || n.staffIndex !== selected.staffIndex || n.voiceId !== selected.voiceId || n.corePartId !== selected.corePartId)) { setMessage('Select a range in one bar, staff, and voice.'); return; }
    const first = convertRange ? ordered[0]! : selected;
    const last = convertRange ? ordered.at(-1)! : selected;
    run([{ type: 'addTuplet', ...locator(), coreEntityId: first.coreEntityId, startTimestampNum: first.timestampNum, startTimestampDen: first.timestampDen, stopTimestampNum: last.timestampNum, stopTimestampDen: last.timestampDen, actualNotes: actual, normalNotes: normal, convertRange, bracket: true, showNumber: 'both' }]);
  };
  const control = 'rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800';
  return <details className="nex-advanced-input border-b border-nex-border bg-white px-3 py-1.5 text-xs" data-testid="advanced-note-input">
    <summary className="nex-advanced-input-summary"><svg className="nex-advanced-input-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden><path d="M4 2.5 7.5 6 4 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>Rhythm, tuplets and MIDI</summary>
    <div className="flex flex-wrap items-start gap-5 py-3">
      <fieldset disabled={!selected} className="space-y-2 disabled:opacity-50">
        <legend className="font-semibold">Bounded rhythm edit</legend>
        <label>Scope <select className={control} aria-label="Rhythm scope" value={scope} onChange={e => setScope(e.target.value as typeof scope)}><option value="voice">Active voice + linked TAB</option><option value="instrument">Instrument</option><option value="score">Entire score</option></select></label>{' '}
        <label>Stop after bar <input className={`${control} w-16`} aria-label="Rhythm stop bar" type="number" min={selected?.measureNumber ?? 1} value={endMeasure} onChange={e => setStopBar(Number(e.target.value))}/></label>
        <div><select className={control} aria-label="Rhythm duration" value={durationType} onChange={e => setDurationType(e.target.value)}>{['whole','half','quarter','eighth','16th','32nd','64th'].map(type => <option key={type}>{type}</option>)}</select>{' '}
          {(['insert','delete','resize'] as const).map(operation => <button className={control} key={operation} onClick={() => run([{ type: 'editRhythm', ...locator(), operation, scope, endMeasureNumber: endMeasure, durationType }])}>{operation === 'insert' ? 'Insert time' : operation === 'delete' ? 'Delete onset + time' : 'Resize onset'}</button>)}
        </div><p>Shift ends after bar {endMeasure}. Occupied overflow is rejected.</p>
      </fieldset>
      <fieldset disabled={!selected} className="space-y-2">
        <legend className="font-semibold">Tuplets</legend>
        <label>Actual <input aria-label="Tuplet actual" className={`${control} w-14`} type="number" min="2" max="32" value={actual} onChange={e => setActual(Number(e.target.value))}/></label>{' : '}
        <label>Normal <input aria-label="Tuplet normal" className={`${control} w-14`} type="number" min="1" max="32" value={normal} onChange={e => setNormal(Number(e.target.value))}/></label>
        <div><button className={control} onClick={() => addTuplet(false)}>Divide selected unit</button>{' '}<button className={control} onClick={() => addTuplet(true)}>Convert selected range</button></div>
        {selected?.coreEntityId && document.tuplets.some(t => t.eventIds.includes(selected.coreEntityId!)) && <div>
          <select aria-label="Tuplet unit pitch" className={control} value={unitPitch} onChange={e => setUnitPitch(e.target.value)}>{'CDEFGAB'.split('').map(n => <option key={n}>{n}</option>)}</select>
          <input aria-label="Tuplet unit octave" className={`${control} w-14`} type="number" min="0" max="8" value={unitOctave} onChange={e => setUnitOctave(Number(e.target.value))}/>
          <select aria-label="Tuplet unit accidental" className={control} value={unitAlter} onChange={e => setUnitAlter(Number(e.target.value))}>{[[-1,'Flat'],[0,'Natural'],[1,'Sharp']].map(([n,label]) => <option key={n} value={n}>{label}</option>)}</select>
          {(['pitch','chord','rest'] as const).map(action => <button key={action} className={control} onClick={() => run([{ type: 'editTupletUnit', ...locator(), action, step: unitPitch, alter: unitAlter, octave: unitOctave }])}>{action === 'pitch' ? 'Set unit pitch' : action === 'chord' ? 'Add unit chord tone' : 'Make unit rest'}</button>)}
        </div>}
      </fieldset>
      <fieldset disabled={!selected} className="space-y-2">
        <legend className="font-semibold">Notation</legend>
        <label>Beat groups <input aria-label="Beat groups" className={`${control} w-20`} value={groups} onChange={e => setGroups(e.target.value)}/></label>{' / '}
        <select aria-label="Beat unit" className={control} value={beatType} onChange={e => setBeatType(Number(e.target.value))}>{[2,4,8,16].map(n => <option key={n}>{n}</option>)}</select>{' '}
        <button className={control} onClick={() => { const beatGroups = groups.split('+').map(Number); run([{ type: 'setTimeSignature', measureNumber: selected!.measureNumber, beats: beatGroups.reduce((a,b) => a+b, 0), beatType, beatGroups }]); }}>Apply meter</button>
        <div><button className={control} onClick={() => run([{ type: 'setRhythmSpelling', ...locator(), literal: true }])}>Keep written duration</button>{' '}<button className={control} onClick={() => run([{ type: 'setRhythmSpelling', ...locator(), literal: false }])}>Automatic duration</button></div>
        <label>Automatic cautionaries <select aria-label="Automatic cautionaries" className={control} value={document.accidentalPolicy ?? 'none'} onChange={e => run([{ type: 'setAccidentalPolicy', policy: e.target.value as 'none' | 'barline' | 'always' }])}><option value="none">Off</option><option value="barline">Previous-bar pitch changes</option><option value="always">Every newly entered pitch</option></select></label>
      </fieldset>
      <fieldset disabled={!selected} className="space-y-2">
        <legend className="font-semibold">Grace sequence</legend>
        <button className={control} onClick={() => run([{ type: 'addGraceNote', ...locator(), slash: true }])}>Add grace</button>{' '}
        <select aria-label="Grace note" className={control} value={activeGrace ?? ''} onChange={e => setActiveGrace(e.target.value)}><option value="">Select grace</option>{graceNotes.map((e,i) => <option key={e.id} value={e.id}>{i+1}: {e.kind === 'note' ? `${e.pitch.step}${e.pitch.alter ? `(${e.pitch.alter})` : ''}${e.pitch.octave}` : 'rest'}</option>)}</select>
        {grace?.kind === 'note' && <div><select aria-label="Grace pitch" className={control} value={grace.pitch.step} onChange={e => run([{ type: 'changeNotePitch', ...locator(grace), ...grace.pitch, step: e.target.value }])}>{'CDEFGAB'.split('').map(n => <option key={n}>{n}</option>)}</select><input aria-label="Grace octave" className={`${control} w-14`} type="number" min="0" max="8" value={grace.pitch.octave} onChange={e => run([{ type: 'changeNotePitch', ...locator(grace), ...grace.pitch, octave: Number(e.target.value) }])}/>{(['earlier', 'later'] as const).map(direction => <button className={control} key={direction} onClick={() => run([{ type: 'moveGraceNote', ...locator(grace), direction }])}>{direction}</button>)}<button className={control} onClick={() => run([{ type: 'removeGraceNote', ...locator(grace) }])}>Delete grace</button></div>}
      </fieldset>
      <div><button className={control} onClick={midi.toggle}>{midi.enabled ? 'Disable MIDI' : 'Enable MIDI'}</button><p>MIDI: {midi.status}</p></div>
      <fieldset disabled={!midi.enabled} className="space-y-2">
        <legend className="font-semibold">Real-time MIDI</legend>
        <label>Tempo <input aria-label="Recording tempo" className={`${control} w-16`} type="number" min="20" max="300" value={recording.bpm} onChange={e => recording.setBpm(Number(e.target.value))}/></label>{' '}
        <label>Count-in <input aria-label="Recording count-in" className={`${control} w-14`} type="number" min="0" max="16" value={recording.countIn} onChange={e => recording.setCountIn(Number(e.target.value))}/></label>{' '}
        <label>Quantize <select aria-label="Recording quantization" className={control} value={recording.grid} onChange={e => recording.setGrid(Number(e.target.value))}>{[[1,'Quarter'],[2,'Eighth'],[4,'16th'],[8,'32nd']].map(([n,label]) => <option key={n} value={n}>{label}</option>)}</select></label>
        <div>{recording.phase === 'recording' || recording.phase === 'count-in' ? <><button className={control} onClick={recording.stop}>Stop take</button><button className={control} onClick={recording.cancel}>Cancel take</button></> : <button className={control} onClick={() => { void recording.start(); }}>Record MIDI</button>}{' '}
          <button className={control} disabled={!recording.noteCount} onClick={() => { const command = recording.buildCommand(); if (!command || command.type !== 'replaceMidiPassage') return; const proposal = prepareDocumentCommands({ xml, coreDocument: document }, [command]); const rejection = proposal.result.diagnostics.find(d => d.code.endsWith('_rejected')); if (rejection) { setMessage(rejection.message); return; } if (apply([command], proposal)) recording.applied(proposal.result.coreDocument, command.lengthTicks / command.ticksPerQuarter); else setMessage('The score validation did not accept this take.'); }}>Apply / requantize take</button>
        </div><p role="status">{recording.phase} · Beat {recording.beat} · {recording.noteCount} captured notes</p><p>{recording.message}</p><p>Chord gates end at the next onset. Sustain is ignored.</p>
      </fieldset>
      {midi.enabled && <label>MIDI input <select aria-label="MIDI input device" className={control} value={midi.selectedDeviceId} onChange={e => midi.selectDevice(e.target.value)}><option value="">Select device</option>{!midi.devices.some(d => d.id === midi.selectedDeviceId) && midi.selectedDeviceId && <option value={midi.selectedDeviceId}>Selected device disconnected</option>}{midi.devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select><p>Release all keys to enter a chord. Sustain does not change notation.</p></label>}
    </div>
    {message && <p role="status" className="pb-2">{message}</p>}
  </details>;
}
