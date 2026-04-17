import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from './api/auth/[...nextauth]/route'
import LoginButton from '@/components/LoginButton'

export default async function Home() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#1A56DB] mb-4">
            <svg className="w-9 h-9 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">PaceIQ</h1>
          <p className="text-slate-400 text-lg">Your AI-powered running coach</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
          <h2 className="text-white text-xl font-semibold mb-1">Connect your account</h2>
          <p className="text-slate-400 text-sm mb-6">
            Sync your Strava activities and unlock personalized insights, pace analysis, and training recommendations.
          </p>

          <LoginButton />

          <p className="text-slate-500 text-xs text-center mt-4">
            We only request read access to your activities. We never post on your behalf.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 mt-8 text-center">
          {[
            { label: 'Pace Analysis', icon: '⚡' },
            { label: 'Training Load', icon: '📈' },
            { label: 'AI Insights', icon: '🧠' },
          ].map((f) => (
            <div key={f.label} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="text-2xl mb-1">{f.icon}</div>
              <p className="text-slate-400 text-xs font-medium">{f.label}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
