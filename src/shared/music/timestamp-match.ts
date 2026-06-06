export function timestampsEqual(
  leftNum: number,
  leftDen: number,
  rightNum: number,
  rightDen: number,
) {
  const safeLeftDen = Math.max(leftDen, 1);
  const safeRightDen = Math.max(rightDen, 1);
  return leftNum * safeRightDen === rightNum * safeLeftDen;
}
