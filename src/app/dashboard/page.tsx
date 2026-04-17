import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { authOptions } from '../api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import SyncButton from '@/components/SyncButton'
import { Activity } from '@/types'
import RouteMap from '@/components/RouteMap'

// ── Formatters ────────────────────────────────────────────────────────────────

function formatPace(metersPerSecond: number): string {
  if (!metersPerSecond || metersPerSecond <= 0) return '–'
  const minPerKm = 1000 / (metersPerSecond * 60)
  const mins = Math.floor(minPerKm)
  const secs = Math.round((minPerKm - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')}/km`
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function Dashboard() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/')

  const userId = session.user.id

  const [{ data: recentRuns }, { data: allRuns }] = await Promise.all([
    supabaseAdmin
      .from('activities')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('activities')
      .select('distance')
      .eq('user_id', userId),
  ])

  const totalRuns = allRuns?.length ?? 0
  const totalKm = allRuns?.reduce((sum, a) => sum + a.distance / 1000, 0) ?? 0
  const longestKm = allRuns?.length
    ? Math.max(...allRuns.map((a) => a.distance / 1000))
    : 0

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={session.user} />

      <main className="flex-1 pl-64">
        <div className="max-w-5xl mx-auto px-8 py-8">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? 'Profile'}
                  width={48}
                  height={48}
                  className="rounded-full ring-2 ring-white shadow"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Welcome back, {session.user.name?.split(' ')[0]}
                </h1>
                <p className="text-gray-500 text-sm mt-0.5">Here's your running overview</p>
              </div>
            </div>
            <SyncButton />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-5 mb-8">
            <StatCard label="Total Runs" value={totalRuns.toLocaleString()} />
            <StatCard label="Total Distance" value={`${totalKm.toFixed(1)} km`} />
            <StatCard label="Longest Run" value={`${longestKm.toFixed(2)} km`} />
          </div>

          {/* Recent Runs */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Recent Runs</h2>
              {totalRuns > 20 && (
                <span className="text-xs text-gray-400">Showing last 20</span>
              )}
            </div>

            {!recentRuns || recentRuns.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" />
                  </svg>
                </div>
                <p className="text-gray-600 font-medium mb-1">No runs yet</p>
                <p className="text-gray-400 text-sm">Click "Sync Activities" to import your runs from Strava</p>
              </div>
            ) : (
              <>
                {/* Table header */}
                <div className="grid grid-cols-[80px_1fr_100px_100px_100px] px-6 py-3 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Route</span>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Activity</span>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Distance</span>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Pace</span>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Duration</span>
                </div>

                <div className="divide-y divide-gray-50">
                  {(recentRuns as Activity[]).map((run) => (
                    <div
                      key={run.id}
                      className="grid grid-cols-[80px_1fr_100px_100px_100px] items-center px-6 py-3 hover:bg-gray-50/70 transition-colors"
                    >
                      <div className="pr-3">
                        {run.summary_polyline ? (
                          <RouteMap polyline={run.summary_polyline} width={64} height={52} />
                        ) : (
                          <div className="w-16 h-13 rounded-lg bg-gray-100 flex items-center justify-center">
                            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm truncate pr-4">{run.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(run.start_date)}</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 text-right">
                        {(run.distance / 1000).toFixed(2)} km
                      </p>
                      <p className="text-sm font-semibold text-gray-900 text-right">
                        {formatPace(run.average_speed)}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 text-right">
                        {formatDuration(run.moving_time)}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
