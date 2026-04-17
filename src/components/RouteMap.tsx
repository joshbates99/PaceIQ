// Decodes a Google encoded polyline string into [lat, lng] pairs
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    shift = 0
    result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1

    points.push([lat / 1e5, lng / 1e5])
  }
  return points
}

// Converts lat/lng points to an SVG path string, normalised to a viewBox
function toSvgPath(points: [number, number][], width: number, height: number, padding = 6): string {
  if (points.length < 2) return ''

  const lats = points.map(p => p[0])
  const lngs = points.map(p => p[1])
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  const latRange = maxLat - minLat || 0.001
  const lngRange = maxLng - minLng || 0.001

  const scale = Math.min(
    (width - padding * 2) / lngRange,
    (height - padding * 2) / latRange,
  )

  const offsetX = (width - lngRange * scale) / 2
  const offsetY = (height - latRange * scale) / 2

  const coords = points.map(([lat, lng]) => {
    const x = (lng - minLng) * scale + offsetX
    const y = height - ((lat - minLat) * scale + offsetY)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return `M ${coords.join(' L ')}`
}

interface RouteMapProps {
  polyline: string
  width?: number
  height?: number
  className?: string
}

export default function RouteMap({ polyline, width = 80, height = 64, className = '' }: RouteMapProps) {
  const points = decodePolyline(polyline)
  if (points.length < 2) return null

  const path = toSvgPath(points, width, height)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`rounded-lg flex-shrink-0 ${className}`}
      style={{ background: '#EEF2FF' }}
    >
      <path
        d={path}
        fill="none"
        stroke="#1A56DB"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {/* Start dot */}
      {points.length > 0 && (() => {
        const [lat, lng] = points[0]
        const lats = points.map(p => p[0])
        const lngs = points.map(p => p[1])
        const minLat = Math.min(...lats), maxLat = Math.max(...lats)
        const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
        const latRange = maxLat - minLat || 0.001
        const lngRange = maxLng - minLng || 0.001
        const scale = Math.min((width - 12) / lngRange, (height - 12) / latRange)
        const offsetX = (width - lngRange * scale) / 2
        const offsetY = (height - latRange * scale) / 2
        const x = (lng - minLng) * scale + offsetX
        const y = height - ((lat - minLat) * scale + offsetY)
        return <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="2.5" fill="#1A56DB" />
      })()}
    </svg>
  )
}
