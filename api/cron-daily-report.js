const { authorizeReport } = require('../server/report-authorization.cjs')

let XLSX

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  const access = authorizeReport(req)
  if (access.status) {
    if (access.status === 405) res.setHeader('Allow', 'GET, POST')
    return res.status(access.status).json({ error: access.error })
  }
  const required = ['SUPABASE_URL', 'SUPABASE_KEY', 'GMAIL_USER', 'GMAIL_APP_PASSWORD']
  if (required.some(name => !process.env[name])) {
    return res.status(503).json({ error: 'Daily report is not configured. Check the required environment variables.' })
  }
  try {
    // Reject unauthorized requests before loading report libraries or reading data.
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
      global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(10000) }) }
    })
    if (!access.cron) {
      const { data, error } = await supabase.from('users').select('role,force_logout_at').eq('id', access.user.id).limit(1)
      if (error) throw error
      const currentUser = data?.[0]
      if (!currentUser || currentUser.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
      if (currentUser.force_logout_at && (!access.user.iat || new Date(currentUser.force_logout_at).getTime() / 1000 > access.user.iat)) {
        return res.status(401).json({ error: 'Session expired. Please login again.' })
      }
    }
    const nodemailer = require('nodemailer')
    XLSX = XLSX || require('xlsx-js-style')
    const GMAIL_USER = process.env.GMAIL_USER
    const RECEIVER = process.env.REPORT_RECEIVER || 'agm.prestairsystem@gmail.com'

    // Fetch all data
    const [ordersRes, deletedRes, paperRes, remindersRes, paymentsRes] = await Promise.all([
      supabase.from('orders').select('*').order('id', { ascending: false }),
      supabase.from('deleted_orders').select('*').order('id', { ascending: false }),
      supabase.from('paper_requests').select('*').order('id', { ascending: false }),
      supabase.from('reminders').select('*').order('created_at', { ascending: false }),
      supabase.from('payments').select('*')
    ])

    const queryError = [ordersRes, deletedRes, paperRes, remindersRes, paymentsRes].find(result => result.error)?.error
    if (queryError) throw queryError
    const orders = ordersRes.data || []
    const deleted = deletedRes.data || []
    const paper = paperRes.data || []
    const reminders = remindersRes.data || []
    const payments = paymentsRes.data || []

    // Build order_id -> payments map, each list sorted oldest-first by date
    const byOrderId = {}
    payments.forEach(p => {
      if (!byOrderId[p.order_id]) byOrderId[p.order_id] = []
      byOrderId[p.order_id].push(p)
    })
    Object.keys(byOrderId).forEach(k => {
      byOrderId[k].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    })

    // Create workbook
    const wb = XLSX.utils.book_new()

    // Sheet 1: Active Orders
    const activeData = orders.map((o, i) => ({
      '#': i + 1,
      'Date': o.date || '',
      'PO No': o.po_no || '',
      'Client': o.client || '',
      'Order No': o.order_no || '',
      'DOD Status': o.status || '',
      'Customer Name': o.customer_name || '',
      'Sales Rep': o.sales_rep || '',
      'Total Amount': o.total_amount || 0,
      'Received': fmtPayments(byOrderId[o.id], o.received_amount || 0),
      'Balance': (o.total_amount || 0) - (o.received_amount || 0),
      '% Rcv': o.total_amount ? parseFloat(((o.received_amount || 0) / o.total_amount * 100).toFixed(2)) : 0,
      'Payment Remarks': o.payment_remarks || '',
      'Akhil Sir Audit': o.akhil_sir_audit || '',
      'Audit Remarks': o.remarks || '',
      'Advance Bill': o.advance_bill || '',
      'OR Recvd': o.or_recvd || ''
    }))
    const ws1 = XLSX.utils.json_to_sheet(activeData)
    autoWidth(ws1, activeData)
    wrapReceivedColumn(ws1, activeData)
    XLSX.utils.book_append_sheet(wb, ws1, 'Active Orders')

    // Sheet 2: Completed Orders
    const completedData = deleted.map((d, i) => ({
      '#': i + 1,
      'Order No': d.data?.order_no || d.data?.orderNo || '',
      'Client': d.data?.client || '',
      'Customer': d.data?.customer_name || d.data?.customerName || '',
      'Total Amount': d.data?.total_amount || d.data?.totalAmount || 0,
      'Received': fmtPayments(byOrderId[d.original_id], d.data?.received_amount || d.data?.receivedAmount || 0),
      'Deleted By': d.deleted_by || '',
      'Deleted On': d.deleted_at ? new Date(d.deleted_at).toLocaleDateString('en-IN') : ''
    }))
    const ws2 = XLSX.utils.json_to_sheet(completedData)
    autoWidth(ws2, completedData)
    wrapReceivedColumn(ws2, completedData)
    XLSX.utils.book_append_sheet(wb, ws2, 'Completed Orders')

    // Sheet 3: Paper Issue Report
    const paperData = paper.map((r, i) => ({
      '#': i + 1,
      'Order No': r.order_no || '',
      'Client': r.client || '',
      'Requested By': r.requested_by || '',
      'Issue To': r.issue_to || '',
      'Status': r.status || '',
      'Date': r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : ''
    }))
    const ws3 = XLSX.utils.json_to_sheet(paperData)
    autoWidth(ws3, paperData)
    XLSX.utils.book_append_sheet(wb, ws3, 'Paper Issue Report')

    // Sheet 4: Reminders
    const reminderData = reminders.map((r, i) => ({
      '#': i + 1,
      'Date': r.date || '',
      'Order No': r.order_no || '',
      'Client': r.client || '',
      'Message': r.description || '',
      'Set By': r.created_by || '',
      'Assigned To': r.assigned_to || '',
      'Response': r.response_text || 'PENDING',
      'Responded By': r.responded_by || '-',
      'Response Date': r.response_date ? new Date(r.response_date).toLocaleDateString('en-IN') : '-',
      'Status': r.responded_by ? 'RESPONDED' : 'PENDING'
    }))
    const ws4 = XLSX.utils.json_to_sheet(reminderData)
    autoWidth(ws4, reminderData)
    XLSX.utils.book_append_sheet(wb, ws4, 'Reminders')

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // Send email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000
    })

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    await transporter.sendMail({
      from: `"OMS Prestair" <${GMAIL_USER}>`,
      to: RECEIVER,
      subject: `OMS Daily Report - ${today}`,
      html: `<h2>OMS Prestair - Daily Report</h2>
        <p>Date: <strong>${today}</strong></p>
        <p>Summary:</p>
        <ul>
          <li>Active Orders: <strong>${orders.length}</strong></li>
          <li>Completed Orders: <strong>${deleted.length}</strong></li>
          <li>Paper Requests: <strong>${paper.length}</strong></li>
          <li>Reminders: <strong>${reminders.length}</strong></li>
        </ul>
        <p>Please find the detailed Excel report attached.</p>
        <br><p style="color:#888;font-size:12px">This is an automated report from OMS Prestair Systems LLP</p>`,
      attachments: [{
        filename: `OMS_Daily_Report_${today.replace(/\//g, '-')}.xlsx`,
        content: buffer
      }]
    })

    res.json({ message: 'Daily report sent successfully', to: RECEIVER, date: today })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}

