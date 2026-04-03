/**
 * usePretext — Convenience hook that pre-generates a PreparedText handle.
 *
 * Because @chenglou/pretext's prepare() is per-text (not per-font), this
 * hook is most useful when you have a stable text string you want to measure
 * at many different widths (e.g. responsive breakpoints) without re-running
 * the Canvas segmentation step.
 *
 * Usage:
 *   const prepared = usePretext(text, '14px Inter');
 *   const { height, lineCount } = layout(prepared, containerWidth, 22.4);
 *
 * For one-off measurements prefer useTextMeasure() directly.
 */
import { useMemo } from 'react';
import { prepare } from '@chenglou/pretext';

export function usePretext(text: string, font: string) {
  // Recreate only when text or font string changes
  return useMemo(() => prepare(text || ' ', font), [text, font]);
}
