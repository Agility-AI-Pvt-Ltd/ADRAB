/**
 * useAutoResize — Auto-resize a textarea using @chenglou/pretext.
 *
 * @chenglou/pretext API:
 *   prepare(text, font)                    → PreparedText  (Canvas measureText, cached)
 *   layout(prepared, maxWidth, lineHeightPx) → { height, lineCount }  (pure arithmetic)
 *
 * After the one-time prepare() pass the layout() call is ~0.0002 ms —
 * hundreds of times faster than a getBoundingClientRect reflow.
 */
import { useRef, useEffect } from 'react';
import { prepare, layout } from '@chenglou/pretext';

interface AutoResizeOptions {
  /** Minimum textarea height in px (default 80) */
  minHeight?: number;
  /** Maximum textarea height in px before scrolling (default 480) */
  maxHeight?: number;
  /**
   * Horizontal padding inside the textarea in px (left + right combined).
   * Default 24 = 12px each side, matching Lyfshilp's .form-textarea padding.
   */
  horizontalPadding?: number;
  /** Font size in px (default 14) */
  fontSize?: number;
  /** Line-height multiplier (default 1.6) */
  lineHeightRatio?: number;
  /** CSS font-family (default 'Inter, sans-serif') */
  fontFamily?: string;
}

export function useAutoResize(
  value: string,
  {
    minHeight = 80,
    maxHeight = 480,
    horizontalPadding = 24,
    fontSize = 14,
    lineHeightRatio = 1.6,
    fontFamily = 'Inter, sans-serif',
  }: AutoResizeOptions = {}
) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const text = value || ' ';
    const availableWidth = Math.max(el.offsetWidth - horizontalPadding, 60);
    const font = `${fontSize}px ${fontFamily}`;
    const lineHeightPx = fontSize * lineHeightRatio;

    // Step 1: prepare() — Canvas segmentation + glyph width measurement (cached by text+font)
    const prepared = prepare(text, font);
    // Step 2: layout() — pure arithmetic, no DOM, ~0.0002 ms
    const { height } = layout(prepared, availableWidth, lineHeightPx);

    // Add vertical padding (12px top + 12px bottom matching .form-textarea)
    const totalHeight = Math.min(Math.max(height + 24, minHeight), maxHeight);
    el.style.height = `${totalHeight}px`;
    el.style.overflowY = totalHeight >= maxHeight ? 'auto' : 'hidden';
  }, [value, minHeight, maxHeight, horizontalPadding, fontSize, lineHeightRatio, fontFamily]);

  return ref;
}
