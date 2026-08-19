import React, { useState, useRef } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'

const FIELDS = [
  { key: 'date', label: 'Date', placeholder: 'DD/MM/YYYY' },
  { key: 'poNo', label: 'PO No' },
  { key: 'client', label: 'Client' },
  { key: 'orderNo', label: 'Order No' },
  { key: 'status', label: 'DOD Status' },
  { key: 'deliveryDate', label: 'Delivery Date', placeholder: 'DD/MM/YYYY' },
  { key: 'deliveryRemarks', label: 'Delivery Remarks' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'gst', label: 'GST No' },
  { key: 'billingAddress', label: 'Billing Address' },
  { key: 'followUp', label: 'Follow Up' },
  { key: 'salesRep', label: 'Sales Rep' },
  { key: 'deliveryAddress', label: 'Delivery Address' },
  { key: 'phoneNo', label: 'Phone No' },
  { key: 'siteVerification', label: 'Site Verification' },
  { key: 'siteVerificationRemarks', label: 'Site Verification Remarks' },
  { key: 'installationStatus', label: 'Installation Status' },
  { key: 'installationRemarks', label: 'Installation Remarks' },
  { key: 'lop', label: 'LOP' },
  { key: 'sectionDrawing', label: 'Section Drawing' },
  { key: 'sectionDrawingRemarks', label: 'SD Remarks' },
  { key: 'inProduction', label: 'In Production' },
  { key: 'installation', label: 'Seasonal Discount' },
  { key: 'totalAmount', label: 'Total Amount', type: 'number' },
  { key: 'paymentRemarks', label: 'Payment Remarks' },
  { key: 'akhilSirAudit', label: 'Akhil Sir Audit' },
  { key: 'remarks', label: 'Audit Remarks' },
  { key: 'advanceBill', label: 'Advance Bill' },
  { key: 'orRecvd', label: 'OR Recvd' },
  { key: 'photography', label: 'Photography' },
  { key: 'photographyRemarks', label: 'Photography Remarks' },
  { key: 'siteVideo', label: 'Site Video' },
  { key: 'siteVideoRemarks', label: 'Site Video Remarks' },
  { key: 'review', label: 'Review' },
  { key: 'reviewRemarks', label: 'Review Remarks' }
]

