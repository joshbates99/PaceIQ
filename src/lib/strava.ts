import { supabaseAdmin } from './supabase'

async function refreshStravaToken(userId: string, refreshToken: string): Promise<string> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status}`)

  const data = await res.json()

  await supabaseAdmin
    .from('users')
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expiry: data.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  return data.access_token as string
}

// Returns a valid access token, refreshing it first if it expires within 5 minutes
export async function getValidAccessToken(userId: string): Promise<string> {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('access_token, refresh_token, token_expiry')
    .eq('id', userId)
    .single()

  if (error || !user) throw new Error('User not found in database')

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (user.token_expiry <= nowSeconds + 300) {
    return refreshStravaToken(userId, user.refresh_token)
  }

  return user.access_token as string
}
