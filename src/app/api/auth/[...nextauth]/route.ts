import NextAuth, { AuthOptions } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const authOptions: AuthOptions = {
  providers: [
    {
      id: 'strava',
      name: 'Strava',
      type: 'oauth',
      clientId: process.env.STRAVA_CLIENT_ID,
      clientSecret: process.env.STRAVA_CLIENT_SECRET,
      authorization: {
        url: 'https://www.strava.com/oauth/authorize',
        params: {
          scope: 'read,activity:read',
          response_type: 'code',
          approval_prompt: 'auto',
        },
      },
      checks: ['state'],
      token: {
        url: 'https://www.strava.com/oauth/token',
        async request({ params, provider }) {
          const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code: params.code as string,
            redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback/strava`,
            client_id: provider.clientId as string,
            client_secret: provider.clientSecret as string,
          })
          console.log('[Strava token request] body:', body.toString())
          const res = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
          })
          const data = await res.json()
          console.log('[Strava token response]', res.status, JSON.stringify(data))
          if (!res.ok) throw new Error(data.message ?? JSON.stringify(data))
          return { tokens: data }
        },
      },
      userinfo: {
        url: 'https://www.strava.com/api/v3/athlete',
        async request({ tokens }) {
          const res = await fetch('https://www.strava.com/api/v3/athlete', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          })
          return res.json()
        },
      },
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: `${profile.firstname} ${profile.lastname}`.trim(),
          email: profile.email ?? null,
          image: profile.profile ?? null,
        }
      },
    },
  ],

  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'strava' || !profile) return false

      const stravaProfile = profile as Record<string, unknown>

      const { error } = await supabaseAdmin.from('users').upsert(
        {
          strava_id: stravaProfile.id,
          name: user.name,
          email: user.email,
          image: user.image,
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          // NextAuth sets expires_at from Strava's expires_at field (Unix seconds)
          token_expiry: account.expires_at ?? Math.floor(Date.now() / 1000) + 21600,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'strava_id' }
      )

      if (error) {
        console.error('[NextAuth] Supabase upsert error:', error.message)
        return false
      }
      return true
    },

    async jwt({ token, account, profile }) {
      if (account?.provider === 'strava' && profile) {
        const stravaProfile = profile as Record<string, unknown>
        const { data } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('strava_id', stravaProfile.id)
          .single()

        if (data) {
          token.userId = data.id as string
          token.stravaId = stravaProfile.id as number
        }
      }
      return token
    },

    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId
      return session
    },
  },

  pages: { signIn: '/' },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
