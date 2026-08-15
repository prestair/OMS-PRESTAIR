import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

function ReminderForm({ order, onClose, onSaved }) {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const canAssign = isAdmin || user.canAssignReminder
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [visibleTo, setVisibleTo] = useState([])
  const [users, setUsers] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [showUserDrop, setShowUserDrop] = useState(false)

  useEffect(() => {
    if (canAssign) {
      fetchUsers()
    }
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/users/list')
      setUsers(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  const toggleUser = (username) => {
    setVisibleTo(prev =>
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!description.trim() || !date) {
      setError('Please fill both description and date')
      return
    }
    setError('')
    setSaving(true)
    try {
      await axios.post(`/api/orders/${order.id}/reminders`, { description: description.toUpperCase(), date, visibleTo })
      setSuccess(true)
      setDescription('')
      setDate('')
      setVisibleTo([])
      setTimeout(() => setSuccess(false), 2000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save reminder')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={{ margin: 0 }}>Add Reminder</h2>
          <button onClick={onClose} style={styles.closeBtn}>X</button>
        </div>
        <div style={styles.info}>
          <span>Order: <strong>{order.orderNo}</strong></span>
          <span>Client: <strong>{order.client}</strong></span>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Reminder Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={styles.input} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={styles.textarea}
              placeholder="Enter reminder description..."
              rows={3}
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Assign Reminder To</label>
            {visibleTo.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                {visibleTo.map(uname => {
                  const u = users.find(x => x.username === uname)
                  return (
                    <span key={uname} style={{ background: '#1a1a2e', color: '#fff', padding: '3px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {u ? (u.fullName || u.full_name || u.username) : uname}
                      <button type="button" onClick={() => toggleUser(uname)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '700', padding: 0, lineHeight: 1 }}>x</button>
                    </span>
                  )
                })}
              </div>
            )}
            {canAssign && users.length > 0 && (
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search user by name..."
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); setShowUserDrop(true) }}
                  onFocus={() => { if (userSearch) setShowUserDrop(true) }}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                />
                {showUserDrop && userSearch.trim() && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', maxHeight: '150px', overflowY: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                    {users.filter(u => u.username !== user.username && !visibleTo.includes(u.username) && (u.fullName || u.full_name || u.username || '').toLowerCase().includes(userSearch.toLowerCase())).map(u => (
                      <div key={u.id} onClick={() => { toggleUser(u.username); setUserSearch(''); setShowUserDrop(false) }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid #f0f0f0' }} onMouseEnter={e => e.target.style.background = '#f0f8ff'} onMouseLeave={e => e.target.style.background = '#fff'}>
                        {u.fullName || u.full_name || u.username}
                      </div>
                    ))}
                    {users.filter(u => u.username !== user.username && !visibleTo.includes(u.username) && (u.fullName || u.full_name || u.username || '').toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                      <div style={{ padding: '10px', textAlign: 'center', color: '#888', fontSize: '11px' }}>No users found</div>
                    )}
                  </div>
                )}
              </div>
            )}
            {!canAssign && (
              <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>You don't have permission to assign reminders to other users.</p>
            )}
          </div>
          {error && <p style={{ color: '#e74c3c', fontSize: '13px', margin: 0 }}>{error}</p>}
          {success && <p style={{ color: '#27ae60', fontSize: '13px', margin: 0, fontWeight: '600' }}>Reminder saved successfully! You can add another or close.</p>}
          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Close</button>
            <button type="submit" style={styles.saveBtn} disabled={saving}>{saving ? 'Saving...' : 'Set Reminder'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', zIndex: 1000, padding: '40px 20px', overflow: 'auto' },
  modal: { background: '#fff', borderRadius: '12px', padding: '32px', width: '100%', maxWidth: '500px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', fontWeight: '700' },
  info: { display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', marginBottom: '16px', padding: '10px', background: '#f8f9fa', borderRadius: '6px' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  field: { display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '12px', fontWeight: '600', color: '#555' },
  input: { padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', width: '100%', boxSizing: 'border-box', textTransform: 'uppercase' },
  textarea: { padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', width: '100%', boxSizing: 'border-box', resize: 'vertical', textTransform: 'uppercase' },
  userList: { maxHeight: '120px', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '6px', padding: '8px' },
  userCheckbox: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '3px 0', cursor: 'pointer' },
  actions: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' },
  cancelBtn: { padding: '10px 20px', background: '#eee', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
  saveBtn: { padding: '10px 20px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }
}

export default ReminderForm
