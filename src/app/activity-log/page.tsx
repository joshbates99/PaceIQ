import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '../api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import MainContent from '@/components/MainContent'
import SyncButton from '@/components/SyncButton'
import { Activity } from '@/types'
import RouteMap from '@/components/RouteMap'

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
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default async function ActivityLog() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/')

  const userId = session.user.id

  const [{ data: runs }, { data: allRuns }] = await Promise.all([
    supabaseAdmin.from('activities').select('*').eq('user_id', userId).order('start_date', { ascending: false }),
    supabaseAdmin.from('activities').select('distance').eq('user_id', userId),
  ])

  const totalRuns = allRuns?.length ?? 0
  const totalKm = allRuns?.reduce((sum, a) => sum + a.distance / 1000, 0) ?? 0
  const longestKm = allRuns?.length ? Math.max(...allRuns.map((a) => a.distance / 1000)) : 0

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar user={session.user} />
      <MainContent>
        <div className="max-w-5xl mx-auto px-4 sm:px-8 pt-20 lg:pt-8 pb-24 lg:pb-8">

          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
              <p className="text-gray-500 text-sm mt-0.5">All your synced runs from Strava</p>
            </div>
            <SyncButton />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
            <StatCard label="Total Runs" value={totalRuns.toLocaleString()} />
            <StatCard label="Total Distance" value={`${totalKm.toFixed(1)} km`} />
            <StatCard label="Longest Run" value={`${longestKm.toFixed(2)} km`} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">All Runs</h2>
              <span className="text-xs text-gray-400">{totalRuns} total</span>
            </div>

            {!runs || runs.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-gray-600 font-medium mb-1">No runs yet</p>
                <p className="text-gray-400 text-sm">Click "Sync Activities" to import your runs from Strava</p>
              </div>
            ) : (
              <>
                <div className="hidden sm:grid grid-cols-[80px_1fr_100px_100px_100px] px-6 py-3 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Route</span>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Activity</span>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Distance</span>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Pace</span>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Duration</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {(runs as Activity[]).map((run) => (
                    <div key={run.id} className="px-4 sm:px-6 py-3 hover:bg-gray-50/70 transition-colors">
                      {/* Mobile layout */}
                      <div className="flex items-center justify-between sm:hidden">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{run.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{formatDate(run.start_date)}</p>
                          <div className="flex gap-3 mt-1">
                            <span className="text-xs font-semibold text-gray-700">{(run.distance / 1000).toFixed(2)} km</span>
                            <span className="text-xs text-gray-500">{formatPace(run.average_speed)}</span>
                            <span className="text-xs text-gray-500">{formatDuration(run.moving_time)}</span>
                          </div>
                        </div>
                        {run.summary_polyline && (
                          <div className="ml-3 flex-shrink-0">
                            <RouteMap polyline={run.summary_polyline} width={56} height={44} />
                          </div>
                        )}
                      </div>
                      {/* Desktop layout */}
                      <div className="hidden sm:grid grid-cols-[80px_1fr_100px_100px_100px] items-center">
                        <div className="pr-3">
                          {run.summary_polyline ? (
                            <RouteMap polyline={run.summary_polyline} width={64} height={52} />
                          ) : (
                            <div className="w-16 rounded-lg bg-gray-100 h-12 flex items-center justify-center">
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
                        <p className="text-sm font-semibold text-gray-900 text-right">{(run.distance / 1000).toFixed(2)} km</p>
                        <p className="text-sm font-semibold text-gray-900 text-right">{formatPace(run.average_speed)}</p>
                        <p className="text-sm font-semibold text-gray-900 text-right">{formatDuration(run.moving_time)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>
      </MainContent>
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
