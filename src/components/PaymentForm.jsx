import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

function PaymentForm({ order, onClose, onSaved }) {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const [payments, setPayments] = useState([{ date: '', mode: '', amount: '', remarks: '' }])
  const [existingPayments, setExistingPayments] = useState([])
  const [editingPayment, setEditingPayment] = useState(null)
  const [editForm, setEditForm] = useState({ date: '', mode: '', amount: '', remarks: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPayments()
  }, [])

  const fetchPayments = async () => {
    try {
      const res = await axios.get(`/api/orders/${order.id}/payments`)
      setExistingPayments(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  const addPaymentRow = () => {
    setPayments([...payments, { date: '', mode: '', amount: '', remarks: '' }])
  }

  const removePaymentRow = (idx) => {
    setPayments(payments.filter((_, i) => i !== idx))
  }

  const updatePayment = (idx, field, value) => {
    const updated = [...payments]
    updated[idx][field] = value
    setPayments(updated)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      for (const p of payments) {
        if (p.amount && parseFloat(p.amount) > 0) {
          await axios.post(`/api/orders/${order.id}/payments`, {
            date: p.date, mode: p.mode ? p.mode.toUpperCase() : '', amount: parseFloat(p.amount), remarks: p.remarks ? p.remarks.toUpperCase() : ''
          })
        }
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save receipts')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this receipt entry?')) return
    try {
      await axios.delete(`/api/orders/${order.id}/payments/${paymentId}`)
      fetchPayments()
    } catch (err) {
      alert('Delete failed: ' + (err.response?.data?.error || 'Admin access required'))
    }
  }

  const handleEditPayment = async () => {
    try {
      await axios.put(`/api/orders/${order.id}/payments/${editingPayment.id}`, {
        date: editForm.date, mode: editForm.mode ? editForm.mode.toUpperCase() : '', amount: parseFloat(editForm.amount), remarks: editForm.remarks ? editForm.remarks.toUpperCase() : ''
      })
      setEditingPayment(null)
      fetchPayments()
    } catch (err) {
      alert('Edit failed: ' + (err.response?.data?.error || 'Failed'))
    }
  }

  const totalExisting = existingPayments.reduce((s, p) => s + (p.amount || 0), 0)
  const totalNew = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={{ margin: 0 }}>Receipt Details - {order.orderNo}</h2>
          <button onClick={onClose} style={styles.closeBtn}>X</button>
        </div>
        <div style={styles.info}>
          <span>Client: <strong>{order.client}</strong></span>
          <span>Total: <strong>Rs {(order.totalAmount || 0).toLocaleString('en-IN')}</strong></span>
          <span>Received: <strong>Rs {totalExisting.toLocaleString('en-IN')}</strong></span>
          <span>Balance: <strong>Rs {((order.totalAmount || 0) - totalExisting).toLocaleString('en-IN')}</strong></span>
        </div>

        {existingPayments.length > 0 && (
          <div style={styles.existing}>
            <h4 style={{ margin: '0 0 8px' }}>Previous Receipts</h4>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Mode</th>
                  <th style={styles.th}>Amount</th>
                  <th style={styles.th}>Remarks</th>
                  {isAdmin && <th style={styles.th}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {existingPayments.map(p => (
                  <tr key={p.id}>
                    <td style={styles.td}>{p.date || '-'}</td>
                    <td style={styles.td}>{p.mode || '-'}</td>
                    <td style={styles.td}>Rs {(p.amount || 0).toLocaleString('en-IN')}</td>
                    <td style={styles.td}>{p.remarks || '-'}</td>
                    {isAdmin && (
                      <td style={styles.td}>
                        <button onClick={() => { setEditingPayment(p); setEditForm({ date: p.date||'', mode: p.mode||'', amount: p.amount||'', remarks: p.remarks||'' }) }} style={{...styles.delBtn,background:'#2980b9',marginRight:'4px'}}>Edit</button>
                        <button onClick={() => handleDeletePayment(p.id)} style={styles.delBtn}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Edit Payment Modal */}
          {editingPayment && (
            <div style={{background:'#fff3cd',padding:'12px',borderRadius:'8px',marginBottom:'12px',border:'1px solid #ffc107'}}>
              <h4 style={{margin:'0 0 8px',fontSize:'12px'}}>Edit Receipt #{editingPayment.id}</h4>
              <div style={styles.paymentRow}>
                <input type="date" value={editForm.date} onChange={e=>setEditForm({...editForm,date:e.target.value})} style={styles.input}/>
                <select value={editForm.mode} onChange={e=>setEditForm({...editForm,mode:e.target.value})} style={styles.input}>
                  <option value="">Mode</option><option value="Cash">Cash</option><option value="Bank Transfer">Bank Transfer</option><option value="Cheque">Cheque</option><option value="UPI">UPI</option><option value="NEFT/RTGS">NEFT/RTGS</option>
                </select>
                <input type="number" value={editForm.amount} onChange={e=>setEditForm({...editForm,amount:e.target.value})} style={styles.input} placeholder="Amount"/>
                <input type="text" value={editForm.remarks} onChange={e=>setEditForm({...editForm,remarks:e.target.value})} style={styles.input} placeholder="Remarks"/>
              </div>
              <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
                <button type="button" onClick={()=>setEditingPayment(null)} style={styles.cancelBtn}>Cancel</button>
                <button type="button" onClick={handleEditPayment} style={{...styles.saveBtn,background:'#f39c12'}}>Update</button>
              </div>
            </div>
          )}
          <h4 style={{ margin: '16px 0 8px' }}>Add New Receipt(s)</h4>
          {payments.map((p, idx) => (
            <div key={idx} style={styles.paymentRow}>
              <input type="date" value={p.date} onChange={e => updatePayment(idx, 'date', e.target.value)} style={styles.input} placeholder="Date" />
              <select value={p.mode} onChange={e => updatePayment(idx, 'mode', e.target.value)} style={styles.input}>
                <option value="">Select Mode</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
                <option value="UPI">UPI</option>
                <option value="NEFT/RTGS">NEFT/RTGS</option>
              </select>
              <input type="number" value={p.amount} onChange={e => updatePayment(idx, 'amount', e.target.value)} style={styles.input} placeholder="Amount" />
              <input type="text" value={p.remarks} onChange={e => updatePayment(idx, 'remarks', e.target.value)} style={styles.input} placeholder="Remarks" />
              {payments.length > 1 && (
                <button type="button" onClick={() => removePaymentRow(idx)} style={styles.removeBtn}>-</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addPaymentRow} style={styles.addMoreBtn}>+ Add More</button>
          {totalNew > 0 && <p style={{ fontSize: '13px', marginTop: '8px' }}>New total to add: <strong>Rs {totalNew.toLocaleString('en-IN')}</strong></p>}
          {error && <p style={{ color: '#e74c3c', fontSize: '13px' }}>{error}</p>}
          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" style={styles.saveBtn} disabled={saving}>{saving ? 'Saving...' : 'Save Receipts'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', zIndex: 1000, padding: '40px 20px', overflow: 'auto' },
  modal: { background: '#fff', borderRadius: '12px', padding: '32px', width: '100%', maxWidth: '800px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', fontWeight: '700' },
  info: { display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', marginBottom: '16px', padding: '12px', background: '#f8f9fa', borderRadius: '8px' },
  existing: { marginBottom: '16px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { padding: '8px', background: '#f0f0f0', textAlign: 'left', fontWeight: '600' },
  td: { padding: '8px', borderBottom: '1px solid #eee' },
  delBtn: { padding: '3px 8px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: '600' },
  paymentRow: { display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center', flexWrap: 'wrap' },
  input: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', flex: '1', minWidth: '120px', textTransform: 'uppercase' },
  removeBtn: { padding: '8px 12px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' },
  addMoreBtn: { padding: '8px 16px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
  actions: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' },
  cancelBtn: { padding: '10px 20px', background: '#eee', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
  saveBtn: { padding: '10px 20px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }
}

export default PaymentForm
