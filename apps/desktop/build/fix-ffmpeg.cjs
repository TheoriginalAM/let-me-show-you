// electron-builder afterPack hook. ffmpeg-static ships a SINGLE binary matched
// to the install-host arch, so a cross-arch target (e.g. the x64 mac dmg built
// on an arm64 host/CI) would bundle the wrong-arch ffmpeg and fail to transcode.
// When the target arch differs from the host, download the correct binary.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const https = require('https')

const TAG = 'b6.1.1' // ffmpeg-static@5.3.0 "binary-release-tag"
const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64' }

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'lmsy-build' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          return download(res.headers.location).then(resolve, reject)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`ffmpeg download failed (${res.statusCode}) for ${url}`))
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, arch, packager } = context
  const archName = ARCH_NAMES[arch]
  if (!archName) return

  const platform =
    electronPlatformName === 'darwin' ? 'darwin' : electronPlatformName === 'win32' ? 'win32' : 'linux'

  // Host build → the installed binary is already the right arch.
  if (platform === process.platform && archName === process.arch) return

  const resourcesDir =
    platform === 'darwin'
      ? path.join(`${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : 'resources'
  const binName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const ffmpegPath = path.join(
    appOutDir,
    resourcesDir,
    'app.asar.unpacked',
    'node_modules',
    'ffmpeg-static',
    binName,
  )
  if (!fs.existsSync(ffmpegPath)) {
    console.warn(`[fix-ffmpeg] no bundled ffmpeg at ${ffmpegPath}; skipping`)
    return
  }

  const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${TAG}/ffmpeg-${platform}-${archName}.gz`
  console.log(
    `[fix-ffmpeg] target ${platform}-${archName} != host ${process.platform}-${process.arch}; fetching correct ffmpeg…`,
  )
  const binary = zlib.gunzipSync(await download(url))
  fs.writeFileSync(ffmpegPath, binary)
  fs.chmodSync(ffmpegPath, 0o755)
  console.log(`[fix-ffmpeg] replaced with ${platform}-${archName} ffmpeg (${binary.length} bytes)`)
}
