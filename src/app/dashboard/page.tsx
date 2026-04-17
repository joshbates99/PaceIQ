'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import Sidebar from '@/components/Sidebar'
import MainContent from '@/components/MainContent'

interface Goal { id: string; title: string; target_date: string | null }
interface Race { id: string; name: string; distance_km: number; date: string; target_time: string | null }

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Personal bests (fetched from analytics) ───────────────────────────────────

const PB_DISTANCES = [
  { label: '5K', target: 5000, min: 4800 },
  { label: '10K', target: 10000, min: 9700 },
  { label: 'Half Marathon', target: 21097, min: 20500 },
  { label: 'Marathon', target: 42195, min: 41000 },
]

function formatFinishTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Insight renderer ──────────────────────────────────────────────────────────

function InsightContent({ text }: { text: string }) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const clean = line.replace(/\*\*/g, '')
        if (/^\*\*(Goals|Upcoming Races|Overall)\*\*$/.test(line) || /^(Goals|Upcoming Races|Overall)$/.test(clean)) {
          return <h3 key={i} className="text-sm font-bold text-gray-900 mt-4 first:mt-0 pb-1 border-b border-gray-100">{clean}</h3>
        }
        if (/^Likelihood:/i.test(line)) {
          const pct = line.match(/(\d+)%/)
          const label = line.match(/—\s*(.+)$/)?.[1] ?? ''
          const colour = label.includes('On Track') ? 'text-green-600' : label.includes('Challenging') ? 'text-yellow-600' : 'text-red-500'
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Likelihood:</span>
              <span className={`text-sm font-bold ${colour}`}>{pct?.[0]} — {label}</span>
            </div>
          )
        }
        if (/^Readiness:/i.test(line)) {
          const pct = parseInt(line.match(/(\d+)%/)?.[1] ?? '0')
          const colour = pct >= 75 ? 'bg-green-400' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'
          return (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Readiness</span><span className="font-semibold">{pct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className={`${colour} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        }
        if (/^This week:/i.test(line) || /^Focus:/i.test(line)) {
          const [label, ...rest] = line.split(':')
          return (
            <p key={i} className="text-xs bg-blue-50 text-blue-700 rounded-lg px-3 py-2">
              <span className="font-bold">{label}:</span> {rest.join(':').trim()}
            </p>
          )
        }
        if (/^[A-Z].*—.*\d+ (week|day)/.test(line)) {
          return <p key={i} className="text-sm font-semibold text-gray-800 mt-3">{line}</p>
        }
        return <p key={i} className="text-sm text-gray-700 leading-relaxed">{clean}</p>
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: session, status } = useSession()
  const [goals, setGoals] = useState<Goal[]>([])
  const [races, setRaces] = useState<Race[]>([])
  const [pbs, setPbs] = useState<{ label: string; time: string; date: string }[]>([])
  const [insight, setInsight] = useState<string | null>(null)
  const [insightDate, setInsightDate] = useState<string | null>(null)
  const [remainingToday, setRemainingToday] = useState(3)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)

  const [newGoal, setNewGoal] = useState('')
  const [newGoalDate, setNewGoalDate] = useState('')
  const [newRaceName, setNewRaceName] = useState('')
  const [newRaceDistance, setNewRaceDistance] = useState('')
  const [newRaceDate, setNewRaceDate] = useState('')
  const [newRaceTarget, setNewRaceTarget] = useState('')
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [showRaceForm, setShowRaceForm] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') redirect('/')
    if (status === 'authenticated') loadAll()
  }, [status])

  async function loadAll() {
    setLoading(true)
    const [goalsRes, racesRes, insightRes, activitiesRes] = await Promise.all([
      fetch('/api/goals'),
      fetch('/api/races'),
      fetch('/api/goal-insights'),
      fetch('/api/activities-summary'),
    ])
    const [g, r, ins, acts] = await Promise.all([goalsRes.json(), racesRes.json(), insightRes.json(), activitiesRes.json()])
    setGoals(Array.isArray(g) ? g : [])
    setRaces(Array.isArray(r) ? r : [])
    setInsight(ins.insight)
    setInsightDate(ins.generatedAt)
    setRemainingToday(ins.remainingToday ?? 3)
    if (Array.isArray(acts)) computePBs(acts)
    setLoading(false)
  }

  function computePBs(activities: { distance: number; average_speed: number; moving_time: number; start_date: string }[]) {
    const results = PB_DISTANCES.flatMap(t => {
      const candidates = activities.filter(a => a.distance >= t.min)
      if (!candidates.length) return []
      // Estimate split time at target distance assuming constant pace
      const best = candidates.reduce((b, a) => {
        const aTime = (t.target / a.distance) * a.moving_time
        const bTime = (t.target / b.distance) * b.moving_time
        return aTime < bTime ? a : b
      })
      const estimatedSecs = (t.target / best.distance) * best.moving_time
      return [{ label: t.label, time: formatFinishTime(estimatedSecs), date: formatDate(best.start_date) }]
    })
    setPbs(results)
  }

  async function addGoal() {
    if (!newGoal.trim()) return
    const res = await fetch('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newGoal, target_date: newGoalDate || null }) })
    const data = await res.json()
    if (res.ok) { setGoals(g => [...g, data]); setNewGoal(''); setNewGoalDate(''); setShowGoalForm(false) }
  }

  async function removeGoal(id: string) {
    await fetch('/api/goals', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setGoals(g => g.filter(x => x.id !== id))
  }

  async function addRace() {
    if (!newRaceName.trim() || !newRaceDistance || !newRaceDate) return
    const res = await fetch('/api/races', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newRaceName, distance_km: parseFloat(newRaceDistance), date: newRaceDate, target_time: newRaceTarget || null }) })
    const data = await res.json()
    if (res.ok) { setRaces(r => [...r, data].sort((a, b) => a.date.localeCompare(b.date))); setNewRaceName(''); setNewRaceDistance(''); setNewRaceDate(''); setNewRaceTarget(''); setShowRaceForm(false) }
  }

  async function removeRace(id: string) {
    await fetch('/api/races', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setRaces(r => r.filter(x => x.id !== id))
  }

  async function generateInsight() {
    setGenerating(true)
    setInsightError(null)
    try {
      const res = await fetch('/api/goal-insights', { method: 'POST' })
      const text = await res.text()
      const data = text ? JSON.parse(text) : {}
      if (!res.ok) { setInsightError(data.error ?? 'Something went wrong.') }
      else { setInsight(data.insight); setInsightDate(data.generatedAt); setRemainingToday(data.remainingToday) }
    } catch (err) {
      setInsightError(err instanceof Error ? err.message : 'Network error')
    }
    setGenerating(false)
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar user={{}} />
        <MainContent>
          <div className="flex items-center justify-center h-full py-32">
            <div className="text-gray-400 text-sm">Loading...</div>
          </div>
        </MainContent>
      </div>
    )
  }

  const inputClass = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={session?.user ?? {}} />
      <MainContent>
        <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-20 lg:pt-8 pb-24 lg:pb-8 space-y-6">

          {/* Header */}
          <div className="flex items-center gap-4">
            {session?.user?.image && (
              <Image src={session.user.image} alt="Profile" width={48} height={48} className="rounded-full ring-2 ring-white shadow" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Welcome back, {session?.user?.name?.split(' ')[0]}</h1>
              <p className="text-gray-500 text-sm mt-0.5">Here&apos;s your running overview</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* ── Left column: Goals + Races ── */}
            <div className="col-span-2 space-y-6">

              {/* Goals */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-900">🎯 My Goals</h2>
                  <button onClick={() => setShowGoalForm(v => !v)} className="text-xs font-semibold text-[#1A56DB] hover:underline">
                    {showGoalForm ? 'Cancel' : '+ Add Goal'}
                  </button>
                </div>

                {showGoalForm && (
                  <div className="px-6 py-4 bg-blue-50 border-b border-blue-100 space-y-2">
                    <input value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder="e.g. Run a sub-25 min 5K" className={inputClass} onKeyDown={e => e.key === 'Enter' && addGoal()} />
                    <div className="flex gap-2">
                      <input type="date" value={newGoalDate} onChange={e => setNewGoalDate(e.target.value)} className={`${inputClass} flex-1`} />
                      <button onClick={addGoal} className="px-4 py-2 bg-[#1A56DB] text-white text-xs font-semibold rounded-lg hover:bg-blue-700">Add</button>
                    </div>
                  </div>
                )}

                <div className="divide-y divide-gray-50">
                  {goals.length === 0 ? (
                    <p className="px-6 py-8 text-center text-sm text-gray-400">No goals yet — add one above</p>
                  ) : goals.map(g => (
                    <div key={g.id} className="px-6 py-3.5 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{g.title}</p>
                        {g.target_date && <p className="text-xs text-gray-400 mt-0.5">Target: {formatDate(g.target_date)}</p>}
                      </div>
                      <button onClick={() => removeGoal(g.id)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Races */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-900">🏁 Upcoming Races</h2>
                  <button onClick={() => setShowRaceForm(v => !v)} className="text-xs font-semibold text-[#1A56DB] hover:underline">
                    {showRaceForm ? 'Cancel' : '+ Add Race'}
                  </button>
                </div>

                {showRaceForm && (
                  <div className="px-6 py-4 bg-blue-50 border-b border-blue-100 space-y-2">
                    <input value={newRaceName} onChange={e => setNewRaceName(e.target.value)} placeholder="Race name (e.g. Manchester Marathon)" className={inputClass} />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" value={newRaceDistance} onChange={e => setNewRaceDistance(e.target.value)} placeholder="Distance (km)" className={inputClass} />
                      <input type="date" value={newRaceDate} onChange={e => setNewRaceDate(e.target.value)} className={inputClass} />
                    </div>
                    <div className="flex gap-2">
                      <input value={newRaceTarget} onChange={e => setNewRaceTarget(e.target.value)} placeholder="Target time (optional, e.g. 1:45:00)" className={`${inputClass} flex-1`} />
                      <button onClick={addRace} className="px-4 py-2 bg-[#1A56DB] text-white text-xs font-semibold rounded-lg hover:bg-blue-700">Add</button>
                    </div>
                  </div>
                )}

                <div className="divide-y divide-gray-50">
                  {races.length === 0 ? (
                    <p className="px-6 py-8 text-center text-sm text-gray-400">No races added yet</p>
                  ) : races.map(r => {
                    const days = daysUntil(r.date)
                    const isPast = days < 0
                    return (
                      <div key={r.id} className="px-6 py-3.5 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{r.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-400">{r.distance_km}km · {formatDate(r.date)}</span>
                            {r.target_time && <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-medium">Target {r.target_time}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {!isPast && (
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${days <= 14 ? 'bg-red-100 text-red-600' : days <= 42 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                              {days}d
                            </span>
                          )}
                          <button onClick={() => removeRace(r.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── Right column: PBs ── */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-bold text-gray-900">🏆 Personal Bests</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {pbs.length === 0 ? (
                    <p className="px-5 py-8 text-center text-xs text-gray-400">Sync runs to see your PBs</p>
                  ) : pbs.map((pb, i) => (
                    <div key={i} className="px-5 py-3.5">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{pb.label}</p>
                      <p className="text-lg font-bold text-[#1A56DB] mt-0.5">{pb.time}</p>
                      <p className="text-xs text-gray-400">{pb.date}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── AI Insights ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-gray-900">✨ Goal & Race Insights</h2>
                <p className="text-xs text-gray-400 mt-0.5">AI assessment of whether you&apos;ll achieve your goals</p>
              </div>
              <div className="text-right">
                <button
                  onClick={generateInsight}
                  disabled={generating || remainingToday <= 0}
                  className="px-4 py-2 bg-[#1A56DB] text-white text-xs font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {generating ? 'Analysing…' : insight ? 'Refresh Analysis' : 'Analyse My Goals'}
                </button>
                <p className="text-xs text-gray-400 mt-1">{remainingToday}/3 left today</p>
              </div>
            </div>

            <div className="px-6 py-5">
              {insightError && <p className="text-sm text-red-600 mb-4">{insightError}</p>}
              {generating && (
                <div className="flex flex-col items-center py-8 gap-3">
                  <div className="w-8 h-8 border-2 border-[#1A56DB] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-500">Analysing your goals and fitness data…</p>
                </div>
              )}
              {!generating && insight && (
                <>
                  {insightDate && <p className="text-xs text-gray-400 mb-4">Last updated {formatDate(insightDate)}</p>}
                  <InsightContent text={insight} />
                </>
              )}
              {!generating && !insight && !insightError && (
                <p className="text-sm text-gray-400 text-center py-8">Add goals or races above, then click &quot;Analyse My Goals&quot; to get AI insights.</p>
              )}
            </div>
          </div>

        </div>
      </MainContent>
    </div>
  )
}
