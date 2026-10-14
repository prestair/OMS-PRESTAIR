const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const jwt = require('jsonwebtoken')
const { authorizeReport } = require('../server/report-authorization.cjs')

const env = {
  JWT_SECRET: 'test-only-signing-secret', CRON_SECRET: 'test-only-cron-secret',
  SUPABASE_URL: 'https://example.invalid', SUPABASE_KEY: 'test-only-key',
  GMAIL_USER: 'sender@example.invalid', GMAIL_APP_PASSWORD: 'test-only-password',
  REPORT_RECEIVER: 'recipient@example.invalid'
}
const request = token => ({ method: 'GET', headers: token ? { authorization: `Bearer ${token}` } : {} })
const token = (role = 'admin') => jwt.sign({ id: 1, role }, env.JWT_SECRET, { expiresIn: '1h' })

function report(overrides = {}, userRow = { role: 'admin' }) {
  const calls = { clients: 0, emails: [], imports: [] }
  const supabase = { from(table) {
    const result = { data: table === 'users' ? [userRow] : [], error: null }
    const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) }
    for (const method of ['select', 'eq', 'order', 'limit']) query[method] = () => query
    return query
  } }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api/cron-daily-report.js'), 'utf8'), {
    module, process: { env: { ...env, ...overrides } }, console, AbortSignal,
    fetch: () => { throw new Error('Live network access is forbidden in tests') },
    require(name) {
      calls.imports.push(name)
      if (name === '../server/report-authorization.cjs') return { authorizeReport: req => authorizeReport(req, { ...env, ...overrides }) }
      if (name === '@supabase/supabase-js') return { createClient: () => { calls.clients++; return supabase } }
      if (name === 'nodemailer') return { createTransport: options => {
        assert.equal(options.socketTimeout, 10000)
        return { sendMail: async mail => { calls.emails.push(mail) } }
      } }
      if (name === 'xlsx-js-style') return require(name)
      throw new Error(`Unexpected dependency: ${name}`)
    }
  })
  return { handler: module.exports, calls }
}
async function invoke(handler, req) {
  const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value },
    status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
  await handler(req, res)
  return res
}

test('anonymous, forged and non-admin report requests cannot read data or send email', async () => {
  for (const [req, status] of [[request(), 401], [request('forged'), 401], [request(token('user')), 403]]) {
    const { handler, calls } = report()
    assert.equal((await invoke(handler, req)).statusCode, status)
    assert.equal(calls.clients, 0)
    assert.equal(calls.emails.length, 0)
    assert.equal(calls.imports.includes('xlsx-js-style'), false)
  }
})

test('an unset cron secret never authorizes Bearer undefined', async () => {
  const { handler, calls } = report({ CRON_SECRET: undefined })
  assert.equal((await invoke(handler, request('undefined'))).statusCode, 401)
  assert.equal(calls.clients, 0)
})

test('scheduled reports and current admins still produce an attachment using mocked email', async () => {
  for (const auth of [env.CRON_SECRET, token()]) {
    const { handler, calls } = report()
    const res = await invoke(handler, request(auth))
    assert.equal(res.statusCode, 200)
    assert.equal(calls.emails.length, 1)
    assert.equal(calls.emails[0].to, env.REPORT_RECEIVER)
    assert.ok(calls.emails[0].attachments[0].content.length > 0)
    assert.equal(res.headers['Cache-Control'], 'private, no-store')
  }
})

test('revoked admin sessions cannot send a manual report', async () => {
  const { handler, calls } = report({}, { role: 'admin', force_logout_at: new Date(Date.now() + 1000).toISOString() })
  assert.equal((await invoke(handler, request(token()))).statusCode, 401)
  assert.equal(calls.emails.length, 0)
})

test('missing mail configuration fails before database and mail work', async () => {
  const { handler, calls } = report({ GMAIL_APP_PASSWORD: undefined })
  assert.equal((await invoke(handler, request(env.CRON_SECRET))).statusCode, 503)
  assert.equal(calls.clients, 0)
})
