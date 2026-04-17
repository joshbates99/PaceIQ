import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '../auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { Activity } from '@/types'

export const maxDuration = 60

const DAILY_LIMIT = parseInt(process.env.PLAN_DAILY_LIMIT ?? '3', 10)

function buildAnalyticsSummary(runs: Activity[]): string {
  const now = Date.now()
  const DAY = 86_400_000

  function trimp(a: Activity) {
    const mins = a.moving_time / 60
    return a.average_heartrate ? mins * (a.average_heartrate / 150) : mins * (a.average_speed / 3)
  }

  const atl = runs
    .filter(a => now - new Date(a.start_date).getTime() <= 7 * DAY)
    .reduce((s, a) => s + trimp(a), 0)

  const ctl = runs
    .filter(a => now - new Date(a.start_date).getTime() <= 42 * DAY)
    .reduce((s, a) => s + trimp(a), 0) / 6

  const tsb = ctl - atl

  const last4Weeks = runs.filter(a => now - new Date(a.start_date).getTime() <= 28 * DAY)
  const weeklyKm = last4Weeks.reduce((s, a) => s + a.distance / 1000, 0) / 4
  const avgPace = last4Weeks.length
    ? last4Weeks.reduce((s, a) => s + 1000 / (a.average_speed * 60), 0) / last4Weeks.length
    : null

  const last7 = runs.filter(a => now - new Date(a.start_date).getTime() <= 7 * DAY)
  const last7Km = last7.reduce((s, a) => s + a.distance / 1000, 0)

  const hasHR = runs.some(a => a.average_heartrate)
  const avgHR = hasHR
    ? Math.round(runs.filter(a => a.average_heartrate).reduce((s, a) => s + a.average_heartrate!, 0) /
        runs.filter(a => a.average_heartrate).length)
    : null

  const formatPace = (mpk: number) => {
    const m = Math.floor(mpk)
    const s = Math.round((mpk - m) * 60)
    return `${m}:${s.toString().padStart(2, '0')}/km`
  }

  const tsbStatus = tsb > 5 ? 'Fresh (race ready)' : tsb < -10 ? 'Fatigued (injury risk elevated)' : 'Neutral (normal training load)'

  return `
Runner analytics summary:
- Total runs synced: ${runs.length}
- Fitness (CTL, 42-day chronic load): ${Math.round(ctl)}
- Fatigue (ATL, 7-day acute load): ${Math.round(atl)}
- Form / TSB: ${Math.round(tsb)} — ${tsbStatus}
- Average weekly km (last 4 weeks): ${weeklyKm.toFixed(1)} km
- This week's km so far: ${last7Km.toFixed(1)} km
- Average pace (last 4 weeks): ${avgPace ? formatPace(avgPace) : 'N/A'}
- Average heart rate (all runs): ${avgHR ? `${avgHR} bpm` : 'No HR data'}
- Heart rate monitor: ${hasHR ? 'Yes' : 'No'}
`.trim()
}

