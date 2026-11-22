/** Number of set bits in a 32-bit integer. */
export function popcount(mask: number): number {
  let k = 0;
  for (let m = mask; m; m &= m - 1) k++;
  return k;
}
