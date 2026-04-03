/**
 * useTextMeasure — Measure multiline text layout via @chenglou/pretext.
 *
 * @chenglou/pretext API:
 *   prepare(text, font)                      → PreparedText  (Canvas, internally cached)
 *   layout(prepared, maxWidth, lineHeightPx) → { height, lineCount }
 *
 * Zero DOM reads after the first prepare() for each unique text+font pair.
 * layout() itself takes ~0.0002 ms — safe to call thousands of times per frame.
 *
 * Usage:
 *   const { height, lineCount } = useTextMeasure(text, 620, {
 *     fontSize: 13, lineHeightRatio: 1.7, fontFamily: 'Inter, sans-serif'
 *   });
 *   const isLong = lineCount > 6;
 */
import { useMemo } from 'react';
import { prepare, layout } from '@chenglou/pretext';

interface MeasureOptions {
  fontSize?: number;
  lineHeightRatio?: number;
  fontFamily?: string;
}

interface MeasureResult {
  height: number;
  lineCount: number;
}

export function useTextMeasure(
  text: string,
  containerWidth: number,
  {
    fontSize = 14,
    lineHeightRatio = 1.6,
    fontFamily = 'Inter, sans-serif',
  }: MeasureOptions = {}
): MeasureResult {
  return useMemo(() => {
    if (!text || containerWidth <= 0) return { height: 0, lineCount: 0 };
    const font = `${fontSize}px ${fontFamily}`;
    const lineHeightPx = fontSize * lineHeightRatio;
    // prepare() is cached by the library for the same text+font pair
    const prepared = prepare(text, font);
    return layout(prepared, containerWidth, lineHeightPx);
  }, [text, containerWidth, fontSize, lineHeightRatio, fontFamily]);
}

/**
 * measureText — synchronous helper (outside React) for bulk pre-computation.
 * E.g. pre-computing heights for an entire list of submissions before render.
 */
export function measureText(
  text: string,
  containerWidth: number,
  options: MeasureOptions = {}
): MeasureResult {
  const { fontSize = 14, lineHeightRatio = 1.6, fontFamily = 'Inter, sans-serif' } = options;
  if (!text || containerWidth <= 0) return { height: 0, lineCount: 0 };
  const prepared = prepare(text, `${fontSize}px ${fontFamily}`);
  return layout(prepared, containerWidth, fontSize * lineHeightRatio);
}