export async function POST() {
  try {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // ── Rate limit check ─────────────────────────────────────────────────────────
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { count } = await supabaseAdmin
    .from('training_plans')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('generated_at', todayStart.toISOString())

  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: `Daily limit of ${DAILY_LIMIT} plan generations reached. Try again tomorrow.` },
      { status: 429 }
    )
  }

  // ── Fetch activities + preferences ───────────────────────────────────────────
  const [{ data: activities }, { data: prefs }] = await Promise.all([
    supabaseAdmin.from('activities').select('*').eq('user_id', userId).order('start_date', { ascending: false }),
    supabaseAdmin.from('user_preferences').select('*').eq('user_id', userId).single(),
  ])

  const runs = (activities ?? []) as Activity[]

  if (runs.length < 3) {
    return NextResponse.json(
      { error: 'Sync at least 3 runs before generating a plan.' },
      { status: 400 }
    )
  }

  const analyticsSummary = buildAnalyticsSummary(runs)

  const prefsText = prefs
    ? `
Athlete training preferences:
- Runs per week: ${prefs.runs_per_week}
- Gym/strength sessions per week: ${prefs.gym_days_per_week}
- Double days allowed (run + gym/stretch same day): ${prefs.allow_double_days ? 'Yes' : 'No'}
- Experience level: ${prefs.experience_level}
${prefs.notes ? `- Additional notes: ${prefs.notes}` : ''}`.trim()
    : 'Athlete training preferences: Not set — use sensible defaults (5 runs/week, 1 strength session, no double days).'

  // ── Claude API call with prompt caching ──────────────────────────────────────
  // Build the next 7 days with real dates (Mon–Sun starting from upcoming Monday)
  const today = new Date()
  const dayOfWeek = today.getDay() // 0 = Sun, 1 = Mon ...
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  const monday = new Date(today)
  monday.setDate(today.getDate() + (dayOfWeek === 1 ? 0 : daysUntilMonday))

  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const weekDates = weekDays.map((day, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return `${day} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'long' })}`
  }).join('\n')

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let response
  try {
    response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: [
      {
        type: 'text',
        text: `You are an expert running coach with deep knowledge of exercise physiology, periodisation, and injury prevention.
You generate personalised 7-day training plans based on a runner's analytics data AND their stated preferences.

Session types available:
1. Easy Run — conversational pace, aerobic base building
2. Recovery Run — very easy, short, after hard sessions
3. Long Run — slowest pace, builds endurance
4. Tempo Run — comfortably hard, sustained effort (20–40 min at tempo)
5. Intervals — structured speed work e.g. 6×800m or 8×400m with rest
6. Strength & Gym — gym-based strength session with specific exercises relevant to running
7. Stretching & Mobility — dedicated session with specific exercises listed
8. Rest — full rest day

Weekly structure rules:
- CRITICAL: Respect the athlete's stated runs_per_week exactly — do not add or remove run days
- CRITICAL: If gym_days_per_week > 0, include exactly that many gym/strength sessions
- CRITICAL: If allow_double_days is Yes, you may schedule run + stretch or run + gym on the same day — format as two sessions clearly
- CRITICAL: If allow_double_days is No, each day has at most one session
- Never place two hard sessions (tempo/intervals) back to back
- Always follow a hard session with an easy, recovery, or mobility day
- If TSB < -10 (fatigued): drop intervals, replace with easy/recovery, add extra mobility
- If TSB > 10 (fresh): include both a tempo and an interval session
- Always include exactly one long run (Saturday or Sunday preferred)
- Fill remaining days with rest as needed to match the stated run count

Format for each day (use this exact structure with these exact labels):
**[Day and Date]**
Session type: [type]
[Details: distance, pace guidance, structure for intervals, or exercise list for mobility]
Nutrition: [specific nutrition advice for this session — pre/during/post fuelling in 1–2 sentences, tailored to the session intensity]
Coach's note: [one specific, motivating insight tied to their analytics]

Nutrition guidelines by session:
- Intervals/Tempo: high-carb day, specific pre-session snack 60–90 min before, recovery protein within 30 min after
- Long Run: carb-load evening before, fuelling strategy during (gels/dates every 45 min if >75 min), protein + carbs after
- Easy/Recovery Run: balanced diet, prioritise hydration, anti-inflammatory foods (berries, salmon, leafy greens)
- Mobility/Rest: protein focus for muscle repair, no need to carb-load, stay hydrated

End with:
**Week Summary**
[2–3 sentences on the overall training stimulus and how it relates to their current fitness/fatigue]

Rules:
- Use km and min/km throughout
- Be specific — give exact distances, paces, and rep structures
- Reference their actual TSB/fatigue numbers in the coaching notes where relevant`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Here is my current running analytics data:\n\n${analyticsSummary}\n\n${prefsText}\n\nThe week to plan is:\n${weekDates}\n\nPlease generate my personalised training plan for this week, strictly following my preferences above.`,
      },
    ],
  })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[training-plan] Claude API error:', msg)
    return NextResponse.json({ error: `AI error: ${msg}` }, { status: 500 })
  }

  const plan = response.content[0].type === 'text' ? response.content[0].text : ''

  // ── Save plan ────────────────────────────────────────────────────────────────
  const { data: saved, error } = await supabaseAdmin
    .from('training_plans')
    .insert({ user_id: userId, plan })
    .select('id, generated_at')
    .single()

  if (error) {
    console.error('[training-plan] save error:', error.message)
    return NextResponse.json({ error: 'Failed to save plan.' }, { status: 500 })
  }

  const remainingToday = DAILY_LIMIT - ((count ?? 0) + 1)

  return NextResponse.json({ plan, id: saved.id, generatedAt: saved.generated_at, remainingToday })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[training-plan] unhandled error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [{ data: latest }, { count: todayCount }] = await Promise.all([
    supabaseAdmin
      .from('training_plans')
      .select('id, plan, generated_at')
      .eq('user_id', session.user.id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single(),
    supabaseAdmin
      .from('training_plans')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .gte('generated_at', todayStart.toISOString()),
  ])

  return NextResponse.json({
    plan: latest?.plan ?? null,
    generatedAt: latest?.generated_at ?? null,
    remainingToday: DAILY_LIMIT - (todayCount ?? 0),
    dailyLimit: DAILY_LIMIT,
  })
}
