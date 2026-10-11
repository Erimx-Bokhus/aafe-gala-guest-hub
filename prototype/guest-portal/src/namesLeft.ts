export function namesLeftText(
  count: number,
  format: (count: number) => string,
) {
  return count > 0 ? format(count) : null
}
