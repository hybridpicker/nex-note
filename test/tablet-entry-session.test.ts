import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bindTabletEntryPreview,
  cancelTabletEntrySession,
  commitTabletEntrySession,
  refineTabletEntrySession,
  startTabletEntrySession,
  type TabletEntryStaffGeometry,
} from '../src/score-input/tablet-entry-session.ts';

const upperStaff: TabletEntryStaffGeometry = {
  id: 'P1:0:1',
  staffIndex: 1,
  topLineY: 100,
  bottomLineY: 140,
  lineDistancePx: 10,
  captureTop: 80,
  captureBottom: 160,
};

function start(pointerType: 'touch' | 'pen' = 'touch') {
  return startTabletEntrySession({
    pointerId: 7,
    pointerType,
    point: { x: 200, y: 121.8 },
    staff: upperStaff,
    staffStep: 4,
    initialSlotKey: 'm1:1:0/1',
    preview: { pitch: 'B4', onset: '0/1' },
    resolvedTarget: { pitch: 'B4', onset: '0/1' },
  });
}

test('contact begins as a non-committing preview with the nearest lane and grab offset', () => {
  const session = start();
  assert.equal(session.phase, 'contact-preview');
  assert.equal(session.stableStaffStep, 4);
  assert.equal(session.effectivePoint.y, 120);
  assert.ok(Math.abs(session.grabOffsetY - 1.8) < 1e-9);
});

test('hover is not a contact session and cannot be committed by the contact reducer', () => {
  const hovering = { ...start('pen'), phase: 'hovering' as const };
  const committed = commitTabletEntrySession(hovering);
  assert.equal(committed.target, null);
  assert.equal(committed.session.phase, 'hovering');
});

test('touch and pen contact never commit until pointer up asks for commit', () => {
  for (const pointerType of ['touch', 'pen'] as const) {
    const session = start(pointerType);
    assert.equal(session.phase, 'contact-preview');
    assert.deepEqual(session.lastValidatedResolvedTarget, { pitch: 'B4', onset: '0/1' });
  }
});

test('pointer up commits the exact last stable resolved target object', () => {
  const target = { pitch: 'C5', onset: '1/4' };
  const bound = bindTabletEntryPreview(
    start(),
    { pitch: 'C5', onset: '1/4' },
    target,
  );
  const committed = commitTabletEntrySession(bound);
  assert.equal(committed.session.phase, 'committing');
  assert.equal(committed.target, target);
});

test('release jitter is ignored because commit never accepts release coordinates', () => {
  const target = { pitch: 'C5', onset: '1/4' };
  const refined = refineTabletEntrySession(
    bindTabletEntryPreview(start(), { pitch: 'C5', onset: '1/4' }, target),
    { point: { x: 244, y: 116 }, slotSpacingPx: 40 },
  );
  const committed = commitTabletEntrySession(refined);
  assert.equal(committed.target, target);
});

test('cancel, lost capture, and mode exit share the no-commit cancelled transition', () => {
  for (const reason of ['pointercancel', 'lostcapture', 'mode-exit']) {
    const cancelled = cancelTabletEntrySession(start());
    assert.equal(cancelled.phase, 'cancelled', reason);
    assert.equal(commitTabletEntrySession(cancelled).target, null, reason);
  }
});

test('initial grab offset prevents the first refinement move from jumping lanes', () => {
  const session = start();
  const refined = refineTabletEntrySession(session, {
    point: { x: 200, y: 122.1 },
    slotSpacingPx: 40,
  });
  assert.equal(refined.stableStaffStep, 4);
});

test('vertical hysteresis holds on both sides of every line/space midpoint', () => {
  for (let staffStep = -4; staffStep <= 14; staffStep += 1) {
    const centerY = upperStaff.topLineY + staffStep * 5;
    const session = startTabletEntrySession({
      pointerId: staffStep + 20,
      pointerType: 'pen',
      point: { x: 200, y: centerY },
      staff: upperStaff,
      staffStep,
      initialSlotKey: 'slot',
      preview: staffStep,
      resolvedTarget: staffStep,
    });
    assert.equal(refineTabletEntrySession(session, {
      point: { x: 200, y: centerY + 2.9 },
      slotSpacingPx: 40,
    }).stableStaffStep, staffStep);
    assert.equal(refineTabletEntrySession(session, {
      point: { x: 200, y: centerY - 2.9 },
      slotSpacingPx: 40,
    }).stableStaffStep, staffStep);
  }
});

test('crossing the Schmitt threshold makes adjacent lanes reachable at low zoom', () => {
  const lowZoom = { ...upperStaff, lineDistancePx: 4, bottomLineY: 116 };
  const session = startTabletEntrySession({
    pointerId: 1,
    pointerType: 'touch',
    point: { x: 100, y: 108 },
    staff: lowZoom,
    staffStep: 4,
    initialSlotKey: 'slot',
    preview: 4,
    resolvedTarget: 4,
  });
  assert.equal(refineTabletEntrySession(session, {
    point: { x: 100, y: 111 },
    slotSpacingPx: 12,
  }).stableStaffStep, 6);
});

test('horizontal drift stays locked while vertical pitch refinement remains active', () => {
  const refined = refineTabletEntrySession(start(), {
    point: { x: 211, y: 128 },
    slotSpacingPx: 48,
  });
  assert.equal(refined.xRefinementActivated, false);
  assert.equal(refined.effectivePoint.x, 200);
  assert.notEqual(refined.stableStaffStep, 4);
});

test('intentional horizontal movement activates rhythmic refinement permanently', () => {
  const activated = refineTabletEntrySession(start(), {
    point: { x: 221, y: 122 },
    slotSpacingPx: 48,
  });
  assert.equal(activated.xRefinementActivated, true);
  assert.equal(activated.effectivePoint.x, 221);
  const movedBack = refineTabletEntrySession(activated, {
    point: { x: 203, y: 122 },
    slotSpacingPx: 48,
  });
  assert.equal(movedBack.xRefinementActivated, true);
  assert.equal(movedBack.effectivePoint.x, 203);
});

test('staff remains locked in its capture region and switches only beyond midpoint hysteresis', () => {
  const lowerStaff: TabletEntryStaffGeometry = {
    id: 'P1:0:2',
    staffIndex: 2,
    topLineY: 190,
    bottomLineY: 230,
    lineDistancePx: 10,
    captureTop: 170,
    captureBottom: 250,
  };
  const held = refineTabletEntrySession(start(), {
    point: { x: 200, y: 158 },
    slotSpacingPx: 40,
    candidateStaff: lowerStaff,
  });
  assert.equal(held.stableStaff.id, upperStaff.id);
  const switched = refineTabletEntrySession(start(), {
    point: { x: 200, y: 173 },
    slotSpacingPx: 40,
    candidateStaff: lowerStaff,
  });
  assert.equal(switched.stableStaff.id, lowerStaff.id);
  assert.equal(switched.staffSwitchPulse, 1);
});
