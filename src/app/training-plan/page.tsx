'use client'

import { useEffect, useRef, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import MainContent from '@/components/MainContent'
import RunRouteMap from '@/components/RunRouteMap'
import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'

interface PlanState {
  plan: string | null
  generatedAt: string | null
  remainingToday: number
  dailyLimit: number
}

interface Preferences {
  runs_per_week: number
  gym_days_per_week: number
  allow_double_days: boolean
  experience_level: string
  notes: string
  injury_active: boolean
  injury_location: string
  severity_level: string
  injury_constraints: string[]
  injury_notes: string
  home_location: string
  home_lat: number | null
  home_lng: number | null
}

interface DayPlan {
  heading: string
  sessionType: string
  details: string[]
  nutrition: string
  coachNote: string
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parsePlan(text: string): { days: DayPlan[]; summary: string } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const days: DayPlan[] = []
  let summary = ''
  let current: Partial<DayPlan> | null = null
  let inSummary = false

  for (const line of lines) {
    const clean = line.replace(/\*\*/g, '')

    if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(clean)) {
      if (current?.heading) days.push(current as DayPlan)
      current = { heading: clean, sessionType: '', details: [], nutrition: '', coachNote: '' }
      inSummary = false
      continue
    }
    if (/^week summary/i.test(clean)) {
      if (current?.heading) days.push(current as DayPlan)
      current = null
      inSummary = true
      continue
    }
    if (inSummary) { summary += (summary ? ' ' : '') + clean; continue }
    if (!current) continue

    if (/^session type:/i.test(line)) {
      current.sessionType = line.replace(/^session type:\s*/i, '').replace(/\*\*/g, '')
    } else if (/^nutrition:/i.test(line)) {
      current.nutrition = line.replace(/^nutrition:\s*/i, '').replace(/\*\*/g, '')
    } else if (/^coach'?s? note:/i.test(line)) {
      current.coachNote = line.replace(/^coach'?s? note:\s*/i, '').replace(/\*\*/g, '')
    } else {
      current.details = [...(current.details ?? []), clean.replace(/^[-•]\s*/, '')]
    }
  }
  if (current?.heading) days.push(current as DayPlan)
  return { days, summary }
}

// ── Session styles ────────────────────────────────────────────────────────────

const STYLES = [
  { pattern: /interval/i, label: 'Intervals', short: 'INT', badge: 'bg-red-100 text-red-700',     border: 'border-t-red-400',    strip: 'bg-red-400',    light: 'bg-red-50',    icon: '⚡' },
  { pattern: /tempo/i,    label: 'Tempo',     short: 'TMP', badge: 'bg-orange-100 text-orange-700', border: 'border-t-orange-400', strip: 'bg-orange-400', light: 'bg-orange-50', icon: '🔥' },
  { pattern: /long/i,     label: 'Long Run',  short: 'LNG', badge: 'bg-purple-100 text-purple-700', border: 'border-t-purple-400', strip: 'bg-purple-400', light: 'bg-purple-50', icon: '🏃' },
  { pattern: /recovery/i, label: 'Recovery',  short: 'REC', badge: 'bg-green-100 text-green-700',  border: 'border-t-green-400',  strip: 'bg-green-400',  light: 'bg-green-50',  icon: '💚' },
  { pattern: /easy/i,     label: 'Easy Run',  short: 'EZY', badge: 'bg-blue-100 text-blue-700',    border: 'border-t-blue-400',   strip: 'bg-blue-400',   light: 'bg-blue-50',   icon: '😊' },
  { pattern: /mobil|stretch|rest/i, label: 'Mobility', short: 'MOB', badge: 'bg-teal-100 text-teal-700', border: 'border-t-teal-400', strip: 'bg-teal-400', light: 'bg-teal-50', icon: '🧘' },
]
const DEFAULT_STYLE = { label: 'Session', short: '—', badge: 'bg-gray-100 text-gray-600', border: 'border-t-gray-300', strip: 'bg-gray-300', light: 'bg-gray-50', icon: '📋' }

function getStyle(s: string) {
  return STYLES.find(x => x.pattern.test(s)) ?? DEFAULT_STYLE
}

// ── Day card ──────────────────────────────────────────────────────────────────

const RUN_SESSION_TYPES = /easy|recovery|long|tempo|interval/i

function extractDistanceKm(details: string[]): number {
  for (const d of details) {
    const m = d.match(/(\d+(?:\.\d+)?)\s*km/i)
    if (m) return parseFloat(m[1])
  }
  return 5
}

function DayCard({ day, id, homeLat, homeLng, homeLocation }: { day: DayPlan; id: string; homeLat: number | null; homeLng: number | null; homeLocation: string }) {
  const style = getStyle(day.sessionType)
  return (
    <div id={id} className={`bg-white rounded-2xl shadow-sm border border-gray-100 border-t-4 ${style.border} overflow-hidden`}>
      {/* Card header */}
      <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
            {day.heading.split(' ').slice(0, 1).join('')}
          </p>
          <h3 className="text-base font-bold text-gray-900 leading-tight">{day.heading}</h3>
        </div>
        {day.sessionType && (
          <span className={`flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${style.badge}`}>
            {style.icon} {day.sessionType}
          </span>
        )}
      </div>

      <div className="px-6 pb-5 space-y-4">
        {/* Session details */}
        {day.details.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Session</p>
            <ul className="space-y-1.5">
              {day.details.map((d, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-gray-300 font-bold mt-0.5 flex-shrink-0">›</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Route map for run sessions */}
        {RUN_SESSION_TYPES.test(day.sessionType) && (
          homeLat && homeLng ? (
            <RunRouteMap
              lat={homeLat}
              lng={homeLng}
              distanceKm={extractDistanceKm(day.details)}
              sessionType={day.sessionType}
              locationName={homeLocation}
            />
          ) : (
            <p className="mt-3 text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2">
              Set your home location in ⚙️ Preferences to see route maps here.
            </p>
          )
        )}

        {/* Nutrition + Coach note side by side on wider screens */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {day.nutrition && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">🥗 Nutrition</p>
              <p className="text-sm text-gray-700 leading-relaxed">{day.nutrition}</p>
            </div>
          )}
          {day.coachNote && (
            <div className={`${style.light} rounded-xl p-3.5`}>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">💬 Coach&apos;s Note</p>
              <p className="text-sm text-gray-700 italic leading-relaxed">{day.coachNote}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Week strip ────────────────────────────────────────────────────────────────

function WeekStrip({ days }: { days: DayPlan[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const style = getStyle(day.sessionType)
          const dayName = day.heading.split(' ')[0].slice(0, 3)
          const dayNum = day.heading.split(' ')[1] ?? ''
          return (
            <a
              key={i}
              href={`#day-${i}`}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className="text-xs font-semibold text-gray-400 uppercase">{dayName}</span>
              <div className={`w-10 h-10 rounded-xl ${style.strip} flex items-center justify-center text-white text-xs font-bold shadow-sm group-hover:scale-105 transition-transform`}>
                {dayNum || style.short}
              </div>
              <span className="text-xs text-gray-500 font-medium text-center leading-tight">{style.short}</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const DEFAULT_PREFS: Preferences = { runs_per_week: 5, gym_days_per_week: 0, allow_double_days: false, experience_level: 'intermediate', notes: '', injury_active: false, injury_location: '', severity_level: 'mild', injury_constraints: [], injury_notes: '', home_location: '', home_lat: null, home_lng: null }

export default function TrainingPlan() {
  const { data: session, status } = useSession()
  const [state, setState] = useState<PlanState | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const topRef = useRef<HTMLDivElement>(null)

  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS)
  const [prefsSet, setPrefsSet] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [prefsDraft, setPrefsDraft] = useState<Preferences>(DEFAULT_PREFS)
  const [gpsLoading, setGpsLoading] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') redirect('/')
    if (status === 'authenticated') loadAll()
  }, [status])

  async function loadAll() {
    setLoading(true)
    const [planRes, prefsRes] = await Promise.all([fetch('/api/training-plan'), fetch('/api/preferences')])
    const planData = await planRes.json()
    const prefsData = await prefsRes.json()
    setState(planData)
    if (prefsData && prefsData.runs_per_week != null) {
      const p: Preferences = { runs_per_week: prefsData.runs_per_week, gym_days_per_week: prefsData.gym_days_per_week ?? 0, allow_double_days: prefsData.allow_double_days ?? false, experience_level: prefsData.experience_level ?? 'intermediate', notes: prefsData.notes ?? '', injury_active: prefsData.injury_active ?? false, injury_location: prefsData.injury_location ?? '', severity_level: prefsData.severity_level ?? 'mild', injury_constraints: prefsData.injury_constraints ?? [], injury_notes: prefsData.injury_notes ?? '', home_location: prefsData.home_location ?? '', home_lat: prefsData.home_lat ?? null, home_lng: prefsData.home_lng ?? null }
      setPrefs(p)
      setPrefsDraft(p)
      setPrefsSet(true)
    } else {
      setPrefsOpen(true)
    }
    setLoading(false)
  }

  async function useGPS() {
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality&access_token=${token}`)
      const data = await res.json()
      const name = data.features?.[0]?.place_name ?? `${lat.toFixed(3)}, ${lng.toFixed(3)}`
      setPrefsDraft(d => ({ ...d, home_lat: lat, home_lng: lng, home_location: name }))
      setGpsLoading(false)
    }, () => setGpsLoading(false))
  }

  async function geocodeLocation(query: string) {
    if (!query.trim()) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=place,locality,postcode&access_token=${token}`)
    const data = await res.json()
    const feature = data.features?.[0]
    if (feature) {
      const [lng, lat] = feature.center
      setPrefsDraft(d => ({ ...d, home_lat: lat, home_lng: lng, home_location: feature.place_name }))
    }
  }

  async function savePrefs() {
    setPrefsSaving(true)
    const res = await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(prefsDraft) })
    if (res.ok) { setPrefs(prefsDraft); setPrefsSet(true); setPrefsOpen(false) }
    setPrefsSaving(false)
  }

  async function generatePlan() {
    setGenerating(true)
    setError(null)
    topRef.current?.scrollIntoView({ behavior: 'smooth' })
    try {
      const res = await fetch('/api/training-plan', { method: 'POST' })
      const text = await res.text()
      if (!text) { setError('Server returned an empty response.'); setGenerating(false); return }
      let data: { error?: string; plan?: string; generatedAt?: string; remainingToday?: number }
      try { data = JSON.parse(text) } catch { setError(`Server error: ${text.slice(0, 200)}`); setGenerating(false); return }
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.')
      } else {
        setState(prev => prev ? { ...prev, plan: data.plan!, generatedAt: data.generatedAt!, remainingToday: data.remainingToday! } : prev)
      }
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    }
    setGenerating(false)
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar user={{}} />
        <MainContent>
          <div className="flex items-center justify-center py-32">
            <div className="text-gray-400 text-sm">Loading...</div>
          </div>
        </MainContent>
      </div>
    )
  }

  const canGenerate = (state?.remainingToday ?? 0) > 0
  const parsed = state?.plan ? parsePlan(state.plan) : null

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={session?.user ?? {}} />

      <MainContent>
        <div className="max-w-3xl mx-auto px-4 sm:px-8 pt-20 lg:pt-8 pb-24 lg:pb-8 space-y-5" ref={topRef}>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Training Plan</h1>
              <p className="text-gray-500 text-sm mt-0.5">AI-personalised plan with session details and nutrition</p>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-1.5">
              <button
                onClick={generatePlan}
                disabled={generating || !canGenerate || !prefsSet}
                className="px-5 py-2.5 bg-[#1A56DB] text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {generating ? 'Generating…' : state?.plan ? 'Regenerate' : 'Generate Plan'}
              </button>
              <p className="text-xs text-gray-400">
                {state?.remainingToday ?? 0}/{state?.dailyLimit ?? 3} left today
              </p>
            </div>
          </div>

          {/* ── Training Preferences ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => { setPrefsOpen(v => !v); setPrefsDraft(prefs) }}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-900">⚙️ Training Preferences</span>
                {prefsSet && (
                  <span className="text-xs text-gray-400">
                    {prefs.runs_per_week} runs · {prefs.gym_days_per_week} gym · {prefs.experience_level}
                  </span>
                )}
                {!prefsSet && <span className="text-xs font-semibold text-orange-500">Set before generating</span>}
              </div>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${prefsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {prefsOpen && (
              <div className="px-6 pb-6 border-t border-gray-100 pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Run days per week</label>
                    <div className="flex gap-2 flex-wrap">
                      {[1,2,3,4,5,6,7].map(n => (
                        <button key={n} onClick={() => setPrefsDraft(d => ({ ...d, runs_per_week: n }))}
                          className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${prefsDraft.runs_per_week === n ? 'bg-[#1A56DB] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Gym/strength days per week</label>
                    <div className="flex gap-2 flex-wrap">
                      {[0,1,2,3,4,5].map(n => (
                        <button key={n} onClick={() => setPrefsDraft(d => ({ ...d, gym_days_per_week: n }))}
                          className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${prefsDraft.gym_days_per_week === n ? 'bg-[#1A56DB] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Experience level</label>
                    <div className="flex gap-2">
                      {['beginner','intermediate','advanced'].map(l => (
                        <button key={l} onClick={() => setPrefsDraft(d => ({ ...d, experience_level: l }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${prefsDraft.experience_level === l ? 'bg-[#1A56DB] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setPrefsDraft(d => ({ ...d, allow_double_days: !d.allow_double_days }))}
                      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${prefsDraft.allow_double_days ? 'bg-[#1A56DB]' : 'bg-gray-200'}`}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${prefsDraft.allow_double_days ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                    <div>
                      <p className="text-xs font-semibold text-gray-700">Double days</p>
                      <p className="text-xs text-gray-400">Run + gym/stretch same day</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Additional notes <span className="font-normal">(optional)</span></label>
                  <textarea
                    value={prefsDraft.notes}
                    onChange={e => setPrefsDraft(d => ({ ...d, notes: e.target.value }))}
                    placeholder="e.g. I swim on Tuesdays, prefer long run on Sunday, no back-to-back hard days"
                    rows={2}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                {/* ── Home Location ── */}
                <div className="border-t border-gray-100 pt-4 space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">Home Location <span className="font-normal">(for route maps)</span></label>
                  <div className="flex gap-2">
                    <input
                      value={prefsDraft.home_location}
                      onChange={e => setPrefsDraft(d => ({ ...d, home_location: e.target.value, home_lat: null, home_lng: null }))}
                      onBlur={e => geocodeLocation(e.target.value)}
                      placeholder="e.g. Manchester, UK or M1 1AE"
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={useGPS}
                      disabled={gpsLoading}
                      title="Use my current location"
                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors disabled:opacity-50"
                    >
                      {gpsLoading ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                      )}
                    </button>
                  </div>
                  {prefsDraft.home_lat && (
                    <p className="text-xs text-green-600 font-medium">✓ Location found — route maps will appear on run days</p>
                  )}
                </div>

                {/* ── Injury / Limitation ── */}
                <div className="border-t border-gray-100 pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-gray-700">Current Injury / Physical Limitation</p>
                      <p className="text-xs text-gray-400 mt-0.5">Adapts your plan — not medical advice</p>
                    </div>
                    <button onClick={() => setPrefsDraft(d => ({ ...d, injury_active: !d.injury_active, ...(d.injury_active ? { injury_location: '', severity_level: 'mild', injury_constraints: [], injury_notes: '' } : {}) }))}
                      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${prefsDraft.injury_active ? 'bg-orange-500' : 'bg-gray-200'}`}>
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${prefsDraft.injury_active ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {prefsDraft.injury_active && (
                    <div className="space-y-4 bg-orange-50 rounded-xl p-4 border border-orange-100">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Location</label>
                          <input
                            value={prefsDraft.injury_location}
                            onChange={e => setPrefsDraft(d => ({ ...d, injury_location: e.target.value }))}
                            placeholder="e.g. knee, ankle, hip, foot"
                            className="w-full text-sm border border-orange-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Severity</label>
                          <div className="flex gap-2">
                            {[{v:'mild',label:'Mild'},{v:'moderate',label:'Moderate'},{v:'severe',label:'Severe'}].map(s => (
                              <button key={s.v} onClick={() => setPrefsDraft(d => ({ ...d, severity_level: s.v }))}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${prefsDraft.severity_level === s.v ? (s.v === 'severe' ? 'bg-red-500 text-white' : s.v === 'moderate' ? 'bg-orange-400 text-white' : 'bg-yellow-400 text-white') : 'bg-white text-gray-600 border border-orange-200'}`}>
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Training constraints</label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { v: 'no_speed_work', label: 'No speed work' },
                            { v: 'reduced_distance', label: 'Reduced distance' },
                            { v: 'no_hills', label: 'No hills' },
                            { v: 'low_impact_only', label: 'Low impact only' },
                            { v: 'no_running', label: 'No running' },
                          ].map(c => {
                            const active = prefsDraft.injury_constraints.includes(c.v)
                            return (
                              <button key={c.v} onClick={() => setPrefsDraft(d => ({ ...d, injury_constraints: active ? d.injury_constraints.filter(x => x !== c.v) : [...d.injury_constraints, c.v] }))}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${active ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-orange-200 hover:bg-orange-50'}`}>
                                {c.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Additional notes <span className="font-normal">(optional)</span></label>
                        <textarea
                          value={prefsDraft.injury_notes}
                          onChange={e => setPrefsDraft(d => ({ ...d, injury_notes: e.target.value }))}
                          placeholder="e.g. Can bike and swim, avoiding downhill completely, physio cleared me for easy flat runs"
                          rows={2}
                          className="w-full text-sm border border-orange-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white resize-none"
                        />
                      </div>

                      <p className="text-xs text-orange-600 font-medium">⚠️ This adapts training load only. Always follow your medical professional&apos;s guidance.</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <button onClick={() => setPrefsOpen(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                  <button onClick={savePrefs} disabled={prefsSaving}
                    className="px-5 py-2 bg-[#1A56DB] text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {prefsSaving ? 'Saving…' : 'Save Preferences'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">{error}</div>
          )}

          {/* Generating */}
          {generating && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 border-2 border-gray-100 rounded-full" />
                <div className="w-12 h-12 border-2 border-[#1A56DB] border-t-transparent rounded-full animate-spin absolute inset-0" />
              </div>
              <div className="text-center">
                <p className="text-gray-800 font-semibold">Your coach is building your plan…</p>
                <p className="text-gray-400 text-sm mt-1">Analysing fitness, fatigue, and pace data</p>
              </div>
            </div>
          )}

          {/* Plan */}
          {!generating && parsed && (
            <>
              {/* Generated timestamp */}
              {state?.generatedAt && (
                <p className="text-xs text-gray-400">
                  Generated {new Date(state.generatedAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}

              {/* Week overview strip */}
              <WeekStrip days={parsed.days} />

              {/* Day cards */}
              <div className="space-y-4">
                {parsed.days.map((day, i) => <DayCard key={i} day={day} id={`day-${i}`} homeLat={prefs.home_lat} homeLng={prefs.home_lng} homeLocation={prefs.home_location} />)}
              </div>

              {/* Week summary */}
              {parsed.summary && (
                <div className="bg-[#0F172A] rounded-2xl px-6 py-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1A56DB]" />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Week Summary</p>
                  </div>
                  <p className="text-white text-sm leading-relaxed">{parsed.summary}</p>
                </div>
              )}
            </>
          )}

          {/* Empty state */}
          {!generating && !state?.plan && !error && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-5 text-3xl">🏃</div>
              <p className="text-gray-900 font-bold text-lg mb-2">Ready to train smarter?</p>
              <p className="text-gray-400 text-sm max-w-xs mx-auto leading-relaxed">
                Generate your personalised plan and get 7 days of sessions with nutrition advice, tailored to your current fitness and fatigue.
              </p>
            </div>
          )}

          <p className="text-xs text-gray-400 text-center pb-4">
            Powered by Claude AI · Synced from Strava · Regenerate after each run
          </p>

        </div>
      </MainContent>
    </div>
  )
}
