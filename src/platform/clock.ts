/** Wall clock (seconds) with a debug offset for testing offline earnings / daily rewards. */
let offset = 0;
export const clock = {
  wall: (): number => Date.now() / 1000 + offset,
  mono: (): number => performance.now() / 1000,
  advance: (sec: number): void => {
    offset += sec;
  },
  /** Local calendar date key, e.g. 2026-10-07. */
  dateKey: (): string => {
    const d = new Date((Date.now() / 1000 + offset) * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
};
