// Schedule the next request only after the previous one finishes. Notification
// checks continue at a lower rate in the background; view-only checks can pause.
export function startPolling(task, {
  intervalMs,
  hiddenIntervalMs = 5 * 60 * 1000,
  immediate = true,
  onError = () => {}
}) {
  let stopped = false
  let running = false
  let timer
  let controller

  const delay = () => document.hidden ? hiddenIntervalMs : intervalMs
  const online = () => navigator.onLine !== false
  const clearTimer = () => { clearTimeout(timer); timer = undefined }
  const schedule = () => {
    clearTimer()
    const ms = delay()
    if (!stopped && online() && ms != null) timer = setTimeout(run, ms)
  }

  async function run() {
    clearTimer()
    if (stopped || running || !online() || delay() == null) return
    running = true
    controller = new AbortController()
    try {
      await task(controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) onError(error)
    } finally {
      running = false
      schedule()
    }
  }

  const onVisibility = () => {
    clearTimer()
    if (!document.hidden) void run()
    else if (!running) schedule()
  }
  const onOnline = () => { void run() }
  const onOffline = () => { clearTimer(); controller?.abort() }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)

  if (immediate) void run()
  else schedule()

  return () => {
    stopped = true
    clearTimer()
    controller?.abort()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  }
}
