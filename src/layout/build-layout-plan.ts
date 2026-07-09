import type { LayoutMeasureSnapshot, LayoutPageSnapshot, LayoutSnapshot, LayoutSystemSnapshot } from '@/src/layout/build-layout-snapshot';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';

export interface MeasureLayoutPlan {
  measureId: string;
  measureNumber: number;
  systemIndex: number;
  pageIndex: number;
  complexity: number;
  collisionPressure: number;
  minimumWidth: number;
  idealWidth: number;
  spacingUnits: number;
  textSpacingDemand: number;
  staffSpacing: number;
}

export interface SystemLayoutPlan {
  systemIndex: number;
  pageIndex: number;
  measureNumbers: number[];
  measureIds: string[];
  explicitBreakBefore: boolean;
  collisionPressure: number;
  collisionMode: 'balanced' | 'relaxed' | 'open';
  minimumWidth: number;
  idealWidth: number;
  spacingUnits: number;
  defaultStaffSpacing: number;
}

export interface PageLayoutPlan {
  pageIndex: number;
  systemIndexes: number[];
  minimumWidth: number;
  idealWidth: number;
}

export interface LayoutPlan {
  revision: number;
  measures: MeasureLayoutPlan[];
  systems: SystemLayoutPlan[];
  pages: PageLayoutPlan[];
}

export interface LayoutPlanOptions {
  baseMeasureWidth?: number;
  eventUnitWidth?: number;
  lyricUnitWidth?: number;
  directionUnitWidth?: number;
  slurUnitWidth?: number;
  tupletUnitWidth?: number;
  repeatUnitWidth?: number;
  endingUnitWidth?: number;
  lyricCharacterUnitWidth?: number;
  directionCharacterUnitWidth?: number;
  minimumMeasureWidth?: number;
  systemIdealWidth?: number;
  pageIdealWidth?: number;
  maxSystemsPerPage?: number;
}

const DEFAULT_OPTIONS: Required<LayoutPlanOptions> = {
  baseMeasureWidth: 72,
  eventUnitWidth: 10,
  lyricUnitWidth: 14,
  directionUnitWidth: 12,
  slurUnitWidth: 6,
  tupletUnitWidth: 8,
  repeatUnitWidth: 12,
  endingUnitWidth: 10,
  lyricCharacterUnitWidth: 2.4,
  directionCharacterUnitWidth: 2,
  minimumMeasureWidth: 56,
  systemIdealWidth: 220,
  pageIdealWidth: 520,
  maxSystemsPerPage: 3,
};

function resolveStaffSpacing(document: ScoreDocumentModel, measure: LayoutMeasureSnapshot) {
  if (measure.explicitStaffSpacing != null) return measure.explicitStaffSpacing;
  const hint = document.layoutHints.find((entry) => (
    entry.kind === 'staffSpacing'
    && typeof entry.value === 'number'
    && entry.measureNumber <= measure.measureNumber
    && (entry.partId == null || entry.partId === measure.sourcePartId)
    && (entry.staffIndex == null || entry.staffIndex === measure.staffIndex)
  ));
  return typeof hint?.value === 'number' ? hint.value : null;
}

function scoreMeasureComplexity(measure: LayoutMeasureSnapshot) {
  return (
    measure.eventCount
    + (measure.voiceCount - 1) * 1.5
    + measure.lyricLineCount * 1.25
    + measure.directionCount
    + measure.slurCount * 0.75
    + measure.tupletCount
    + (measure.hasRepeatStart ? 1 : 0)
    + (measure.hasRepeatEnd ? 1 : 0)
    + (measure.hasEnding ? 1 : 0)
  );
}

function scoreCollisionPressure(measure: LayoutMeasureSnapshot) {
  const lyricOverflow = Math.max(0, measure.maxLyricTokenLength - 8);
  const directionOverflow = Math.max(0, measure.maxDirectionTokenLength - 12);
  return (
    measure.lyricLineCount * 1.5
    + measure.slurCount
    + measure.tupletCount
    + Math.max(0, measure.voiceCount - 1)
    + measure.directionCount * 0.5
    + lyricOverflow * 0.4
    + directionOverflow * 0.25
  );
}

function scoreTextSpacingDemand(measure: LayoutMeasureSnapshot, options: Required<LayoutPlanOptions>) {
  const lyricBaseline = measure.lyricLineCount * 6;
  const directionBaseline = measure.directionCount * 10;
  const lyricOverflowCharacters = Math.max(0, measure.lyricCharacterCount - lyricBaseline);
  const directionOverflowCharacters = Math.max(0, measure.directionCharacterCount - directionBaseline);
  const longestLyricOverflow = Math.max(0, measure.maxLyricTokenLength - 8);
  const longestDirectionOverflow = Math.max(0, measure.maxDirectionTokenLength - 12);
  return Math.round(
    lyricOverflowCharacters * options.lyricCharacterUnitWidth
    + directionOverflowCharacters * options.directionCharacterUnitWidth
    + longestLyricOverflow * options.lyricCharacterUnitWidth * 1.5
    + longestDirectionOverflow * options.directionCharacterUnitWidth * 1.25,
  );
}

