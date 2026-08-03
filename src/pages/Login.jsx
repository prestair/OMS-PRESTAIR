import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
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
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" style={styles.button} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
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
    padding: '14px', background: 'linear-gradient(135deg, #1a1a2e, #0f3460)', color: '#fff', border: 'none',
    borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: 'pointer',
    marginTop: '8px', transition: 'transform 0.2s, box-shadow 0.2s',
    boxShadow: '0 4px 16px rgba(26,26,46,0.3)', letterSpacing: '0.5px'
  },
  footer: { textAlign: 'center', marginTop: '30px', fontSize: '11px', color: '#aaa' }
}

export default Login
