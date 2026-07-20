import { describe, expect, it } from 'vitest';
import { ACTIVITY_LOG_PAGE_SIZE, visibleActivityEntries } from './ActivityLogPanel';

const entries = Array.from({ length: 25 }, (_, index) => ({
  text: `event ${index + 1}`,
  ts: index + 1,
}));

describe('activity log pagination', () => {
  it('starts with the newest page in chronological order', () => {
    expect(
      visibleActivityEntries(entries, ACTIVITY_LOG_PAGE_SIZE).map((entry) => entry.text),
    ).toEqual(Array.from({ length: 10 }, (_, index) => `event ${index + 16}`));
  });

  it('reveals older entries as the visible count grows', () => {
    expect(visibleActivityEntries(entries, 20)[0]?.text).toBe('event 6');
    expect(visibleActivityEntries(entries, 30)).toEqual(entries);
  });
});
