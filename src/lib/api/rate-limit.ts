/**
 * A naive fixed-window limiter, in memory. Enough to stop one address
 * hammering an unauthenticated endpoint; it resets with the process and is
 * per instance, which is accepted for what it guards.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    /** Records an attempt at `nowMs` and says whether it is within the limit. */
    take(key: string, nowMs: number): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => nowMs - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(nowMs);
      hits.set(key, recent);
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}
