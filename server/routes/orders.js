import { Router } from 'express'
import { getDb, save } from '../db.js'
import { authenticate, adminOnly } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// Get all orders
router.get('/', (req, res) => {
  const db = getDb()
  const orders = [...db.orders].sort((a, b) => {
    // Parse DD/MM/YYYY to comparable format
    const parseDate = (d) => {
      if (!d) return '0'
      const parts = String(d).split('/')
      if (parts.length === 3) return `${parts[2]}${parts[1].padStart(2,'0')}${parts[0].padStart(2,'0')}`
      return String(d)
    }
    const dateCompare = parseDate(b.date).localeCompare(parseDate(a.date))
    if (dateCompare !== 0) return dateCompare
    // Then by order number descending
    const getNum = (orderNo) => { const m = String(orderNo || '').match(/\/(\d+)/g); return m ? parseInt(m[m.length-1].replace('/','')) : 0 }
    return getNum(b.orderNo) - getNum(a.orderNo)
  })
  res.json(orders)
})

// Search orders
router.get('/search', (req, res) => {
  const { q } = req.query
  const db = getDb()
  const term = (q || '').toLowerCase()
  const orders = db.orders.filter(o =>
    (o.orderNo || '').toLowerCase().includes(term) ||
    (o.client || '').toLowerCase().includes(term) ||
    (o.gst || '').toLowerCase().includes(term) ||
    (o.poNo || '').toLowerCase().includes(term) ||
    (o.customerName || '').toLowerCase().includes(term)
  )
  res.json(orders)
})

// Export all orders (admin only)
router.get('/export/all', adminOnly, (req, res) => {
  const db = getDb()
  res.json(db.orders)
})

// Get all active reminders (due today or earlier) - must be before /:id
router.get('/reminders/due', (req, res) => {
  const db = getDb()
  if (!db.reminders) return res.json([])
  const today = new Date().toISOString().split('T')[0]
  const username = req.user.username
  const isAdmin = req.user.role === 'admin'

  const due = db.reminders.filter(r => {
    // Must be due (date <= today)
    if (r.date > today) return false
    // Show to: 1) admin always, 2) creator, 3) users in visibleTo list
    if (isAdmin) return true
    if (r.createdBy === username) return true
    if (r.visibleTo && r.visibleTo.includes(username)) return true
    return false
  })
  res.json(due)
})

// Delete/dismiss a reminder
router.delete('/reminders/:reminderId', (req, res) => {
  const db = getDb()
  if (!db.reminders) return res.json({ message: 'No reminders' })
  const id = parseInt(req.params.reminderId)
  db.reminders = db.reminders.filter(r => r.id !== id)
  save()
  res.json({ message: 'Reminder dismissed' })
})

// Get all deleted/completed orders (visible to all)
router.get('/deleted/all', (req, res) => {
  const db = getDb()
  res.json(db.deletedOrders || [])
})

// Permanently delete an order from deleted list (admin only)
router.delete('/deleted/:id', adminOnly, (req, res) => {
  const db = getDb()
  if (!db.deletedOrders) return res.status(404).json({ error: 'No deleted orders' })
  const id = parseInt(req.params.id)
  db.deletedOrders = db.deletedOrders.filter(o => o.id !== id)
  save()
  res.json({ message: 'Order permanently deleted' })
})

// Restore an order from deleted list back to active (admin only)
router.post('/deleted/:id/restore', adminOnly, (req, res) => {
  const db = getDb()
  if (!db.deletedOrders) return res.status(404).json({ error: 'No deleted orders' })
  const id = parseInt(req.params.id)
  const order = db.deletedOrders.find(o => o.id === id)
  if (!order) return res.status(404).json({ error: 'Order not found in deleted list' })

  // Remove deletedBy and deletedAt fields, move back to active
  const { deletedBy, deletedAt, ...restoredOrder } = order
  db.orders.push(restoredOrder)
  db.deletedOrders = db.deletedOrders.filter(o => o.id !== id)
  save()
  res.json({ message: 'Order restored successfully' })
})

