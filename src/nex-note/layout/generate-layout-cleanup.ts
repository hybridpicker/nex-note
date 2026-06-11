import { projectLayoutToDocument } from '@/src/layout/project-layout-to-document';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import type { ParsedIntentJson } from '@/src/nex-note/intent/parse-intent-json';
import type { ScoreCommand } from '@/src/shared/schemas/score-command';
import { isLocalResponseGerman, type SupportedAppLocale } from '@/src/nex-note/language/local-response-language';

export interface LayoutCleanupIntent extends ParsedIntentJson {
  commands: ScoreCommand[];
}

interface StaffSpacingTarget {
  measureNumber: number;
  partId?: string;
  staffIndex?: number;
  value: number;
}

function buildLayoutKey(measureNumber: number, partId?: string, staffIndex?: number) {
  return `${partId ?? 'all'}:${staffIndex ?? 'all'}:${measureNumber}`;
}

function collectBreakMeasures(document: ScoreDocumentModel, kind: 'newSystem' | 'newPage') {
  const measures = new Set<number>();

  document.score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      staff.measures.forEach((measure) => {
        const printValue = kind === 'newSystem' ? measure.print?.newSystem : measure.print?.newPage;
        const hintValue = document.layoutHints.some((hint) => (
          hint.measureNumber === measure.measureNumber
          && hint.kind === kind
          && hint.value === true
          && (hint.partId == null || hint.partId === part.sourcePartId)
          && (hint.staffIndex == null || hint.staffIndex === staff.staffIndex)
        ));
        if (printValue || hintValue) measures.add(measure.measureNumber);
      });
    });
  });

  return measures;
}

function collectStaffSpacing(document: ScoreDocumentModel) {
  const spacing = new Map<string, StaffSpacingTarget>();

  document.layoutHints.forEach((hint) => {
    if (hint.kind !== 'staffSpacing' || typeof hint.value !== 'number') return;
    spacing.set(buildLayoutKey(hint.measureNumber, hint.partId, hint.staffIndex), {
      measureNumber: hint.measureNumber,
      partId: hint.partId,
      staffIndex: hint.staffIndex,
      value: hint.value,
    });
  });

  return spacing;
}

export function generateLayoutCleanupIntent(document: ScoreDocumentModel, message: string, appLocale?: SupportedAppLocale): LayoutCleanupIntent {
  const projected = projectLayoutToDocument(document);
  const currentSystemBreaks = collectBreakMeasures(document, 'newSystem');
  const currentPageBreaks = collectBreakMeasures(document, 'newPage');
  const projectedSystemBreaks = collectBreakMeasures(projected, 'newSystem');
  const projectedPageBreaks = collectBreakMeasures(projected, 'newPage');
  const currentStaffSpacing = collectStaffSpacing(document);
  const projectedStaffSpacing = collectStaffSpacing(projected);

  const commands: ScoreCommand[] = [];
  const allBreakMeasures = new Set<number>([
    ...currentSystemBreaks,
    ...currentPageBreaks,
    ...projectedSystemBreaks,
    ...projectedPageBreaks,
  ]);

  [...allBreakMeasures]
    .sort((a, b) => a - b)
    .forEach((measureNumber) => {
      const nextSystemBreak = projectedSystemBreaks.has(measureNumber);
      if (currentSystemBreaks.has(measureNumber) !== nextSystemBreak) {
        commands.push({ type: 'setSystemBreak', measureNumber, value: nextSystemBreak });
      }

      const nextPageBreak = projectedPageBreaks.has(measureNumber);
      if (currentPageBreaks.has(measureNumber) !== nextPageBreak) {
        commands.push({ type: 'setPageBreak', measureNumber, value: nextPageBreak });
      }
    });

  Array.from(projectedStaffSpacing.values())
    .sort((a, b) => (
      a.measureNumber - b.measureNumber
      || (a.staffIndex ?? 0) - (b.staffIndex ?? 0)
      || (a.partId ?? '').localeCompare(b.partId ?? '')
    ))
    .forEach((target) => {
      const key = buildLayoutKey(target.measureNumber, target.partId, target.staffIndex);
      const current = currentStaffSpacing.get(key);
      if (current && Math.abs(current.value - target.value) < 1) return;
      commands.push({
        type: 'setMeasureLayoutHint',
        measureNumber: target.measureNumber,
        hint: 'staffSpacing',
        value: target.value,
        partId: target.partId,
        staffIndex: target.staffIndex,
      });
    });

  const breakCount = commands.filter((command) => command.type === 'setSystemBreak' || command.type === 'setPageBreak').length;
  const spacingCount = commands.filter((command) => command.type === 'setMeasureLayoutHint').length;
  const german = isLocalResponseGerman(message, appLocale);
  const explanation = commands.length === 0
    ? (german
      ? 'Das Layout wirkt bereits aufgeräumt; es wurden keine zusätzlichen Hinweise vorbereitet.'
      : 'The layout already looks organized; no additional cleanup hints were needed.')
    : (german
      ? `Layout-Bereinigung vorbereitet: ${breakCount} Umbruch-Hinweise und ${spacingCount} Abstands-Hinweise.`
      : `Prepared layout cleanup with ${breakCount} break hints and ${spacingCount} spacing hints.`);

  return {
    commands,
    explanation,
    confidence: 'high',
    ambiguities: [],
    plan: commands.length === 0
      ? ['Inspect current spacing']
      : ['Inspect current spacing', 'Prepare cleanup hints'],
  };
}
