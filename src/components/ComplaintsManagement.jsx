import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import * as XLSX from 'xlsx-js-style'
import { useAuth } from '../context/AuthContext'

const STATUSES = ['OPEN', 'ASSIGNED', 'IN PROGRESS', 'CLOSED']
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']
const WARRANTY = ['IN', 'OUT']

const today = () => new Date().toISOString().split('T')[0]

const emptyComplaint = () => ({
  complaintDate: today(), client: '', customerName: '', phone: '',
  purchaseBillNo: '', purchaseDate: '', warrantyStatus: 'IN',
  product: '', problemReported: '', priority: 'MEDIUM',
  technician: '', helper: '', assignmentType: 'PLANNED', scheduledDate: '', status: 'OPEN',
  problemIdentified: '', resolution: '', billRequired: false, billNo: '', amount: '',
  serviceSlipNo: '', resolutionDate: '', resolutionHistory: []
})

const fmtDate = (d) => {
  if (!d) return ''
  if (typeof d === 'string' && d.includes('-')) { const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }
  return d
}

export default function ComplaintsManagement({ onClose }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [complaints, setComplaints] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('all')
  const [scheduleDate, setScheduleDate] = useState(today())
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(null)
  const [formMode, setFormMode] = useState('details') // 'details' | 'assign' | 'resolution'
  const [closureAction, setClosureAction] = useState('closed') // 'closed' | 'pending'
  const [historyView, setHistoryView] = useState(null) // complaint whose history is shown
  const [picker, setPicker] = useState(null) // { mode } when choosing a complaint for assign/resolution
  const [pickerSearch, setPickerSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchComplaints = async () => {
    try { const res = await axios.get('/api/complaints'); setComplaints(res.data || []) } catch { /* table may not exist yet */ }
    setLoading(false)
  }

  useEffect(() => {
    fetchComplaints()
    axios.get('/api/users/list').then(res => setPeople((res.data || []).map(u => u.fullName || u.username))).catch(() => {})
  }, [])

  const handleChange = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const openAdd = () => { setError(''); setClosureAction('closed'); setFormMode('details'); setForm(emptyComplaint()) }
  const openForm = (c, mode) => { setError(''); setClosureAction('closed'); setFormMode(mode); setForm({ ...c, amount: c.amount || '', assignmentType: c.assignmentType || 'PLANNED' }) }
  const openEdit = (c) => openForm(c, 'details')

  const save = async () => {
    setError('')
    if (!form.client && !form.customerName) { setError('Client or Customer Name is required'); return }
    if (!form.problemReported) { setError('Problem Reported is required'); return }
    setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.billRequired) { payload.billNo = ''; payload.amount = '' }
      const isResolution = form.id && formMode === 'resolution'
      if (isResolution) {
        // An attempt is recorded ONLY when submitting from the Resolution tab.
        payload.closureAction = closureAction
      } else {
        // Add / Assign / Details: never create a history attempt.
        // Auto-assign when a technician & scheduled date are present (unless admin overrides / already closed).
        const hasAssign = String(payload.technician || '').trim() && String(payload.scheduledDate || '').trim()
        if (isAdmin) {
          if ((payload.status === 'OPEN' || !payload.status) && hasAssign) payload.status = 'ASSIGNED'
        } else if (hasAssign && payload.status !== 'CLOSED') {
          payload.status = 'ASSIGNED'
        }
      }
      if (form.id) await axios.put(`/api/complaints/${form.id}`, payload)
      else await axios.post('/api/complaints', payload)
      setForm(null)
      fetchComplaints()
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed. Make sure the complaints table has the latest columns (run complaints-migration.sql).')
    } finally { setSaving(false) }
  }

  const remove = async (c) => {
    if (!window.confirm(`Delete complaint ${c.complaintNo || ''}? This cannot be undone.`)) return
    try { await axios.delete(`/api/complaints/${c.id}`); fetchComplaints() } catch (e) { alert(e.response?.data?.error || 'Delete failed') }
  }

  const quickStatus = async (c, status) => {
    try { await axios.put(`/api/complaints/${c.id}`, { status }); fetchComplaints() } catch { alert('Update failed') }
  }

  const filtered = useMemo(() => {
    let list = complaints
    if (view === 'schedule') list = list.filter(c => c.scheduledDate === scheduleDate)
    if (statusFilter) list = list.filter(c => (c.status || 'OPEN') === statusFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c => [c.complaintNo, c.client, c.customerName, c.phone, c.purchaseBillNo, c.technician, c.helper, c.problemReported]
        .some(f => String(f || '').toLowerCase().includes(q)))
    }
    return list
  }, [complaints, view, scheduleDate, statusFilter, search])

  const openPicker = (mode) => { setPickerSearch(''); setPicker({ mode }) }
  const pickerMatches = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    let list = complaints
    const mode = picker?.mode
    if (mode === 'assign') {
      // Only complaints that still need a technician visit
      list = list.filter(c => ['OPEN', 'IN PROGRESS'].includes(c.status || 'OPEN'))
    } else if (mode === 'resolution') {
      // Only complaints whose status is ASSIGNED
      list = list.filter(c => (c.status || 'OPEN') === 'ASSIGNED')
    }
    if (q) list = list.filter(c => [c.client, c.customerName, c.complaintNo, c.phone]
      .some(f => String(f || '').toLowerCase().includes(q)))
    return list.slice(0, 50)
  }, [complaints, pickerSearch, picker])
  const choosePicker = (c) => { const mode = picker.mode; setPicker(null); openForm(c, mode) }

  const counts = useMemo(() => {
    const c = { total: complaints.length, open: 0, assigned: 0, progress: 0, closed: 0 }
    complaints.forEach(x => {
      const s = x.status || 'OPEN'
      if (s === 'OPEN') c.open++; else if (s === 'ASSIGNED') c.assigned++; else if (s === 'IN PROGRESS') c.progress++; else if (s === 'CLOSED') c.closed++
    })
    return c
  }, [complaints])

  const exportExcel = () => {
    const rows = filtered.map((c, i) => ({
      '#': i + 1, 'Complaint No': c.complaintNo || '', 'Date': fmtDate(c.complaintDate), 'Client': c.client || '',
      'Customer': c.customerName || '', 'Phone': c.phone || '', 'Purchase Bill No': c.purchaseBillNo || '',
      'Purchase Date': fmtDate(c.purchaseDate), 'Warranty': c.warrantyStatus || '', 'Product': c.product || '',
      'Problem Reported': c.problemReported || '', 'Priority': c.priority || '', 'Technician': c.technician || '',
      'Helper': c.helper || '', 'Assignment Type': c.assignmentType || '', 'Scheduled Date': fmtDate(c.scheduledDate), 'Status': c.status || 'OPEN',
      'Problem Identified': c.problemIdentified || '', 'Resolution': c.resolution || '',
      'Bill Required': c.billRequired ? 'YES' : 'NO', 'Bill No': c.billNo || '', 'Amount': c.amount || 0,
      'Service Slip No': c.serviceSlipNo || '', 'Resolution Date': fmtDate(c.resolutionDate),
      'Attempts': Array.isArray(c.resolutionHistory) ? c.resolutionHistory.length : 0
    }))
    if (!rows.length) { alert('No complaints to export'); return }
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = Object.keys(rows[0]).map(k => {
      if (['Problem Reported', 'Problem Identified', 'Resolution'].includes(k)) return { wch: 30 }
      if (['Client', 'Customer'].includes(k)) return { wch: 22 }
      let maxLen = k.length; rows.forEach(r => { const v = String(r[k] || ''); if (v.length > maxLen) maxLen = v.length })
      return { wch: Math.min(Math.max(maxLen + 2, 9), 35) }
    })
    const range = XLSX.utils.decode_range(ws['!ref'])
    for (let r = range.s.r; r <= range.e.r; r++) for (let cc = range.s.c; cc <= range.e.c; cc++) {
      const addr = XLSX.utils.encode_cell({ r, c: cc }); if (!ws[addr]) ws[addr] = { v: '', t: 's' }; if (!ws[addr].s) ws[addr].s = {}
      ws[addr].s.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      ws[addr].s.alignment = { horizontal: 'center', vertical: 'center', wrapText: true }
      if (r === 0) { ws[addr].s.font = { bold: true, sz: 11 }; ws[addr].s.fill = { fgColor: { rgb: 'FFD700' } } } else { ws[addr].s.font = { sz: 10 } }
    }
    const wb = XLSX.utils.book_new()
    const title = view === 'schedule' ? `Schedule ${scheduleDate}` : 'Complaints'
    XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31))
    XLSX.writeFile(wb, `Complaints_${view === 'schedule' ? scheduleDate : 'All'}_${today()}.xlsx`, { bookSST: true })
  }

  const printReport = () => {
    if (!filtered.length) { alert('No complaints to print'); return }
    const heading = view === 'schedule' ? `Daily Schedule - ${fmtDate(scheduleDate)}` : 'Complaints Report'
    let html = `<html><head><title>${heading} - OMS Prestair</title><style>
      body{font-family:Arial,sans-serif;margin:10px;font-size:9px}
      h2{text-align:center;font-size:15px;margin-bottom:2px}
      .sub{text-align:center;font-size:11px;color:#555;margin-bottom:10px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #333;padding:3px 5px;text-align:center;font-size:8px;word-wrap:break-word}
      th{background:#FFD700;font-weight:bold;font-size:9px}
      tr:nth-child(even){background:#f9f9f9}
      .no-print{text-align:center;margin:12px 0}
      .print-btn{padding:6px 16px;background:#2980b9;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;margin-right:8px}
      .cancel-btn{padding:6px 16px;background:#eee;color:#333;border:none;border-radius:4px;cursor:pointer}
      @media print{.no-print{display:none!important}body{margin:0;padding:3mm}}
      @page{size:A4 landscape;margin:8mm}
    </style></head><body>`
    html += `<div class="no-print"><button class="print-btn" onclick="window.print()">Print</button><button class="cancel-btn" onclick="window.close()">Cancel</button></div>`
    html += `<h2>OMS - Prestair Systems LLP</h2><p class="sub">${heading} | Generated: ${new Date().toLocaleString('en-IN')} | Total: ${filtered.length}</p>`
    html += `<table><thead><tr><th>#</th><th>Complaint No</th><th>Date</th><th>Client</th><th>Customer</th><th>Phone</th><th>Purch. Bill</th><th>Purch. Date</th><th>Warranty</th><th>Product</th><th>Problem Reported</th><th>Priority</th><th>Technician</th><th>Helper</th><th>Assign Type</th><th>Sched.</th><th>Status</th><th>Problem Identified</th><th>Resolution</th><th>Bill Req.</th><th>Bill No</th><th>Amount</th><th>Slip No</th><th>Res. Date</th></tr></thead><tbody>`
    filtered.forEach((c, i) => {
      html += `<tr><td>${i + 1}</td><td>${c.complaintNo || ''}</td><td>${fmtDate(c.complaintDate)}</td><td>${c.client || ''}</td><td>${c.customerName || ''}</td><td>${c.phone || ''}</td><td>${c.purchaseBillNo || ''}</td><td>${fmtDate(c.purchaseDate)}</td><td>${c.warrantyStatus || ''}</td><td>${c.product || ''}</td><td>${c.problemReported || ''}</td><td>${c.priority || ''}</td><td>${c.technician || ''}</td><td>${c.helper || ''}</td><td>${c.assignmentType || ''}</td><td>${fmtDate(c.scheduledDate)}</td><td>${c.status || 'OPEN'}</td><td>${c.problemIdentified || ''}</td><td>${c.resolution || ''}</td><td>${c.billRequired ? 'YES' : 'NO'}</td><td>${c.billNo || ''}</td><td>${c.billRequired ? (c.amount || 0).toLocaleString('en-IN') : ''}</td><td>${c.serviceSlipNo || ''}</td><td>${fmtDate(c.resolutionDate)}</td></tr>`
    })
    html += `</tbody></table></body></html>`
    const w = window.open('', '_blank'); w.document.write(html); w.document.close()
  }

  const statusColor = (s) => ({ 'OPEN': '#e74c3c', 'ASSIGNED': '#f39c12', 'IN PROGRESS': '#2980b9', 'CLOSED': '#27ae60' }[s] || '#7f8c8d')

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.head}>
          <div style={{ flexShrink: 0 }}>
            <h2 style={S.title}>Complaints Management</h2>
            <span style={S.subtitle}>Track, assign & resolve service complaints</span>
          </div>
          <div style={S.headerActions}>
            <button onClick={openAdd} style={{ ...S.hBtn, background: '#27ae60' }}>+ Add Complaint</button>
            <button onClick={() => openPicker('assign')} style={{ ...S.hBtn, background: '#f39c12' }}>Assign Technician</button>
            <button onClick={() => openPicker('resolution')} style={{ ...S.hBtn, background: '#2980b9' }}>Resolution / Feedback</button>
          </div>
          <button onClick={onClose} style={S.close}>✕</button>
        </div>

        <div style={S.cards}>
          <Card label="Total" value={counts.total} color="#34495e" />
          <Card label="Open" value={counts.open} color="#e74c3c" />
          <Card label="Assigned" value={counts.assigned} color="#f39c12" />
          <Card label="In Progress" value={counts.progress} color="#2980b9" />
          <Card label="Closed" value={counts.closed} color="#27ae60" />
        </div>

        <div style={S.toolbar}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setView('all')} style={view === 'all' ? S.tabActive : S.tab}>All Complaints</button>
            <button onClick={() => setView('schedule')} style={view === 'schedule' ? S.tabActive : S.tab}>Daily Schedule</button>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {view === 'schedule' && (
              <label style={S.inlineLabel}>Date:
                <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={S.inputSm} />
              </label>
            )}
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={S.inputSm}>
              <option value="">All Status</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input placeholder="Filter table…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.inputSm, width: '150px' }} />
            <button onClick={exportExcel} style={S.exBtn}>Excel</button>
            <button onClick={printReport} style={S.exBtn}>Print</button>
          </div>
        </div>

        <div style={S.tableWrap}>
          {loading ? <p style={{ padding: '20px', textAlign: 'center' }}>Loading…</p> : (
            <table style={S.table}>
              <thead>
                <tr>
                  {['#', 'Complaint No', 'Date', 'Client / Customer', 'Phone', 'Purch. Bill', 'Warranty', 'Problem Reported', 'Priority', 'Technician', 'Helper', 'Type', 'Sched. Date', 'Status', 'Resolution', 'Bill', 'Amount', 'Slip No', 'Res. Date', 'Att.', 'Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={21} style={{ ...S.td, padding: '18px', color: '#888' }}>No complaints found.</td></tr>}
                {filtered.map((c, i) => (
                  <tr key={c.id} style={i % 2 ? { background: '#fafafa' } : {}}>
                    <td style={S.td}>{i + 1}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{c.complaintNo}</td>
                    <td style={S.td}>{fmtDate(c.complaintDate)}</td>
                    <td style={{ ...S.td, textAlign: 'left' }}>{c.client || c.customerName}</td>
                    <td style={S.td}>{c.phone}</td>
                    <td style={S.td}>{c.purchaseBillNo}</td>
                    <td style={S.td}>{c.warrantyStatus}</td>
                    <td style={{ ...S.td, textAlign: 'left', maxWidth: '150px' }}>{c.problemReported}</td>
                    <td style={S.td}>{c.priority}</td>
                    <td style={S.td}>{c.technician || <span style={{ color: '#e74c3c' }}>—</span>}</td>
                    <td style={S.td}>{c.helper}</td>
                    <td style={S.td}>{c.assignmentType}</td>
                    <td style={S.td}>{fmtDate(c.scheduledDate)}</td>
                    <td style={S.td}>
                      {isAdmin ? (
                        <select value={c.status || 'OPEN'} onChange={e => quickStatus(c, e.target.value)}
                          style={{ ...S.statusPill, background: statusColor(c.status || 'OPEN') }} title="Admin can change status">
                          {STATUSES.map(s => <option key={s} value={s} style={{ background: '#fff', color: '#000' }}>{s}</option>)}
                        </select>
                      ) : (
                        <span style={{ ...S.statusPill, display: 'inline-block', background: statusColor(c.status || 'OPEN') }}>{c.status || 'OPEN'}</span>
                      )}
                    </td>
                    <td style={{ ...S.td, textAlign: 'left', maxWidth: '150px' }}>{c.resolution}</td>
                    <td style={S.td}>{c.billRequired ? 'YES' : 'NO'}</td>
                    <td style={S.td}>{c.billRequired && c.amount ? Number(c.amount).toLocaleString('en-IN') : ''}</td>
                    <td style={S.td}>{c.serviceSlipNo}</td>
                    <td style={S.td}>{fmtDate(c.resolutionDate)}</td>
                    <td style={S.td}>{Array.isArray(c.resolutionHistory) && c.resolutionHistory.length ? c.resolutionHistory.length : ''}</td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                      <button onClick={() => openForm(c, 'details')} style={S.rowBtn}>Edit</button>
                      {Array.isArray(c.resolutionHistory) && c.resolutionHistory.length > 0 &&
                        <button onClick={() => setHistoryView(c)} style={{ ...S.rowBtn, background: '#8e44ad' }}>History ({c.resolutionHistory.length})</button>}
                      {isAdmin && <button onClick={() => remove(c)} style={{ ...S.rowBtn, background: '#e74c3c' }}>Del</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {form && (
        <div style={S.formOverlay}>
          <div style={S.formModal}>
            <div style={S.head}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px' }}>{form.id ? `${form.complaintNo || 'Complaint'} — ${form.client || form.customerName || ''}` : 'New Complaint'}</h3>
                {form.id && <span style={S.subtitle}>{formMode === 'details' ? 'Complaint Details' : formMode === 'assign' ? 'Assign Complaint' : 'Resolution / Feedback'}</span>}
              </div>
              <button onClick={() => setForm(null)} style={S.close}>✕</button>
            </div>
            {form.id && (
              <div style={S.modeTabs}>
                <button onClick={() => setFormMode('details')} style={formMode === 'details' ? S.modeTabActive : S.modeTab}>Details</button>
                <button onClick={() => setFormMode('assign')} style={formMode === 'assign' ? S.modeTabActive : S.modeTab}>Assign</button>
                <button onClick={() => setFormMode('resolution')} style={formMode === 'resolution' ? S.modeTabActive : S.modeTab}>Resolution / Feedback</button>
              </div>
            )}
            <div style={S.formBody}>
              {(!form.id || formMode === 'details') && (
              <Section title="Complaint Details">
                <Field label="Complaint Date"><input type="date" value={form.complaintDate || ''} onChange={e => handleChange('complaintDate', e.target.value)} style={S.input} /></Field>
                <Field label="Client"><input value={form.client || ''} onChange={e => handleChange('client', e.target.value)} style={S.input} /></Field>
                <Field label="Customer Name"><input value={form.customerName || ''} onChange={e => handleChange('customerName', e.target.value)} style={S.input} /></Field>
                <Field label="Phone"><input value={form.phone || ''} onChange={e => handleChange('phone', e.target.value)} style={S.input} /></Field>
                <Field label="Purchase Bill No"><input value={form.purchaseBillNo || ''} onChange={e => handleChange('purchaseBillNo', e.target.value)} style={S.input} /></Field>
                <Field label="Purchase Date"><input type="date" value={form.purchaseDate || ''} onChange={e => handleChange('purchaseDate', e.target.value)} style={S.input} /></Field>
                <Field label="Warranty Status">
                  <select value={form.warrantyStatus || 'IN'} onChange={e => handleChange('warrantyStatus', e.target.value)} style={S.input}>
                    {WARRANTY.map(w => <option key={w} value={w}>{w === 'IN' ? 'IN WARRANTY' : 'OUT OF WARRANTY'}</option>)}
                  </select>
                </Field>
                <Field label="Product"><input value={form.product || ''} onChange={e => handleChange('product', e.target.value)} style={S.input} /></Field>
                <Field label="Priority">
                  <select value={form.priority || 'MEDIUM'} onChange={e => handleChange('priority', e.target.value)} style={S.input}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Problem Reported" full><textarea value={form.problemReported || ''} onChange={e => handleChange('problemReported', e.target.value)} style={{ ...S.input, minHeight: '48px' }} /></Field>
              </Section>
              )}

              {(!form.id || formMode === 'assign') && (
              <Section title="Assignment">
                <Field label="Assignment Type" full>
                  <Toggle value={(form.assignmentType || 'PLANNED') === 'PLANNED'} onChange={v => handleChange('assignmentType', v ? 'PLANNED' : 'UNPLANNED')}
                    onLabel="PLANNED" offLabel="UNPLANNED" onColor="#2980b9" offColor="#e67e22" wide />
                </Field>
                <Field label="Technician">
                  <input list="peopleList" value={form.technician || ''} onChange={e => handleChange('technician', e.target.value)} style={S.input} placeholder="Select or type" />
                </Field>
                <Field label="Helper Name">
                  <input list="peopleList" value={form.helper || ''} onChange={e => handleChange('helper', e.target.value)} style={S.input} placeholder="Select or type" />
                </Field>
                <datalist id="peopleList">{people.map(t => <option key={t} value={t} />)}</datalist>
                <Field label="Scheduled Date"><input type="date" value={form.scheduledDate || ''} onChange={e => handleChange('scheduledDate', e.target.value)} style={S.input} /></Field>
                <Field label={isAdmin ? 'Status (admin can change)' : 'Status (auto)'}>
                  {isAdmin ? (
                    <select value={form.status || 'OPEN'} onChange={e => handleChange('status', e.target.value)} style={S.input}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <input value={form.status || 'OPEN'} disabled style={{ ...S.input, background: '#f0f0f0', color: '#666', fontWeight: 700 }} />
                  )}
                  <span style={{ fontSize: '10px', color: '#888' }}>{isAdmin ? 'You can override the status manually.' : 'Auto-set to ASSIGNED on update when a technician & scheduled date are filled.'}</span>
                </Field>
              </Section>
              )}

              {(!form.id || formMode === 'resolution') && (<>
              <Section title="Resolution / Closure">
                <Field label="Problem Identified" full><textarea value={form.problemIdentified || ''} onChange={e => handleChange('problemIdentified', e.target.value)} style={{ ...S.input, minHeight: '40px' }} /></Field>
                <Field label="Resolution" full><textarea value={form.resolution || ''} onChange={e => handleChange('resolution', e.target.value)} style={{ ...S.input, minHeight: '40px' }} /></Field>
                <Field label="Service Slip No"><input value={form.serviceSlipNo || ''} onChange={e => handleChange('serviceSlipNo', e.target.value)} style={S.input} /></Field>
                <Field label="Resolution Date"><input type="date" value={form.resolutionDate || ''} onChange={e => handleChange('resolutionDate', e.target.value)} style={S.input} /></Field>

                <Field label="Bill Required?">
                  <Toggle value={!!form.billRequired} onChange={v => handleChange('billRequired', v)} onLabel="YES" offLabel="NO" onColor="#27ae60" />
                </Field>
                {form.billRequired && <Field label="Bill No"><input value={form.billNo || ''} onChange={e => handleChange('billNo', e.target.value)} style={S.input} /></Field>}
                {form.billRequired && <Field label="Amount"><input type="number" value={form.amount || ''} onChange={e => handleChange('amount', e.target.value)} style={S.input} /></Field>}
              </Section>

              {form.id && (
                <Section title="On Save (for resolution entries)">
                  <Field label="Complaint Outcome" full>
                    <Toggle value={closureAction === 'closed'} onChange={v => setClosureAction(v ? 'closed' : 'pending')}
                      onLabel="CLOSED" offLabel="PENDING" onColor="#27ae60" offColor="#e67e22" wide />
                    <span style={{ fontSize: '10px', color: '#888' }}>
                      {closureAction === 'closed'
                        ? 'Marks the complaint CLOSED (finalized).'
                        : 'Saves this attempt to history, re-opens the complaint (status OPEN) for re-assignment. Old data is preserved, not deleted.'}
                    </span>
                  </Field>
                </Section>
              )}

              {form.id && Array.isArray(form.resolutionHistory) && form.resolutionHistory.length > 0 && (
                <Section title={`Resolution History (${form.resolutionHistory.length})`}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    {form.resolutionHistory.map((h, idx) => (
                      <div key={idx} style={S.histItem}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                          <strong style={{ fontSize: '11px' }}>Attempt #{h.attempt || idx + 1}
                            <span style={{ marginLeft: '6px', padding: '1px 7px', borderRadius: '8px', fontSize: '9px', color: '#fff', background: h.outcome === 'CLOSED' ? '#27ae60' : '#e67e22' }}>{h.outcome}</span>
                          </strong>
                          <span style={{ fontSize: '9px', color: '#999' }}>{h.savedBy} · {h.savedAt ? new Date(h.savedAt).toLocaleString('en-IN') : ''}</span>
                        </div>
                        <div style={S.histRow}><b>Technician:</b> {h.technician || '-'} &nbsp; <b>Helper:</b> {h.helper || '-'} &nbsp; <b>Type:</b> {h.assignmentType || '-'} &nbsp; <b>Sched:</b> {fmtDate(h.scheduledDate)}</div>
                        {h.problemIdentified && <div style={S.histRow}><b>Identified:</b> {h.problemIdentified}</div>}
                        {h.resolution && <div style={S.histRow}><b>Resolution:</b> {h.resolution}</div>}
                        <div style={S.histRow}><b>Bill:</b> {h.billRequired ? `YES (No: ${h.billNo || '-'}, Amt: ${h.amount || 0})` : 'NO'} &nbsp; <b>Slip:</b> {h.serviceSlipNo || '-'} &nbsp; <b>Res. Date:</b> {fmtDate(h.resolutionDate)}</div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
              </>)}

              {error && <p style={{ color: '#e74c3c', fontSize: '12px', fontWeight: 600 }}>{error}</p>}
            </div>
            <div style={S.formActions}>
              <button onClick={() => setForm(null)} style={S.cancelBtn}>Cancel</button>
              <button onClick={save} disabled={saving} style={S.saveBtn}>
                {saving ? 'Saving…' : (!form.id ? 'Add Complaint' : (formMode === 'resolution' ? (closureAction === 'closed' ? 'Save & Close' : 'Save as Pending') : 'Update'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History panel */}
      {historyView && (
        <div style={S.formOverlay}>
          <div style={{ ...S.formModal, maxWidth: '720px' }}>
            <div style={S.head}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px' }}>Service History — {historyView.complaintNo}</h3>
                <span style={S.subtitle}>{historyView.client || historyView.customerName} · {(historyView.resolutionHistory || []).length} attempt(s)</span>
              </div>
              <button onClick={() => setHistoryView(null)} style={S.close}>✕</button>
            </div>
            <div style={S.formBody}>
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '10px' }}>
                <b>Problem Reported:</b> {historyView.problemReported || '-'} &nbsp;|&nbsp; <b>Warranty:</b> {historyView.warrantyStatus || '-'} &nbsp;|&nbsp; <b>Current Status:</b> <span style={{ color: statusColor(historyView.status || 'OPEN'), fontWeight: 700 }}>{historyView.status || 'OPEN'}</span>
              </div>
              {(historyView.resolutionHistory || []).length === 0 && <p style={{ color: '#888' }}>No history yet.</p>}
              {(historyView.resolutionHistory || []).map((h, idx) => (
                <div key={idx} style={S.histItem}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '12px' }}>Attempt #{h.attempt || idx + 1}
                      <span style={{ marginLeft: '6px', padding: '1px 8px', borderRadius: '8px', fontSize: '9px', color: '#fff', background: h.outcome === 'CLOSED' ? '#27ae60' : '#e67e22' }}>{h.outcome}</span>
                    </strong>
                    <span style={{ fontSize: '9px', color: '#999' }}>{h.savedBy} · {h.savedAt ? new Date(h.savedAt).toLocaleString('en-IN') : ''}</span>
                  </div>
                  <div style={S.histRow}><b>Technician:</b> {h.technician || '-'} &nbsp; <b>Helper:</b> {h.helper || '-'} &nbsp; <b>Type:</b> {h.assignmentType || '-'} &nbsp; <b>Scheduled:</b> {fmtDate(h.scheduledDate)}</div>
                  {h.problemIdentified && <div style={S.histRow}><b>Problem Identified:</b> {h.problemIdentified}</div>}
                  {h.resolution && <div style={S.histRow}><b>Resolution:</b> {h.resolution}</div>}
                  <div style={S.histRow}><b>Bill:</b> {h.billRequired ? `YES (No: ${h.billNo || '-'}, Amount: ${h.amount || 0})` : 'NO'} &nbsp; <b>Service Slip No:</b> {h.serviceSlipNo || '-'} &nbsp; <b>Resolution Date:</b> {fmtDate(h.resolutionDate)}</div>
                </div>
              ))}
            </div>
            <div style={S.formActions}>
              <button onClick={() => { const c = historyView; setHistoryView(null); openEdit(c) }} style={{ ...S.saveBtn, background: '#2980b9' }}>Edit / Reassign</button>
              <button onClick={() => setHistoryView(null)} style={S.cancelBtn}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Complaint picker for Assign / Resolution */}
      {picker && (
        <div style={S.formOverlay}>
          <div style={{ ...S.formModal, maxWidth: '620px', maxHeight: '80vh' }}>
            <div style={S.head}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>{picker.mode === 'assign' ? 'Assign Technician — Select Complaint' : 'Resolution / Feedback — Select Complaint'}</h3>
              <button onClick={() => setPicker(null)} style={S.close}>✕</button>
            </div>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
              <input autoFocus placeholder="Search by customer name, client name, complaint no or phone…"
                value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                style={{ ...S.input, padding: '9px 12px', fontSize: '13px' }} />
              <div style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>
                {picker.mode === 'assign' ? 'Showing OPEN and IN PROGRESS complaints.' : 'Showing complaints with status ASSIGNED.'}
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 16px' }}>
              {pickerMatches.length === 0 && <p style={{ color: '#888', fontSize: '12px' }}>No complaints match.</p>}
              {pickerMatches.map(c => (
                <div key={c.id} onClick={() => choosePicker(c)} style={S.pickItem}>
                  <div>
                    <b style={{ fontSize: '12px' }}>{c.complaintNo}</b> · {c.client || c.customerName}
                    <div style={{ fontSize: '10px', color: '#777' }}>{c.customerName && c.client ? c.customerName + ' · ' : ''}{c.phone || ''} · {c.problemReported || ''}</div>
                  </div>
                  <span style={{ fontSize: '9px', color: '#fff', background: statusColor(c.status || 'OPEN'), padding: '2px 8px', borderRadius: '8px', height: 'fit-content' }}>{c.status || 'OPEN'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ label, value, color }) {
  return (
    <div style={{ ...S.card, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: '20px', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '10px', color: '#666', fontWeight: 600 }}>{label}</div>
    </div>
  )
}
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={S.sectionTitle}>{title}</div>
      <div style={S.grid}>{children}</div>
    </div>
  )
}
function Field({ label, children, full }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: full ? '1 / -1' : 'auto' }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  )
}
function Toggle({ value, onChange, onLabel, offLabel, onColor = '#27ae60', offColor = '#bbb', wide }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid #ccc', borderRadius: '6px', overflow: 'hidden', width: wide ? '220px' : 'auto' }}>
      <button type="button" onClick={() => onChange(true)} style={{ flex: 1, padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 700, background: value ? onColor : '#f2f2f2', color: value ? '#fff' : '#666' }}>{onLabel}</button>
      <button type="button" onClick={() => onChange(false)} style={{ flex: 1, padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 700, background: !value ? offColor : '#f2f2f2', color: !value ? '#fff' : '#666' }}>{offLabel}</button>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, padding: '2vh' },
  modal: { background: '#fff', borderRadius: '12px', width: '96vw', maxWidth: '1450px', height: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', padding: '12px 18px', background: 'linear-gradient(90deg,#1a1a2e,#16213e)', color: '#fff' },
  headerActions: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'center', flexWrap: 'wrap' },
  hBtn: { padding: '7px 14px', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  pickItem: { display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '9px 10px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', borderRadius: '6px' },
  title: { margin: 0, fontSize: '18px', fontWeight: 700 },
  subtitle: { fontSize: '11px', opacity: 0.75 },
  close: { background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '30px', height: '30px', borderRadius: '6px', cursor: 'pointer', fontSize: '15px' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', padding: '12px 20px' },
  card: { background: '#f8f9fa', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '0 20px 10px', flexWrap: 'wrap' },
  tab: { padding: '7px 14px', background: '#ecf0f1', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#333' },
  tabActive: { padding: '7px 14px', background: '#1a1a2e', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#fff' },
  inlineLabel: { fontSize: '11px', fontWeight: 600, color: '#555', display: 'flex', alignItems: 'center', gap: '4px' },
  inputSm: { padding: '5px 8px', border: '1px solid #ccc', borderRadius: '5px', fontSize: '12px' },
  addBtn: { padding: '6px 14px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 },
  exBtn: { padding: '6px 12px', background: '#2980b9', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
  tableWrap: { flex: 1, overflow: 'auto', margin: '0 20px 20px', border: '1px solid #e0e0e0', borderRadius: '8px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { position: 'sticky', top: 0, background: '#1a1a2e', color: '#fff', padding: '8px 6px', fontSize: '11px', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', zIndex: 2 },
  td: { padding: '6px', borderBottom: '1px solid #eee', textAlign: 'center', verticalAlign: 'top' },
  statusPill: { color: '#fff', border: 'none', borderRadius: '10px', padding: '3px 6px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' },
  rowBtn: { padding: '3px 8px', background: '#2980b9', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 600, marginRight: '3px' },
  formOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1300, padding: '2vh' },
  formModal: { background: '#fff', borderRadius: '12px', width: '90vw', maxWidth: '860px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  modeTabs: { display: 'flex', gap: '6px', padding: '10px 20px 0' },
  modeTab: { padding: '6px 14px', background: '#ecf0f1', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: '#333' },
  modeTabActive: { padding: '6px 14px', background: '#1a1a2e', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#fff' },
  formBody: { padding: '16px 20px', overflow: 'auto', flex: 1 },
  sectionTitle: { fontSize: '12px', fontWeight: 700, color: '#1a1a2e', borderBottom: '2px solid #f0f0f0', paddingBottom: '4px', marginBottom: '8px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: '10px', alignItems: 'end' },
  label: { fontSize: '10px', fontWeight: 600, color: '#555' },
  input: { padding: '6px 9px', border: '1px solid #ccc', borderRadius: '5px', fontSize: '12px', width: '100%', boxSizing: 'border-box' },
  histItem: { border: '1px solid #eee', borderRadius: '6px', padding: '8px 10px', marginBottom: '6px', background: '#fbfbfb' },
  histRow: { fontSize: '10px', color: '#444', lineHeight: '1.5' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '12px 20px', borderTop: '1px solid #eee' },
  cancelBtn: { padding: '8px 18px', background: '#eee', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 },
  saveBtn: { padding: '8px 20px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 },
}
