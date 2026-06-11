// Pin better-sqlite3 to the Electron ABI, deterministically.
// electron-builder's install-app-deps and electron-rebuild both cache their
// "is a rebuild needed" decision and can silently no-op after `npm rebuild`
// has swapped the binary back to the Node ABI — prebuild-install with an
// explicit runtime/target never lies.
const { execFileSync } = require('child_process')
const { join } = require('path')

const electronVersion = require('electron/package.json').version
const moduleDir = join(__dirname, '..', 'node_modules', 'better-sqlite3')

execFileSync(
  process.execPath,
  [
    require.resolve('prebuild-install/bin.js'),
    '--runtime=electron',
    `--target=${electronVersion}`,
    `--arch=${process.arch}`
  ],
  { cwd: moduleDir, stdio: 'inherit' }
)
console.log(`better-sqlite3 pinned to Electron ${electronVersion} ABI`)
