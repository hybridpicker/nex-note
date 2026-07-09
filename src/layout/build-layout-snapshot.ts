import type { LayoutHint, ScoreDocumentModel } from '@/src/score-core/model/types';

export interface LayoutMeasureSnapshot {
  measureId: string;
  measureNumber: number;
  partId: string;
  sourcePartId: string;
  staffIndex: number;
  voiceCount: number;
  eventCount: number;
  lyricLineCount: number;
  lyricVerseCount: number;
  lyricCharacterCount: number;
  maxLyricTokenLength: number;
  directionCount: number;
  directionCharacterCount: number;
  maxDirectionTokenLength: number;
  slurCount: number;
  tupletCount: number;
  hasRepeatStart: boolean;
  hasRepeatEnd: boolean;
  hasEnding: boolean;
  explicitStaffSpacing: number | null;
  eventIds: string[];
  directionIds: string[];
  explicitSystemBreak: boolean;
  explicitPageBreak: boolean;
  hintIds: string[];
}

export interface LayoutSystemSnapshot {
  systemIndex: number;
  pageIndex: number;
  measureNumbers: number[];
  measureIds: string[];
  explicitBreakBefore: boolean;
}

export interface LayoutPageSnapshot {
  pageIndex: number;
  systemIndexes: number[];
}

export interface LayoutAnchorSnapshot {
  eventId: string;
  measureId: string;
  measureNumber: number;
  partId: string;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
}

export interface LayoutSnapshot {
  revision: number;
  measures: LayoutMeasureSnapshot[];
  systems: LayoutSystemSnapshot[];
  pages: LayoutPageSnapshot[];
  anchors: LayoutAnchorSnapshot[];
}

function hasMeasureBreakHint(hints: LayoutHint[], measureNumber: number, kind: 'newSystem' | 'newPage') {
  return hints.some((hint) => hint.measureNumber === measureNumber && hint.kind === kind && hint.value === true);
}

function findStaffSpacingHintValue(hints: LayoutHint[], measureNumber: number, partId: string, staffIndex: number) {
  const hint = hints.find((entry) => (
    entry.measureNumber === measureNumber
    && entry.kind === 'staffSpacing'
    && typeof entry.value === 'number'
    && (entry.partId == null || entry.partId === partId)
    && (entry.staffIndex == null || entry.staffIndex === staffIndex)
  ));
  return typeof hint?.value === 'number' ? hint.value : null;
}

