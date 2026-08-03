import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('oms_token')
    const userData = localStorage.getItem('oms_user')
    if (token && userData) {
      setUser(JSON.parse(userData))
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }
    setLoading(false)
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

  const logout = () => {
    localStorage.removeItem('oms_token')
    localStorage.removeItem('oms_user')
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
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
