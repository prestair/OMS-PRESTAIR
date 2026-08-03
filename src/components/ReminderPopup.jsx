import React, { useState, useEffect } from 'react'
import axios from 'axios'

function ReminderPopup({ onClose }) {
  const [reminders, setReminders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDueReminders()
  }, [])

  const fetchDueReminders = async () => {
    try {
      const res = await axios.get('/api/orders/reminders/due')
      setReminders(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = async (id) => {
    try {
      await axios.delete(`/api/orders/reminders/${id}`)
      setReminders(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  const handleDismissAll = async () => {
    for (const r of reminders) {
      await axios.delete(`/api/orders/reminders/${r.id}`)
    }
    setReminders([])
    onClose()
  }

  if (loading) return null
  if (reminders.length === 0) return null

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Reminders Due</h2>
          <button onClick={onClose} style={styles.closeBtn}>X</button>
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
              <div style={styles.itemBottom}>
                <span style={styles.createdBy}>Set by: {r.createdBy}{r.visibleTo && r.visibleTo.length > 0 ? ` | For: ${r.visibleTo.join(', ')}` : ''}</span>
                <button onClick={() => handleDismiss(r.id)} style={styles.dismissBtn}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
        <div style={styles.footer}>
          <button onClick={handleDismissAll} style={styles.dismissAllBtn}>Dismiss All</button>
          <button onClick={onClose} style={styles.okBtn}>OK</button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 },
  modal: { background: '#fff', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '550px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { margin: 0, fontSize: '20px', color: '#e74c3c' },
  closeBtn: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', fontWeight: '700' },
  list: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' },
  item: { padding: '12px', background: '#fff9e6', border: '1px solid #f0d060', borderRadius: '8px' },
  itemTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  orderTag: { fontSize: '12px', fontWeight: '700', color: '#1a1a2e' },
  dateTag: { fontSize: '11px', fontWeight: '600', color: '#e74c3c', background: '#fde8e8', padding: '2px 8px', borderRadius: '4px' },
  client: { fontSize: '12px', color: '#555', margin: '2px 0' },
  desc: { fontSize: '13px', fontWeight: '500', margin: '4px 0', color: '#333' },
  itemBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' },
  createdBy: { fontSize: '10px', color: '#888' },
  dismissBtn: { padding: '3px 10px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: '600' },
  footer: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #eee' },
  dismissAllBtn: { padding: '8px 16px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' },
  okBtn: { padding: '8px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }
}

export default ReminderPopup
