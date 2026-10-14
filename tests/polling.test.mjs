import test from 'node:test'
import assert from 'node:assert/strict'
import { startPolling } from '../src/lib/polling.mjs'

function browser(t) {
  const document = new EventTarget()
  document.hidden = false
  const window = new EventTarget()
  const navigator = { onLine: true }
  const cleanup = []
  t.after(() => cleanup.forEach(stop => stop()))
  for (const [name, value] of Object.entries({ document, window, navigator })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { value, configurable: true })
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original)
      else delete globalThis[name]
    })
  }
  t.mock.timers.enable({ apis: ['setTimeout'] })
  return { document, window, navigator, cleanup }
}

const flush = () => new Promise(resolve => setImmediate(resolve))

test('background notification polling slows down and returning to the tab refreshes immediately', async t => {
  const { document, cleanup } = browser(t)
  let calls = 0
  const stop = startPolling(async () => { calls++ }, { intervalMs: 30000 })
  cleanup.push(stop)
  await flush()
  assert.equal(calls, 1)
  t.mock.timers.tick(30000)
  await flush()
  assert.equal(calls, 2)
  document.hidden = true
  document.dispatchEvent(new Event('visibilitychange'))
  t.mock.timers.tick(299999)
  await flush()
  assert.equal(calls, 2)
  t.mock.timers.tick(1)
  await flush()
  assert.equal(calls, 3)
  document.hidden = false
  document.dispatchEvent(new Event('visibilitychange'))
  await flush()
  assert.equal(calls, 4)
})

test('view-only polling pauses while hidden or offline and catches up on return', async t => {
  const { document, window, navigator, cleanup } = browser(t)
  let calls = 0
  const stop = startPolling(async () => { calls++ }, { intervalMs: 120000, hiddenIntervalMs: null, immediate: false })
  cleanup.push(stop)
  document.hidden = true
  document.dispatchEvent(new Event('visibilitychange'))
  t.mock.timers.tick(3600000)
  await flush()
  assert.equal(calls, 0)
  document.hidden = false
  document.dispatchEvent(new Event('visibilitychange'))
  await flush()
  assert.equal(calls, 1)
  navigator.onLine = false
  window.dispatchEvent(new Event('offline'))
  t.mock.timers.tick(3600000)
  await flush()
  assert.equal(calls, 1)
  navigator.onLine = true
  window.dispatchEvent(new Event('online'))
  await flush()
  assert.equal(calls, 2)
})

test('slow requests never overlap and cleanup cancels work and removes wake listeners', async t => {
  const { document, window } = browser(t)
  let calls = 0
  let finish
  let requestSignal
  const stop = startPolling(signal => {
    calls++
    requestSignal = signal
    return new Promise(resolve => { finish = resolve })
  }, { intervalMs: 30000 })
  t.mock.timers.tick(120000)
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('online'))
  assert.equal(calls, 1)
  stop()
  assert.equal(requestSignal.aborted, true)
  finish()
  await flush()
  t.mock.timers.tick(3600000)
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('online'))
  assert.equal(calls, 1)
})

test('a failed request can recover on the next scheduled check', async t => {
  const { cleanup } = browser(t)
  let calls = 0
  let failures = 0
  const stop = startPolling(async () => {
    if (++calls === 1) throw new Error('Temporary failure')
  }, { intervalMs: 30000, onError: () => { failures++ } })
  cleanup.push(stop)
  await flush()
  t.mock.timers.tick(30000)
  await flush()
  assert.equal(calls, 2)
  assert.equal(failures, 1)
})
