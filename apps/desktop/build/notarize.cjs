// electron-builder afterSign hook: notarize the signed macOS app with Apple's
// notary service. No-ops (so unsigned/local builds still succeed) unless all of
// APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID are set.
const { execFileSync } = require('child_process')
const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID
  if (!appleId || !appleIdPassword || !teamId) {
    console.log(
      '[notarize] Skipping — set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID to notarize.',
    )
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`
  console.log(`[notarize] Submitting ${appPath} to Apple notary (this can take a few minutes)…`)
  await notarize({ appPath, appleId, appleIdPassword, teamId })
  // Staple the ticket so Gatekeeper passes offline. Done here (before the dmg/zip
  // are built) so both artifacts carry the stapled app.
  console.log('[notarize] Notarized; stapling ticket…')
  execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' })
  console.log('[notarize] Stapled.')
}
