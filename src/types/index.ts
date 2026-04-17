export interface DbUser {
  id: string
  strava_id: number
  name: string | null
  email: string | null
  image: string | null
  access_token: string
  refresh_token: string
  token_expiry: number
  created_at: string
  updated_at: string
}

export interface BestEffort {
  name: string        // '5k', '10k', 'half marathon', 'marathon' etc.
  elapsed_time: number // seconds
  distance: number
}

export interface Activity {
  id: string
  user_id: string
  strava_id: number
  name: string
  distance: number
  moving_time: number
  elapsed_time: number
  start_date: string
  average_speed: number
  max_speed: number
  average_heartrate: number | null
  max_heartrate: number | null
  total_elevation_gain: number
  average_cadence: number | null
  summary_polyline: string | null
  best_efforts: BestEffort[] | null
}

export interface StravaActivity {
  id: number
  name: string
  distance: number
  moving_time: number
  elapsed_time: number
  start_date: string
  type: string
  average_speed: number
  max_speed: number
  average_heartrate?: number
  max_heartrate?: number
  total_elevation_gain: number
  average_cadence?: number
  map?: { summary_polyline?: string }
}
