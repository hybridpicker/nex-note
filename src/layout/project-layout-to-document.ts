import { buildLayoutPlan } from '@/src/layout/build-layout-plan';
import type { LayoutPlanOptions } from '@/src/layout/build-layout-plan';
import { buildLayoutSnapshot } from '@/src/layout/build-layout-snapshot';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';

function cloneDocument<T>(value: T): T {
  return structuredClone(value);
}

export function projectLayoutToDocument(document: ScoreDocumentModel, options?: LayoutPlanOptions): ScoreDocumentModel {
  const projected = cloneDocument(document);
  const snapshot = buildLayoutSnapshot(projected);
  const plan = buildLayoutPlan(projected, snapshot, options);
  const measurePlans = new Map(plan.measures.map((measure) => [measure.measureId, measure] as const));

  for (const part of projected.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        measure.print = {
          ...measure.print,
          newSystem: undefined,
          newPage: undefined,
        };
      }
    }
  }

  projected.layoutHints = projected.layoutHints.filter((hint) => hint.kind !== 'staffSpacing');

  for (const system of plan.systems) {
    const firstMeasureNumber = system.measureNumbers[0];
    if (firstMeasureNumber == null) continue;

    for (const part of projected.score.parts) {
      for (const staff of part.staves) {
        const measure = staff.measures.find((entry) => entry.measureNumber === firstMeasureNumber);
        if (!measure) continue;
        if (system.systemIndex > 0) {
          measure.print = {
            ...measure.print,
            newSystem: true,
          };
        }
        const page = plan.pages.find((entry) => entry.pageIndex === system.pageIndex);
        if (system.pageIndex > 0 && page?.systemIndexes[0] === system.systemIndex) {
          measure.print = {
            ...measure.print,
            newPage: true,
          };
        }
      }
    }
  }

  snapshot.measures.forEach((measure) => {
    const projectedPart = projected.score.parts.find((part) => part.id === measure.partId || part.sourcePartId === measure.sourcePartId);
    const projectedStaff = projectedPart?.staves.find((staff) => staff.staffIndex === measure.staffIndex);
    const projectedMeasure = projectedStaff?.measures.find((entry) => entry.id === measure.measureId || entry.measureNumber === measure.measureNumber);
    if (!projectedPart || !projectedStaff || !projectedMeasure) return;

    const spacing = measurePlans.get(measure.measureId)?.staffSpacing ?? measure.explicitStaffSpacing ?? 84;
    projected.layoutHints.push({
      id: `layout:${projectedPart.sourcePartId}:${projectedStaff.staffIndex}:${projectedMeasure.measureNumber}:staffSpacing:projected`,
      scope: 'staff',
      measureNumber: projectedMeasure.measureNumber,
      partId: projectedPart.sourcePartId,
      staffIndex: projectedStaff.staffIndex,
      kind: 'staffSpacing',
      value: spacing,
    });
  });

  return projected;
}
