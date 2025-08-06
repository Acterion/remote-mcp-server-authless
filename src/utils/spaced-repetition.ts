export interface SpacedRepetitionSettings {
  weakInterval: number; // hours
  mediumInterval: number; // hours  
  strongInterval: number; // hours
}

export const DEFAULT_SETTINGS: SpacedRepetitionSettings = {
  weakInterval: 1, // 1 hour
  mediumInterval: 24, // 1 day
  strongInterval: 72, // 3 days
};

export function calculateNextReview(
  recallStrength: 'weak' | 'medium' | 'strong',
  settings: SpacedRepetitionSettings = DEFAULT_SETTINGS
): Date {
  const now = new Date();
  const hoursToAdd = settings[`${recallStrength}Interval`];
  return new Date(now.getTime() + hoursToAdd * 60 * 60 * 1000);
}

export function generateId(): string {
  return crypto.randomUUID();
}