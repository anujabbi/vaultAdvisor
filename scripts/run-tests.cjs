// Run vitest under Electron's bundled Node (ELECTRON_RUN_AS_NODE) so tests
// load the SAME better-sqlite3 binary as the app — one ABI everywhere, no
// rebuild dance between `npm test` and `npm run dev`.
const { spawnSync } = require('child_process')

const electron = require('electron') // resolves to the electron binary path
const args = ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)]

const r = spawnSync(electron, args, {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
process.exit(r.status ?? 1)
