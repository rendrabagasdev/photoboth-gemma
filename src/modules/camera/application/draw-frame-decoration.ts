import { getFrameDecorationShapes } from '../../frames/domain/frame-decoration'
import type { PhotoFrame } from '../../frames/domain/photo-frame'

export function drawFrameDecorations(
  context: CanvasRenderingContext2D,
  frame: PhotoFrame,
  scale = 1,
  offsetX = 0,
): void {
  getFrameDecorationShapes(frame).forEach((shape) => {
    context.save()
    context.globalAlpha = shape.opacity ?? 1

    if (shape.type === 'rect') {
      context.fillStyle = shape.fill
      context.fillRect(
        offsetX + shape.x * scale,
        shape.y * scale,
        shape.width * scale,
        shape.height * scale,
      )
    } else if (shape.type === 'circle') {
      context.fillStyle = shape.fill
      context.beginPath()
      context.arc(
        offsetX + shape.cx * scale,
        shape.cy * scale,
        shape.radius * scale,
        0,
        Math.PI * 2,
      )
      context.fill()
    } else {
      context.strokeStyle = shape.stroke
      context.lineWidth = shape.width * scale
      context.setLineDash(shape.dash?.map((value) => value * scale) ?? [])
      context.beginPath()
      context.moveTo(offsetX + shape.x1 * scale, shape.y1 * scale)
      context.lineTo(offsetX + shape.x2 * scale, shape.y2 * scale)
      context.stroke()
    }

    context.restore()
  })
}