function deriveCollisionMode(collisionPressure: number): 'balanced' | 'relaxed' | 'open' {
  if (collisionPressure >= 6) return 'open';
  if (collisionPressure >= 3) return 'relaxed';
  return 'balanced';
}

function recommendedStaffSpacing(measure: LayoutMeasureSnapshot) {
  return (
    84
    + measure.lyricLineCount * 6
    + measure.slurCount * 4
    + measure.tupletCount * 3
    + Math.max(0, measure.voiceCount - 1) * 5
    + measure.directionCount * 2
  );
}

function buildMeasurePlan(
  document: ScoreDocumentModel,
  measure: LayoutMeasureSnapshot,
  options: Required<LayoutPlanOptions>,
): MeasureLayoutPlan {
  const complexity = scoreMeasureComplexity(measure);
  const collisionPressure = scoreCollisionPressure(measure);
  const textSpacingDemand = scoreTextSpacingDemand(measure, options);
  const spacingUnits = Math.max(1, complexity);
  const idealWidth = Math.max(
    options.minimumMeasureWidth,
    options.baseMeasureWidth
      + measure.eventCount * options.eventUnitWidth
      + measure.lyricLineCount * options.lyricUnitWidth
      + measure.directionCount * options.directionUnitWidth
      + measure.slurCount * options.slurUnitWidth
      + measure.tupletCount * options.tupletUnitWidth
      + ((measure.hasRepeatStart || measure.hasRepeatEnd) ? options.repeatUnitWidth : 0)
      + (measure.hasEnding ? options.endingUnitWidth : 0)
      + textSpacingDemand,
  );
  const longestTokenDemand = (
    Math.max(0, measure.maxLyricTokenLength - 8) * options.lyricCharacterUnitWidth * 2.5
    + Math.max(0, measure.maxDirectionTokenLength - 12) * options.directionCharacterUnitWidth * 2
  );
  const minimumWidth = Math.max(
    options.minimumMeasureWidth,
    Math.round(idealWidth * 0.68),
    longestTokenDemand > 0 ? Math.round(options.baseMeasureWidth + longestTokenDemand) : 0,
  );

  return {
    measureId: measure.measureId,
    measureNumber: measure.measureNumber,
    systemIndex: 0,
    pageIndex: 0,
    complexity,
    collisionPressure,
    minimumWidth,
    idealWidth,
    spacingUnits,
    textSpacingDemand,
    staffSpacing: resolveStaffSpacing(document, measure) ?? recommendedStaffSpacing(measure),
  };
}

interface CanonicalMeasureLayout {
  measureNumber: number;
  measureIds: string[];
  minimumWidth: number;
  idealWidth: number;
}

function buildCanonicalMeasureLayouts(measures: MeasureLayoutPlan[]): CanonicalMeasureLayout[] {
  const grouped = new Map<number, CanonicalMeasureLayout>();

  measures.forEach((measure) => {
    const existing = grouped.get(measure.measureNumber);
    if (existing) {
      existing.measureIds.push(measure.measureId);
      existing.minimumWidth = Math.max(existing.minimumWidth, measure.minimumWidth);
      existing.idealWidth = Math.max(existing.idealWidth, measure.idealWidth);
      return;
    }

    grouped.set(measure.measureNumber, {
      measureNumber: measure.measureNumber,
      measureIds: [measure.measureId],
      minimumWidth: measure.minimumWidth,
      idealWidth: measure.idealWidth,
    });
  });

  return Array.from(grouped.values()).sort((a, b) => a.measureNumber - b.measureNumber);
}

function reflowSystems(
  snapshot: LayoutSnapshot,
  measures: MeasureLayoutPlan[],
  options: Required<LayoutPlanOptions>,
): LayoutSystemSnapshot[] {
  const measuresByNumber = new Map<number, LayoutMeasureSnapshot[]>();
  snapshot.measures.forEach((measure) => {
    const existing = measuresByNumber.get(measure.measureNumber);
    if (existing) {
      existing.push(measure);
    } else {
      measuresByNumber.set(measure.measureNumber, [measure]);
    }
  });

  const canonicalLayouts = buildCanonicalMeasureLayouts(measures);
  const systems: LayoutSystemSnapshot[] = [];
  let currentSystem: LayoutSystemSnapshot | null = null;
  let currentSystemIdealWidth = 0;

  const pushSystem = () => {
    if (!currentSystem) return;
    systems.push(currentSystem);
    currentSystem = null;
    currentSystemIdealWidth = 0;
  };

  canonicalLayouts.forEach((canonical, index) => {
    const snapshotMeasures = measuresByNumber.get(canonical.measureNumber) ?? [];
    const explicitBreakBefore = index > 0 && snapshotMeasures.some((entry) => entry.explicitSystemBreak || entry.explicitPageBreak);
    const shouldWrapForWidth = (
      currentSystem != null
      && currentSystem.measureNumbers.length > 0
      && currentSystemIdealWidth + canonical.idealWidth > options.systemIdealWidth
    );

    if (!currentSystem || explicitBreakBefore || shouldWrapForWidth) {
      pushSystem();
      currentSystem = {
        systemIndex: systems.length,
        pageIndex: 0,
        measureNumbers: [],
        measureIds: [],
        explicitBreakBefore,
      };
    }

    currentSystem.measureNumbers.push(canonical.measureNumber);
    currentSystem.measureIds.push(...canonical.measureIds);
    currentSystemIdealWidth += canonical.idealWidth;
  });

  pushSystem();
  return systems;
}

