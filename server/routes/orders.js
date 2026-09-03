const { Router } = require('express')
const { supabase } = require('../db.js')
const { authenticate, adminOnly } = require('../middleware/auth.js')

const router = Router()
router.use(authenticate)

// Get all orders
router.get('/', async (req, res) => {
  const { data } = await supabase.from('orders').select('*')
  const mapped = (data || []).map(o => mapOrder(o))
  // Sort by financial year descending, then by order number descending within each FY
  // Format: OR/2026-27/240 NI -> FY start year = 2026, order num = 240
  const getOrderParts = (orderNo) => {
    if (!orderNo) return { fy: 0, num: 0 }
    const parts = orderNo.split('/')
    // parts: ['OR', '2026-27', '245 NI'] or similar
    let fy = 0
    let num = 0
    if (parts.length >= 3) {
      const fyPart = parts[1] // '2026-27'
      const fyDigits = fyPart.match(/^(\d{4})/)
      if (fyDigits) fy = parseInt(fyDigits[1])
      const numPart = parts[2] // '245 NI'
      const numDigits = numPart.match(/^(\d+)/)
      if (numDigits) num = parseInt(numDigits[1])
    }
    return { fy, num }
  }
  mapped.sort((a, b) => {
    const pa = getOrderParts(a.orderNo)
    const pb = getOrderParts(b.orderNo)
    if (pb.fy !== pa.fy) return pb.fy - pa.fy
    return pb.num - pa.num
  })
  res.json(mapped)
})

// Search orders
router.get('/search', async (req, res) => {
  const { q } = req.query
  const { data } = await supabase.from('orders').select('*').or(`order_no.ilike.%${q}%,client.ilike.%${q}%,gst.ilike.%${q}%,po_no.ilike.%${q}%,customer_name.ilike.%${q}%`)
  res.json((data || []).map(o => mapOrder(o)))
})

// Export all orders
router.get('/export/all', adminOnly, async (req, res) => {
  const { data } = await supabase.from('orders').select('*').order('date', { ascending: false })
  res.json((data || []).map(o => mapOrder(o)))
})