// Get single order with payments
router.get('/:id', (req, res) => {
  const db = getDb()
  const order = db.orders.find(o => o.id === parseInt(req.params.id))
  if (!order) return res.status(404).json({ error: 'Order not found' })
  const payments = db.payments.filter(p => p.orderId === order.id)
  res.json({ ...order, payments })
})

// Add new order
router.post('/', (req, res) => {
  const db = getDb()
  const o = req.body
  if (o.orderNo) {
    const existing = db.orders.find(x => x.orderNo === o.orderNo)
    if (existing) {
      return res.status(400).json({ error: 'Order number already exists' })
    }
  }
  const newOrder = { id: db.nextOrderId++, ...o, totalAmount: o.totalAmount || 0, receivedAmount: o.receivedAmount || 0, balance: o.balance || 0, percentReceived: o.percentReceived || 0 }
  db.orders.push(newOrder)
  save()
  res.json(newOrder)
})

// Bulk import orders (admin only)
router.post('/import', adminOnly, (req, res) => {
  const db = getDb()
  const { orders, overwrite } = req.body
  const duplicates = []
  const added = []

  for (const o of orders) {
    const existing = db.orders.find(x => x.orderNo === o.orderNo)
    if (existing) {
      if (overwrite) {
        Object.assign(existing, o)
        added.push(o.orderNo)
      } else {
        duplicates.push(o.orderNo)
      }
    } else {
      db.orders.push({ id: db.nextOrderId++, ...o })
      added.push(o.orderNo)
    }
  }
  save()
  res.json({ added: added.length, duplicates })
})

// Update order
router.put('/:id', (req, res) => {
  const db = getDb()
  const id = parseInt(req.params.id)
  const idx = db.orders.findIndex(o => o.id === id)
  if (idx === -1) return res.status(404).json({ error: 'Order not found' })
  db.orders[idx] = { ...db.orders[idx], ...req.body, id }
  save()
  res.json({ message: 'Order updated' })
})



// Delete order (move to deleted list) - only users with canDelete right
router.delete('/:id', (req, res) => {
  const db = getDb()
  const isAdmin = req.user.role === 'admin'
  const userRecord = db.users.find(u => u.id === req.user.id)
  const canDelete = isAdmin || (userRecord && userRecord.canDelete)
  if (!canDelete) {
    return res.status(403).json({ error: 'You do not have permission to delete orders' })
  }
  const id = parseInt(req.params.id)
  const order = db.orders.find(o => o.id === id)
  if (!order) return res.status(404).json({ error: 'Order not found' })

  // Move to deletedOrders
  if (!db.deletedOrders) db.deletedOrders = []
  const deletedOrder = { ...order, deletedBy: req.user.username, deletedAt: new Date().toISOString() }
  db.deletedOrders.push(deletedOrder)

  // Remove from active
  db.orders = db.orders.filter(o => o.id !== id)
  save()
  res.json({ message: 'Order moved to deleted list' })
})

// Add payment to order
router.post('/:id/payments', (req, res) => {
  const db = getDb()
  const orderId = parseInt(req.params.id)
  const order = db.orders.find(o => o.id === orderId)
  if (!order) return res.status(404).json({ error: 'Order not found' })

  const { date, mode, amount, remarks } = req.body
  const payment = { id: db.nextPaymentId++, orderId, date, mode, amount: parseFloat(amount), remarks, createdAt: new Date().toISOString() }
  db.payments.push(payment)

  // Update order totals
  const totalReceived = db.payments.filter(p => p.orderId === orderId).reduce((s, p) => s + (p.amount || 0), 0)
  order.receivedAmount = totalReceived
  order.balance = (order.totalAmount || 0) - totalReceived
  order.percentReceived = order.totalAmount ? parseFloat(((totalReceived / order.totalAmount) * 100).toFixed(2)) : 0

  save()
  res.json(payment)
})

// Get payments for an order
router.get('/:id/payments', (req, res) => {
  const db = getDb()
  const orderId = parseInt(req.params.id)
  const payments = db.payments.filter(p => p.orderId === orderId).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  res.json(payments)
})