function reflowPages(
  snapshot: LayoutSnapshot,
  systemPlans: SystemLayoutPlan[],
  options: Required<LayoutPlanOptions>,
): LayoutPageSnapshot[] {
  const explicitPageBreakMeasures = new Set(
    snapshot.measures
      .filter((measure) => measure.explicitPageBreak)
      .map((measure) => measure.measureNumber),
  );

  const pages: LayoutPageSnapshot[] = [];
  let currentPage: LayoutPageSnapshot | null = null;
  let currentPageIdealWidth = 0;

  const pushPage = () => {
    if (!currentPage) return;
    pages.push(currentPage);
    currentPage = null;
    currentPageIdealWidth = 0;
  };

  systemPlans.forEach((system, index) => {
    const startsWithMeasure = system.measureNumbers[0];
    const explicitPageBreakBefore = index > 0 && startsWithMeasure != null && explicitPageBreakMeasures.has(startsWithMeasure);
    const shouldWrapForPage = (
      currentPage != null
      && currentPage.systemIndexes.length > 0
      && (
        currentPage.systemIndexes.length >= options.maxSystemsPerPage
        || currentPageIdealWidth + system.idealWidth > options.pageIdealWidth
      )
    );

    if (!currentPage || explicitPageBreakBefore || shouldWrapForPage) {
      pushPage();
      currentPage = {
        pageIndex: pages.length,
        systemIndexes: [],
      };
    }

    system.pageIndex = currentPage.pageIndex;
    currentPage.systemIndexes.push(system.systemIndex);
    currentPageIdealWidth += system.idealWidth;
  });

  pushPage();
  return pages;
}

export function buildLayoutPlan(
  document: ScoreDocumentModel,
  snapshot: LayoutSnapshot,
  options: LayoutPlanOptions = {},
): LayoutPlan {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const measurePlans = snapshot.measures.map((measure) => buildMeasurePlan(document, measure, resolvedOptions));
  const reflowedSystems = reflowSystems(snapshot, measurePlans, resolvedOptions);
  const systemAssignments = new Map<string, number>();
  reflowedSystems.forEach((system) => {
    system.measureIds.forEach((measureId) => {
      systemAssignments.set(measureId, system.systemIndex);
    });
  });
  measurePlans.forEach((measure) => {
    measure.systemIndex = systemAssignments.get(measure.measureId) ?? 0;
  });

  const systemPlans: SystemLayoutPlan[] = reflowedSystems.map((system) => {
    const measures = measurePlans.filter((entry) => system.measureIds.includes(entry.measureId));
    const collisionPressure = measures.reduce((max, measure) => Math.max(max, measure.collisionPressure), 0);
    return {
      systemIndex: system.systemIndex,
      pageIndex: system.pageIndex,
      measureNumbers: [...system.measureNumbers],
      measureIds: [...system.measureIds],
      explicitBreakBefore: system.explicitBreakBefore,
      collisionPressure,
      collisionMode: deriveCollisionMode(collisionPressure),
      minimumWidth: measures.reduce((sum, measure) => sum + measure.minimumWidth, 0),
      idealWidth: measures.reduce((sum, measure) => sum + measure.idealWidth, 0),
      spacingUnits: measures.reduce((sum, measure) => sum + measure.spacingUnits, 0),
      defaultStaffSpacing: measures.reduce((max, measure) => Math.max(max, measure.staffSpacing), 0),
    };
  });
  const pageSnapshots = reflowPages(snapshot, systemPlans, resolvedOptions);

  const measureAssignments = new Map<string, { systemIndex: number; pageIndex: number }>();
  systemPlans.forEach((system) => {
    system.measureIds.forEach((measureId) => {
      measureAssignments.set(measureId, {
        systemIndex: system.systemIndex,
        pageIndex: system.pageIndex,
      });
    });
  });

  measurePlans.forEach((measure) => {
    const assignment = measureAssignments.get(measure.measureId);
    measure.systemIndex = assignment?.systemIndex ?? 0;
    measure.pageIndex = assignment?.pageIndex ?? 0;
  });

  const pagePlans: PageLayoutPlan[] = pageSnapshots.map((page) => {
    const systems = systemPlans.filter((entry) => page.systemIndexes.includes(entry.systemIndex));
    return {
      pageIndex: page.pageIndex,
      systemIndexes: [...page.systemIndexes],
      minimumWidth: systems.reduce((sum, system) => sum + system.minimumWidth, 0),
      idealWidth: systems.reduce((sum, system) => sum + system.idealWidth, 0),
    };
  });

  return {
    revision: snapshot.revision,
    measures: measurePlans,
    systems: systemPlans,
    pages: pagePlans,
  };
}
