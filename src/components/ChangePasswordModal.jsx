import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

function ChangePasswordModal({ onClose }) {
  const { changePassword } = useAuth()
  const [current, setCurrent] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (newPass !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (newPass.length < 4) {
      setError('Password must be at least 4 characters')
      return
    }
    try {
      await changePassword(current, newPass)
      setSuccess('Password changed successfully')
      setTimeout(onClose, 1500)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password')
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={{ margin: 0 }}>Change Password</h2>
          <button onClick={onClose} style={styles.closeBtn}>X</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Current Password</label>
            <div style={styles.passWrap}>
              <input type={showCurrent ? 'text' : 'password'} value={current} onChange={e => setCurrent(e.target.value)} style={styles.input} required />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} style={styles.eyeBtn}>{showCurrent ? '🙈' : '👁'}</button>
            </div>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>New Password</label>
            <div style={styles.passWrap}>
              <input type={showNew ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)} style={styles.input} required />
              <button type="button" onClick={() => setShowNew(!showNew)} style={styles.eyeBtn}>{showNew ? '🙈' : '👁'}</button>
            </div>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Confirm New Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} style={styles.input} required />
          </div>
          {error && <p style={{ color: '#e74c3c', fontSize: '13px', margin: 0 }}>{error}</p>}
          {success && <p style={{ color: '#27ae60', fontSize: '13px', margin: 0 }}>{success}</p>}
          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" style={styles.saveBtn}>Change Password</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '12px', padding: '32px', width: '100%', maxWidth: '420px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', fontWeight: '700' },
  form: { display: 'flex', flexDirection: 'column', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '12px', fontWeight: '600', color: '#555' },
  input: { padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', width: '100%', boxSizing: 'border-box' },
  passWrap: { position: 'relative' },
  eyeBtn: { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer' },
  actions: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' },
  cancelBtn: { padding: '10px 20px', background: '#eee', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
  saveBtn: { padding: '10px 20px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }
}

export default ChangePasswordModal
