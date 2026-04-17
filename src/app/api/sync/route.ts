import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '../auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { getValidAccessToken } from '@/lib/strava'
import { StravaActivity } from '@/types'

export async function POST() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    const accessToken = await getValidAccessToken(userId)

    const res = await fetch(
      'https://www.strava.com/api/v3/athlete/activities?per_page=50',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Strava API error ${res.status}: ${body}`)
    }

    const activities: StravaActivity[] = await res.json()
    const runs = activities.filter((a) => a.type === 'Run')

    if (runs.length === 0) {
      return NextResponse.json({ synced: 0 })
    }

    const rows = runs.map((a) => ({
      user_id: userId,
      strava_id: a.id,
      name: a.name,
      distance: a.distance,
      moving_time: a.moving_time,
      elapsed_time: a.elapsed_time,
      start_date: a.start_date,
      average_speed: a.average_speed,
      max_speed: a.max_speed,
      average_heartrate: a.average_heartrate ?? null,
      max_heartrate: a.max_heartrate ?? null,
      total_elevation_gain: a.total_elevation_gain,
      average_cadence: a.average_cadence ?? null,
      summary_polyline: a.map?.summary_polyline ?? null,
    }))

    const { error } = await supabaseAdmin
      .from('activities')
      .upsert(rows, { onConflict: 'strava_id' })

    if (error) throw new Error(error.message)

    return NextResponse.json({ synced: rows.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/sync]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
