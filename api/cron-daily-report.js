const { timingSafeEqual } = require('node:crypto')
const jwt = require('jsonwebtoken')

function authorizeReport(req, env = process.env) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return { status: 405, error: 'Method not allowed' }
  }
  const authorization = req.headers?.authorization
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
    return { status: 401, error: 'Unauthorized' }
  }
  const token = authorization.slice(7)
  if (env.CRON_SECRET) {
    const actual = Buffer.from(token)
    const expected = Buffer.from(env.CRON_SECRET)
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return { cron: true }
  }
  if (!env.JWT_SECRET) return { status: 503, error: 'Report authentication is not configured' }
  try {
    const user = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] })
    if (user.role !== 'admin' || user.id == null) return { status: 403, error: 'Admin only' }
    return { user }
  } catch {
    return { status: 401, error: 'Invalid token' }
  }
}

let XLSX

// ---------------------------------------------------------------------------
// Colour palette — all light, readable on white background
// ---------------------------------------------------------------------------
const C = {
  // Sheet header rows
  GREEN_HDR:  'D6F5D6', // Active Orders header  — light green
  ORANGE_HDR: 'FFE5CC', // Completed Orders header — light orange (unused now)
  RED_HDR:    'FFB3B3', // Completed Orders header — light red
  BLUE_HDR:   'D0E8FF', // Paper Issue header     — light blue
  PURPLE_HDR: 'EDE0FF', // Reminders header       — light purple

  // Alternating data rows
  ROW_ALT:    'F7F7F7', // very light grey
  ROW_EVEN:   'FFFFFF', // white

  // Completed Orders alternating orange shades
  COMP_ROW1:  'FFF3E6', // light orange
  COMP_ROW2:  'FFE0B2', // slightly deeper orange

  // Accent fills
  AMOUNT_POS: 'E8F8E8', // light green for positive balance
  AMOUNT_NEG: 'FFE8E8', // light red for negative / zero balance
  STATUS_OK:  'E8F8E8',
  STATUS_WARN:'FFF9E0',
}

function cellStyle(fill, bold, wrap, fontSize) {
  return {
    font: { name: 'Arial', sz: fontSize || 9, bold: !!bold },
    fill: fill ? { fgColor: { rgb: fill } } : {},
    alignment: { horizontal: 'center', vertical: 'center', wrapText: !!wrap },
    border: {
      top:    { style: 'thin', color: { rgb: 'D0D0D0' } },
      bottom: { style: 'thin', color: { rgb: 'D0D0D0' } },
      left:   { style: 'thin', color: { rgb: 'D0D0D0' } },
      right:  { style: 'thin', color: { rgb: 'D0D0D0' } }
    }
  }
}

// Fixed optimal column widths per header name (in characters)
// All columns wrap — widths control the wrap point, not the content cutoff
const COL_WIDTHS = {
  '#':                   4,
  'Date':               10,
  'PO No':               8,
  'Client':             18,
  'Order No':           14,
  'DOD Status':          9,
  'Customer Name':      14,
  'GST':                14,
  'Billing Address':    18,
  'Follow Up':           8,
  'Sales Rep':          10,
  'Delivery Address':   18,
  'Phone No':           12,
  'Wapp Group':          8,
  'Wapp Name':          12,
  'Wapp Group Made':    12,
  'Photography':         9,
  'Photo Remarks':      14,
  'Site Video':          9,
  'SV Remarks':         14,
  'Review':              9,
  'Review Remarks':     14,
  'Delivery Date':      10,
  'Delivery Remarks':   14,
  'Site Verification':  10,
  'SV2 Remarks':        14,
  'Installation':        9,
  'Inst. Remarks':      14,
  'LOP':                 8,
  'Section Drawing':    10,
  'SD Remarks':         14,
  'In Production':       9,
  'Seasonal Discount':  10,
  'Total Amount':       10,
  'Received':           16,
  'Balance':             9,
  '% Rcv':               6,
  'Follow Up Type':     10,
  'Payment Remarks':    16,
  'Akhil Remarks':      16,
  'Days to Order':       8,
  'Akhil Sir Audit':    10,
  'Audit Remarks':      16,
  'Advance Bill':        9,
  'Adv. Remarks':       14,
  'OR Recvd':            8,
  // Completed extra
  'Installation Status':10,
  'Akhil Payment Remarks':16,
  'Deleted By':         10,
  'Deleted On':         10,
  // Paper
  'Requested By':       12,
  'Issue To':           12,
  'Status':              9,
  'Accepted By':        10,
  'Accepted At':        10,
  'Returned By':        10,
  'Return Date':        10,
  // Sales Person Wise
  'Amount (18%)':       12,
  'Status':              9,
  // Reminders
  'Message':            20,
  'Set By':             10,
  'Assigned To':        10,
  'Response':           16,
  'Responded By':       10,
  'Response Date':      10,
}

