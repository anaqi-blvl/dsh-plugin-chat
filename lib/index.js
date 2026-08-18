/**
 * dsh-chat — host half (real-session, client-driven).
 *
 * Chats are REAL DSH sessions, each isolated in its own temporary workspace
 * nested under ~/.dsh/dsh-chat-work/<uuid>. This host half is intentionally
 * thin: it mints a fresh temp folder per chat (the browser can't mkdir) and
 * exposes its path + title. The client then registers the folder as a
 * workspace and starts a session in it via the official
 * `ctx.workspaces.startSession()` flow (the same path the workspace "+"
 * button uses), so each chat is a fully isolated session with the agent
 * toolset scoped to its own folder.
 */
import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'chat'
export const inject = ['webServer', 'webStartup']

const API_BASE = '/api/dsh-chat'
const WORK_ROOT = join(homedir(), '.dsh', 'dsh-chat-work')
const WORK_TITLE = 'Chat'

// Browser-trust fence (mirrors the official /api fence: loopback + trusted hosts).
function parseAuthority(authority) {
  try { return new URL(`http://${authority}`) } catch { return undefined }
}
function canonicalAuthority(entry, entryUrl) {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : entryUrl.host
}
function isTrustedAuthority(hostUrl, trustedHosts) {
  return (trustedHosts ?? []).some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}
function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}
function isTrustedRequest(request, trustedHosts) {
  const host = request.headers?.host
  if (typeof host !== 'string') return false
  let hostUrl
  try { hostUrl = new URL('http://' + host) } catch { return false }
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try { return new URL(origin).host === hostUrl.host } catch { return false }
}
function writeJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'referrer-policy': 'no-referrer',
  })
  res.end(JSON.stringify(body))
}

export function apply(ctx) {
  const trustedHosts = () => ctx.webStartup?.trustedHosts ?? []
  mkdirSync(WORK_ROOT, { recursive: true, mode: 0o700 })

  // GET /api/dsh-chat/config → { workRoot, title } so the client knows the
  // chat workspace root without a hardcoded path.
  function configHandler(req, res) {
    if (!isTrustedRequest(req, trustedHosts())) return writeJson(res, 403, { error: 'forbidden' })
    if (req.method !== 'GET') return writeJson(res, 405, { error: 'method not allowed' })
    writeJson(res, 200, { workRoot: WORK_ROOT, title: WORK_TITLE })
  }

  // POST /api/dsh-chat/folder → mint a fresh isolated temp folder for one chat.
  function folderHandler(req, res) {
    if (!isTrustedRequest(req, trustedHosts())) return writeJson(res, 403, { error: 'forbidden' })
    if (req.method !== 'POST') return writeJson(res, 405, { error: 'method not allowed' })
    const dir = join(WORK_ROOT, randomUUID())
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    writeJson(res, 201, { path: dir, title: WORK_TITLE })
  }

  ctx.effect(() => {
    const disposers = [
      ctx.webServer.register({ kind: 'exact', path: API_BASE + '/config', handler: configHandler }),
      ctx.webServer.register({ kind: 'exact', path: API_BASE + '/folder', handler: folderHandler }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'dsh-chat: routes')
}
