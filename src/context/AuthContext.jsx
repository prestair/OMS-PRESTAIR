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

  // Auto hard-refresh mechanisms: (1) when a new version is deployed, (2) daily at 13:40
  useEffect(() => {
    let stopped = false

    const hardReload = () => {
      // Bust caches then reload
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

    // (1) Version-based refresh — reload when deployed version changes
    const checkVersion = async () => {
      try {
        const res = await axios.get('/api/app-version')
        const remote = String(res.data?.version || '')
        if (!remote) return
        const stored = localStorage.getItem('oms_app_version')
        if (!stored) {
          localStorage.setItem('oms_app_version', remote)
        } else if (stored !== remote) {
          localStorage.setItem('oms_app_version', remote)
          if (!stopped) hardReload()
        }
      } catch {}
    }

    // (2) Daily scheduled refresh at 13:40 (once per day)
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

    checkVersion()
    const versionInterval = setInterval(checkVersion, 60000) // every 60s
    const dailyInterval = setInterval(checkDailyRefresh, 20000) // every 20s (catches the 13:40 minute)

    return () => { stopped = true; clearInterval(versionInterval); clearInterval(dailyInterval) }
  }, [])

  const login = async (username, password) => {
    const res = await axios.post('/api/auth/login', { username, password })
    const { token, user: userData } = res.data
    localStorage.setItem('oms_token', token)
    localStorage.setItem('oms_user', JSON.stringify(userData))
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setUser(userData)
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
