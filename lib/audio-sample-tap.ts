'use client';

/**
 * Delivers every sample of an audio source to the main thread in small
 * blocks, so a tracker sees the signal gap-free instead of polling an
 * AnalyserNode snapshot on requestAnimationFrame (which stops while the
 * window is hidden).
 *
 * Preferred: an AudioWorklet, loaded from a Blob URL so it needs no extra
 * static file and works the same under the web server, Electron and the
 * bundled iPad assets. Fallback: a ScriptProcessorNode where AudioWorklet is
 * missing or refuses the module. Both are routed into a muted gain so the
 * engine keeps pulling them without making a sound.
 */

export const SAMPLE_TAP_BLOCK_SIZE = 512;

export type SampleTapKind = 'audio-worklet' | 'script-processor';

export interface SampleTap {
  kind: SampleTapKind;
  disconnect: () => void;
}

const PROCESSOR_NAME = 'nex-note-sample-tap';

const WORKLET_SOURCE = `
class NexNoteSampleTap extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const requested = options && options.processorOptions && options.processorOptions.blockSize;
    this.size = requested > 0 ? requested : ${SAMPLE_TAP_BLOCK_SIZE};
    this.block = new Float32Array(this.size);
    this.filled = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    const frames = channels[0].length;
    const count = channels.length;
    for (let frame = 0; frame < frames; frame += 1) {
      let sum = 0;
      for (let channel = 0; channel < count; channel += 1) sum += channels[channel][frame];
      this.block[this.filled] = sum / count;
      this.filled += 1;
      if (this.filled === this.size) {
        this.port.postMessage(this.block, [this.block.buffer]);
        this.block = new Float32Array(this.size);
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('${PROCESSOR_NAME}', NexNoteSampleTap);
`;

const loadedContexts = new WeakSet<BaseAudioContext>();

async function loadWorklet(context: AudioContext) {
  if (loadedContexts.has(context)) return;
  const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
  try {
    await context.audioWorklet.addModule(url);
    loadedContexts.add(context);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function createSampleTap(
  context: AudioContext,
  source: AudioNode,
  onSamples: (samples: Float32Array) => void,
  blockSize = SAMPLE_TAP_BLOCK_SIZE,
): Promise<SampleTap> {
  const mute = context.createGain();
  mute.gain.value = 0;
  mute.connect(context.destination);

  if (typeof AudioWorkletNode === 'function' && context.audioWorklet) {
    try {
      await loadWorklet(context);
      const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { blockSize },
      });
      node.port.onmessage = (event: MessageEvent<Float32Array>) => onSamples(event.data);
      source.connect(node);
      node.connect(mute);
      return {
        kind: 'audio-worklet',
        disconnect: () => {
          node.port.onmessage = null;
          try { source.disconnect(node); } catch { /* already disconnected */ }
          node.disconnect();
          mute.disconnect();
        },
      };
    } catch {
      // Fall through to the ScriptProcessorNode.
    }
  }

  const bufferSize = 1 << Math.round(Math.log2(Math.min(16384, Math.max(256, blockSize * 2))));
  const processor = context.createScriptProcessor(bufferSize, 1, 1);
  processor.onaudioprocess = (event) => {
    onSamples(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(mute);
  return {
    kind: 'script-processor',
    disconnect: () => {
      processor.onaudioprocess = null;
      try { source.disconnect(processor); } catch { /* already disconnected */ }
      processor.disconnect();
      mute.disconnect();
    },
  };
}
