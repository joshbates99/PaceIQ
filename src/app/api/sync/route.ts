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

    const allActivities: StravaActivity[] = []
    let page = 1
    while (true) {
      const res = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${page}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Strava API error ${res.status}: ${body}`)
      }
      const page_activities: StravaActivity[] = await res.json()
      allActivities.push(...page_activities)
      if (page_activities.length < 200) break
      page++
    }

    const runs = allActivities.filter((a) => a.type === 'Run')

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

    // Fetch best_efforts for activities that don't have them yet
    const { data: missing } = await supabaseAdmin
      .from('activities')
      .select('id, strava_id')
      .eq('user_id', userId)
      .is('best_efforts', null)

    if (missing && missing.length > 0) {
      // Fetch in batches of 20 to stay within Strava rate limits
      const BATCH = 20
      for (let i = 0; i < missing.length; i += BATCH) {
        const batch = missing.slice(i, i + BATCH)
        await Promise.all(batch.map(async (row) => {
          try {
            const detailRes = await fetch(
              `https://www.strava.com/api/v3/activities/${row.strava_id}`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            )
            if (!detailRes.ok) return
            const detail = await detailRes.json()
            const best_efforts = (detail.best_efforts ?? []).map((e: { name: string; elapsed_time: number; distance: number }) => ({
              name: e.name.toLowerCase(),
              elapsed_time: e.elapsed_time,
              distance: e.distance,
            }))
            await supabaseAdmin
              .from('activities')
              .update({ best_efforts })
              .eq('id', row.id)
          } catch { /* skip on error */ }
        }))
      }
    }

    return NextResponse.json({ synced: rows.length, detailed: missing?.length ?? 0 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/sync]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
