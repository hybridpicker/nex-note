// Where the playhead stands on the engraved score. Notes are not spaced linearly in time, so the
// playhead is placed from the rendered notes themselves: every onset of a measure is an anchor
// (its notehead x), and between two anchors the line moves linearly in musical time. At an onset
// the line is exactly on its notes; at the end of a measure it reaches the next measure's first
// note when that note follows on the same system, so the line never jumps backwards.

export interface PlaybackGeometryMeasure {
  measureNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  systemIndex: number;
}

export interface PlaybackGeometryNote<T> {
  measureNumber: number;
  positionWholes: number;
  x: number;
  isRest: boolean;
  /** A whole-measure rest is centred in its measure and is not an anchor in time. */
  isMeasureRest?: boolean;
  item: T;
}

export interface PlaybackGeometryOnset<T> {
  key: string;
  measureNumber: number;
  positionWholes: number;
  items: T[];
}

export interface PlaybackPlayheadPlacement {
  x: number;
  y: number;
  height: number;
  systemIndex: number;
  measureNumber: number;
}

interface MeasureEntry<T> {
  measure: PlaybackGeometryMeasure;
  anchors: Array<{ positionWholes: number; x: number }>;
  onsets: Array<PlaybackGeometryOnset<T>>;
}

export interface PlaybackGeometry<T> {
  hasMeasure(measureNumber: number): boolean;
  /** Playhead at a position. `next` is the measure that sounds after this one, if any. */
  place(measureNumber: number, positionWholes: number, lengthWholes: number, next?: number | null): PlaybackPlayheadPlacement | null;
  /** The onset the listener has reached at a position: the last onset at or before it. */
  onsetAt(measureNumber: number, positionWholes: number): PlaybackGeometryOnset<T> | null;
  /** The musical position under an x coordinate, inverse of `place`. */
  positionForX(measureNumber: number, x: number, lengthWholes: number): number | null;
}

