export type TabletEntryPhase =
  | 'idle'
  | 'hovering'
  | 'contact-preview'
  | 'refining'
  | 'committing'
  | 'cancelled';

export type DirectEntryPointerType = 'touch' | 'pen';

export interface TabletEntryPoint {
  x: number;
  y: number;
}

export interface TabletEntryStaffGeometry {
  id: string;
  staffIndex: number;
  topLineY: number;
  bottomLineY: number;
  lineDistancePx: number;
  captureTop: number;
  captureBottom: number;
}

export interface TabletEntrySession<TPreview, TResolved> {
  phase: TabletEntryPhase;
  pointerId: number;
  pointerType: DirectEntryPointerType;
  initialPoint: TabletEntryPoint;
  latestPoint: TabletEntryPoint;
  effectivePoint: TabletEntryPoint;
  initialStaff: TabletEntryStaffGeometry;
  stableStaff: TabletEntryStaffGeometry;
  initialSlotKey: string;
  stableStaffStep: number;
  grabOffsetY: number;
  xRefinementActivated: boolean;
  moved: boolean;
  lastValidatedPreview: TPreview;
  lastValidatedResolvedTarget: TResolved;
  lastAuditionedPitch: string | null;
  lastAuditionTimestamp: number;
  staffSwitchPulse: number;
}

export interface StartTabletEntryInput<TPreview, TResolved> {
  pointerId: number;
  pointerType: DirectEntryPointerType;
  point: TabletEntryPoint;
  staff: TabletEntryStaffGeometry;
  staffStep: number;
  initialSlotKey: string;
  preview: TPreview;
  resolvedTarget: TResolved;
}

export interface RefineTabletEntryInput {
  point: TabletEntryPoint;
  slotSpacingPx: number;
  candidateStaff?: TabletEntryStaffGeometry | null;
}

