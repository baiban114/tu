import { describe, expect, it } from 'vitest';
import { ORTH_SMART_STRAIGHT_GAP, shouldCollapseOrthRoute } from './orthSmartRouter';

const source = { x: 0, y: 0, width: 100, height: 60 };

describe('shouldCollapseOrthRoute', () => {
  it('collapses the route when horizontally adjacent nodes leave no usable bend segment', () => {
    expect(shouldCollapseOrthRoute(source, { x: 120, y: 0, width: 100, height: 60 })).toBe(true);
  });

  it('treats the configured gap as the inclusive collapse boundary', () => {
    expect(shouldCollapseOrthRoute(source, {
      x: 100 + ORTH_SMART_STRAIGHT_GAP,
      y: 0,
      width: 100,
      height: 60,
    })).toBe(true);
  });

  it('keeps orthogonal routing once enough space is available', () => {
    expect(shouldCollapseOrthRoute(source, {
      x: 100 + ORTH_SMART_STRAIGHT_GAP + 1,
      y: 0,
      width: 100,
      height: 60,
    })).toBe(false);
  });

  it('collapses overlapping and diagonally close node bounds', () => {
    expect(shouldCollapseOrthRoute(source, { x: 80, y: 40, width: 100, height: 60 })).toBe(true);
    expect(shouldCollapseOrthRoute(source, { x: 115, y: 75, width: 100, height: 60 })).toBe(true);
  });

  it('does not collapse while either endpoint bounds are unavailable', () => {
    expect(shouldCollapseOrthRoute(source, null)).toBe(false);
    expect(shouldCollapseOrthRoute(undefined, source)).toBe(false);
  });
});
