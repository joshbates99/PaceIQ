import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '../auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabaseAdmin
    .from('user_preferences')
    .select('*')
    .eq('user_id', session.user.id)
    .single()

  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { runs_per_week, gym_days_per_week, allow_double_days, experience_level, notes, injury_active, injury_location, severity_level, injury_constraints, injury_notes } = body

  const { data, error } = await supabaseAdmin
    .from('user_preferences')
    .upsert(
      { user_id: session.user.id, runs_per_week, gym_days_per_week, allow_double_days, experience_level, notes, injury_active: injury_active ?? false, injury_location: injury_location || null, severity_level: severity_level || null, injury_constraints: injury_constraints ?? [], injury_notes: injury_notes || null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