// Delete a specific payment (admin only)
router.delete('/:id/payments/:paymentId', adminOnly, (req, res) => {
  const db = getDb()
  const orderId = parseInt(req.params.id)
  const paymentId = parseInt(req.params.paymentId)
  const order = db.orders.find(o => o.id === orderId)
  if (!order) return res.status(404).json({ error: 'Order not found' })

  db.payments = db.payments.filter(p => p.id !== paymentId)

  // Recalculate order totals
  const totalReceived = db.payments.filter(p => p.orderId === orderId).reduce((s, p) => s + (p.amount || 0), 0)
  order.receivedAmount = totalReceived
  order.balance = (order.totalAmount || 0) - totalReceived
  order.percentReceived = order.totalAmount ? parseFloat(((totalReceived / order.totalAmount) * 100).toFixed(2)) : 0

  save()
  res.json({ message: 'Payment deleted' })
})

// --- Reminders ---

// Add reminder for an order
router.post('/:id/reminders', (req, res) => {
  const db = getDb()
  if (!db.reminders) { db.reminders = []; db.nextReminderId = 1 }
  const orderId = parseInt(req.params.id)
  const order = db.orders.find(o => o.id === orderId)
  if (!order) return res.status(404).json({ error: 'Order not found' })

  const { description, date, visibleTo } = req.body
  const reminder = {
    id: db.nextReminderId++,
    orderId,
    orderNo: order.orderNo,
    client: order.client,
    description,
    date,
    visibleTo: visibleTo || [],
    createdBy: req.user.username,
    createdAt: new Date().toISOString()
  }
  db.reminders.push(reminder)
  save()
  res.json(reminder)
})

// Get reminders for an order
router.get('/:id/reminders', (req, res) => {
  const db = getDb()
  if (!db.reminders) return res.json([])
  const orderId = parseInt(req.params.id)
  const reminders = db.reminders.filter(r => r.orderId === orderId)
  res.json(reminders)
})

// --- Paper Issue Requests ---

// Create a paper issue request
router.post('/paper-requests', (req, res) => {
  const db = getDb()
  if (!db.paperRequests) { db.paperRequests = []; db.nextPaperRequestId = 1 }
  const { orderNo, issueTo } = req.body
  if (!orderNo || !issueTo) return res.status(400).json({ error: 'Order No and Issue To are required' })
  const order = db.orders.find(o => o.orderNo === orderNo)
  const request = {
    id: db.nextPaperRequestId++,
    orderNo,
    client: order ? order.client : '',
    requestedBy: req.user.username,
    issueTo,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  }
  db.paperRequests.push(request)
  save()
  res.json(request)
})

// Get all paper issue requests
router.get('/paper-requests/all', (req, res) => {
  const db = getDb()
  res.json((db.paperRequests || []).sort((a, b) => b.id - a.id))
})

// Get pending requests for current user (requests issued TO them)
router.get('/paper-requests/my', (req, res) => {
  const db = getDb()
  const requests = (db.paperRequests || []).filter(r => r.issueTo === req.user.username && r.status === 'PENDING')
  res.json(requests)
})

// Accept a paper request
router.post('/paper-requests/:id/accept', (req, res) => {
  const db = getDb()
  const id = parseInt(req.params.id)
  const request = (db.paperRequests || []).find(r => r.id === id)
  if (!request) return res.status(404).json({ error: 'Request not found' })
  request.status = 'ACCEPTED'
  request.acceptedBy = req.user.username
  request.acceptedAt = new Date().toISOString()

  // Update the order's orRecvd to PENDING (paper issued but not returned)
  const order = db.orders.find(o => o.orderNo === request.orderNo)
  if (order) {
    order.orRecvd = `ISSUED TO ${request.requestedBy}`
  }
  save()
  res.json(request)
})