// Get all payments (for Payment Update report)
router.get('/payments/all', async (req, res) => {
  try {
    const { data: payments } = await supabase.from('payments').select('*').order('date', { ascending: false })
    const { data: allOrders } = await supabase.from('orders').select('id, order_no, client, date, total_amount, received_amount, balance')
    const orderMap = {}
    ;(allOrders || []).forEach(o => { orderMap[o.id] = o })
    const result = (payments || []).map(p => {
      const order = orderMap[p.order_id] || {}
      return { id: p.id, orderId: p.order_id, paymentDate: p.date, amount: p.amount, mode: p.mode, remarks: p.remarks, orderNo: order.order_no || '', client: order.client || '', orderDate: order.date || '', totalAmount: order.total_amount || 0, receivedAmount: order.received_amount || 0, balance: order.balance || 0 }
    })
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Get deleted orders - sorted by FY descending, then order number descending
router.get('/deleted/all', async (req, res) => {
  const { data } = await supabase.from('deleted_orders').select('*')
  const getOrderParts = (orderNo) => {
    if (!orderNo) return { fy: 0, num: 0 }
    const parts = orderNo.split('/')
    let fy = 0
    let num = 0
    if (parts.length >= 3) {
      const fyPart = parts[1]
      const fyDigits = fyPart.match(/^(\d{4})/)
      if (fyDigits) fy = parseInt(fyDigits[1])
      const numPart = parts[2]
      const numDigits = numPart.match(/^(\d+)/)
      if (numDigits) num = parseInt(numDigits[1])
    }
    return { fy, num }
  }
  const mapped = (data || []).map(d => ({ ...d.data, id: d.original_id, deletedBy: d.deleted_by, deletedAt: d.deleted_at }))
  mapped.sort((a, b) => {
    const pa = getOrderParts(a.orderNo)
    const pb = getOrderParts(b.orderNo)
    if (pb.fy !== pa.fy) return pb.fy - pa.fy
    return pb.num - pa.num
  })
  res.json(mapped)
})

// Permanently delete from deleted
router.delete('/deleted/:id', adminOnly, async (req, res) => {
  await supabase.from('deleted_orders').delete().eq('original_id', parseInt(req.params.id))
  res.json({ message: 'Permanently deleted' })
})

// Restore from deleted
router.post('/deleted/:id/restore', adminOnly, async (req, res) => {
  const { data: dels } = await supabase.from('deleted_orders').select('*').eq('original_id', parseInt(req.params.id))
  if (!dels?.length) return res.status(404).json({ error: 'Not found' })
  const orderData = dels[0].data
  const { error } = await supabase.from('orders').insert(snakeOrder(orderData))
  if (error) return res.status(400).json({ error: error.message })
  await supabase.from('deleted_orders').delete().eq('original_id', parseInt(req.params.id))
  res.json({ message: 'Restored' })
})

// Update deleted order data
router.put('/deleted/:id/update', adminOnly, async (req, res) => {
  const { data: dels } = await supabase.from('deleted_orders').select('*').eq('original_id', parseInt(req.params.id))
  if (!dels?.length) return res.status(404).json({ error: 'Not found' })
  const updatedData = { ...dels[0].data, ...req.body }
  Object.keys(updatedData).forEach(key => { if (typeof updatedData[key] === 'string') updatedData[key] = updatedData[key].toUpperCase ? updatedData[key] : updatedData[key] })
  const { error } = await supabase.from('deleted_orders').update({ data: updatedData }).eq('original_id', parseInt(req.params.id))
  if (error) return res.status(400).json({ error: error.message })
  res.json({ message: 'Updated' })
})

// Reminders
router.get('/reminders/due', async (req, res) => {
  const { data } = await supabase.from('reminders').select('*')
  const username = req.user.username
  const isAdmin = req.user.role === 'admin'
  const filtered = (data || []).filter(r => {
    if (r.responded_by) return false
    if (isAdmin) return true
    if (r.created_by === username) return true
    if (r.visible_to && r.visible_to.includes(username)) return true
    return false
  })
  res.json(filtered.map(r => ({ ...r, orderNo: r.order_no, createdBy: r.created_by, orderId: r.order_id, visibleTo: r.visible_to })))
})

router.delete('/reminders/:id', async (req, res) => {
  await supabase.from('reminders').delete().eq('id', parseInt(req.params.id))
  res.json({ message: 'Dismissed' })
})

router.put('/reminders/:id/respond', async (req, res) => {
  const { responseText } = req.body
  if (!responseText || responseText.trim().length < 10) return res.status(400).json({ error: 'Response must be at least 10 characters' })
  if (responseText.trim().length > 250) return res.status(400).json({ error: 'Response must not exceed 250 characters' })
  // Append to existing response text
  const { data: existing } = await supabase.from('reminders').select('response_text').eq('id', parseInt(req.params.id))
  const prev = existing?.[0]?.response_text || ''
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const newResponse = prev ? `${prev} | ${dateStr}: ${responseText.toUpperCase()}` : `${dateStr}: ${responseText.toUpperCase()}`
  await supabase.from('reminders').update({ response_text: newResponse, response_date: new Date().toISOString(), responded_by: req.user.username }).eq('id', parseInt(req.params.id))
  res.json({ message: 'Response saved' })
})

router.put('/reminders/:id/reassign', async (req, res) => {
  const { reason } = req.body
  const { data: existing } = await supabase.from('reminders').select('response_text').eq('id', parseInt(req.params.id))
  const prev = existing?.[0]?.response_text || ''
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const reasonText = reason ? ` - ${reason}` : ''
  const appendText = `${prev ? prev + ' | ' : ''}${dateStr}: REASSIGNED BY ${req.user.username.toUpperCase()}${reasonText}`
  await supabase.from('reminders').update({ response_text: appendText, response_date: null, responded_by: null, date: new Date().toISOString().split('T')[0] }).eq('id', parseInt(req.params.id))
  res.json({ message: 'Reminder reassigned' })
})

router.get('/reminders/all', async (req, res) => {
  const { data } = await supabase.from('reminders').select('*').order('created_at', { ascending: false })
  const isAdmin = req.user.role === 'admin'
  const username = req.user.username
  const filtered = (data || []).filter(r => {
    if (isAdmin) return true
    return r.created_by === username
  })
  res.json(filtered.map(r => ({ ...r, orderNo: r.order_no, createdBy: r.created_by, orderId: r.order_id, visibleTo: r.visible_to, assignedTo: r.assigned_to, responseText: r.response_text, responseDate: r.response_date, respondedBy: r.responded_by })))
})

// Paper requests
router.get('/paper-requests/all', async (req, res) => {
  const { data } = await supabase.from('paper_requests').select('*').order('id', { ascending: false })
  res.json((data || []).map(r => mapPaperReq(r)))
})

router.get('/paper-requests/my', async (req, res) => {
  const { data } = await supabase.from('paper_requests').select('*').eq('issue_to', req.user.username).eq('status', 'PENDING')
  res.json((data || []).map(r => mapPaperReq(r)))
})

router.post('/paper-requests', async (req, res) => {
  const { orderNo, issueTo } = req.body
  if (!orderNo || !issueTo) return res.status(400).json({ error: 'Order No and Issue To required' })
  // Check if this order already has a PENDING paper request
  const { data: pendingReqs } = await supabase.from('paper_requests').select('*').eq('order_no', orderNo).eq('status', 'PENDING')
  if (pendingReqs && pendingReqs.length > 0) {
    const pendingWith = pendingReqs[0].issue_to
    return res.status(400).json({ error: `Order ${orderNo} is already pending with ${pendingWith.toUpperCase()}` })
  }
  // Check if order is already issued (ACCEPTED) and not yet returned
  const { data: acceptedReqs } = await supabase.from('paper_requests').select('*').eq('order_no', orderNo).eq('status', 'ACCEPTED')
  if (acceptedReqs && acceptedReqs.length > 0) {
    const { data: returnAccepted } = await supabase.from('return_requests').select('*').eq('order_no', orderNo).eq('status', 'ACCEPTED')
    if (!returnAccepted || returnAccepted.length === 0) {
      const issuedTo = acceptedReqs[0].issue_to
      return res.status(400).json({ error: `Order ${orderNo} is already issued to ${issuedTo.toUpperCase()} (not returned yet)`, issuedTo: issuedTo, canReissue: true })
    }
    // Return ho chuka hai — purane ACCEPTED records ko RETURNED mark karo
    await supabase.from('paper_requests').update({ status: 'RETURNED' }).eq('order_no', orderNo).eq('status', 'ACCEPTED')
  }
  const { data: orders } = await supabase.from('orders').select('client').eq('order_no', orderNo)
  const client = orders?.[0]?.client || ''
  const { data, error } = await supabase.from('paper_requests').insert({ order_no: orderNo, client, requested_by: req.user.username, issue_to: issueTo, status: 'PENDING' }).select()
  if (error) return res.status(400).json({ error: error.message })
  res.json(mapPaperReq(data[0]))
})

router.post('/paper-requests/:id/accept', async (req, res) => {
  const { data: reqs } = await supabase.from('paper_requests').select('*').eq('id', parseInt(req.params.id))
  if (!reqs?.length) return res.status(404).json({ error: 'Not found' })
  const request = reqs[0]
  // If this is a reissue request, update the old ACCEPTED entry and mark this as reissue
  if (request.reject_remarks === 'REISSUE') {
    // Mark old ACCEPTED request for this order as REISSUED
    await supabase.from('paper_requests').update({ status: `REISSUED TO ${request.requested_by.toUpperCase()}` }).eq('order_no', request.order_no).eq('status', 'ACCEPTED')
    // Mark this reissue request as ACCEPTED with reissue info
    await supabase.from('paper_requests').update({ status: 'ACCEPTED', accepted_by: req.user.username, accepted_at: new Date().toISOString(), reject_remarks: `REISSUE BY ${req.user.username.toUpperCase()}` }).eq('id', request.id)
  } else {
    await supabase.from('paper_requests').update({ status: 'ACCEPTED', accepted_by: req.user.username, accepted_at: new Date().toISOString() }).eq('id', request.id)
  }
  res.json({ message: 'Accepted' })
})

// Reissue request - when paper is already with someone, another user can request reissue
router.post('/paper-requests/reissue', async (req, res) => {
  const { orderNo } = req.body
  if (!orderNo) return res.status(400).json({ error: 'Order No required' })
  // Check reissue count - max 2
  const { data: allReqs } = await supabase.from('paper_requests').select('status').eq('order_no', orderNo)
  const reissueCount = (allReqs || []).filter(r => r.status && r.status.startsWith('REISSUED')).length
  if (reissueCount >= 2) return res.status(400).json({ error: 'Maximum 2 reissues reached. Please use Return Request.' })
  // Find who currently has the paper
  const { data: acceptedReqs } = await supabase.from('paper_requests').select('*').eq('order_no', orderNo).eq('status', 'ACCEPTED')
  if (!acceptedReqs || acceptedReqs.length === 0) return res.status(400).json({ error: 'No active issue found for this order' })
  const currentHolder = acceptedReqs[0].requested_by || acceptedReqs[0].issue_to
  // Create reissue request - sent to the current holder
  const { data: orders } = await supabase.from('orders').select('client').eq('order_no', orderNo)
  const client = orders?.[0]?.client || ''
  const { data, error } = await supabase.from('paper_requests').insert({ order_no: orderNo, client, requested_by: req.user.username, issue_to: currentHolder, status: 'PENDING', reject_remarks: 'REISSUE' }).select()
  if (error) return res.status(400).json({ error: error.message })
  res.json(mapPaperReq(data[0]))
})

router.post('/paper-requests/:id/reject', async (req, res) => {
  const { remarks } = req.body
  await supabase.from('paper_requests').update({ status: `REJECTED: ${remarks || ''}`, rejected_by: req.user.username, rejected_at: new Date().toISOString(), reject_remarks: remarks || '' }).eq('id', parseInt(req.params.id))
  res.json({ message: 'Rejected' })
})

router.put('/paper-requests/:id/change-user', async (req, res) => {
  const { issueTo } = req.body
  if (!issueTo) return res.status(400).json({ error: 'User required' })
  const { data: reqs } = await supabase.from('paper_requests').select('*').eq('id', parseInt(req.params.id))
  if (!reqs?.length) return res.status(404).json({ error: 'Not found' })
  if (reqs[0].requested_by !== req.user.username && req.user.role !== 'admin') return res.status(403).json({ error: 'Only requester can change' })
  if (reqs[0].status !== 'PENDING') return res.status(400).json({ error: 'Can only change before acceptance' })
  await supabase.from('paper_requests').update({ issue_to: issueTo }).eq('id', parseInt(req.params.id))
  res.json({ message: 'Updated' })
})

router.put('/return-requests/:id/change-user', async (req, res) => {
  const { returnTo } = req.body
  if (!returnTo) return res.status(400).json({ error: 'User required' })
  const { data: reqs } = await supabase.from('return_requests').select('*').eq('id', parseInt(req.params.id))
  if (!reqs?.length) return res.status(404).json({ error: 'Not found' })
  if (reqs[0].requested_by !== req.user.username && req.user.role !== 'admin') return res.status(403).json({ error: 'Only requester can change' })
  if (reqs[0].status !== 'PENDING') return res.status(400).json({ error: 'Can only change before acceptance' })
  await supabase.from('return_requests').update({ return_to: returnTo }).eq('id', parseInt(req.params.id))
  res.json({ message: 'Updated' })
})

router.post('/paper-requests/:id/reroute', async (req, res) => {
  const { rerouteTo } = req.body
  if (!rerouteTo) return res.status(400).json({ error: 'Reroute user required' })
  const { data: reqs } = await supabase.from('paper_requests').select('*').eq('id', parseInt(req.params.id))
  if (!reqs?.length) return res.status(404).json({ error: 'Not found' })
  const request = reqs[0]

  const { data: allReqs } = await supabase.from('paper_requests').select('status').eq('order_no', request.order_no)
  const rerouteCount = (allReqs || []).filter(r => r.status && r.status.startsWith('REROUTED')).length
  if (rerouteCount >= 2) {
    await supabase.from('paper_requests').update({ status: 'ISSUE' }).eq('id', request.id)
    return res.json({ status: 'ISSUE' })
  }

  await supabase.from('paper_requests').update({ status: `REROUTED TO ${rerouteTo.toUpperCase()}`, rerouted_by: req.user.username, rerouted_at: new Date().toISOString() }).eq('id', request.id)
  const { data: newReq } = await supabase.from('paper_requests').insert({ order_no: request.order_no, client: request.client, requested_by: request.requested_by, issue_to: rerouteTo, status: 'PENDING' }).select()
  res.json(mapPaperReq(newReq[0]))
})

// Delete paper request (admin only)
router.delete('/paper-requests/:id', adminOnly, async (req, res) => {
  await supabase.from('paper_requests').delete().eq('id', parseInt(req.params.id))
  res.json({ message: 'Deleted' })
})

// Return requests
router.get('/return-requests/all', async (req, res) => {
  const { data } = await supabase.from('return_requests').select('*').order('id', { ascending: false })
  res.json((data || []).map(r => ({ ...r, orderNo: r.order_no, requestedBy: r.requested_by, returnTo: r.return_to, acceptedBy: r.accepted_by, acceptedAt: r.accepted_at, rejectRemarks: r.reject_remarks })))
})

router.get('/return-requests/my', async (req, res) => {
  const { data } = await supabase.from('return_requests').select('*').eq('return_to', req.user.username).eq('status', 'PENDING')
  res.json((data || []).map(r => ({ ...r, orderNo: r.order_no, requestedBy: r.requested_by, returnTo: r.return_to })))
})

router.post('/return-requests', async (req, res) => {
  const { orderNo, returnTo } = req.body
  if (!orderNo || !returnTo) return res.status(400).json({ error: 'Required' })

  // Check: requester ke paas ye order ka paper hai ya nahi
  const { data: acceptedReqs } = await supabase
    .from('paper_requests').select('*')
    .eq('order_no', orderNo).eq('status', 'ACCEPTED')

  if (!acceptedReqs || acceptedReqs.length === 0) {
    return res.status(400).json({ error: `Order ${orderNo} is not currently issued to anyone` })
  }

  const holder = acceptedReqs[0].issue_to
  if (holder !== req.user.username) {
    return res.status(400).json({ error: `Order ${orderNo} paper is with ${holder.toUpperCase()}, only they can submit a return request` })
  }

  // Check: already pending return request nahi ho
  const { data: pendingReturn } = await supabase
    .from('return_requests').select('*')
    .eq('order_no', orderNo).eq('status', 'PENDING')
  if (pendingReturn && pendingReturn.length > 0) {
    return res.status(400).json({ error: `Return request for ${orderNo} is already pending` })
  }

  const { data: orders } = await supabase.from('orders').select('client').eq('order_no', orderNo)
  const { data } = await supabase.from('return_requests').insert({ order_no: orderNo, client: orders?.[0]?.client || '', requested_by: req.user.username, return_to: returnTo, status: 'PENDING' }).select()
  res.json(data[0])
})

router.post('/return-requests/:id/accept', async (req, res) => {
  const { data: reqs } = await supabase.from('return_requests').select('*').eq('id', parseInt(req.params.id))
  if (!reqs?.length) return res.status(404).json({ error: 'Not found' })
  await supabase.from('return_requests').update({ status: 'ACCEPTED', accepted_by: req.user.username, accepted_at: new Date().toISOString() }).eq('id', parseInt(req.params.id))
  // Paper wapas aa gaya — saare ACCEPTED paper_requests RETURNED mark karo
  await supabase.from('paper_requests').update({ status: 'RETURNED' }).eq('order_no', reqs[0].order_no).eq('status', 'ACCEPTED')
  // Saari PENDING requests bhi cancel karo — paper ab kisi ke paas nahi hai
  await supabase.from('paper_requests').update({ status: 'CANCELLED' }).eq('order_no', reqs[0].order_no).eq('status', 'PENDING')
  res.json({ message: 'Accepted' })
})

router.post('/return-requests/:id/reject', async (req, res) => {
  const { remarks } = req.body
  await supabase.from('return_requests').update({ status: `REJECTED: ${remarks || ''}`, rejected_by: req.user.username, rejected_at: new Date().toISOString(), reject_remarks: remarks || '' }).eq('id', parseInt(req.params.id))
  res.json({ message: 'Rejected' })
})

// Get single order
router.get('/:id', async (req, res) => {
  const { data } = await supabase.from('orders').select('*').eq('id', parseInt(req.params.id))
  if (!data?.length) return res.status(404).json({ error: 'Not found' })
  const { data: payments } = await supabase.from('payments').select('*').eq('order_id', parseInt(req.params.id)).order('date', { ascending: false })
  res.json({ ...mapOrder(data[0]), payments })
})

// Create order
router.post('/', async (req, res) => {
  const o = req.body
  if (o.orderNo) {
    const { data: existing } = await supabase.from('orders').select('id').eq('order_no', o.orderNo)
    if (existing?.length) return res.status(400).json({ error: 'Order number already exists' })
  }
  const { data, error } = await supabase.from('orders').insert(snakeOrder(o)).select()
  if (error) return res.status(400).json({ error: error.message })
  res.json(mapOrder(data[0]))
})

// Bulk import
router.post('/import', adminOnly, async (req, res) => {
  const { orders, overwrite } = req.body
  const duplicates = []
  let added = 0
  for (const o of orders) {
    const { data: existing } = await supabase.from('orders').select('id').eq('order_no', o.orderNo)
    if (existing?.length) {
      if (overwrite) {
        await supabase.from('orders').update(snakeOrder(o)).eq('order_no', o.orderNo)
        added++
      } else {
        duplicates.push(o.orderNo)
      }
    } else {
      await supabase.from('orders').insert(snakeOrder(o))
      added++
    }
  }
  res.json({ added, duplicates })
})

// Update order
router.put('/:id', async (req, res) => {
  const AUTO_FIELDS = ['receivedAmount', 'balance', 'percentReceived', 'received_amount', 'percent_received', 'id', 'createdAt', 'created_at', 'payments', '_needsOrderNo', 'daysToOrder', 'rowColor', 'paymentProofUrl', 'payment_proof_url']
  const { data: existing } = await supabase.from('orders').select('*').eq('id', parseInt(req.params.id))
  const oldOrder = existing?.[0] ? mapOrder(existing[0]) : {}
  const { error } = await supabase.from('orders').update(snakeOrder(req.body)).eq('id', parseInt(req.params.id))
  if (error) return res.status(400).json({ error: error.message })

  // Recalculate %REC whenever totalAmount or receivedAmount changes
  if (req.body.totalAmount !== undefined || req.body.receivedAmount !== undefined) {
    const { data: updated } = await supabase.from('orders').select('total_amount, received_amount').eq('id', parseInt(req.params.id))
    if (updated?.[0]) {
      const totalAmt = parseFloat(updated[0].total_amount) || 0
      const receivedAmt = parseFloat(updated[0].received_amount) || 0
      const balance = totalAmt - receivedAmt
      const percent = totalAmt ? parseFloat(((receivedAmt / totalAmt) * 100).toFixed(2)) : 0
      await supabase.from('orders').update({ balance, percent_received: percent }).eq('id', parseInt(req.params.id))
    }
  }

  const changes = []
  Object.keys(req.body).forEach(key => {
    if (AUTO_FIELDS.includes(key)) return
    const oldVal = String(oldOrder[key] || '').trim()
    const newVal = String(req.body[key] || '').trim()
    if (oldVal !== newVal && !(oldVal === '0' && newVal === '') && !(oldVal === '' && newVal === '0')) changes.push({ field: key, oldValue: oldVal, newValue: newVal })
  })
  if (changes.length > 0) {
    await supabase.from('order_edit_history').insert({ order_id: parseInt(req.params.id), order_no: oldOrder.orderNo || '', edit_type: 'ORDER_EDIT', edited_by: req.user.username, changes })
  }
  res.json({ message: 'Updated' })
})

// Delete order (move to deleted)
router.delete('/:id', async (req, res) => {
  const { data: users } = await supabase.from('users').select('can_delete, role').eq('id', req.user.id)
  const userRecord = users?.[0]
  const canDelete = req.user.role === 'admin' || userRecord?.can_delete
  if (!canDelete) return res.status(403).json({ error: 'No permission' })

  const { data: orders } = await supabase.from('orders').select('*').eq('id', parseInt(req.params.id))
  if (!orders?.length) return res.status(404).json({ error: 'Not found' })

  await supabase.from('deleted_orders').insert({ original_id: orders[0].id, data: mapOrder(orders[0]), deleted_by: req.user.username })
  await supabase.from('payments').delete().eq('order_id', parseInt(req.params.id))
  await supabase.from('orders').delete().eq('id', parseInt(req.params.id))
  res.json({ message: 'Deleted' })
})

// Payments
router.post('/:id/payments', async (req, res) => {
  const { date, mode, amount, remarks } = req.body
  const { data } = await supabase.from('payments').insert({ order_id: parseInt(req.params.id), date, mode, amount: parseFloat(amount), remarks }).select()
  const { data: payments } = await supabase.from('payments').select('amount').eq('order_id', parseInt(req.params.id))
  const totalReceived = (payments || []).reduce((s, p) => s + (p.amount || 0), 0)
  const { data: order } = await supabase.from('orders').select('total_amount').eq('id', parseInt(req.params.id))
  const totalAmt = order?.[0]?.total_amount || 0
  const balance = totalAmt - totalReceived
  const percent = totalAmt ? parseFloat(((totalReceived / totalAmt) * 100).toFixed(2)) : 0
  await supabase.from('orders').update({ received_amount: totalReceived, balance, percent_received: percent }).eq('id', parseInt(req.params.id))
  res.json(data[0])
})

router.get('/:id/payments', async (req, res) => {
  const { data } = await supabase.from('payments').select('*').eq('order_id', parseInt(req.params.id)).order('date', { ascending: false })
  res.json(data || [])
})

router.put('/:id/payments/:paymentId', adminOnly, async (req, res) => {
  const { date, mode, amount, remarks } = req.body
  await supabase.from('payments').update({ date, mode, amount: parseFloat(amount), remarks }).eq('id', parseInt(req.params.paymentId))
  const { data: payments } = await supabase.from('payments').select('amount').eq('order_id', parseInt(req.params.id))
  const totalReceived = (payments || []).reduce((s, p) => s + (p.amount || 0), 0)
  const { data: order } = await supabase.from('orders').select('total_amount').eq('id', parseInt(req.params.id))
  const totalAmt = order?.[0]?.total_amount || 0
  await supabase.from('orders').update({ received_amount: totalReceived, balance: totalAmt - totalReceived, percent_received: totalAmt ? parseFloat(((totalReceived / totalAmt) * 100).toFixed(2)) : 0 }).eq('id', parseInt(req.params.id))
  res.json({ message: 'Updated' })
})

router.delete('/:id/payments/:paymentId', adminOnly, async (req, res) => {
  await supabase.from('payments').delete().eq('id', parseInt(req.params.paymentId))
  const { data: payments } = await supabase.from('payments').select('amount').eq('order_id', parseInt(req.params.id))
  const totalReceived = (payments || []).reduce((s, p) => s + (p.amount || 0), 0)
  const { data: order } = await supabase.from('orders').select('total_amount').eq('id', parseInt(req.params.id))
  const totalAmt = order?.[0]?.total_amount || 0
  await supabase.from('orders').update({ received_amount: totalReceived, balance: totalAmt - totalReceived, percent_received: totalAmt ? parseFloat(((totalReceived / totalAmt) * 100).toFixed(2)) : 0 }).eq('id', parseInt(req.params.id))
  res.json({ message: 'Payment deleted' })
})

// Reminders for order
router.post('/:id/reminders', async (req, res) => {
  const { description, date, visibleTo } = req.body
  const { data: orders } = await supabase.from('orders').select('order_no, client').eq('id', parseInt(req.params.id))
  const order = orders?.[0]
  // Create separate reminder for each assigned user
  const users = visibleTo && visibleTo.length > 0 ? visibleTo : [req.user.username]
  const rows = users.map(u => ({ order_id: parseInt(req.params.id), order_no: order?.order_no, client: order?.client, description, date, visible_to: [u], assigned_to: u, created_by: req.user.username }))
  const { data } = await supabase.from('reminders').insert(rows).select()
  res.json(data?.[0] || { message: 'Reminders created' })
})

router.get('/:id/reminders', async (req, res) => {
  const { data } = await supabase.from('reminders').select('*').eq('order_id', parseInt(req.params.id))
  res.json(data || [])
})

// Edit logs
router.get('/edit-logs/all', async (req, res) => {
  const { data } = await supabase.from('order_edit_history').select('*').order('created_at', { ascending: false }).limit(500)
  res.json(data || [])
})

router.get('/:id/edit-logs', async (req, res) => {
  const { data } = await supabase.from('order_edit_history').select('*').eq('order_id', parseInt(req.params.id)).order('created_at', { ascending: false })
  res.json(data || [])
})

// Helper: map snake_case DB row to camelCase for frontend
function mapOrder(o) {
  if (!o) return o
  const totalAmt = parseFloat(o.total_amount) || 0
  const receivedAmt = parseFloat(o.received_amount) || 0
  const balance = totalAmt - receivedAmt
  const percentReceived = totalAmt ? parseFloat(((receivedAmt / totalAmt) * 100).toFixed(2)) : 0
  return { id: o.id, date: o.date, poNo: o.po_no, client: o.client, orderNo: o.order_no, status: o.status, deliveryDate: o.delivery_date, deliveryRemarks: o.delivery_remarks, customerName: o.customer_name, gst: o.gst, billingAddress: o.billing_address, followUp: o.follow_up, salesRep: o.sales_rep, deliveryAddress: o.delivery_address, phoneNo: o.phone_no, siteVerification: o.site_verification, siteVerificationRemarks: o.site_verification_remarks, installationStatus: o.installation_status, installationRemarks: o.installation_remarks, lop: o.lop, sectionDrawing: o.section_drawing, sectionDrawingRemarks: o.section_drawing_remarks, inProduction: o.in_production, billing: o.billing, installation: o.installation, totalAmount: totalAmt, receivedAmount: receivedAmt, balance: balance, percentReceived: percentReceived, paymentRemarks: o.payment_remarks, paymentProofUrl: o.payment_proof_url, daysToOrder: o.days_to_order, remarks: o.remarks, akhilSirAudit: o.akhil_sir_audit, advanceBill: o.advance_bill, orRecvd: o.or_recvd, photography: o.photography, photographyRemarks: o.photography_remarks, siteVideo: o.site_video, siteVideoRemarks: o.site_video_remarks, review: o.review, reviewRemarks: o.review_remarks, rowColor: o.row_color || '', createdAt: o.created_at }
}

// Helper: map camelCase frontend data to snake_case for DB
function snakeOrder(o) {
  if (!o) return o
  const s = {}
  if (o.date !== undefined) s.date = o.date
  if (o.poNo !== undefined) s.po_no = o.poNo
  if (o.client !== undefined) s.client = o.client
  if (o.orderNo !== undefined) s.order_no = o.orderNo
  if (o.status !== undefined) s.status = o.status
  if (o.deliveryDate !== undefined) s.delivery_date = o.deliveryDate
  if (o.deliveryRemarks !== undefined) s.delivery_remarks = o.deliveryRemarks
  if (o.customerName !== undefined) s.customer_name = o.customerName
  if (o.gst !== undefined) s.gst = o.gst
  if (o.billingAddress !== undefined) s.billing_address = o.billingAddress
  if (o.followUp !== undefined) s.follow_up = o.followUp
  if (o.salesRep !== undefined) s.sales_rep = o.salesRep
  if (o.deliveryAddress !== undefined) s.delivery_address = o.deliveryAddress
  if (o.phoneNo !== undefined) s.phone_no = o.phoneNo
  if (o.siteVerification !== undefined) s.site_verification = o.siteVerification
  if (o.siteVerificationRemarks !== undefined) s.site_verification_remarks = o.siteVerificationRemarks
  if (o.installationStatus !== undefined) s.installation_status = o.installationStatus
  if (o.installationRemarks !== undefined) s.installation_remarks = o.installationRemarks
  if (o.lop !== undefined) s.lop = o.lop
  if (o.sectionDrawing !== undefined) s.section_drawing = o.sectionDrawing
  if (o.sectionDrawingRemarks !== undefined) s.section_drawing_remarks = o.sectionDrawingRemarks
  if (o.inProduction !== undefined) s.in_production = o.inProduction
  if (o.billing !== undefined) s.billing = o.billing
  if (o.installation !== undefined) s.installation = o.installation
  if (o.totalAmount !== undefined) s.total_amount = parseFloat(o.totalAmount) || 0
  if (o.receivedAmount !== undefined) s.received_amount = parseFloat(o.receivedAmount) || 0
  if (o.balance !== undefined) s.balance = parseFloat(o.balance) || 0
  if (o.percentReceived !== undefined) s.percent_received = parseFloat(o.percentReceived) || 0
  if (o.paymentRemarks !== undefined) s.payment_remarks = o.paymentRemarks
  if (o.paymentProofUrl !== undefined) s.payment_proof_url = o.paymentProofUrl
  if (o.daysToOrder !== undefined) s.days_to_order = parseInt(o.daysToOrder) || 0
  if (o.remarks !== undefined) s.remarks = o.remarks
  if (o.akhilSirAudit !== undefined) s.akhil_sir_audit = o.akhilSirAudit
  if (o.advanceBill !== undefined) s.advance_bill = o.advanceBill
  if (o.orRecvd !== undefined) s.or_recvd = o.orRecvd
  if (o.photography !== undefined) s.photography = o.photography
  if (o.photographyRemarks !== undefined) s.photography_remarks = o.photographyRemarks
  if (o.siteVideo !== undefined) s.site_video = o.siteVideo
  if (o.siteVideoRemarks !== undefined) s.site_video_remarks = o.siteVideoRemarks
  if (o.review !== undefined) s.review = o.review
  if (o.reviewRemarks !== undefined) s.review_remarks = o.reviewRemarks
  if (o.rowColor !== undefined) s.row_color = o.rowColor
  return s
}

function mapPaperReq(r) {
  return { ...r, orderNo: r.order_no, requestedBy: r.requested_by, issueTo: r.issue_to, acceptedBy: r.accepted_by, acceptedAt: r.accepted_at, rejectedBy: r.rejected_by, rejectedAt: r.rejected_at, rejectRemarks: r.reject_remarks, reroutedBy: r.rerouted_by, reroutedAt: r.rerouted_at, createdAt: r.created_at }
}

module.exports = router
