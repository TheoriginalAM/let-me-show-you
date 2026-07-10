'use client'

import { createAuthClient } from 'better-auth/react'
import { magicLinkClient } from 'better-auth/client/plugins'

// baseURL defaults to the current origin, which is correct for this same-origin
// Next.js app (handler mounted at /api/auth).
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
