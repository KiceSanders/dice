/** Offset for die `index` within a held cluster (world XZ, Y applied separately). */
export function dieClusterOffset(index: number): [number, number] {
  const t = (index - 2) * 0.055;
  return [t + (index % 2) * 0.018, (index % 3) * 0.014 - 0.014];
}
