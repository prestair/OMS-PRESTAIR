import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [locationBlocked, setLocationBlocked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [locked, setLocked] = useState(false)
  const [unlockCode, setUnlockCode] = useState('')
  const [unlockError, setUnlockError] = useState('')
  const [unlockLoading, setUnlockLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  // Detect browser for tailored instructions
  const getBrowser = () => {
    const ua = navigator.userAgent
    if (ua.includes('Edg/')) return 'edge'
    if (ua.includes('Chrome')) return 'chrome'
    if (ua.includes('Firefox')) return 'firefox'
    if (ua.includes('Safari')) return 'safari'
    return 'chrome'
  }

  const getGPS = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ type: 'unsupported' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject({ type: err.code === 1 ? 'denied' : err.code === 2 ? 'unavailable' : 'timeout' }),
      { timeout: 12000, maximumAge: 0, enableHighAccuracy: true }
    )
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLocationBlocked(false)
    setLoading(true)
    let gps = null
    try {
      gps = await getGPS()
    } catch (locErr) {
      setLoading(false)
      if (locErr.type === 'denied' || locErr.type === 'unsupported') {
        setLocationBlocked(true)
      } else if (locErr.type === 'unavailable') {
        setError('Location signal unavailable. Please ensure GPS or network is enabled and try again.')
      } else {
        setError('Location request timed out. Please try again.')
      }
      return
    }
    try {
      const loggedInUser = await login(username, password)
      if (gps) axios.post('/api/auth/log-location', { lat: gps.lat, lon: gps.lon, accuracy: gps.accuracy, logId: loggedInUser?.locationLogId }).catch(() => {})
      navigate('/dashboard')
    } catch (err) {
      if (err.response?.data?.locked) {
        setLocked(true)
        setError('LOGIN DISABLED ENTER CODE TO ENABLE')
      } else {
        setError(err.response?.data?.error === 'Login not allowed from this IP address.'
          ? 'Unauthorised IP Address, please contact administrator to approve your IP.'
          : err.response?.data?.error || 'Login failed. Please check your credentials.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleUnlockSubmit = async (e) => {
    e.preventDefault()
    if (!unlockCode.trim()) { setUnlockError('Enter the unlock code'); return }
    setUnlockLoading(true)
    setUnlockError('')
    try {
      await axios.post('/api/auth/verify-unlock-code', { username, code: unlockCode.trim() })
      setLocked(false)
      setUnlockCode('')
      setError('')
      setUnlockError('')
    } catch (err) {
      setUnlockError(err.response?.data?.error || 'Invalid code')
    } finally {
      setUnlockLoading(false)
    }
  }

  const handleResendCode = async () => {
    if (!username) { setUnlockError('Enter your username first'); return }
    setUnlockLoading(true)
    setUnlockError('')
    try {
      await axios.post('/api/auth/resend-unlock-code', { username })
      setUnlockError('✅ New code sent to administrator')
      setUnlockCode('')
    } catch (err) {
      setUnlockError(err.response?.data?.error || 'Failed to resend')
    } finally {
      setUnlockLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.leftPanel}>
        <div style={styles.overlay}></div>
        <div style={styles.brandContent}>
          <img src="/logo.PNG" alt="Prestair Systems LLP" style={styles.brandLogoImg} />
          <p style={styles.brandTagline}>Commercial Kitchen & Food Service Equipment Manufacturer</p>
          <div style={styles.servicesList}>
            <div style={styles.serviceItem}>Display Counters</div>
            <div style={styles.serviceItem}>Service Counters</div>
            <div style={styles.serviceItem}>Kitchen Equipment</div>
            <div style={styles.serviceItem}>Cold Rooms & Racks</div>
            <div style={styles.serviceItem}>Exhaust Hoods</div>
            <div style={styles.serviceItem}>Induction Systems</div>
          </div>
          <div style={styles.brandStats}>
            <div style={styles.stat}><span style={styles.statNum}>500+</span><span style={styles.statLabel}>Projects</span></div>
            <div style={styles.stat}><span style={styles.statNum}>200+</span><span style={styles.statLabel}>Clients</span></div>
            <div style={styles.stat}><span style={styles.statNum}>15+</span><span style={styles.statLabel}>Years</span></div>
          </div>
          <div style={styles.clientsList}>
            <p style={styles.clientsTitle}>Trusted By</p>
            <p style={styles.clientsNames}>Haldiram's | Bikanervala | Chaayos | Blue Tokai | HMS Host | Jaggi Sweets | Lyallji | Pirates of Grill</p>
          </div>
        </div>
      </div>
      <div style={styles.rightPanel}>
        <div style={styles.card}>
          <div style={styles.logo}>
            <div style={styles.omsIcon}>OMS</div>
            <p style={styles.subtitle}>Order Management System</p>
          </div>
          <form onSubmit={handleSubmit} style={styles.form}>
            {error && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                background: '#fff0f0', border: '1px solid #f5c6cb',
                borderRadius: '8px', padding: '12px 14px', marginBottom: '12px'
              }}>
                <span style={{ color: '#e74c3c', fontSize: '18px', lineHeight: 1 }}>❌</span>
                <span style={{ color: '#c0392b', fontSize: '13px', fontWeight: '500', lineHeight: '1.4' }}>{error}</span>
              </div>
            )}
            <div style={styles.field}>
              <label style={styles.label}>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.input}
                placeholder="Enter your username"
                required
                autoComplete="username"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <div style={styles.passwordWrap}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...styles.input, paddingRight: '40px' }}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            {/* Location blocked — show browser-specific instructions */}
            {locationBlocked && (() => {
              const br = getBrowser()
              const steps = br === 'firefox'
                ? [
                    'Click the 🔒 lock icon in the address bar.',
                    'Click "Connection Secure" → "More Information".',
                    'Go to the "Permissions" tab.',
                    'Find "Access Your Location" and set it to "Allow".',
                    'Refresh this page and try again.'
                  ]
                : br === 'safari'
                ? [
                    'Go to Safari → Settings → Websites.',
                    'Click "Location" in the left sidebar.',
                    `Find this website and change it to "Allow".`,
                    'Refresh this page and try again.'
                  ]
                : br === 'edge'
                ? [
                    'Click the 🔒 lock icon in the address bar.',
                    'Click "Permissions for this site".',
                    'Find "Location" and set it to "Allow".',
                    'Refresh this page and try again.'
                  ]
                : [
                    'Click the 🔒 lock icon in the address bar (left of the URL).',
                    'Click "Site settings".',
                    'Find "Location" and change it from "Block" to "Allow".',
                    'Refresh this page and try again.'
                  ]
              return (
                <div style={{ background:'#fff8e1', border:'1px solid #f39c12', borderRadius:'10px', padding:'14px', fontSize:'12px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'10px' }}>
                    <span style={{ fontSize:'18px' }}>📍</span>
                    <strong style={{ color:'#e67e22', fontSize:'13px' }}>Location Access Required</strong>
                  </div>
                  <p style={{ margin:'0 0 10px', color:'#555', lineHeight:'1.5' }}>
                    Location access is required to use this application. Your browser has blocked it.
                    Please follow these steps to enable it:
                  </p>
                  <ol style={{ margin:'0 0 10px', paddingLeft:'18px', color:'#333', lineHeight:'2' }}>
                    {steps.map((step, i) => <li key={i}>{step}</li>)}
                  </ol>
                  <button
                    type="button"
                    onClick={() => { setLocationBlocked(false); setError('') }}
                    style={{ padding:'6px 14px', background:'#f39c12', color:'#fff', border:'none', borderRadius:'6px', fontSize:'11px', fontWeight:'600', cursor:'pointer' }}
                  >
                    I have enabled location — Try Again
                  </button>
                </div>
              )
            })()}

            <button type="submit" style={{ ...styles.button, opacity: locked ? 0.4 : 1, background: locked ? '#c0392b' : undefined }} disabled={loading || locationBlocked || locked}>
              {loading ? 'Logging in in few seconds ........ Please Wait .......' : locked ? '🔒 LOGIN DISABLED' : 'Sign In'}
            </button>

            {locked && (
              <form onSubmit={handleUnlockSubmit} style={{ marginTop: '12px', padding: '12px', background: '#fff3cd', border: '2px solid #f39c12', borderRadius: '8px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: '700', color: '#c0392b', textAlign: 'center', letterSpacing: '0.5px' }}>LOGIN DISABLED ENTER CODE TO ENABLE</p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    value={unlockCode}
                    onChange={e => { setUnlockCode(e.target.value); setUnlockError('') }}
                    placeholder=""
                    maxLength={6}
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid #f39c12', borderRadius: '5px', fontSize: '14px', fontWeight: '700', letterSpacing: '4px', textAlign: 'center', outline: 'none' }}
                    autoFocus
                  />
                  <button type="submit" disabled={unlockLoading} style={{ padding: '8px 14px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {unlockLoading ? '...' : 'Unlock'}
                  </button>
                </div>
                {unlockError && <p style={{ margin: '6px 0 0', fontSize: '11px', color: unlockError.startsWith('✅') ? '#27ae60' : '#e74c3c', fontWeight: '600', textAlign: 'center' }}>{unlockError}</p>}
                <div style={{ marginTop: '8px', textAlign: 'center' }}>
                  <button type="button" onClick={handleResendCode} disabled={unlockLoading} style={{ background: 'none', border: 'none', color: '#2980b9', fontSize: '10px', cursor: 'pointer', textDecoration: 'underline' }}>
                    {unlockLoading ? 'Sending...' : 'Resend Code'}
                  </button>
                </div>
              </form>
            )}
          </form>
          <p style={styles.footer}>www.prestairsystems.com</p>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex', minHeight: '100vh', fontFamily: "'Inter', sans-serif"
  },
  leftPanel: {
    flex: '1', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #0a0a2e 0%, #1a1a4e 30%, #0f3460 70%, #0a2040 100%)', overflow: 'hidden'
  },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    background: 'radial-gradient(circle at 30% 20%, rgba(47,128,237,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(142,68,173,0.1) 0%, transparent 50%)',
    zIndex: 1
  },
  imageGrid: { display: 'none' },
  brandContent: {
    position: 'relative', zIndex: 2, textAlign: 'center', padding: '40px', color: '#fff'
  },
  brandLogoImg: { width: '220px', marginBottom: '20px', background: '#fff', padding: '12px 20px', borderRadius: '8px' },
  brandTagline: { fontSize: '13px', opacity: 0.7, margin: '0 0 30px', fontWeight: '300' },
  servicesList: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '30px', maxWidth: '320px', margin: '0 auto 30px' },
  serviceItem: { padding: '8px 12px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', fontSize: '11px', fontWeight: '500', border: '1px solid rgba(255,255,255,0.1)' },
  brandStats: { display: 'flex', gap: '30px', justifyContent: 'center', marginBottom: '30px' },
  stat: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  statNum: { fontSize: '28px', fontWeight: '700' },
  statLabel: { fontSize: '11px', opacity: 0.7, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '1px' },
  clientsList: { borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '20px' },
  clientsTitle: { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.5, margin: '0 0 8px' },
  clientsNames: { fontSize: '11px', opacity: 0.7, margin: 0, lineHeight: '1.8' },
  rightPanel: {
    flex: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f8f9fa', padding: '40px'
  },
  card: {
    width: '100%', maxWidth: '380px'
  },
  logo: { textAlign: 'center', marginBottom: '36px' },
  omsIcon: {
    display: 'inline-block', padding: '14px 28px', background: 'linear-gradient(135deg, #1a1a2e, #0f3460)',
    color: '#fff', fontSize: '28px', fontWeight: '800', borderRadius: '12px', letterSpacing: '3px',
    boxShadow: '0 8px 24px rgba(26,26,46,0.3)'
  },
  subtitle: { fontSize: '13px', color: '#666', marginTop: '12px', fontWeight: '500' },
  form: { display: 'flex', flexDirection: 'column', gap: '18px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '12px', fontWeight: '600', color: '#444', textTransform: 'uppercase', letterSpacing: '0.5px' },
  input: {
    padding: '14px 16px', border: '2px solid #e8e8e8', borderRadius: '10px',
    fontSize: '14px', outline: 'none', transition: 'border-color 0.3s, box-shadow 0.3s',
    width: '100%', boxSizing: 'border-box', background: '#fff'
  },
  passwordWrap: { position: 'relative' },
  eyeBtn: {
    position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '4px'
  },
  error: { color: '#e74c3c', fontSize: '13px', margin: 0, textAlign: 'center', fontWeight: '500' },
  button: {
    padding: '14px', background: 'linear-gradient(135deg, #1a1a2e, #0f3460)', color: '#ffffff', border: 'none',
    borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
    marginTop: '8px', transition: 'transform 0.2s, box-shadow 0.2s',
    boxShadow: '0 4px 16px rgba(26,26,46,0.3)', letterSpacing: '0.5px', textShadow: '0 1px 2px rgba(0,0,0,0.2)'
  },
  footer: { textAlign: 'center', marginTop: '30px', fontSize: '11px', color: '#aaa' }
}

export default Login