// Apply full formatting — all cells center+wrap, headers bold with hdrFill
// altRows: optional [evenFill, oddFill] to override default white/grey alternation
function applySheetStyle(ws, data, hdrFill, altRows) {
  if (!data || !data.length) return
  const headers = Object.keys(data[0])
  const numRows = data.length
  const numCols = headers.length
  const rowEven = altRows ? altRows[0] : C.ROW_EVEN
  const rowOdd  = altRows ? altRows[1] : C.ROW_ALT

  // Fixed column widths from lookup table, fallback to 12
  ws['!cols'] = headers.map(key => ({ wch: COL_WIDTHS[key] || 12 }))

  // Row heights — header taller, data rows uniform
  ws['!rows'] = [{ hpt: 24 }]
  for (let r = 0; r < numRows; r++) ws['!rows'].push({ hpt: 42 })

  // Header row
  for (let c = 0; c < numCols; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[ref]) ws[ref] = { v: headers[c], t: 's' }
    ws[ref].s = cellStyle(hdrFill, true, true, 9)
  }

  // Data rows — all center + wrap
  for (let r = 0; r < numRows; r++) {
    const rowFill = r % 2 === 0 ? rowEven : rowOdd
    for (let c = 0; c < numCols; c++) {
      const ref = XLSX.utils.encode_cell({ r: r + 1, c })
      if (!ws[ref]) ws[ref] = { v: '', t: 's' }
      const key = headers[c]
      let fill = rowFill
      if (key === 'Balance') {
        const val = Number(ws[ref].v)
        fill = val <= 0 ? C.AMOUNT_NEG : C.AMOUNT_POS
      }
      ws[ref].s = cellStyle(fill, false, true, 9)
    }
  }
}

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

    const queryError = [ordersRes, deletedRes, paperRes, remindersRes, paymentsRes].find(r => r.error)?.error
    if (queryError) throw queryError
    const orders   = ordersRes.data   || []
    const deleted  = deletedRes.data  || []
    const paper    = paperRes.data    || []
    const reminders= remindersRes.data|| []
    const payments = paymentsRes.data || []

    // Build order_id -> payments map
    const byOrderId = {}
    payments.forEach(p => {
      if (!byOrderId[p.order_id]) byOrderId[p.order_id] = []
      byOrderId[p.order_id].push(p)
    })
    Object.keys(byOrderId).forEach(k => {
      byOrderId[k].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    })

    const wb = XLSX.utils.book_new()

    // -----------------------------------------------------------------------
    // Sheet 1: Active Orders — green header
    // -----------------------------------------------------------------------
    const activeData = orders.map((o, i) => ({
      '#':                 i + 1,
      'Date':              o.date || '',
      'PO No':             o.po_no || '',
      'Client':            o.client || '',
      'Order No':          o.order_no || '',
      'DOD Status':        o.status || '',
      'Customer Name':     o.customer_name || '',
      'GST':               o.gst || '',
      'Billing Address':   o.billing_address || '',
      'Follow Up':         o.follow_up || '',
      'Sales Rep':         o.sales_rep || '',
      'Delivery Address':  o.delivery_address || '',
      'Phone No':          o.phone_no || '',
      'Wapp Group':        o.wapp_group  || '',
      'Wapp Name':         o.wapp_number || '',
      'Wapp Group Made':   o.wapp_group_made || '',
      'Photography':       o.photography || '',
      'Photo Remarks':     o.photography_remarks || '',
      'Site Video':        o.site_video || '',
      'SV Remarks':        o.site_video_remarks || '',
      'Review':            o.review || '',
      'Review Remarks':    o.review_remarks || '',
      'Delivery Date':     o.delivery_date || '',
      'Delivery Remarks':  o.delivery_remarks || '',
      'Site Verification': o.site_verification || '',
      'SV2 Remarks':       o.site_verification_remarks || '',
      'Installation':      o.installation_status || '',
      'Inst. Remarks':     o.installation_remarks || '',
      'LOP':               o.lop || '',
      'Section Drawing':   o.section_drawing || '',
      'SD Remarks':        o.section_drawing_remarks || '',
      'In Production':     o.in_production || '',
      'Seasonal Discount': o.installation || '',
      'Total Amount':      o.total_amount || 0,
      'Received':          fmtPayments(byOrderId[o.id], o.received_amount || 0),
      'Balance':           (o.total_amount || 0) - (o.received_amount || 0),
      '% Rcv':             o.total_amount ? parseFloat(((o.received_amount || 0) / o.total_amount * 100).toFixed(1)) : 0,
      'Follow Up Type':    o.follow_up_type || '',
      'Payment Remarks':   o.payment_remarks || '',
      'Akhil Remarks':     o.akhil_points || '',
      'Days to Order':     o.days_to_order || '',
      'Akhil Sir Audit':   o.akhil_sir_audit || '',
      'Audit Remarks':     o.remarks || '',
      'Advance Bill':      o.advance_bill || '',
      'Adv. Remarks':      o.advance_bill_remarks || '',
      'OR Recvd':          o.or_recvd || ''
    }))

    const ws1 = XLSX.utils.json_to_sheet(activeData)
    applySheetStyle(ws1, activeData, C.GREEN_HDR)
    XLSX.utils.book_append_sheet(wb, ws1, 'Active Orders')

    // -----------------------------------------------------------------------
    // Sheet 2: Completed Orders — orange header
    // -----------------------------------------------------------------------
    const completedData = deleted.map((d, i) => {
      const o = d.data || {}
      const totalAmt = o.total_amount || o.totalAmount || 0
      const recvdAmt = o.received_amount || o.receivedAmount || 0
      return {
        '#':                    i + 1,
        'Date':                 o.date || '',
        'PO No':                o.po_no || o.poNo || '',
        'Client':               o.client || '',
        'Order No':             o.order_no || o.orderNo || '',
        'DOD Status':           o.status || '',
        'Customer Name':        o.customer_name || o.customerName || '',
        'GST':                  o.gst || '',
        'Billing Address':      o.billing_address || o.billingAddress || '',
        'Follow Up':            o.follow_up || o.followUp || '',
        'Sales Rep':            o.sales_rep || o.salesRep || '',
        'Delivery Address':     o.delivery_address || o.deliveryAddress || '',
        'Phone No':             o.phone_no || o.phoneNo || '',
        'Wapp Group':           o.wapp_group  || o.wappGroup  || '',
        'Wapp Name':            o.wapp_number || o.wappNumber || '',
        'Wapp Group Made':      o.wapp_group_made || o.wappGroupMade || '',
        'Photography':          o.photography || '',
        'Photo Remarks':        o.photography_remarks || o.photographyRemarks || '',
        'Site Video':           o.site_video || o.siteVideo || '',
        'SV Remarks':           o.site_video_remarks || o.siteVideoRemarks || '',
        'Review':               o.review || '',
        'Review Remarks':       o.review_remarks || o.reviewRemarks || '',
        'Delivery Date':        o.delivery_date || o.deliveryDate || '',
        'Delivery Remarks':     o.delivery_remarks || o.deliveryRemarks || '',
        'Site Verification':    o.site_verification || o.siteVerification || '',
        'SV2 Remarks':          o.site_verification_remarks || o.siteVerificationRemarks || '',
        'Installation Status':  o.installation_status || o.installationStatus || '',
        'Inst. Remarks':        o.installation_remarks || o.installationRemarks || '',
        'LOP':                  o.lop || '',
        'Section Drawing':      o.section_drawing || o.sectionDrawing || '',
        'SD Remarks':           o.section_drawing_remarks || o.sectionDrawingRemarks || '',
        'In Production':        o.in_production || o.inProduction || '',
        'Seasonal Discount':    o.installation || '',
        'Total Amount':         totalAmt,
        'Received':             fmtPayments(byOrderId[d.original_id], recvdAmt),
        'Balance':              totalAmt - recvdAmt,
        '% Rcv':                totalAmt ? parseFloat(((recvdAmt / totalAmt) * 100).toFixed(1)) : 0,
        'Follow Up Type':       o.follow_up_type || o.followUpType || '',
        'Payment Remarks':      o.payment_remarks || o.paymentRemarks || '',
        'Akhil Remarks':        o.akhil_points || o.akhilPoints || '',
        'Days to Order':        o.days_to_order || o.daysToOrder || '',
        'Akhil Sir Audit':      o.akhil_sir_audit || o.akhilSirAudit || '',
        'Audit Remarks':        o.remarks || '',
        'Advance Bill':         o.advance_bill || o.advanceBill || '',
        'Adv. Remarks':         o.advance_bill_remarks || o.advanceBillRemarks || '',
        'OR Recvd':             o.or_recvd || o.orRecvd || '',
        'Deleted By':           d.deleted_by || '',
        'Deleted On':           d.deleted_at ? new Date(d.deleted_at).toLocaleDateString('en-IN') : ''
      }
    })

    const ws2 = XLSX.utils.json_to_sheet(completedData)
    applySheetStyle(ws2, completedData, C.RED_HDR, [C.COMP_ROW1, C.COMP_ROW2])
    XLSX.utils.book_append_sheet(wb, ws2, 'Completed Orders')

    // -----------------------------------------------------------------------
    // Sheet 3: Paper Issue Report — blue header
    // -----------------------------------------------------------------------
    const paperData = paper.map((r, i) => ({
      '#':            i + 1,
      'Date':         r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '',
      'Order No':     r.order_no || '',
      'Client':       r.client || '',
      'Requested By': (r.requested_by || '') + (r.placed_by_admin ? ' (admin)' : ''),
      'Issue To':     r.issue_to || '',
      'Status':       r.status || '',
      'Accepted By':  r.accepted_by || '',
      'Accepted At':  r.accepted_at ? new Date(r.accepted_at).toLocaleDateString('en-IN') : '',
      'Returned By':  r.returned_by || '',
      'Return Date':  r.return_date ? new Date(r.return_date).toLocaleDateString('en-IN') : ''
    }))

    const ws3 = XLSX.utils.json_to_sheet(paperData)
    applySheetStyle(ws3, paperData, C.BLUE_HDR)
    XLSX.utils.book_append_sheet(wb, ws3, 'Paper Issue Report')

    // -----------------------------------------------------------------------
    // Sheet 4: Reminders — purple header
    // -----------------------------------------------------------------------
    const reminderData = reminders.map((r, i) => ({
      '#':             i + 1,
      'Date':          r.date || '',
      'Order No':      r.order_no || '',
      'Client':        r.client || '',
      'Message':       r.description || '',
      'Set By':        r.created_by || '',
      'Assigned To':   r.assigned_to || '',
      'Response':      r.response_text || 'PENDING',
      'Responded By':  r.responded_by || '-',
      'Response Date': r.response_date ? new Date(r.response_date).toLocaleDateString('en-IN') : '-',
      'Status':        r.responded_by ? 'RESPONDED' : 'PENDING'
    }))

    const ws4 = XLSX.utils.json_to_sheet(reminderData)
    applySheetStyle(ws4, reminderData, C.PURPLE_HDR)
    XLSX.utils.book_append_sheet(wb, ws4, 'Reminders')

    // -----------------------------------------------------------------------
    // Sheet 5: Sales Person Wise — yellow header
    // Orders (active + completed) where salesPerson === 'yes'
    // -----------------------------------------------------------------------
    const C_YELLOW_HDR = 'FFF3B0'
    const allOrdersForSp = [
      ...orders.map(o => ({ ...o, _source: 'active' })),
      ...deleted.map(d => ({ ...(d.data || {}), _source: 'completed', _deletedBy: d.deleted_by, _deletedAt: d.deleted_at }))
    ]
    const spOrders = allOrdersForSp.filter(o => (o.sales_person || o.salesPerson || '').trim().toLowerCase() === 'yes')
    const spData = spOrders.map((o, i) => {
      const totalAmt = parseFloat(o.total_amount || o.totalAmount) || 0
      return {
        '#':              i + 1,
        'Date':           o.date || '',
        'Client':         o.client || '',
        'Order No':       o.order_no || o.orderNo || '',
        'Sales Rep':      o.sales_rep || o.salesRep || '',
        'Total Amount':   totalAmt,
        'Amount (18%)':   parseFloat((totalAmt * 0.18).toFixed(2)),
        'Status':         _source => o._source === 'completed' ? 'Completed' : 'Active'
      }
    }).map(({ Status, ...rest }, i) => ({
      ...rest,
      'Status': spOrders[i]._source === 'completed' ? 'Completed' : 'Active'
    }))

    const spTotalAmt = spOrders.reduce((s, o) => s + (parseFloat(o.total_amount || o.totalAmount) || 0) * 0.18, 0)
    // Add a totals row at the bottom
    if (spData.length > 0) {
      spData.push({
        '#': '',
        'Date': '',
        'Client': '',
        'Order No': 'TOTAL',
        'Sales Rep': '',
        'Total Amount': spOrders.reduce((s, o) => s + (parseFloat(o.total_amount || o.totalAmount) || 0), 0),
        'Amount (18%)': parseFloat(spTotalAmt.toFixed(2)),
        'Status': `${spOrders.length} orders`
      })
    }

    const ws5 = XLSX.utils.json_to_sheet(spData)
    applySheetStyle(ws5, spData, C_YELLOW_HDR)
    XLSX.utils.book_append_sheet(wb, ws5, 'Sales Person Wise')

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
