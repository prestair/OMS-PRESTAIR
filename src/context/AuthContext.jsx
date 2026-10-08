import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const logout = () => {
    localStorage.removeItem('oms_token')
    localStorage.removeItem('oms_user')
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
  }

  // Shared hard-reload helper: bust caches then reload. Used by the daily
  // scheduled refresh and the deploy-based version/build checks.
  const hardReload = () => {
    try {
      if (window.caches && caches.keys) {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => window.location.reload(true))
        setTimeout(() => window.location.reload(true), 1500)
      } else {
        window.location.reload(true)
      }
    } catch {
      window.location.reload(true)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('oms_token')
    const userData = localStorage.getItem('oms_user')
    if (token && userData) {
      setUser(JSON.parse(userData))
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }
    setLoading(false)

    // Interceptor to handle force-logout (401 responses)
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response && error.response.status === 401) {
          const msg = error.response.data?.error || ''
          localStorage.removeItem('oms_token')
          localStorage.removeItem('oms_user')
          delete axios.defaults.headers.common['Authorization']
          setUser(null)
          if (msg.includes('Session expired') || msg.includes('Invalid token')) {
            alert('Session expired. Please login again.')
          }
        }
        return Promise.reject(error)
      }
    )
    return () => axios.interceptors.response.eject(interceptor)
  }, [])

  // Auto hard-refresh mechanisms: daily at 13:40
  useEffect(() => {
    let stopped = false

    // Daily scheduled refresh at 13:40 (once per day) — pure client-side, no API call
    const DAILY_REFRESH_HOUR = 13
    const DAILY_REFRESH_MIN = 40
    const checkDailyRefresh = () => {
      const now = new Date()
      if (now.getHours() === DAILY_REFRESH_HOUR && now.getMinutes() === DAILY_REFRESH_MIN) {
        const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
        const last = localStorage.getItem('oms_daily_refresh_date')
        if (last !== todayKey) {
          localStorage.setItem('oms_daily_refresh_date', todayKey)
          if (!stopped) hardReload()
        }
      }
    }

    const dailyInterval = setInterval(checkDailyRefresh, 20000) // every 20s (catches the 13:40 minute)

    return () => { stopped = true; clearInterval(dailyInterval) }
  }, [])

  // Deploy-based auto hard-refresh: while logged in, every ~60s compare the
  // running build constant and the server app-version against stored baselines.
  // Always write the new value to localStorage BEFORE reloading, and only reload
  // when a baseline exists and differs (loop-guarded).
  useEffect(() => {
    if (!user) return
    let stopped = false

    const checkVersion = async () => {
      if (stopped) return
      // (a) Build check first (synchronous). If the running bundle differs from
      // the stored build, update the baseline and reload once.
      const storedBuild = localStorage.getItem('oms_build')
      if (storedBuild && storedBuild !== __APP_BUILD__) {
        localStorage.setItem('oms_build', __APP_BUILD__)
        if (!stopped) hardReload()
        return
      }
      // (b) Server-version check. Only reload when a baseline exists and differs.
      try {
        const res = await axios.get('/api/app-version')
        const serverVersion = res?.data?.version != null ? String(res.data.version) : null
        if (serverVersion == null) return
        const storedVersion = localStorage.getItem('oms_app_version')
        if (storedVersion == null) {
          // No baseline yet — store without reloading.
          localStorage.setItem('oms_app_version', serverVersion)
          return
        }
        if (storedVersion !== serverVersion) {
          localStorage.setItem('oms_app_version', serverVersion)
          if (!stopped) hardReload()
        }
      } catch { /* version check is best-effort; ignore */ }
    }

    const versionInterval = setInterval(checkVersion, 60000) // every 60s

    return () => { stopped = true; clearInterval(versionInterval) }
  }, [user])

  const login = async (username, password) => {
    const res = await axios.post('/api/auth/login', { username, password })
    const { token, user: userData } = res.data
    localStorage.setItem('oms_token', token)
    localStorage.setItem('oms_user', JSON.stringify(userData))
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setUser(userData)
    // Baseline the deploy version + running build so a fresh login never
    // immediately triggers an auto hard-refresh. A failed fetch must not block login.
    try {
      const vr = await axios.get('/api/app-version')
      if (vr?.data?.version != null) localStorage.setItem('oms_app_version', String(vr.data.version))
    } catch { /* version fetch is best-effort; ignore */ }
    try { localStorage.setItem('oms_build', __APP_BUILD__) } catch { /* ignore */ }
    return userData
  }

  const changePassword = async (currentPassword, newPassword) => {
    await axios.post('/api/auth/change-password', { currentPassword, newPassword })
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>

  return (
    <AuthContext.Provider value={{ user, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
