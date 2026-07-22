import { TEMPLATE_HEIGHT, TEMPLATE_WIDTH, resolveTemplateLayout } from '../domain/template-layout'
import { getFrameDecorationShapes } from '../../frames/domain/frame-decoration'
import type { PhotoFrame } from '../../frames/domain/photo-frame'

export function TemplateDecoration({ frame }: { frame: PhotoFrame }) {
  const shapes = getFrameDecorationShapes(frame)
  const layout = resolveTemplateLayout(frame.layoutId)

  return (
    <svg
      className="template-decoration"
      viewBox={`0 0 ${TEMPLATE_WIDTH} ${TEMPLATE_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {shapes.map((shape, index) => {
        if (shape.type === 'rect') {
          return (
            <rect
              key={index}
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              fill={shape.fill}
              opacity={shape.opacity}
            />
          )
        }
        if (shape.type === 'circle') {
          return (
            <circle
              key={index}
              cx={shape.cx}
              cy={shape.cy}
              r={shape.radius}
              fill={shape.fill}
              opacity={shape.opacity}
            />
          )
        }
        return (
          <line
            key={index}
            x1={shape.x1}
            y1={shape.y1}
            x2={shape.x2}
            y2={shape.y2}
            stroke={shape.stroke}
            strokeWidth={shape.width}
            strokeDasharray={shape.dash?.join(' ')}
            opacity={shape.opacity}
          />
        )
      })}
      <text
        x={layout.brand.x}
        y={layout.brand.y}
        fill="#171711"
        fontFamily="Arial, sans-serif"
        fontSize={layout.brand.fontSize}
        fontWeight="900"
        textAnchor="middle"
      >
        {layout.brand.text}
      </text>
      <text
        x={layout.copyright.x}
        y={layout.copyright.y}
        fill="#171711"
        fontFamily="Arial, sans-serif"
        fontSize={layout.copyright.fontSize}
        fontWeight="500"
        textAnchor="end"
      >
        {layout.copyright.text}
      </text>
    </svg>
  )
}
