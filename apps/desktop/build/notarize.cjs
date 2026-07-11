// electron-builder afterSign hook: notarize the signed macOS app with Apple's
// notary service, then staple the ticket. No-ops (so unsigned/local builds still
// succeed) unless all of APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID
// are set.
//
// We drive `xcrun notarytool` directly (rather than @electron/notarize) so each
// submission is bounded by notarytool's native `--timeout` and can be retried.
// The notary wait occasionally hangs on a transient runner↔Apple network blip;
// a bounded attempt fails cleanly instead of stalling the whole build for hours,
// and the retry usually clears it.
const { execFileSync } = require('child_process')
const { existsSync, rmSync } = require('fs')
const path = require('path')

const MAX_ATTEMPTS = 3
const PER_ATTEMPT_TIMEOUT = '20m' // notarytool self-terminates cleanly at this bound
const BACKOFF_SECONDS = 30

const delay = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000))

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
  const appPath = path.join(appOutDir, `${appName}.app`)
  const zipPath = path.join(appOutDir, `${appName}.notarize.zip`)

  // notarytool accepts a .zip/.dmg/.pkg, not a raw .app bundle.
  console.log(`[notarize] Zipping ${appPath} for submission…`)
  execFileSync('ditto', ['-c', '-k', '--keepParent', appPath, zipPath], { stdio: 'inherit' })

  try {
    let notarized = false
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !notarized; attempt++) {
      try {
        console.log(
          `[notarize] Submitting to Apple notary (attempt ${attempt}/${MAX_ATTEMPTS}, per-attempt timeout ${PER_ATTEMPT_TIMEOUT})…`,
        )
        // stdio 'inherit' streams notarytool's own progress; it never echoes the
        // password, so nothing sensitive is logged from here.
        execFileSync(
          'xcrun',
          [
            'notarytool',
            'submit',
            zipPath,
            '--apple-id',
            appleId,
            '--password',
            appleIdPassword,
            '--team-id',
            teamId,
            '--wait',
            '--timeout',
            PER_ATTEMPT_TIMEOUT,
          ],
          { stdio: 'inherit' },
        )
        notarized = true
      } catch (err) {
        // NEVER surface err.message — execFileSync embeds the full argv (incl. the
        // app-specific password) in it. Only the exit status is safe to log.
        const status = err && typeof err.status === 'number' ? err.status : 'unknown'
        console.warn(`[notarize] Attempt ${attempt} did not complete (exit ${status}).`)
        if (attempt >= MAX_ATTEMPTS) {
          throw new Error(`[notarize] Notarization failed after ${MAX_ATTEMPTS} attempts.`)
        }
        console.log(`[notarize] Retrying in ${BACKOFF_SECONDS * attempt}s…`)
        await delay(BACKOFF_SECONDS * attempt)
      }
    }
  } finally {
    if (existsSync(zipPath)) rmSync(zipPath)
  }

  // Staple the ticket so Gatekeeper passes offline. Done here (before the dmg/zip
  // are built) so both artifacts carry the stapled app.
  console.log('[notarize] Notarized; stapling ticket…')
  execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' })
  console.log('[notarize] Stapled.')
}
