export function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 0,
): void {
  const corner = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  if (corner === 0) {
    context.rect(x, y, width, height)
    return
  }

  context.moveTo(x + corner, y)
  context.lineTo(x + width - corner, y)
  context.arcTo(x + width, y, x + width, y + corner, corner)
  context.lineTo(x + width, y + height - corner)
  context.arcTo(x + width, y + height, x + width - corner, y + height, corner)
  context.lineTo(x + corner, y + height)
  context.arcTo(x, y + height, x, y + height - corner, corner)
  context.lineTo(x, y + corner)
  context.arcTo(x, y, x + corner, y, corner)
  context.closePath()
}
