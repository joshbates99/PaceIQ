import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '../api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import { Activity } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPace(minPerKm: number): string {
  const mins = Math.floor(minPerKm)
  const secs = Math.round((minPerKm - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')}/km`
}

// ── Analytics computations ────────────────────────────────────────────────────

function weeklyVolume(activities: Activity[], weeks = 12) {
  const now = new Date()
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - (weeks - i) * 7)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    const runs = activities.filter(a => {
      const d = new Date(a.start_date)
      return d >= weekStart && d < weekEnd
    })
    return {
      label: weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      km: runs.reduce((s, a) => s + a.distance / 1000, 0),
      count: runs.length,
    }
  })
}

function trainingLoad(activities: Activity[]) {
  const now = Date.now()
  const DAY = 86_400_000

  // TRIMP proxy: duration(min) × HR factor (or speed factor if no HR)
  function trimp(a: Activity) {
    const mins = a.moving_time / 60
    return a.average_heartrate ? mins * (a.average_heartrate / 150) : mins * (a.average_speed / 3)
  }

  const atl = activities
    .filter(a => now - new Date(a.start_date).getTime() <= 7 * DAY)
    .reduce((s, a) => s + trimp(a), 0)

  const ctl = activities
    .filter(a => now - new Date(a.start_date).getTime() <= 42 * DAY)
    .reduce((s, a) => s + trimp(a), 0) / 6

  return { atl: Math.round(atl), ctl: Math.round(ctl), tsb: Math.round(ctl - atl) }
}

function paceTrend(activities: Activity[], weeks = 10) {
  const now = new Date()
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - (weeks - i) * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    const runs = activities.filter(a => {
      const d = new Date(a.start_date)
      return d >= weekStart && d < weekEnd && a.average_speed > 0
    })
    const avgSpeed = runs.length ? runs.reduce((s, a) => s + a.average_speed, 0) / runs.length : null
    return {
      label: weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      minPerKm: avgSpeed ? 1000 / (avgSpeed * 60) : null,
    }
  })
}

function hrZones(activities: Activity[]) {
  const withHR = activities.filter(a => a.average_heartrate && a.max_heartrate)
  if (withHR.length === 0) return null

  const maxHR = Math.max(...withHR.map(a => a.max_heartrate!))
  const zones = [
    { name: 'Zone 1 — Easy', min: 0, max: 0.6, color: 'bg-blue-400' },
    { name: 'Zone 2 — Aerobic', min: 0.6, max: 0.7, color: 'bg-green-400' },
    { name: 'Zone 3 — Tempo', min: 0.7, max: 0.8, color: 'bg-yellow-400' },
    { name: 'Zone 4 — Threshold', min: 0.8, max: 0.9, color: 'bg-orange-400' },
    { name: 'Zone 5 — Max Effort', min: 0.9, max: 1.1, color: 'bg-red-500' },
  ]

  return zones.map(z => {
    const count = withHR.filter(a => {
      const pct = a.average_heartrate! / maxHR
      return pct >= z.min && pct < z.max
    }).length
    return { ...z, count, pct: Math.round((count / withHR.length) * 100) }
  })
}

