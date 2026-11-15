// A small fake AudioContext that records nodes, connections and automation, for the audio tests.

export class FakeParam {
  value: number;
  events: Array<{ kind: string; value: number; time: number }> = [];
  constructor(value = 0) { this.value = value; }
  setValueAtTime(value: number, time: number) { this.events.push({ kind: 'set', value, time }); this.value = value; return this; }
  linearRampToValueAtTime(value: number, time: number) { this.events.push({ kind: 'linear', value, time }); return this; }
  exponentialRampToValueAtTime(value: number, time: number) {
    if (!(value > 0)) throw new RangeError('exponential ramp target must be positive');
    this.events.push({ kind: 'exponential', value, time });
    return this;
  }
  setTargetAtTime(value: number, time: number) { this.events.push({ kind: 'target', value, time }); return this; }
  cancelScheduledValues(time: number) { this.events = this.events.filter((event) => event.time < time); return this; }
}

export class FakeNode {
  outputs: FakeNode[] = [];
  started: number[] = [];
  stopped: number[] = [];
  buffer: unknown = null;
  type = '';
  curve: Float32Array | null = null;
  oversample = 'none';
  normalize = true;
  onended: (() => void) | null = null;
  gain = new FakeParam(1);
  pan = new FakeParam(0);
  frequency = new FakeParam(440);
  Q = new FakeParam(1);
  constructor(public kind: string, public context: FakeAudioContext) {}
  connect(target: FakeNode) { this.outputs.push(target); return target; }
  disconnect() { this.outputs = []; }
  start(when = 0) { this.started.push(when); }
  stop(when = 0) { this.stopped.push(when); }
}

export class FakeAudioBuffer {
  private channels: Float32Array[];
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() { return this.length / this.sampleRate; }
  getChannelData(channel: number) { return this.channels[channel]!; }
}

export interface FakeContextOptions {
  panner?: boolean;
  convolver?: boolean;
}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  nodes: FakeNode[] = [];
  destination: FakeNode;
  constructor(options: FakeContextOptions = {}) {
    this.destination = new FakeNode('destination', this);
    if (options.panner === false) (this as { createStereoPanner?: unknown }).createStereoPanner = undefined;
    if (options.convolver === false) (this as { createConvolver?: unknown }).createConvolver = undefined;
  }
  private make(kind: string) { const node = new FakeNode(kind, this); this.nodes.push(node); return node; }
  createGain() { return this.make('gain'); }
  createWaveShaper() { return this.make('shaper'); }
  createStereoPanner() { return this.make('panner'); }
  createConvolver() { return this.make('convolver'); }
  createOscillator() { return this.make('oscillator'); }
  createBiquadFilter() { return this.make('biquad'); }
  createBufferSource() { return this.make('source'); }
  createBuffer(channels: number, length: number, sampleRate: number) { return new FakeAudioBuffer(channels, length, sampleRate); }
  count(kind: string) { return this.nodes.filter((node) => node.kind === kind).length; }
}

/** Every path of node kinds from `from` to the destination. */
export function pathsToDestination(from: FakeNode, seen = new Set<FakeNode>()): string[][] {
  if (from.kind === 'destination') return [['destination']];
  if (seen.has(from)) return [];
  const next = new Set(seen).add(from);
  return from.outputs.flatMap((output) => pathsToDestination(output, next).map((path) => [from.kind, ...path]));
}
