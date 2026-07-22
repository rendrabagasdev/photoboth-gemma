import type { FramePresetStyle, PhotoFrame } from './photo-frame'

export type FrameDecorationShape =
  | { type: 'rect'; x: number; y: number; width: number; height: number; fill: string; opacity?: number }
  | { type: 'circle'; cx: number; cy: number; radius: number; fill: string; opacity?: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number; dash?: number[]; opacity?: number }

export function resolvePresetStyle(frame: PhotoFrame): FramePresetStyle {
  if (frame.presetStyle) return frame.presetStyle
  if (frame.id === 'lime-wave') return 'stripe'
  if (frame.id === 'blue-hour') return 'dots'
  if (frame.id === 'mono-ticket') return 'ticket'
  return 'clean'
}

export function getFrameDecorationShapes(frame: PhotoFrame): FrameDecorationShape[] {
  if (frame.kind !== 'preset') return []

  const style = resolvePresetStyle(frame)
  if (style === 'stripe') {
    return [
      { type: 'rect', x: 0, y: 0, width: 18, height: 1800, fill: frame.accent },
      { type: 'rect', x: 582, y: 0, width: 18, height: 1800, fill: frame.accent },
      { type: 'rect', x: 18, y: 0, width: 564, height: 18, fill: frame.accent },
    ]
  }

  if (style === 'dots') {
    const topDots = [45, 105, 165, 435, 495, 555].map((cx) => ({
      type: 'circle' as const,
      cx,
      cy: 27,
      radius: 13,
      fill: frame.accent,
    }))
    const footerDots = [55, 125, 475, 545].map((cx, index) => ({
      type: 'circle' as const,
      cx,
      cy: index % 2 === 0 ? 1535 : 1585,
      radius: index % 2 === 0 ? 28 : 18,
      fill: frame.accent,
      opacity: 0.82,
    }))
    return [...topDots, ...footerDots]
  }

  if (style === 'ticket') {
    return [
      { type: 'line', x1: 22, y1: 18, x2: 578, y2: 18, stroke: frame.accent, width: 7, dash: [22, 14] },
      { type: 'line', x1: 22, y1: 1782, x2: 578, y2: 1782, stroke: frame.accent, width: 7, dash: [22, 14] },
      { type: 'line', x1: 18, y1: 18, x2: 18, y2: 1782, stroke: frame.accent, width: 7, dash: [22, 14] },
      { type: 'line', x1: 582, y1: 18, x2: 582, y2: 1782, stroke: frame.accent, width: 7, dash: [22, 14] },
      { type: 'rect', x: 0, y: 1475, width: 600, height: 12, fill: frame.accent },
    ]
  }

  return []
}
