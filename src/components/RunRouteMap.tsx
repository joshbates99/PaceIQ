'use client'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

// Zoom level appropriate for the run distance
function zoomForDistance(km: number): number {
  if (km <= 3) return 15
  if (km <= 7) return 14
  if (km <= 15) return 13
  if (km <= 25) return 12
  return 11
}

// Generate circular loop waypoints around a centre point
function loopWaypoints(lat: number, lng: number, distanceKm: number): [number, number][] {
  const radius = distanceKm / (2 * Math.PI)
  const latDeg = radius / 111
  const lngDeg = radius / (111 * Math.cos((lat * Math.PI) / 180))
  return [
    [lng, lat],
    [lng + lngDeg, lat],
    [lng, lat - latDeg],
    [lng - lngDeg, lat],
    [lng, lat],
  ]
}

interface RunRouteMapProps {
  lat: number
  lng: number
  distanceKm: number
  sessionType: string
  locationName: string
}

export default function RunRouteMap({ lat, lng, distanceKm, sessionType, locationName }: RunRouteMapProps) {
  const zoom = zoomForDistance(distanceKm)
  const waypoints = loopWaypoints(lat, lng, distanceKm)
  const coords = waypoints.map(([lo, la]) => `${lo.toFixed(5)},${la.toFixed(5)}`).join(';')

  // Mapbox Directions API URL for route (server-side would be better but public token is fine)
  const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}?geometries=geojson&overview=full&access_token=${TOKEN}`

  // Static map centered on home
  const staticMap = `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/pin-s-home+1A56DB(${lng},${lat})/${lng},${lat},${zoom}/600x220@2x?access_token=${TOKEN}`

  // Strava route builder pre-loaded at user's location
  const stravaUrl = `https://www.strava.com/routes/new#map/satellite/${lng}/${lat}/14`

  // Google Maps running route search near location
  const gmapsUrl = `https://www.google.com/maps/search/running+routes/@${lat},${lng},${zoom}z`

  return (
    <div className="rounded-xl overflow-hidden border border-gray-100 mt-3">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={staticMap}
          alt={`Map near ${locationName}`}
          className="w-full object-cover"
          style={{ height: '160px' }}
        />
        <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-sm">
          <p className="text-xs font-semibold text-gray-800">{distanceKm}km · {sessionType}</p>
          <p className="text-[10px] text-gray-500 truncate max-w-[140px]">{locationName}</p>
        </div>
      </div>
      <div className="flex border-t border-gray-100 divide-x divide-gray-100 bg-gray-50">
        <a
          href={stravaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-orange-600 hover:bg-orange-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          Plan on Strava
        </a>
        <a
          href={gmapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Find Routes Nearby
        </a>
      </div>
    </div>
  )
}