export function buildLayoutSnapshot(document: ScoreDocumentModel): LayoutSnapshot {
  const measures: LayoutMeasureSnapshot[] = [];
  const anchors: LayoutAnchorSnapshot[] = [];

  for (const part of document.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        const eventIds = measure.voices.flatMap((voice) => voice.events.map((event) => event.id));
        const directionIds = measure.directions.map((direction) => direction.id);
        const lyricLines = document.lyricLines.filter((line) => eventIds.includes(line.eventId));
        const lyricLineCount = lyricLines.length;
        const lyricVerseCount = new Set(lyricLines.map((line) => line.verseNumber)).size;
        const lyricCharacterCount = lyricLines.reduce((sum, line) => sum + Array.from(line.text.trim()).length, 0);
        const maxLyricTokenLength = lyricLines.reduce(
          (max, line) => Math.max(max, Array.from(line.text.trim()).length),
          0,
        );
        const directionTexts = measure.directions
          .map((direction) => direction.value?.trim() ?? '')
          .filter(Boolean);
        const directionCharacterCount = directionTexts.reduce((sum, value) => sum + Array.from(value).length, 0);
        const maxDirectionTokenLength = directionTexts.reduce(
          (max, value) => Math.max(max, Array.from(value).length),
          0,
        );
        const slurCount = document.slurs.filter((slur) => {
          const start = slur.startEventId ? eventIds.includes(slur.startEventId) : false;
          const stop = slur.stopEventId ? eventIds.includes(slur.stopEventId) : false;
          return start || stop;
        }).length;
        const tupletCount = document.tuplets.filter((tuplet) => tuplet.eventIds.some((eventId) => eventIds.includes(eventId))).length;
        const explicitSystemBreak = Boolean(measure.print?.newSystem) || hasMeasureBreakHint(document.layoutHints, measure.measureNumber, 'newSystem');
        const explicitPageBreak = Boolean(measure.print?.newPage) || hasMeasureBreakHint(document.layoutHints, measure.measureNumber, 'newPage');
        const explicitStaffSpacing = findStaffSpacingHintValue(document.layoutHints, measure.measureNumber, part.sourcePartId, staff.staffIndex);

        measures.push({
          measureId: measure.id,
          measureNumber: measure.measureNumber,
          partId: part.id,
          sourcePartId: part.sourcePartId,
          staffIndex: staff.staffIndex,
          voiceCount: measure.voices.length,
          eventCount: eventIds.length,
          lyricLineCount,
          lyricVerseCount,
          lyricCharacterCount,
          maxLyricTokenLength,
          directionCount: directionIds.length,
          directionCharacterCount,
          maxDirectionTokenLength,
          slurCount,
          tupletCount,
          hasRepeatStart: measure.leftBarline === 'repeat-start',
          hasRepeatEnd: measure.rightBarline === 'repeat-end',
          hasEnding: Boolean(measure.leftEnding || measure.rightEnding),
          explicitStaffSpacing,
          eventIds,
          directionIds,
          explicitSystemBreak,
          explicitPageBreak,
          hintIds: document.layoutHints
            .filter((hint) => hint.measureNumber === measure.measureNumber && (hint.partId == null || hint.partId === part.id) && (hint.staffIndex == null || hint.staffIndex === staff.staffIndex))
            .map((hint) => hint.id),
        });

        for (const voice of measure.voices) {
          for (const event of voice.events) {
            anchors.push({
              eventId: event.id,
              measureId: measure.id,
              measureNumber: measure.measureNumber,
              partId: part.id,
              staffIndex: staff.staffIndex,
              voiceId: voice.voiceId,
              timestampNum: event.timestampNum,
              timestampDen: event.timestampDen,
            });
          }
        }
      }
    }
  }

  const canonicalMeasures = document.score.parts[0]?.staves[0]?.measures ?? [];
  const measuresByNumber = new Map<number, LayoutMeasureSnapshot[]>();
  for (const measure of measures) {
    const entries = measuresByNumber.get(measure.measureNumber);
    if (entries) {
      entries.push(measure);
    } else {
      measuresByNumber.set(measure.measureNumber, [measure]);
    }
  }

  const systems: LayoutSystemSnapshot[] = [];
  let currentPageIndex = 0;
  let currentSystem: LayoutSystemSnapshot | null = null;

  const pushSystem = () => {
    if (!currentSystem) return;
    systems.push(currentSystem);
  };

  canonicalMeasures.forEach((measure, index) => {
    const measureSnapshots = measuresByNumber.get(measure.measureNumber) ?? [];
    const explicitBreakBefore = index > 0 && measureSnapshots.some((entry) => entry.explicitSystemBreak || entry.explicitPageBreak);
    const startsNewPage = index > 0 && measureSnapshots.some((entry) => entry.explicitPageBreak);

    if (!currentSystem) {
      currentSystem = {
        systemIndex: systems.length,
        pageIndex: currentPageIndex,
        measureNumbers: [],
        measureIds: [],
        explicitBreakBefore,
      };
    } else if (explicitBreakBefore) {
      pushSystem();
      if (startsNewPage) currentPageIndex += 1;
      currentSystem = {
        systemIndex: systems.length,
        pageIndex: currentPageIndex,
        measureNumbers: [],
        measureIds: [],
        explicitBreakBefore,
      };
    }

    currentSystem.measureNumbers.push(measure.measureNumber);
    currentSystem.measureIds.push(...measureSnapshots.map((entry) => entry.measureId));
  });

  pushSystem();
  const pages: LayoutPageSnapshot[] = [];
  for (const system of systems) {
    const previousPage = pages[pages.length - 1];
    if (!previousPage || previousPage.pageIndex !== system.pageIndex) {
      pages.push({
        pageIndex: system.pageIndex,
        systemIndexes: [system.systemIndex],
      });
      continue;
    }

    previousPage.systemIndexes.push(system.systemIndex);
  }

  return {
    revision: document.revision,
    measures,
    systems,
    pages,
    anchors,
  };
}
