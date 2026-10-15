/**
 * A value the code can't go on without (docs/CODING-STANDARD.md, R5 and R9). Use it instead of an unchecked `!`:
 * a wrong assumption then fails at once, with the reason, instead of later as "cannot read properties of undefined".
 */
export function must<T>(value: T | null | undefined, why: string): T {
  if (value == null) throw new Error(`internal error: ${why}`)
  return value
}
