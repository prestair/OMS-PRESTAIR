import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
)

const JWT_SECRET = 'oms-prestair-secret-key-2026'

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' })
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'No token' })
  try {
    const token = authHeader.split(' ')[1]
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch { return res.status(401).json({ error: 'Invalid token' }) }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  next()
}

function mapOrder(row) {
  if (!row) return null
  return {
    id: row.id, orderNo: row.order_no, date: row.date, clientName: row.client_name,
    description: row.description, totalValue: row.total_value, receivedAmount: row.received_amount,
    balance: row.balance, status: row.status, deliveryDate: row.delivery_date,
    photography: row.photography, photographyRemarks: row.photography_remarks,
    siteVideo: row.site_video, siteVideoRemarks: row.site_video_remarks,
    review: row.review, reviewRemarks: row.review_remarks,
    rejectionRemark: row.rejection_remark, createdBy: row.created_by, createdAt: row.created_at
  }
}

// AUTH
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body
    const { data: users } = await supabase.from('users').select('*').ilike('username', username)
    if (!users || users.length === 0) return res.status(401).json({ error: 'Invalid credentials' })
    const user = users[0]
    const valid = await bcrypt.compare(password.toLowerCase(), user.password)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
    const token = generateToken(user)
    res.json({ token, user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role, group: user.group_name, columnPermissions: user.column_permissions || {}, canEdit: user.can_edit, canReceipt: user.can_receipt, canAssignReminder: user.can_assign_reminder, canDelete: user.can_delete, canCreateQuote: user.can_create_quote } })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/auth/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const { data: users } = await supabase.from('users').select('*').eq('id', req.user.id)
    if (!users || users.length === 0) return res.status(404).json({ error: 'User not found' })
    const valid = await bcrypt.compare(currentPassword.toLowerCase(), users[0].password)
    if (!valid) return res.status(401).json({ error: 'Current password incorrect' })
    const hash = await bcrypt.hash(newPassword.toLowerCase(), 10)
    await supabase.from('users').update({ password: hash }).eq('id', req.user.id)
    res.json({ message: 'Password changed' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// USERS
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const { data } = await supabase.from('users').select('*').order('username')
    res.json(data.map(u => ({ id: u.id, username: u.username, fullName: u.full_name, role: u.role, group: u.group_name, columnPermissions: u.column_permissions || {}, canEdit: u.can_edit, canReceipt: u.can_receipt, canAssignReminder: u.can_assign_reminder, canDelete: u.can_delete, canCreateQuote: u.can_create_quote })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/users/list', authenticate, async (req, res) => {
  try {
    const { data } = await supabase.from('users').select('id, username, full_name').order('username')
    res.json(data.map(u => ({ id: u.id, username: u.username, fullName: u.full_name })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/users/groups', authenticate, async (req, res) => {
  try {
    const { data } = await supabase.from('groups').select('*').order('name')
    res.json(data.map(g => ({ id: g.id, name: g.name, columnPermissions: g.column_permissions || {}, canEdit: g.can_edit, canReceipt: g.can_receipt, canAssignReminder: g.can_assign_reminder, canDelete: g.can_delete, canCreateQuote: g.can_create_quote })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/users', authenticate, adminOnly, async (req, res) => {
  try {
    const { username, password, fullName, role, group, columnPermissions, canEdit, canReceipt, canAssignReminder, canDelete, canCreateQuote } = req.body
    const hash = await bcrypt.hash(password.toLowerCase(), 10)
    const { data, error } = await supabase.from('users').insert({ username: username.toLowerCase(), password: hash, full_name: fullName, role: role || 'user', group_name: group || '', column_permissions: columnPermissions || {}, can_edit: canEdit || false, can_receipt: canReceipt || false, can_assign_reminder: canAssignReminder || false, can_delete: canDelete || false, can_create_quote: canCreateQuote || false }).select()
    if (error) return res.status(400).json({ error: error.message })
    res.json(data[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/users/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { fullName, role, group, columnPermissions, canEdit, canReceipt, canAssignReminder, canDelete, canCreateQuote } = req.body
    const { error } = await supabase.from('users').update({ full_name: fullName, role, group_name: group || '', column_permissions: columnPermissions || {}, can_edit: canEdit || false, can_receipt: canReceipt || false, can_assign_reminder: canAssignReminder || false, can_delete: canDelete || false, can_create_quote: canCreateQuote || false }).eq('id', req.params.id)
    if (error) return res.status(400).json({ error: error.message })
    res.json({ message: 'Updated' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/users/groups', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, columnPermissions, canEdit, canReceipt, canAssignReminder, canDelete, canCreateQuote } = req.body
    const { data, error } = await supabase.from('groups').insert({ name, column_permissions: columnPermissions || {}, can_edit: canEdit || false, can_receipt: canReceipt || false, can_assign_reminder: canAssignReminder || false, can_delete: canDelete || false, can_create_quote: canCreateQuote || false }).select()
    if (error) return res.status(400).json({ error: error.message })
    res.json(data[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/users/groups/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, columnPermissions, canEdit, canReceipt, canAssignReminder, canDelete, canCreateQuote } = req.body
    const { error } = await supabase.from('groups').update({ name, column_permissions: columnPermissions || {}, can_edit: canEdit || false, can_receipt: canReceipt || false, can_assign_reminder: canAssignReminder || false, can_delete: canDelete || false, can_create_quote: canCreateQuote || false }).eq('id', req.params.id)
    if (error) return res.status(400).json({ error: error.message })
    res.json({ message: 'Updated' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ORDERS
app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const { data } = await supabase.from('orders').select('*').order('date', { ascending: false }).order('id', { ascending: false })
    res.json((data || []).map(mapOrder))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/orders', authenticate, async (req, res) => {
  try {
    const o = req.body
    const { data, error } = await supabase.from('orders').insert({
      order_no: o.orderNo, date: o.date, client_name: o.clientName, description: o.description,
      total_value: o.totalValue, received_amount: o.receivedAmount || 0, balance: o.balance || 0,
      status: o.status || 'PENDING', delivery_date: o.deliveryDate || '',
      photography: o.photography || '', photography_remarks: o.photographyRemarks || '',
      site_video: o.siteVideo || '', site_video_remarks: o.siteVideoRemarks || '',
      review: o.review || '', review_remarks: o.reviewRemarks || '',
      rejection_remark: o.rejectionRemark || '', created_by: req.user.username
    }).select()
    if (error) return res.status(400).json({ error: error.message })
    res.json(mapOrder(data[0]))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/orders/:id', authenticate, async (req, res) => {
  try {
    const o = req.body
    const update = {}
    if (o.orderNo !== undefined) update.order_no = o.orderNo
    if (o.date !== undefined) update.date = o.date
    if (o.clientName !== undefined) update.client_name = o.clientName
    if (o.description !== undefined) update.description = o.description
    if (o.totalValue !== undefined) update.total_value = o.totalValue
    if (o.receivedAmount !== undefined) update.received_amount = o.receivedAmount
    if (o.balance !== undefined) update.balance = o.balance
    if (o.status !== undefined) update.status = o.status
    if (o.deliveryDate !== undefined) update.delivery_date = o.deliveryDate
    if (o.photography !== undefined) update.photography = o.photography
    if (o.photographyRemarks !== undefined) update.photography_remarks = o.photographyRemarks
    if (o.siteVideo !== undefined) update.site_video = o.siteVideo
    if (o.siteVideoRemarks !== undefined) update.site_video_remarks = o.siteVideoRemarks
    if (o.review !== undefined) update.review = o.review
    if (o.reviewRemarks !== undefined) update.review_remarks = o.reviewRemarks
    if (o.rejectionRemark !== undefined) update.rejection_remark = o.rejectionRemark
    const { error } = await supabase.from('orders').update(update).eq('id', req.params.id)
    if (error) return res.status(400).json({ error: error.message })
    res.json({ message: 'Updated' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/orders/:id', authenticate, async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single()
    if (order) {
      await supabase.from('deleted_orders').insert({ ...order, deleted_by: req.user.username, deleted_at: new Date().toISOString() })
      await supabase.from('orders').delete().eq('id', req.params.id)
    }
    res.json({ message: 'Deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/orders/deleted/all', authenticate, async (req, res) => {
  try {
    const { data } = await supabase.from('deleted_orders').select('*').order('deleted_at', { ascending: false })
    res.json((data || []).map(mapOrder))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Payments
app.get('/api/orders/:id/payments', authenticate, async (req, res) => {
  try {
    const { data } = await supabase.from('payments').select('*').eq('order_id', req.params.id).order('date')
    res.json(data || [])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/orders/:id/payments', authenticate, async (req, res) => {
  try {
    const { date, mode, amount, remarks } = req.body
    const { data, error } = await supabase.from('payments').insert({ order_id: parseInt(req.params.id), date, mode, amount, remarks, created_by: req.user.username }).select()
    if (error) return res.status(400).json({ error: error.message })
    const { data: payments } = await supabase.from('payments').select('amount').eq('order_id', req.params.id)
    const totalReceived = (payments || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
    const { data: ord } = await supabase.from('orders').select('total_value').eq('id', req.params.id).single()
    const totalVal = parseFloat(ord?.total_value) || 0
    await supabase.from('orders').update({ received_amount: totalReceived, balance: totalVal - totalReceived }).eq('id', req.params.id)
    res.json(data[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/orders/:id/payments/:paymentId', authenticate, async (req, res) => {
  try {
    await supabase.from('payments').delete().eq('id', req.params.paymentId)
    const { data: payments } = await supabase.from('payments').select('amount').eq('order_id', req.params.id)
    const totalReceived = (payments || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
    const { data: ord } = await supabase.from('orders').select('total_value').eq('id', req.params.id).single()
    const totalVal = parseFloat(ord?.total_value) || 0
    await supabase.from('orders').update({ received_amount: totalReceived, balance: totalVal - totalReceived }).eq('id', req.params.id)
    res.json({ message: 'Deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Reminders
app.get('/api/orders/reminders/due', authenticate, async (req, res) => {
  try {
    const { data } = await supabase.from('reminders').select('*')
    const now = new Date()
    const due = (data || []).filter(r => {
      if (r.visible_to && !r.visible_to.includes(req.user.username)) return false
      return new Date(r.date.split('/').reverse().join('-')) <= now
    })
    res.json(due)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/orders/:id/reminders', authenticate, async (req, res) => {
  try {
    const { description, date, visibleTo } = req.body
    const { data, error } = await supabase.from('reminders').insert({ order_id: parseInt(req.params.id), description, date, visible_to: visibleTo || [], created_by: req.user.username }).select()
    if (error) return res.status(400).json({ error: error.message })
    res.json(data[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/orders/reminders/:id', authenticate, async (req, res) => {
  try {
    await supabase.from('reminders').delete().eq('id', req.params.id)
    res.json({ message: 'Deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Paper requests
app.get('/api/orders/paper-requests/all', authenticate, async (req, res) => {
  try {
    const { data } = await supabase.from('paper_requests').select('*').order('created_at', { ascending: false })
    res.json(data || [])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/orders/paper-requests/my', authenticate, async (req, res) => {
  try {
    const { data } = await supabase.from('paper_requests').select('*').eq('issue_to', req.user.username).in('status', ['PENDING', 'REROUTE'])
    res.json(data || [])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/orders/paper-requests', authenticate, async (req, res) => {
  try {
    const { orderNos, issueTo } = req.body
    const { data, error } = await supabase.from('paper_requests').insert({ order_nos: orderNos, issue_to: issueTo, requested_by: req.user.username, status: 'PENDING', reroute_count: 0 }).select()
    if (error) return res.status(400).json({ error: error.message })
    res.json(data[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/orders/paper-requests/:id', authenticate, async (req, res) => {
  try {
    const { status, issueTo, rejectionRemark } = req.body
    const update = { status }
    if (issueTo) update.issue_to = issueTo
    if (rejectionRemark) update.rejection_remark = rejectionRemark
    if (status === 'REROUTE') {
      const { data: pr } = await supabase.from('paper_requests').select('reroute_count').eq('id', req.params.id).single()
      const count = (pr?.reroute_count || 0) + 1
      update.reroute_count = count
      if (count > 2) update.status = 'ISSUE'
    }
    if (status === 'ACCEPTED') {
      update.accepted_by = req.user.username
      update.accepted_at = new Date().toISOString()
    }
    const { error } = await supabase.from('paper_requests').update(update).eq('id', req.params.id)
    if (error) return res.status(400).json({ error: error.message })
    res.json({ message: 'Updated' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Return requests
app.get('/api/orders/return-requests/all', authenticate, async (req, res) => {
  try {
    const { data } = await supabase.from('return_requests').select('*').order('created_at', { ascending: false })
    res.json(data || [])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/orders/return-requests/my', authenticate, async (req, res) => {
  try {
    const { data } = await supabase.from('return_requests').select('*').eq('return_to', req.user.username).eq('status', 'PENDING')
    res.json(data || [])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/orders/return-requests', authenticate, async (req, res) => {
  try {
    const { orderNos, returnTo } = req.body
    const { data, error } = await supabase.from('return_requests').insert({ order_nos: orderNos, return_to: returnTo, requested_by: req.user.username, status: 'PENDING' }).select()
    if (error) return res.status(400).json({ error: error.message })
    res.json(data[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/orders/return-requests/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body
    const update = { status }
    if (status === 'ACCEPTED') {
      update.accepted_by = req.user.username
      update.accepted_at = new Date().toISOString()
    }
    const { error } = await supabase.from('return_requests').update(update).eq('id', req.params.id)
    if (error) return res.status(400).json({ error: error.message })
    res.json({ message: 'Updated' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Bulk
app.post('/api/orders/bulk', authenticate, async (req, res) => {
  try {
    const orders = req.body.orders || []
    const rows = orders.map(o => ({
      order_no: o.orderNo, date: o.date, client_name: o.clientName, description: o.description,
      total_value: o.totalValue || 0, received_amount: o.receivedAmount || 0, balance: o.balance || 0,
      status: o.status || 'PENDING', delivery_date: o.deliveryDate || '',
      photography: o.photography || '', photography_remarks: o.photographyRemarks || '',
      site_video: o.siteVideo || '', site_video_remarks: o.siteVideoRemarks || '',
      review: o.review || '', review_remarks: o.reviewRemarks || '',
      rejection_remark: o.rejectionRemark || '', created_by: req.user.username
    }))
    const { error } = await supabase.from('orders').insert(rows)
    if (error) return res.status(400).json({ error: error.message })
    res.json({ message: `${rows.length} orders imported` })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/orders/all', authenticate, adminOnly, async (req, res) => {
  try {
    await supabase.from('orders').delete().neq('id', 0)
    res.json({ message: 'All orders deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default app