function personalBests(activities: Activity[]) {
  const targets = [
    { label: '5K', min: 4500, max: 5500 },
    { label: '10K', min: 9000, max: 11000 },
    { label: 'Half Marathon', min: 19000, max: 22200 },
    { label: 'Marathon', min: 40000, max: 44000 },
  ]
  return targets.flatMap(t => {
    const candidates = activities.filter(a => a.distance >= t.min && a.distance <= t.max)
    if (!candidates.length) return []
    const best = candidates.reduce((b, a) => (a.average_speed > b.average_speed ? a : b))
    return [{
      label: t.label,
      pace: formatPace(1000 / (best.average_speed * 60)),
      date: new Date(best.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      distance: (best.distance / 1000).toFixed(2),
    }]
  })
}

function consistencyScore(activities: Activity[], weeks = 12) {
  const now = new Date()
  const activeWeeks = new Set(
    activities
      .filter(a => now.getTime() - new Date(a.start_date).getTime() <= weeks * 7 * 86_400_000)
      .map(a => {
        const d = new Date(a.start_date)
        return `${d.getFullYear()}-W${Math.floor(d.getDate() / 7)}-${d.getMonth()}`
      })
  ).size
  return Math.min(Math.round((activeWeeks / weeks) * 100), 100)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function Analytics() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/')

  const { data: activities } = await supabaseAdmin
    .from('activities')
    .select('*')
    .eq('user_id', session.user.id)
    .order('start_date', { ascending: false })

  const runs = (activities ?? []) as Activity[]

  const load = trainingLoad(runs)
  const weekly = weeklyVolume(runs)
  const paceData = paceTrend(runs)
  const zones = hrZones(runs)
  const pbs = personalBests(runs)
  const consistency = consistencyScore(runs)

  const maxWeeklyKm = Math.max(...weekly.map(w => w.km), 1)
  const pacePts = paceData.filter(p => p.minPerKm !== null)
  const minPace = pacePts.length ? Math.min(...pacePts.map(p => p.minPerKm!)) : 4
  const maxPace = pacePts.length ? Math.max(...pacePts.map(p => p.minPerKm!)) : 8
  const paceRange = maxPace - minPace || 1

  const tsbColor = load.tsb > 5 ? 'text-green-600' : load.tsb < -10 ? 'text-red-500' : 'text-yellow-500'
  const tsbLabel = load.tsb > 5 ? 'Fresh' : load.tsb < -10 ? 'Fatigued' : 'Neutral'

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={session.user} />

      <main className="flex-1 pl-64">
        <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-500 text-sm mt-0.5">Based on {runs.length} synced runs</p>
          </div>

          {/* Training Load */}
          <Section title="Training Load" subtitle="Premium Strava metric — free here">
            <div className="grid grid-cols-3 gap-4">
              <LoadCard
                label="Fitness (CTL)"
                value={load.ctl}
                sub="42-day chronic load"
                color="text-blue-600"
              />
              <LoadCard
                label="Fatigue (ATL)"
                value={load.atl}
                sub="7-day acute load"
                color="text-orange-500"
              />
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Form (TSB)</p>
                <p className={`text-3xl font-bold ${tsbColor}`}>{load.tsb > 0 ? '+' : ''}{load.tsb}</p>
                <p className={`text-sm font-medium mt-1 ${tsbColor}`}>{tsbLabel}</p>
                <p className="text-xs text-gray-400 mt-1">Fitness − Fatigue</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              TSB &gt; +5 = race ready · −5 to +5 = normal training · &lt; −10 = back off
            </p>
          </Section>

          {/* Weekly Volume */}
          <Section title="Weekly Volume" subtitle="Last 12 weeks">
            <div className="flex items-end gap-1.5 h-36">
              {weekly.map((w, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-500 font-medium">{w.km > 0 ? w.km.toFixed(0) : ''}</span>
                  <div className="w-full relative" style={{ height: '96px' }}>
                    <div
                      className="absolute bottom-0 w-full rounded-t-md bg-[#1A56DB] opacity-80 transition-all"
                      style={{ height: `${(w.km / maxWeeklyKm) * 96}px` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 text-center leading-tight">{w.label}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Pace Trend */}
          <Section title="Pace Trend" subtitle="Weekly average — lower is faster">
            {pacePts.length < 2 ? (
              <p className="text-sm text-gray-400">Not enough data yet — sync more runs.</p>
            ) : (
              <div className="relative h-36">
                <svg className="w-full h-full" viewBox={`0 0 ${paceData.length * 60} 100`} preserveAspectRatio="none">
                  <polyline
                    fill="none"
                    stroke="#1A56DB"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={paceData
                      .map((p, i) =>
                        p.minPerKm !== null
                          ? `${i * 60 + 30},${((p.minPerKm - minPace) / paceRange) * 80 + 10}`
                          : null
                      )
                      .filter(Boolean)
                      .join(' ')}
                  />
                  {paceData.map((p, i) =>
                    p.minPerKm !== null ? (
                      <circle
                        key={i}
                        cx={i * 60 + 30}
                        cy={((p.minPerKm - minPace) / paceRange) * 80 + 10}
                        r="3"
                        fill="#1A56DB"
                      />
                    ) : null
                  )}
                </svg>
                <div className="flex justify-between mt-1">
                  {paceData.map((p, i) => (
                    <span key={i} className="text-[10px] text-gray-400 text-center" style={{ width: '60px' }}>
                      {p.minPerKm !== null ? formatPace(p.minPerKm) : '–'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <div className="grid grid-cols-2 gap-6">
            {/* HR Zones */}
            <Section title="Heart Rate Zones" subtitle="Distribution across all runs">
              {!zones ? (
                <p className="text-sm text-gray-400">No heart rate data found.</p>
              ) : (
                <div className="space-y-3">
                  {zones.map((z, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>{z.name}</span>
                        <span className="font-semibold">{z.pct}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className={`${z.color} h-2 rounded-full`} style={{ width: `${z.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Consistency + PBs */}
            <div className="space-y-6">
              <Section title="Consistency" subtitle="Last 12 weeks">
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20 flex-shrink-0">
                    <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#E5E7EB" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15.9" fill="none"
                        stroke="#1A56DB" strokeWidth="3"
                        strokeDasharray={`${consistency} ${100 - consistency}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-gray-900">
                      {consistency}%
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {consistency >= 80
                      ? 'Excellent consistency — keep it up!'
                      : consistency >= 50
                      ? 'Good base, aim for more regular weeks.'
                      : 'Focus on running more consistently each week.'}
                  </p>
                </div>
              </Section>

              <Section title="Personal Bests" subtitle="Fastest pace per distance">
                {pbs.length === 0 ? (
                  <p className="text-sm text-gray-400">No qualifying runs found yet.</p>
                ) : (
                  <div className="space-y-2">
                    {pbs.map((pb, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{pb.label}</p>
                          <p className="text-xs text-gray-400">{pb.date}</p>
                        </div>
                        <span className="text-sm font-bold text-[#1A56DB]">{pb.pace}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function LoadCard({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  )
}