// Reject a paper request
router.post('/paper-requests/:id/reject', (req, res) => {
  const db = getDb()
  const id = parseInt(req.params.id)
  const { remarks } = req.body
  const request = (db.paperRequests || []).find(r => r.id === id)
  if (!request) return res.status(404).json({ error: 'Request not found' })
  request.status = 'REJECTED'
  request.rejectedBy = req.user.username
  request.rejectedAt = new Date().toISOString()
  request.rejectRemarks = remarks || ''
  save()
  res.json(request)
})

// Reroute a paper request to another user
router.post('/paper-requests/:id/reroute', (req, res) => {
  const db = getDb()
  const id = parseInt(req.params.id)
  const { rerouteTo } = req.body
  if (!rerouteTo) return res.status(400).json({ error: 'Reroute user required' })
  const request = (db.paperRequests || []).find(r => r.id === id)
  if (!request) return res.status(404).json({ error: 'Request not found' })

  // Count how many times this orderNo has been rerouted
  const rerouteCount = (db.paperRequests || []).filter(r => r.orderNo === request.orderNo && r.status && r.status.startsWith('REROUTED')).length
  if (rerouteCount >= 2) {
    // Mark as ISSUE - too many reroutes
    request.status = 'ISSUE'
    save()
    return res.json(request)
  }

  request.status = `REROUTED TO ${rerouteTo.toUpperCase()}`
  request.reroutedBy = req.user.username
  request.reroutedAt = new Date().toISOString()
  // Create new request for the rerouted user
  const newRequest = {
    id: db.nextPaperRequestId++,
    orderNo: request.orderNo,
    client: request.client,
    requestedBy: request.requestedBy,
    issueTo: rerouteTo,
    status: 'PENDING',
    reroutedFrom: req.user.username,
    createdAt: new Date().toISOString()
  }
  db.paperRequests.push(newRequest)
  save()
  res.json(newRequest)
})

// --- Paper Return Requests ---

// Create a paper return request
router.post('/return-requests', (req, res) => {
  const db = getDb()
  if (!db.returnRequests) { db.returnRequests = []; db.nextReturnRequestId = 1 }
  const { orderNo, returnTo } = req.body
  if (!orderNo || !returnTo) return res.status(400).json({ error: 'Order No and Return To are required' })
  const order = db.orders.find(o => o.orderNo === orderNo)
  const request = {
    id: db.nextReturnRequestId++,
    orderNo,
    client: order ? order.client : '',
    requestedBy: req.user.username,
    returnTo,
    status: 'PENDING',
    createdAt: new Date().toISOString()
  }
  db.returnRequests.push(request)
  save()
  res.json(request)
})

// Get all return requests
router.get('/return-requests/all', (req, res) => {
  const db = getDb()
  res.json((db.returnRequests || []).sort((a, b) => b.id - a.id))
})

// Get pending return requests for current user
router.get('/return-requests/my', (req, res) => {
  const db = getDb()
  const requests = (db.returnRequests || []).filter(r => r.returnTo === req.user.username && r.status === 'PENDING')
  res.json(requests)
})

// Accept a return request
router.post('/return-requests/:id/accept', (req, res) => {
  const db = getDb()
  const id = parseInt(req.params.id)
  const request = (db.returnRequests || []).find(r => r.id === id)
  if (!request) return res.status(404).json({ error: 'Request not found' })
  request.status = 'ACCEPTED'
  request.acceptedBy = req.user.username
  request.acceptedAt = new Date().toISOString()
  // Update order orRecvd to Paper Received
  const order = db.orders.find(o => o.orderNo === request.orderNo)
  if (order) { order.orRecvd = 'Paper Received' }
  save()
  res.json(request)
})

// Reject a return request
router.post('/return-requests/:id/reject', (req, res) => {
  const db = getDb()
  const id = parseInt(req.params.id)
  const { remarks } = req.body
  const request = (db.returnRequests || []).find(r => r.id === id)
  if (!request) return res.status(404).json({ error: 'Request not found' })
  request.status = 'REJECTED'
  request.rejectedBy = req.user.username
  request.rejectedAt = new Date().toISOString()
  request.rejectRemarks = remarks || ''
  save()
  res.json(request)
})

export default router
