const nodemailer = require('nodemailer')
const XLSX = require('xlsx-js-style')
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || 'https://ttbyhawdgwwqemcqwjen.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0YnloYXdkZ3d3cWVtY3F3amVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MjU3ODcsImV4cCI6MjEwMTMwMTc4N30.V_d9mK8Bv6Sx6w89VE4Pzt6KRKvIAeHI7Dz6SbaLyh8'
const supabase = createClient(supabaseUrl, supabaseKey)

const GMAIL_USER = 'oms.prestair@gmail.com'
const GMAIL_PASS = 'sweveeorgfotyyhr'
const RECEIVER = 'agm.prestairsystem@gmail.com'

module.exports = async (req, res) => {
  try {
    // Fetch all data
    const [ordersRes, deletedRes, paperRes, remindersRes] = await Promise.all([
      supabase.from('orders').select('*').order('id', { ascending: false }),
      supabase.from('deleted_orders').select('*').order('id', { ascending: false }),
      supabase.from('paper_requests').select('*').order('id', { ascending: false }),
      supabase.from('reminders').select('*').order('created_at', { ascending: false })
    ])

    const orders = ordersRes.data || []
    const deleted = deletedRes.data || []
    const paper = paperRes.data || []
    const reminders = remindersRes.data || []

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
      'Received': o.received_amount || 0,
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
    XLSX.utils.book_append_sheet(wb, ws1, 'Active Orders')

    // Sheet 2: Completed Orders
    const completedData = deleted.map((d, i) => ({
      '#': i + 1,
      'Order No': d.data?.order_no || d.data?.orderNo || '',
      'Client': d.data?.client || '',
      'Customer': d.data?.customer_name || d.data?.customerName || '',
      'Total Amount': d.data?.total_amount || d.data?.totalAmount || 0,
      'Received': d.data?.received_amount || d.data?.receivedAmount || 0,
      'Deleted By': d.deleted_by || '',
      'Deleted On': d.deleted_at ? new Date(d.deleted_at).toLocaleDateString('en-IN') : ''
    }))
    const ws2 = XLSX.utils.json_to_sheet(completedData)
    autoWidth(ws2, completedData)
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
      auth: { user: GMAIL_USER, pass: GMAIL_PASS }
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

function autoWidth(ws, data) {
  if (!data.length) return
  const headers = Object.keys(data[0])
  ws['!cols'] = headers.map(key => {
    let maxLen = key.length
    data.forEach(row => { const val = String(row[key] || ''); if (val.length > maxLen) maxLen = val.length })
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) }
  })
}
