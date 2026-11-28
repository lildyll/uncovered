export type UncoveredFrequency = "low" | "normal" | "chaos";
export const ROUND_CHOICES = [5, 10, 15, 20] as const;
export function makeUncoveredRounds(total: number, frequency: UncoveredFrequency, anonymous: boolean): number[] {
  if (anonymous) return [];
  const ratio = frequency === "low" ? 0.1 : frequency === "chaos" ? 0.6 : 0.25;
  const count = Math.max(1, Math.round(total * ratio));
  const shuffled = Array.from({ length: total }, (_, i) => i + 1);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count).sort((a, b) => a - b);
}