function OrderForm({ order, onClose, onSaved, canEditColumn, isAdmin, isDeleted }) {
  const { user } = useAuth()

  const generateOrderNo = (salesRepName) => {
    const now = new Date()
    const month = now.getMonth() + 1 // 1-12
    const year = now.getFullYear()
    // Financial year: April to March
    let fyStart, fyEnd
    if (month >= 4) {
      fyStart = year
      fyEnd = year + 1
    } else {
      fyStart = year - 1
      fyEnd = year
    }
    const fyStr = `${fyStart}-${String(fyEnd).slice(2)}`
    // Get initials from sales rep first name (first 2 chars)
    const repName = (salesRepName || user.fullName || user.username || '').trim().split(/\s+/)[0]
    const initials = repName.substring(0, 2).toUpperCase()
    return { fyStr, initials }
  }

  const [form, setForm] = useState(() => {
    if (order) return { ...order }
    const empty = {}
    FIELDS.forEach(f => { empty[f.key] = '' })
    empty.totalAmount = 0
    empty.daysToOrder = 0
    // Auto-fill today's date in DD/MM/YYYY
    const today = new Date()
    empty.date = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`
    // Auto-generate order number for new orders
    const { fyStr, initials } = generateOrderNo('')
    empty.orderNo = `OR/${fyStr}/___NEXT___ ${initials}`
    empty._needsOrderNo = true
    return empty
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [proofFile, setProofFile] = useState(null)
  const [proofPreview, setProofPreview] = useState(order?.paymentProofUrl || '')
  const [uploading, setUploading] = useState(false)
  const proofInputRef = useRef(null)

  // Fetch next order number on mount for new orders
  React.useEffect(() => {
    if (!order && form._needsOrderNo) {
      axios.get('/api/orders').then(res => {
        const { fyStr, initials } = generateOrderNo(form.salesRep)
        const prefix = `OR/${fyStr}/`
        // Find max number from existing orders in this FY
        let maxNum = 242 // start from 243
        res.data.forEach(o => {
          if (o.orderNo && o.orderNo.startsWith(prefix)) {
            const numPart = o.orderNo.replace(prefix, '').split(' ')[0]
            const num = parseInt(numPart)
            if (!isNaN(num) && num > maxNum) maxNum = num
          }
        })
        const nextNum = maxNum + 1
        setForm(prev => ({ ...prev, orderNo: `${prefix}${nextNum} ${initials}`, _needsOrderNo: false }))
      }).catch(() => {})
    }
  }, [])

  const handleChange = (key, value) => {
    setForm(prev => {
      const updated = { ...prev, [key]: value }
      // Update order number initials when sales rep changes
      if (key === 'salesRep' && !order) {
        const { fyStr, initials } = generateOrderNo(value)
        const currentNo = updated.orderNo || ''
        const numPart = currentNo.replace(/OR\/\d{4}-\d{2}\//, '').split(' ')[0]
        if (numPart) updated.orderNo = `OR/${fyStr}/${numPart} ${initials}`
      }
      return updated
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    // Convert all text fields to uppercase
    const upperForm = { ...form }
    Object.keys(upperForm).forEach(key => {
      if (typeof upperForm[key] === 'string') {
        upperForm[key] = upperForm[key].toUpperCase()
      }
    })
    try {
      // Upload image if new file selected (auto-delete old one first)
      if (proofFile) {
        setUploading(true)
        if (order && order.id && order.paymentProofUrl) {
          try { await axios.delete(`/api/delete-payment-proof/${order.id}`) } catch {}
        }
        const reader = new FileReader()
        const fileData = await new Promise((resolve) => { reader.onload = (ev) => resolve(ev.target.result.split(',')[1]); reader.readAsDataURL(proofFile) })
        const orderId = order ? order.id : 'temp'
        const res = await axios.post('/api/upload-payment-proof', { orderId, fileData, fileName: proofFile.name })
        upperForm.paymentProofUrl = res.data.url
        setUploading(false)
      }
      if (order) {
        if (isDeleted) {
          await axios.put(`/api/orders/deleted/${order.id}/update`, upperForm)
        } else {
          await axios.put(`/api/orders/${order.id}`, upperForm)
        }
      } else {
        const createRes = await axios.post('/api/orders', upperForm)
        // Upload proof for new order
        if (proofFile && createRes.data?.id) {
          const reader = new FileReader()
          const fileData = await new Promise((resolve) => { reader.onload = (ev) => resolve(ev.target.result.split(',')[1]); reader.readAsDataURL(proofFile) })
          await axios.post('/api/upload-payment-proof', { orderId: createRes.data.id, fileData, fileName: proofFile.name })
        }
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  // Filter fields based on edit permission (for editing existing orders)
  // For new orders, admin can fill all; non-admin can fill only editable columns
  const getVisibleFields = () => {
    if (isAdmin) return FIELDS
    if (!order) {
      // New order: show all fields (user with Create Order right can fill everything)
      return FIELDS
    }
    // Edit existing: show only fields user can edit
    return FIELDS.filter(f => canEditColumn(f.key))
  }

  const visibleFields = getVisibleFields()

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.watermark}></div>
        <div style={styles.modalInner}>
        <div style={styles.modalHeader}>
          <h2 style={{ margin: 0, fontSize: '16px' }}>{order ? 'Edit Order' : 'Add New Order'}</h2>
          <button onClick={onClose} style={styles.closeBtn}>X</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form} onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
            e.preventDefault()
            const inputs = Array.from(e.currentTarget.querySelectorAll('input:not([disabled])'))
            const idx = inputs.indexOf(e.target)
            if (idx < inputs.length - 1) {
              inputs[idx + 1].focus()
            } else {
              // Last field - ask to save
              if (window.confirm('Do you want to save?')) {
                e.currentTarget.requestSubmit()
              }
            }
          }
        }}>
          <div style={styles.grid}>
            {visibleFields.map(field => {
              const isOrderNoLocked = field.key === 'orderNo' && !isAdmin
              const isDateLocked = field.key === 'date' && !isAdmin && !order
              const isSeasonalLocked = field.key === 'installation' && !isAdmin && !user.canEdit
              const editable = !order ? (!isOrderNoLocked && !isDateLocked && !isSeasonalLocked) : (isDeleted ? (isAdmin && !isOrderNoLocked) : (canEditColumn(field.key) && !isOrderNoLocked && !isDateLocked))
              const isDropdown = field.key === 'photography' || field.key === 'siteVideo' || field.key === 'review' || field.key === 'status' || field.key === 'installation'
              return (
                <div key={field.key} style={styles.field}>
                  <label style={styles.label}>{field.label}</label>
                  {isDropdown ? (
                    <select
                      value={form[field.key] || ''}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      style={{ ...styles.input, ...(editable ? {} : styles.inputDisabled) }}
                      disabled={!editable}
                    >
                      {field.key === 'status' ? (
                        <>
                          <option value="">-- Select --</option>
                          <option value="MENTIONED">MENTIONED</option>
                          <option value="N/A">N/A</option>
                          <option value="REQ">REQ</option>
                        </>
                      ) : field.key === 'installation' ? (
                        <>
                          <option value="">-- Select --</option>
                          <option value="YES">YES</option>
                          <option value="NO">NO</option>
                        </>
                      ) : (
                        <>
                          <option value="">-- Select --</option>
                          <option value="NOT REQUIRED">NOT REQUIRED</option>
                          <option value="REQUIRED">REQUIRED</option>
                          <option value="IN PROCESS">IN PROCESS</option>
                          <option value="DONE">DONE</option>
                          <option value="ISSUE">ISSUE</option>
                        </>
                      )}
                    </select>
                  ) : (
                  <input
                    type={field.type || 'text'}
                    value={form[field.key] || ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder={field.placeholder || ''}
                    style={{ ...styles.input, ...(editable ? {} : styles.inputDisabled) }}
                    disabled={!editable}
                  />
                  )}
                </div>
              )
            })}
          </div>
          {/* Payment Proof Upload */}
          <div style={{ padding: '10px', background: '#f0f8ff', borderRadius: '6px', border: '1px solid #bee5eb' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#1a1a2e', marginBottom: '6px', display: 'block' }}>Supporting Image <span style={{ color: '#e74c3c' }}>*Required with Payment Remarks</span> {proofPreview && !proofFile && <span style={{ color: '#27ae60' }}>(Current kept if not changed)</span>}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => proofInputRef.current.click()} style={{ padding: '6px 14px', background: '#2980b9', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>{proofPreview ? 'Change Image' : 'Upload Image'}</button>
              <input ref={proofInputRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files[0]; if (f) { if (f.size > 2 * 1024 * 1024) { setError('Image size must be less than 2MB'); setTimeout(() => setError(''), 3000); return } setProofFile(f); setProofPreview(URL.createObjectURL(f)); setError('') } }} style={{ display: 'none' }} />
              {proofPreview && <a href={proofPreview} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#2980b9', fontWeight: '600' }}>View Current</a>}
              {proofPreview && order && isAdmin && <button type="button" onClick={async () => { if (window.confirm('Delete this image?')) { try { await axios.delete(`/api/delete-payment-proof/${order.id}`); setProofPreview(''); setProofFile(null); setForm(prev => ({...prev, paymentProofUrl: ''})) } catch(e) { setError(e.response?.data?.error || 'Delete failed') } } }} style={{ padding: '4px 10px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: '600' }}>Delete Image</button>}
              {proofFile && <span style={{ fontSize: '10px', color: '#27ae60' }}>{proofFile.name}</span>}
              {uploading && <span style={{ fontSize: '10px', color: '#f39c12' }}>Uploading...</span>}
            </div>
            {proofPreview && <img src={proofPreview} alt="proof" style={{ marginTop: '8px', maxHeight: '80px', borderRadius: '4px', border: '1px solid #ddd' }} />}
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" style={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : (order ? 'Update Order' : 'Add Order')}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '12px', padding: '24px 28px', width: '100%', maxWidth: '95vw', maxHeight: '95vh', position: 'relative', overflow: 'hidden' },
  watermark: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'url(https://prestairsystems.com/wp-content/uploads/2023/09/DSC_2608-scaled.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.08, zIndex: 1 },
  modalInner: { position: 'relative', zIndex: 2 },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', fontWeight: '700' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' },
  field: { display: 'flex', flexDirection: 'column', gap: '2px' },
  label: { fontSize: '10px', fontWeight: '600', color: '#555' },
  input: { padding: '6px 8px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '12px', outline: 'none', textTransform: 'uppercase' },
  inputDisabled: { background: '#f0f0f0', color: '#888', cursor: 'not-allowed' },
  error: { color: '#e74c3c', fontSize: '12px', margin: 0 },
  actions: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' },
  cancelBtn: { padding: '8px 18px', background: '#eee', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' },
  saveBtn: { padding: '8px 18px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }
}

export default OrderForm
