export function namesLeftText(
  count: number,
  deadline: string | undefined,
  format: (count: number, deadline?: string) => string,
) {
  return count > 0 ? format(count, deadline) : null
}
