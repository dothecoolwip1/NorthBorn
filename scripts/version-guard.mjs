import fs from 'node:fs'
import { execSync } from 'node:child_process'

const repair = process.argv.includes('--repair')
const packagePath = 'package.json'
const lockPath = 'package-lock.json'
const releasePath = 'public/release.json'

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'))
const writeJson = (path, value) => fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
const pkg = readJson(packagePath)
const lock = readJson(lockPath)
const release = readJson(releasePath)

function parentVersion() {
  try {
    return JSON.parse(execSync('git show HEAD^:package.json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).version || ''
  } catch {
    return ''
  }
}

function changedFiles() {
  try {
    return execSync('git diff --name-only HEAD^ HEAD', { encoding: 'utf8' }).split(/\r?\n/).map(value => value.trim()).filter(Boolean)
  } catch {
    return []
  }
}

function nextPatch(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) throw new Error(`Northborn version must use x.y.z format. Found: ${version}`)
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

const rootLockVersion = lock?.packages?.['']?.version || ''
const versionsAligned = pkg.version === lock.version && pkg.version === rootLockVersion && pkg.version === release.version
const previousVersion = parentVersion()
const files = changedFiles()
const versionFiles = new Set([packagePath, lockPath, releasePath])
const nonVersionChange = files.some(file => !versionFiles.has(file))
const missingRequiredBump = Boolean(previousVersion && nonVersionChange && pkg.version === previousVersion)

if (!repair) {
  const problems = []
  if (!versionsAligned) problems.push(`Version mismatch: package=${pkg.version}, lock=${lock.version}, lock-root=${rootLockVersion}, release=${release.version}`)
  if (missingRequiredBump) problems.push(`Northborn changed without a version bump. Current and parent are both ${pkg.version}.`)
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log(`Northborn version discipline passed at v${pkg.version}.`)
  process.exit(0)
}

const output = process.env.GITHUB_OUTPUT
if (!versionsAligned || missingRequiredBump) {
  const next = nextPatch(pkg.version)
  pkg.version = next
  lock.version = next
  if (!lock.packages || !lock.packages['']) throw new Error('package-lock.json is missing its root package entry.')
  lock.packages[''].version = next
  release.version = next
  release.title = 'Automatic Version Correction'
  release.notes = [
    'Synchronized Northborn package, lockfile and release versions.',
    'Applied the mandatory version bump rule automatically after detecting inconsistent or unversioned changes.',
    'No user data or operational records were changed by this correction.'
  ]
  writeJson(packagePath, pkg)
  writeJson(lockPath, lock)
  writeJson(releasePath, release)
  console.log(`Northborn version guard updated the repository to v${next}.`)
  if (output) fs.appendFileSync(output, `changed=true\nversion=${next}\n`)
} else {
  console.log(`Northborn versions are synchronized at v${pkg.version}.`)
  if (output) fs.appendFileSync(output, `changed=false\nversion=${pkg.version}\n`)
}
