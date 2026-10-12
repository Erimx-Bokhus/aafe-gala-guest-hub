/** Runs `fn` again after each delay until it succeeds; throws the last error once the delays run out. */
export async function retry<T>(fn: () => Promise<T>, delays = [200, 1000, 3000]): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn() } catch (e) {
      if (i >= delays.length) throw e
      await new Promise((r) => setTimeout(r, delays[i]))
    }
  }
}
