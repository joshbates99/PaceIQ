import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '../auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { Activity } from '@/types'

export const maxDuration = 60

const DAILY_LIMIT = parseInt(process.env.PLAN_DAILY_LIMIT ?? '3', 10)

function buildContext(runs: Activity[]) {
  const now = Date.now()
  const DAY = 86_400_000

  function trimp(a: Activity) {
    const mins = a.moving_time / 60
    return a.average_heartrate ? mins * (a.average_heartrate / 150) : mins * (a.average_speed / 3)
  }

  const atl = runs.filter(a => now - new Date(a.start_date).getTime() <= 7 * DAY).reduce((s, a) => s + trimp(a), 0)
  const ctl = runs.filter(a => now - new Date(a.start_date).getTime() <= 42 * DAY).reduce((s, a) => s + trimp(a), 0) / 6
  const tsb = ctl - atl

  const last4 = runs.filter(a => now - new Date(a.start_date).getTime() <= 28 * DAY)
  const weeklyKm = last4.reduce((s, a) => s + a.distance / 1000, 0) / 4
  const avgSpeed = last4.length ? last4.reduce((s, a) => s + a.average_speed, 0) / last4.length : null
  const avgPace = avgSpeed ? 1000 / (avgSpeed * 60) : null
  const formatPace = (mpk: number) => `${Math.floor(mpk)}:${Math.round((mpk % 1) * 60).toString().padStart(2, '0')}/km`

  const pbs = [
    { label: '5K', target: 5000, min: 5000 },
    { label: '10K', target: 10000, min: 10000 },
    { label: 'Half Marathon', target: 21097, min: 21097 },
    { label: 'Marathon', target: 42195, min: 42195 },
  ].flatMap(t => {
    const c = runs.filter(a => a.distance >= t.min)
    if (!c.length) return []
    const best = c.reduce((b, a) => {
      const aTime = (t.target / a.distance) * a.moving_time
      const bTime = (t.target / b.distance) * b.moving_time
      return aTime < bTime ? a : b
    })
    const secs = Math.round((t.target / best.distance) * best.moving_time)
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    const timeStr = h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`
    return [`${t.label}: ${timeStr}`]
  })

  return `
Runner profile:
- Total runs: ${runs.length}
- Fitness (CTL): ${Math.round(ctl)}
- Fatigue (ATL): ${Math.round(atl)}
- Form (TSB): ${Math.round(tsb)} (${tsb > 5 ? 'Fresh' : tsb < -10 ? 'Fatigued' : 'Neutral'})
- Average weekly km (last 4 weeks): ${weeklyKm.toFixed(1)} km
- Average pace (last 4 weeks): ${avgPace ? formatPace(avgPace) : 'N/A'}
- Personal bests: ${pbs.length ? pbs.join(', ') : 'None recorded'}
`.trim()
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = session.user.id
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { count } = await supabaseAdmin
      .from('goal_insights')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('generated_at', todayStart.toISOString())

    if ((count ?? 0) >= DAILY_LIMIT) {
      return NextResponse.json({ error: `Daily limit of ${DAILY_LIMIT} reached. Try again tomorrow.` }, { status: 429 })
    }

    const [{ data: activities }, { data: goals }, { data: races }] = await Promise.all([
      supabaseAdmin.from('activities').select('*').eq('user_id', userId).order('start_date', { ascending: false }),
      supabaseAdmin.from('goals').select('*').eq('user_id', userId),
      supabaseAdmin.from('races').select('*').eq('user_id', userId).order('date', { ascending: true }),
    ])

    const runs = (activities ?? []) as Activity[]

    if (runs.length < 3) return NextResponse.json({ error: 'Sync at least 3 runs first.' }, { status: 400 })
    if (!goals?.length && !races?.length) return NextResponse.json({ error: 'Add at least one goal or race first.' }, { status: 400 })

    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

    const goalsText = goals?.length
      ? goals.map(g => `- "${g.title}"${g.target_date ? ` (target: ${new Date(g.target_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })})` : ''}`).join('\n')
      : 'None set'

    const racesText = races?.length
      ? races.map(r => `- ${r.name} | ${r.distance_km}km | ${new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}${r.target_time ? ` | Target: ${r.target_time}` : ''}`).join('\n')
      : 'None set'

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: [
        {
          type: 'text',
          text: `You are an expert running coach. Analyse a runner's current fitness data, goals, and upcoming races. Give honest, specific, and motivating assessments.

For each goal, assess:
- Likelihood of achievement (as a % and a label: On Track / Challenging / Unlikely)
- What specifically needs to happen to achieve it
- One concrete action they can take this week

For each race, assess:
- Readiness % based on current fitness vs required fitness for that distance/target time
- How many weeks until race day and whether that's enough time
- One key focus area between now and race day

End with an overall 2-sentence coaching summary.

Format:
**Goals**
[Goal name]
Likelihood: [X%] — [label]
[2-3 sentences of honest assessment and specific advice]
This week: [one concrete action]

**Upcoming Races**
[Race name] — [distance] on [date] ([X weeks away])
Readiness: [X%]
[2-3 sentences on preparation status]
Focus: [one key area]

**Overall**
[2-sentence coaching summary]`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Today is ${today}.\n\n${buildContext(runs)}\n\nMy goals:\n${goalsText}\n\nMy upcoming races:\n${racesText}\n\nPlease assess my goals and race readiness.`,
        },
      ],
    })

    const insight = response.content[0].type === 'text' ? response.content[0].text : ''

    const { data: saved, error } = await supabaseAdmin
      .from('goal_insights')
      .insert({ user_id: userId, insight })
      .select('id, generated_at')
      .single()

    if (error) return NextResponse.json({ error: 'Failed to save insight.' }, { status: 500 })

    return NextResponse.json({
      insight,
      generatedAt: saved.generated_at,
      remainingToday: DAILY_LIMIT - ((count ?? 0) + 1),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[goal-insights]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [{ data: latest }, { count }] = await Promise.all([
    supabaseAdmin.from('goal_insights').select('insight, generated_at').eq('user_id', session.user.id).order('generated_at', { ascending: false }).limit(1).single(),
    supabaseAdmin.from('goal_insights').select('*', { count: 'exact', head: true }).eq('user_id', session.user.id).gte('generated_at', todayStart.toISOString()),
  ])

  return NextResponse.json({
    insight: latest?.insight ?? null,
    generatedAt: latest?.generated_at ?? null,
    remainingToday: DAILY_LIMIT - (count ?? 0),
    dailyLimit: DAILY_LIMIT,
  })
}
