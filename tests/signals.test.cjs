const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function api() {
  const routes = new Map()
  const app = { use() {} }
  for (const method of ['get', 'post', 'put', 'delete']) {
    app[method] = (url, ...handlers) => routes.set(`${method} ${url}`, handlers.at(-1))
  }
  const express = Object.assign(() => app, { json: () => () => {} })
  const state = { calls: 0, count: 3, maxId: 8, gate: null, error: false }
  const supabase = { from(table) {
    const info = { table }
    const query = { then(resolve, reject) {
      state.calls++
      const result = state.error ? { error: { message: 'Temporary database failure' } } :
        info.options?.head ? { count: state.count } :
          { data: [{ id: state.maxId, response_date: '2026-10-14T00:00:00Z' }] }
      return Promise.resolve(info.method === 'delete' ? null : state.gate).then(() => result).then(resolve, reject)
    } }
    query.select = (columns, options) => { info.columns = columns; info.options = options; return query }
    query.delete = () => { info.method = 'delete'; return query }
    for (const method of ['order', 'limit', 'eq', 'abortSignal']) query[method] = () => query
    return query
  } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8'), {
    module: { exports: {} }, console, Buffer, AbortSignal,
    process: { env: { JWT_SECRET: 'test-only-secret', SUPABASE_URL: 'https://example.invalid', SUPABASE_KEY: 'test-only-key' } },
    fetch: () => { throw new Error('Live network access is forbidden in tests') },
    require(name) {
      if (name === 'express') return express
      if (name === 'compression' || name === 'cors') return () => () => {}
      if (name === '@supabase/supabase-js') return { createClient: () => supabase }
      return require(name)
    }
  })
  async function invoke(url, method = 'get') {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(data) { this.body = data } }
    await routes.get(`${method} ${url}`)({ params: { id: '2' }, user: { id: 1, username: 'tester', role: 'admin' } }, res)
    return res
  }
  return { state, invoke }
}

test('simultaneous reminder signal requests share three parallel reads and a short cache', async () => {
  const { state, invoke } = api()
  let release
  state.gate = new Promise(resolve => { release = resolve })
  const first = invoke('/api/orders/reminders/signal')
  const second = invoke('/api/orders/reminders/signal')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.calls, 3, 'all independent queries start together and are shared')
  release()
  const results = await Promise.all([first, second])
  assert.equal(results[0].body.count, 3)
  assert.equal(results[1].body.maxId, 8)
  await invoke('/api/orders/reminders/signal')
  assert.equal(state.calls, 3)
})

test('failed signal reads are returned as errors and are retried rather than cached as empty data', async () => {
  const { state, invoke } = api()
  state.error = true
  assert.equal((await invoke('/api/orders/signal')).statusCode, 500)
  state.error = false
  const retry = await invoke('/api/orders/signal')
  assert.equal(retry.statusCode, 200)
  assert.equal(retry.body.count, 3)
  assert.equal(state.calls, 4)
})

test('a reminder mutation invalidates the signal and a late older read cannot overwrite fresh data', async () => {
  const { state, invoke } = api()
  let release
  state.gate = new Promise(resolve => { release = resolve })
  const old = invoke('/api/orders/reminders/signal')
  await new Promise(resolve => setImmediate(resolve))
  await invoke('/api/orders/reminders/:id', 'delete')
  state.count = 2
  state.gate = null
  assert.equal((await invoke('/api/orders/reminders/signal')).body.count, 2)
  release()
  await old
  assert.equal((await invoke('/api/orders/reminders/signal')).body.count, 2)
})
