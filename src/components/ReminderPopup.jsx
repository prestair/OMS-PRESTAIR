import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

function ReminderPopup({ onClose }) {
  const { user } = useAuth()
  const currentUsername = user.username
  const isAdmin = user.role === 'admin'
  const [reminders, setReminders] = useState([])
  const [loading, setLoading] = useState(true)
  const [responses, setResponses] = useState({})
  const [submitting, setSubmitting] = useState({})

  useEffect(() => {
    fetchDueReminders()
    // Auto-check for new reminders every 30 seconds
    const interval = setInterval(fetchDueReminders, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchDueReminders = async () => {
    try {
      const res = await axios.get('/api/orders/reminders/due')
      // Only show reminders where: responded_by is null (pending), user is receiver, not creator, not admin
      const pending = res.data.filter(r => !r.responded_by && r.createdBy !== currentUsername && !isAdmin)
      setReminders(pending)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleRespond = async (id) => {
    const text = responses[id]
    if (!text || text.trim().length < 10) {
      alert('Response must be at least 10 characters')
      return
    }
    if (text.trim().length > 250) {
      alert('Response must not exceed 250 characters')
      return
    }
    setSubmitting(prev => ({ ...prev, [id]: true }))
    try {
      await axios.put(`/api/orders/reminders/${id}/respond`, { responseText: text })
      setReminders(prev => prev.filter(r => r.id !== id))
      setResponses(prev => { const n = { ...prev }; delete n[id]; return n })
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save response')
    } finally {
      setSubmitting(prev => ({ ...prev, [id]: false }))
    }
  }

  if (loading) return null
  if (reminders.length === 0) return null

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Reminders Due ({reminders.length})</h2>
          <span style={{ fontSize: '11px', color: '#e74c3c', fontWeight: '600' }}>You must respond to all reminders</span>
        </div>
        <div style={styles.list}>
          {reminders.map(r => (
            <div key={r.id} style={styles.item}>
              <div style={styles.itemTop}>
                <span style={styles.orderTag}>{r.orderNo}</span>
                <span style={styles.dateTag}>{r.date}</span>
              </div>
              <p style={styles.client}>{r.client}</p>
              <p style={styles.desc}>{r.description}</p>
              {r.response_text && <p style={{ fontSize: '12px', margin: '4px 0 6px', padding: '6px 10px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '5px', color: '#856404', fontWeight: '600' }}>Previous: {r.response_text}</p>}
              <div style={styles.createdBy}>Set by: {r.createdBy}{r.visibleTo && r.visibleTo.length > 0 ? ` | For: ${r.visibleTo.join(', ')}` : ''}</div>
              <div style={styles.responseRow}>
                <input
                  type="text"
                  placeholder="Type response (min 10, max 250 chars)..."
                  value={responses[r.id] || ''}
                  onChange={e => { if (e.target.value.length <= 250) setResponses(prev => ({ ...prev, [r.id]: e.target.value })) }}
                  style={styles.responseInput}
                  onKeyDown={e => { if (e.key === 'Enter') handleRespond(r.id) }}
                  maxLength={250}
                />
                <span style={{ fontSize: '9px', color: '#888', whiteSpace: 'nowrap' }}>{(responses[r.id] || '').length}/250</span>
                <button onClick={() => handleRespond(r.id)} disabled={submitting[r.id]} style={styles.respondBtn}>
                  {submitting[r.id] ? '...' : 'Submit'}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div style={styles.footer}>
          <span style={{ fontSize: '11px', color: '#888' }}>Respond to all reminders to continue working</span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 },
  modal: { background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { margin: 0, fontSize: '18px', color: '#e74c3c' },
  list: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' },
  item: { padding: '14px', background: '#fff9e6', border: '1px solid #f0d060', borderRadius: '8px' },
  itemTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  orderTag: { fontSize: '12px', fontWeight: '700', color: '#1a1a2e' },
  dateTag: { fontSize: '11px', fontWeight: '600', color: '#e74c3c', background: '#fde8e8', padding: '2px 8px', borderRadius: '4px' },
  client: { fontSize: '12px', color: '#555', margin: '2px 0' },
  desc: { fontSize: '13px', fontWeight: '600', margin: '4px 0 8px', color: '#333' },
  createdBy: { fontSize: '10px', color: '#888', marginBottom: '8px' },
  responseRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  responseInput: { flex: 1, padding: '8px 12px', border: '2px solid #f39c12', borderRadius: '6px', fontSize: '12px', outline: 'none', textTransform: 'uppercase' },
  respondBtn: { padding: '8px 16px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  footer: { marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #eee', textAlign: 'center' }
}

export default ReminderPopup