function fmtDate(s) {
  if (!s) return ''
  const str = String(s)
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  let d, mo, y
  if (m) {
    y = m[1]; mo = m[2]; d = m[3]
  } else {
    const dt = new Date(str)
    if (isNaN(dt.getTime())) return str
    y = String(dt.getFullYear())
    mo = String(dt.getMonth() + 1).padStart(2, '0')
    d = String(dt.getDate()).padStart(2, '0')
  }
  return `${d}.${mo}.${y.slice(-2)}`
}

function fmtPayments(list, fallback) {
  if (!list || !list.length) return fallback
  return list.map(p => `${fmtDate(p.date)}  ${Number(p.amount || 0)}/-`).join('\n')
}

function wrapReceivedColumn(ws, data) {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const colIdx = headers.indexOf('Received')
  if (colIdx === -1) return
  for (let r = 0; r < data.length; r++) {
    const ref = XLSX.utils.encode_cell({ c: colIdx, r: r + 1 })
    if (ws[ref]) ws[ref].s = { ...(ws[ref].s || {}), alignment: { wrapText: true, vertical: 'top' } }
  }
}

function autoWidth(ws, data) {
  if (!data.length) return
  const headers = Object.keys(data[0])
  ws['!cols'] = headers.map(key => {
    let maxLen = key.length
    data.forEach(row => { const val = String(row[key] || ''); if (val.length > maxLen) maxLen = val.length })
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) }
  })
}