function positiveFinite(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function tabletEntryStaffId(input: {
  corePartId?: string | null;
  systemIndex?: number | null;
  staffIndex: number;
}) {
  return `${input.corePartId ?? 'partless'}:${input.systemIndex ?? 'systemless'}:${input.staffIndex}`;
}

export function startTabletEntrySession<TPreview, TResolved>(
  input: StartTabletEntryInput<TPreview, TResolved>,
): TabletEntrySession<TPreview, TResolved> {
  const halfStepPx = positiveFinite(input.staff.lineDistancePx / 2, 1);
  const laneCenterY = input.staff.topLineY + (input.staffStep * halfStepPx);
  return {
    phase: 'contact-preview',
    pointerId: input.pointerId,
    pointerType: input.pointerType,
    initialPoint: { ...input.point },
    latestPoint: { ...input.point },
    effectivePoint: {
      x: input.point.x,
      y: laneCenterY,
    },
    initialStaff: input.staff,
    stableStaff: input.staff,
    initialSlotKey: input.initialSlotKey,
    stableStaffStep: input.staffStep,
    grabOffsetY: input.point.y - laneCenterY,
    xRefinementActivated: false,
    moved: false,
    lastValidatedPreview: input.preview,
    lastValidatedResolvedTarget: input.resolvedTarget,
    lastAuditionedPitch: null,
    lastAuditionTimestamp: 0,
    staffSwitchPulse: 0,
  };
}

function horizontalIntentThreshold(pointerType: DirectEntryPointerType, slotSpacingPx: number) {
  const floor = pointerType === 'touch' ? 14 : 8;
  return Math.max(floor, positiveFinite(slotSpacingPx, floor) * 0.35);
}

function verticalNoiseFloor(pointerType: DirectEntryPointerType, halfStepPx: number) {
  const preferred = pointerType === 'touch' ? 1.5 : 0.6;
  return Math.min(preferred, halfStepPx * 0.2);
}

function shouldSwitchStaff<TPreview, TResolved>(
  session: TabletEntrySession<TPreview, TResolved>,
  candidate: TabletEntryStaffGeometry | null | undefined,
  pointerY: number,
) {
  if (!candidate || candidate.id === session.stableStaff.id) return false;
  const current = session.stableStaff;
  if (pointerY >= current.captureTop && pointerY <= current.captureBottom) return false;
  const currentCenter = (current.topLineY + current.bottomLineY) / 2;
  const candidateCenter = (candidate.topLineY + candidate.bottomLineY) / 2;
  const midpoint = (currentCenter + candidateCenter) / 2;
  const hysteresis = Math.max(6, Math.min(current.lineDistancePx, candidate.lineDistancePx) * 0.75);
  return candidateCenter > currentCenter
    ? pointerY > midpoint + hysteresis
    : pointerY < midpoint - hysteresis;
}

export function refineTabletEntrySession<TPreview, TResolved>(
  session: TabletEntrySession<TPreview, TResolved>,
  input: RefineTabletEntryInput,
): TabletEntrySession<TPreview, TResolved> {
  if (session.phase !== 'contact-preview' && session.phase !== 'refining') return session;

  const staffChanged = shouldSwitchStaff(session, input.candidateStaff, input.point.y);
  const stableStaff = staffChanged ? input.candidateStaff! : session.stableStaff;
  const halfStepPx = positiveFinite(stableStaff.lineDistancePx / 2, 1);
  const grabOffsetY = staffChanged ? 0 : session.grabOffsetY;
  const effectiveRawY = input.point.y - grabOffsetY;
  const currentCenterY = stableStaff.topLineY + (session.stableStaffStep * halfStepPx);
  const deltaFromCenter = effectiveRawY - currentCenterY;
  const boundary = (halfStepPx / 2) + verticalNoiseFloor(session.pointerType, halfStepPx);
  const crossedBoundary = Math.abs(deltaFromCenter) > boundary;
  const stableStaffStep = staffChanged
    ? Math.round((input.point.y - stableStaff.topLineY) / halfStepPx)
    : crossedBoundary
      ? Math.round((effectiveRawY - stableStaff.topLineY) / halfStepPx)
      : session.stableStaffStep;
  const stableLaneY = stableStaff.topLineY + (stableStaffStep * halfStepPx);

  const deltaX = input.point.x - session.initialPoint.x;
  const xRefinementActivated = session.xRefinementActivated
    || Math.abs(deltaX) > horizontalIntentThreshold(session.pointerType, input.slotSpacingPx);
  const effectiveX = xRefinementActivated ? input.point.x : session.initialPoint.x;
  const moved = session.moved
    || Math.hypot(
      input.point.x - session.initialPoint.x,
      input.point.y - session.initialPoint.y,
    ) > 0.5;

  return {
    ...session,
    phase: moved ? 'refining' : 'contact-preview',
    latestPoint: { ...input.point },
    effectivePoint: { x: effectiveX, y: stableLaneY },
    stableStaff,
    stableStaffStep,
    grabOffsetY,
    xRefinementActivated,
    moved,
    staffSwitchPulse: session.staffSwitchPulse + (staffChanged ? 1 : 0),
  };
}

export function bindTabletEntryPreview<TPreview, TResolved>(
  session: TabletEntrySession<TPreview, TResolved>,
  preview: TPreview,
  resolvedTarget: TResolved,
) {
  if (session.phase !== 'contact-preview' && session.phase !== 'refining') return session;
  return {
    ...session,
    lastValidatedPreview: preview,
    lastValidatedResolvedTarget: resolvedTarget,
  };
}

export function commitTabletEntrySession<TPreview, TResolved>(
  session: TabletEntrySession<TPreview, TResolved>,
) {
  if (session.phase !== 'contact-preview' && session.phase !== 'refining') {
    return { session, target: null as TResolved | null };
  }
  return {
    session: { ...session, phase: 'committing' as const },
    target: session.lastValidatedResolvedTarget,
  };
}

export function cancelTabletEntrySession<TPreview, TResolved>(
  session: TabletEntrySession<TPreview, TResolved>,
) {
  if (session.phase === 'committing' || session.phase === 'cancelled') return session;
  return { ...session, phase: 'cancelled' as const };
}

export function shouldAuditionTabletPitch<TPreview, TResolved>(
  session: TabletEntrySession<TPreview, TResolved>,
  pitch: string,
  now: number,
  minimumIntervalMs = 55,
) {
  return pitch !== session.lastAuditionedPitch
    && now - session.lastAuditionTimestamp >= minimumIntervalMs;
}

export function markTabletPitchAuditioned<TPreview, TResolved>(
  session: TabletEntrySession<TPreview, TResolved>,
  pitch: string,
  now: number,
) {
  return {
    ...session,
    lastAuditionedPitch: pitch,
    lastAuditionTimestamp: now,
  };
}