const POSITION_EPSILON = 1 / 2048;
// Without a note at the downbeat the line starts this far into the measure, past the barline.
const MEASURE_START_INSET_PX = 4;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function buildPlaybackGeometry<T>(
  measures: PlaybackGeometryMeasure[],
  notes: Array<PlaybackGeometryNote<T>>,
): PlaybackGeometry<T> {
  const entries = new Map<number, MeasureEntry<T>>();
  for (const measure of measures) {
    // A measure can be drawn once per page/system only; keep the first drawing.
    if (!entries.has(measure.measureNumber)) entries.set(measure.measureNumber, { measure, anchors: [], onsets: [] });
  }

  const grouped = new Map<number, Map<number, Array<PlaybackGeometryNote<T>>>>();
  for (const note of notes) {
    if (!entries.has(note.measureNumber) || !Number.isFinite(note.positionWholes) || !Number.isFinite(note.x)) continue;
    const byPosition = grouped.get(note.measureNumber) ?? new Map<number, Array<PlaybackGeometryNote<T>>>();
    const existingKey = [...byPosition.keys()].find((position) => Math.abs(position - note.positionWholes) < POSITION_EPSILON);
    const key = existingKey ?? note.positionWholes;
    byPosition.set(key, [...(byPosition.get(key) ?? []), note]);
    grouped.set(note.measureNumber, byPosition);
  }

  grouped.forEach((byPosition, measureNumber) => {
    const entry = entries.get(measureNumber)!;
    const positions = [...byPosition.keys()].sort((a, b) => a - b);
    let lastX = Number.NEGATIVE_INFINITY;
    for (const position of positions) {
      const group = byPosition.get(position)!;
      entry.onsets.push({
        key: `${measureNumber}:${position.toFixed(6)}`,
        measureNumber,
        positionWholes: position,
        items: group.map((note) => note.item),
      });
      const timed = group.filter((note) => !note.isMeasureRest);
      const sounding = timed.filter((note) => !note.isRest);
      const anchorNotes = sounding.length ? sounding : timed;
      if (!anchorNotes.length) continue;
      // Keep anchors monotonic: a displaced or grace notehead must not pull the line back.
      const x = Math.max(median(anchorNotes.map((note) => note.x)), lastX);
      lastX = x;
      entry.anchors.push({ positionWholes: position, x });
    }
  });

  const startX = (entry: MeasureEntry<T>) => {
    const first = entry.anchors[0];
    return first && first.positionWholes < POSITION_EPSILON
      ? first.x
      : entry.measure.x + Math.min(MEASURE_START_INSET_PX, entry.measure.width / 4);
  };

  const endX = (entry: MeasureEntry<T>, next: number | null | undefined) => {
    const right = entry.measure.x + entry.measure.width;
    const following = next != null ? entries.get(next) : undefined;
    if (following
      && following.measure.systemIndex === entry.measure.systemIndex
      && following.measure.x >= right - 1) {
      return Math.max(startX(following), entry.anchors[entry.anchors.length - 1]?.x ?? entry.measure.x);
    }
    return Math.max(right, entry.anchors[entry.anchors.length - 1]?.x ?? right);
  };

  const anchorsFor = (entry: MeasureEntry<T>, lengthWholes: number, next: number | null | undefined) => {
    const anchors = [...entry.anchors];
    if (!anchors.length || anchors[0]!.positionWholes > POSITION_EPSILON) {
      anchors.unshift({ positionWholes: 0, x: Math.min(startX(entry), anchors[0]?.x ?? Number.POSITIVE_INFINITY) });
    }
    const length = Math.max(lengthWholes, anchors[anchors.length - 1]!.positionWholes);
    anchors.push({ positionWholes: length + (length <= anchors[anchors.length - 1]!.positionWholes ? POSITION_EPSILON : 0), x: endX(entry, next) });
    return anchors;
  };

  return {
    hasMeasure: (measureNumber) => entries.has(measureNumber),
    place(measureNumber, positionWholes, lengthWholes, next) {
      const entry = entries.get(measureNumber);
      if (!entry) return null;
      const anchors = anchorsFor(entry, lengthWholes, next);
      let x = anchors[anchors.length - 1]!.x;
      if (positionWholes <= anchors[0]!.positionWholes) {
        x = anchors[0]!.x;
      } else {
        for (let index = 1; index < anchors.length; index += 1) {
          const right = anchors[index]!;
          if (positionWholes <= right.positionWholes) {
            const left = anchors[index - 1]!;
            const span = right.positionWholes - left.positionWholes;
            const fraction = span > 0 ? (positionWholes - left.positionWholes) / span : 1;
            x = left.x + (right.x - left.x) * fraction;
            break;
          }
        }
      }
      return {
        x,
        y: entry.measure.y,
        height: entry.measure.height,
        systemIndex: entry.measure.systemIndex,
        measureNumber,
      };
    },
    onsetAt(measureNumber, positionWholes) {
      const entry = entries.get(measureNumber);
      if (!entry) return null;
      let found: PlaybackGeometryOnset<T> | null = null;
      for (const onset of entry.onsets) {
        if (onset.positionWholes > positionWholes + POSITION_EPSILON) break;
        found = onset;
      }
      return found;
    },
    positionForX(measureNumber, x, lengthWholes) {
      const entry = entries.get(measureNumber);
      if (!entry) return null;
      const anchors = anchorsFor(entry, lengthWholes, null);
      if (x <= anchors[0]!.x) return 0;
      for (let index = 1; index < anchors.length; index += 1) {
        const right = anchors[index]!;
        if (x <= right.x) {
          const left = anchors[index - 1]!;
          const width = right.x - left.x;
          const fraction = width > 0 ? (x - left.x) / width : 0;
          return Math.min(lengthWholes, left.positionWholes + (right.positionWholes - left.positionWholes) * fraction);
        }
      }
      return lengthWholes;
    },
  };
}
