import { redirect } from 'next/navigation'

// Branding moved into per-workspace settings. Keep this path working by
// redirecting to the workspace settings page (which owns branding now).
export default function BrandingRedirect() {
  redirect('/dashboard/workspace')
}
