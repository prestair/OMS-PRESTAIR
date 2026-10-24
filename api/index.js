const express = require('express')
const compression = require('compression')
const cors = require('cors')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const nodemailer = require('nodemailer')
const net = require('net')
const { createClient } = require('@supabase/supabase-js')

const app = express()
app.use(compression())
app.use(cors())
app.use(express.json({ limit: '50mb' }))

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
)
const JWT_SECRET = process.env.JWT_SECRET

// ---------------------------------------------------------------------------
// Simple in-memory TTL cache — reduces Supabase Egress & Log Ingestion
// All 15-20 users share the same cached response instead of each hitting DB
// ---------------------------------------------------------------------------
const _cache = {}
const pendingReads = new Map()
function cacheGet(key) {
  const entry = _cache[key]
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { delete _cache[key]; return null }
  return entry.data
}
function cacheSet(key, data, ttlMs) {
  _cache[key] = { data, expiresAt: Date.now() + ttlMs }
}
function cacheDel(...keys) {
  const related = { orders: 'orders_signal', reminders_all: 'reminders_signal' }
  keys.forEach(k => {
    delete _cache[k]
    pendingReads.delete(k)
    if (related[k]) { delete _cache[related[k]]; pendingReads.delete(related[k]) }
  })
}
function cacheClear(prefix) {
  new Set([...Object.keys(_cache), ...pendingReads.keys()]).forEach(k => { if (k.startsWith(prefix)) cacheDel(k) })
}
// Share in-flight reads between simultaneous requests on a Fluid instance.
// An invalidation also removes the pending read so a late result cannot replace
// newer data after an edit.
async function cachedRead(key, ttlMs, load) {
  const cached = cacheGet(key)
  if (cached !== null) return cached
  if (pendingReads.has(key)) return pendingReads.get(key)
  const pending = Promise.resolve().then(load).then(data => {
    if (pendingReads.get(key) === pending) cacheSet(key, data, ttlMs)
    return data
  }).finally(() => {
    if (pendingReads.get(key) === pending) pendingReads.delete(key)
  })
  pendingReads.set(key, pending)
  return pending
}
// TTLs
const TTL_ORDERS       = 90 * 1000       // 90s — main orders list. Safe: cacheDel('orders') is called in every POST/PUT/DELETE on orders; signal also busts orders_signal. Extra 30s only affects stale cross-instance window.
const TTL_DELETED      = 15 * 60 * 1000  // 15 min — deleted orders (rarely changes)
const TTL_PAYMENTS_ALL = 10 * 60 * 1000  // 10 min — all payments
const TTL_REMINDERS    = 8  * 60 * 1000  // 8 min  — reminders. Safe: cacheDel('reminders_all') called on every reminder create/respond/reassign/delete; signal invalidates within 30s
const TTL_PAPER        = 5  * 60 * 1000  // 5 min  — paper/return requests
const TTL_USERS_LIST   = 30 * 60 * 1000  // 30 min — user list (almost never changes)
const TTL_SALES_REPS   = 30 * 60 * 1000  // 30 min — sales reps
const TTL_APP_VERSION  = 5  * 60 * 1000  // 5 min  — app version
const TTL_AUTHORISED_IPS = 60 * 1000   // 60s — authorised IP list (admin-only, rarely changes)
// ---------------------------------------------------------------------------

// Sends a fire-and-forget alert email for unauthorised login attempts.
// Must never throw — always wrapped in try/catch at call site.
async function sendUnauthorisedLoginAlert(ip, username) {
  try {
    const GMAIL_USER = process.env.GMAIL_USER
    const RECEIVER = process.env.REPORT_RECEIVER || 'agm.prestairsystem@gmail.com'
    if (!GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return
    const timeIST = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: true
    })
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000
    })
    await transporter.sendMail({
      from: `"Prestair Security" <${GMAIL_USER}>`,
      to: RECEIVER,
      subject: `Unauthorised login attempt from ${ip} by ${username}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#e74c3c;margin-top:0">⚠️ Unauthorised Login Attempt</h2>
  <table style="width:100%;border-collapse:collapse;margin-top:8px">
    <tr><td style="padding:8px 12px;font-weight:600;width:140px">App Name</td><td style="padding:8px 12px">OMS DASHBOARD</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600">IP Address</td><td style="padding:8px 12px">${ip}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600">Username</td><td style="padding:8px 12px">${username}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600">Time (IST)</td><td style="padding:8px 12px">${timeIST}</td></tr>
  </table>
  <p style="margin-top:16px;color:#555;font-size:13px">This IP is not in the Authorised IPs list. Please review and add it if this is a legitimate user.</p>
</div>`
    })
  } catch (emailErr) {
    console.error('Unauthorised login alert email failed:', emailErr.message)
  }
}

// Sends unlock code to admin when IP is locked out after unauthorized attempt
async function sendLockoutUnlockCode(ip, username, unlockCode) {
  try {
    const GMAIL_USER = process.env.GMAIL_USER
    const RECEIVER = process.env.REPORT_RECEIVER || 'agm.prestairsystem@gmail.com'
    if (!GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return
    const timeIST = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: true
    })
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000
    })
    await transporter.sendMail({
      from: `"Prestair Security" <${GMAIL_USER}>`,
      to: RECEIVER,
      subject: `🔒 LOGIN LOCKED — Unlock Code for ${username} (${ip})`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#e74c3c;margin-top:0">🔒 Login Locked — Unauthorised IP</h2>
  <p style="color:#555;font-size:13px">Login has been locked for the following user after an unauthorised IP attempt.</p>
  <table style="width:100%;border-collapse:collapse;margin-top:8px">
    <tr style="background:#f8f8f8"><td style="padding:8px 12px;font-weight:600;width:140px">App Name</td><td style="padding:8px 12px">OMS DASHBOARD</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600">IP Address</td><td style="padding:8px 12px">${ip}</td></tr>
    <tr style="background:#f8f8f8"><td style="padding:8px 12px;font-weight:600">Username</td><td style="padding:8px 12px">${username}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600">Time (IST)</td><td style="padding:8px 12px">${timeIST}</td></tr>
  </table>
  <div style="margin-top:20px;padding:16px 20px;background:#fff3cd;border:2px solid #f39c12;border-radius:8px;text-align:center">
    <p style="margin:0 0 8px;font-size:13px;color:#555;font-weight:600">UNLOCK CODE</p>
    <p style="margin:0;font-size:36px;font-weight:900;letter-spacing:8px;color:#1a1a2e">${unlockCode}</p>
  </div>
  <p style="margin-top:16px;color:#555;font-size:12px">Share this code with the user to unlock their login. The code is valid for 30 minutes.</p>
</div>`
    })
  } catch (emailErr) {
    console.error('Lockout unlock code email failed:', emailErr.message)
  }
}

function generateToken(user) {
  if (!JWT_SECRET) throw new Error('Server authentication is not configured: set JWT_SECRET')
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' })
}
// Cache for force_logout_at: { [userId]: { value: <iso|null>, fetchedAt: <ms> } }
// TTL = 30s — avoids a Supabase query on every single authenticated request
const forceLogoutCache = {}
const FORCE_LOGOUT_TTL = 30 * 1000 // 30 seconds

async function authenticate(req, res, next) {
  if (!JWT_SECRET) return res.status(503).json({ error: 'Server authentication is not configured' })
  const h = req.headers.authorization
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const decoded = jwt.verify(h.split(' ')[1], JWT_SECRET)
    req.user = decoded
    // Check force logout — use cache to avoid hitting Supabase on every request
    const now = Date.now()
    const cached = forceLogoutCache[decoded.id]
    let forceLogoutAt = null
    if (cached && (now - cached.fetchedAt) < FORCE_LOGOUT_TTL) {
      forceLogoutAt = cached.value
    } else {
      const { data: userData } = await supabase.from('users').select('force_logout_at').eq('id', decoded.id)
      forceLogoutAt = userData?.[0]?.force_logout_at || null
      forceLogoutCache[decoded.id] = { value: forceLogoutAt, fetchedAt: now }
    }
    if (forceLogoutAt) {
      const logoutTime = new Date(forceLogoutAt).getTime() / 1000
      if (decoded.iat && logoutTime > decoded.iat) return res.status(401).json({ error: 'Session expired. Please login again.' })
    }
    next()
  } catch (e) { return res.status(401).json({ error: 'Invalid token' }) }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  next()
}
// Grant check for new-style grantable rights not carried in the JWT.
// Admins always pass; otherwise look the boolean column up by user id.
async function userHasRight(req, col) {
  if (req.user.role === 'admin') return true
  const { data } = await supabase.from('users').select(col).eq('id', req.user.id)
  return !!(data?.[0]?.[col])
}
function mapOrder(o) {
  if (!o) return o
  const totalAmt = parseFloat(o.total_amount) || 0
  const receivedAmt = parseFloat(o.received_amount) || 0
  const balance = totalAmt - receivedAmt
  const percentReceived = totalAmt ? parseFloat(((receivedAmt / totalAmt) * 100).toFixed(2)) : 0
  return { id: o.id, date: o.date, poNo: o.po_no, client: o.client, orderNo: o.order_no, status: o.status, deliveryDate: o.delivery_date, deliveryRemarks: o.delivery_remarks, customerName: o.customer_name, gst: o.gst, billingAddress: o.billing_address, followUp: o.follow_up, salesRep: o.sales_rep, deliveryAddress: o.delivery_address, phoneNo: o.phone_no, siteVerification: o.site_verification, siteVerificationRemarks: o.site_verification_remarks, installationStatus: o.installation_status, installationRemarks: o.installation_remarks, lop: o.lop, sectionDrawing: o.section_drawing, sectionDrawingRemarks: o.section_drawing_remarks, inProduction: o.in_production, billing: o.billing, installation: o.installation, akhilPoints: o.akhil_points, totalAmount: totalAmt, receivedAmount: receivedAmt, balance: balance, percentReceived: percentReceived, followUpType: o.follow_up_type, paymentRemarks: o.payment_remarks, paymentProofUrl: o.payment_proof_url, daysToOrder: o.days_to_order, remarks: o.remarks, auditProofUrl: o.audit_proof_url, akhilSirAudit: o.akhil_sir_audit, advanceBill: o.advance_bill, advanceBillRemarks: o.advance_bill_remarks, orRecvd: o.or_recvd, photography: o.photography, photographyRemarks: o.photography_remarks, siteVideo: o.site_video, siteVideoRemarks: o.site_video_remarks, review: o.review, reviewRemarks: o.review_remarks, rowColor: o.row_color || '', createdAt: o.created_at, wappGroup: o.wapp_group || '', wappNumber: o.wapp_number || '', wappGroupMade: o.wapp_group_made || '' }
}
function snakeOrder(o) {
  if (!o) return o; const s = {}
  if (o.date !== undefined) s.date = o.date; if (o.poNo !== undefined) s.po_no = o.poNo; if (o.client !== undefined) s.client = o.client; if (o.orderNo !== undefined) s.order_no = o.orderNo; if (o.status !== undefined) s.status = o.status; if (o.deliveryDate !== undefined) s.delivery_date = o.deliveryDate; if (o.customerName !== undefined) s.customer_name = o.customerName; if (o.gst !== undefined) s.gst = o.gst; if (o.totalAmount !== undefined) s.total_amount = parseFloat(o.totalAmount) || 0; if (o.receivedAmount !== undefined) s.received_amount = parseFloat(o.receivedAmount) || 0; if (o.balance !== undefined) s.balance = parseFloat(o.balance) || 0; if (o.photography !== undefined) s.photography = o.photography; if (o.photographyRemarks !== undefined) s.photography_remarks = o.photographyRemarks; if (o.siteVideo !== undefined) s.site_video = o.siteVideo; if (o.siteVideoRemarks !== undefined) s.site_video_remarks = o.siteVideoRemarks; if (o.review !== undefined) s.review = o.review; if (o.reviewRemarks !== undefined) s.review_remarks = o.reviewRemarks; if (o.orRecvd !== undefined) s.or_recvd = o.orRecvd; if (o.billingAddress !== undefined) s.billing_address = o.billingAddress; if (o.deliveryAddress !== undefined) s.delivery_address = o.deliveryAddress; if (o.phoneNo !== undefined) s.phone_no = o.phoneNo; if (o.salesRep !== undefined) s.sales_rep = o.salesRep; if (o.followUp !== undefined) s.follow_up = o.followUp; if (o.deliveryRemarks !== undefined) s.delivery_remarks = o.deliveryRemarks; if (o.siteVerification !== undefined) s.site_verification = o.siteVerification; if (o.siteVerificationRemarks !== undefined) s.site_verification_remarks = o.siteVerificationRemarks; if (o.installationStatus !== undefined) s.installation_status = o.installationStatus; if (o.installationRemarks !== undefined) s.installation_remarks = o.installationRemarks; if (o.lop !== undefined) s.lop = o.lop; if (o.sectionDrawing !== undefined) s.section_drawing = o.sectionDrawing; if (o.sectionDrawingRemarks !== undefined) s.section_drawing_remarks = o.sectionDrawingRemarks; if (o.inProduction !== undefined) s.in_production = o.inProduction; if (o.billing !== undefined) s.billing = o.billing; if (o.installation !== undefined) s.installation = o.installation; if (o.akhilPoints !== undefined) s.akhil_points = o.akhilPoints; if (o.remarks !== undefined) s.remarks = o.remarks; if (o.akhilSirAudit !== undefined) s.akhil_sir_audit = o.akhilSirAudit; if (o.advanceBill !== undefined) s.advance_bill = o.advanceBill; if (o.advanceBillRemarks !== undefined) s.advance_bill_remarks = o.advanceBillRemarks; if (o.followUpType !== undefined) s.follow_up_type = o.followUpType; if (o.paymentRemarks !== undefined) s.payment_remarks = o.paymentRemarks; if (o.paymentProofUrl !== undefined && o.paymentProofUrl !== o.paymentProofUrl?.toUpperCase()) s.payment_proof_url = o.paymentProofUrl; if (o.auditProofUrl !== undefined && o.auditProofUrl !== o.auditProofUrl?.toUpperCase()) s.audit_proof_url = o.auditProofUrl; if (o.rowColor !== undefined) s.row_color = o.rowColor; if (o.wappGroup !== undefined) s.wapp_group = o.wappGroup; if (o.wappNumber !== undefined) s.wapp_number = o.wappNumber; if (o.wappGroupMade !== undefined) s.wapp_group_made = o.wappGroupMade
  return s
}

// AUTH
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body
    const { data: users } = await supabase.from('users').select('*').ilike('username', username)
    const user = users?.[0]
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    const valid = bcrypt.compareSync(password.toLowerCase(), user.password)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
    // IP whitelist check — fail-open when table is empty
    const clientIp = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim()
    // Check if this IP+username is currently locked out
    try {
      const { data: activeLocks } = await supabase.from('ip_lockouts')
        .select('created_at').eq('ip_address', clientIp).eq('username', user.username).eq('is_unlocked', false)
        .order('created_at', { ascending: false }).limit(1)
      const lock = activeLocks?.[0]
      if (lock) {
          return res.status(403).json({ error: 'LOGIN DISABLED ENTER CODE TO ENABLE', locked: true })
        }
    } catch (lockCheckErr) { console.error('lockout check failed:', lockCheckErr.message) }
    try {
      const allowedIps = await cachedRead('authorised_ips_guard', TTL_AUTHORISED_IPS, async () => {
        const { data } = await supabase.from('authorised_ips').select('ip_address')
        return data || []
      })
      if (allowedIps.length > 0) {
        const normalised = clientIp.toLowerCase().trim()
        const isAllowed = allowedIps.some(r => (r.ip_address || '').toLowerCase().trim() === normalised)
        if (!isAllowed) {
          // Generate 6-digit unlock code and store in ip_lockouts table
          const unlockCode = String(Math.floor(100000 + Math.random() * 900000))
          try {
            // Remove any existing active lockouts for this IP+username
            await supabase.from('ip_lockouts').update({ is_unlocked: true }).eq('ip_address', clientIp).eq('username', user.username).eq('is_unlocked', false)
            // Insert new lockout
            await supabase.from('ip_lockouts').insert({ ip_address: clientIp, username: user.username, unlock_code: unlockCode })
          } catch (lockErr) { console.error('ip_lockouts insert failed:', lockErr.message) }
          // Send both emails: unauthorized alert + unlock code
          await sendUnauthorisedLoginAlert(clientIp, user.username)
          await sendLockoutUnlockCode(clientIp, user.username, unlockCode)
          return res.status(403).json({ error: 'Login not allowed from this IP address.', locked: true })
        }
      }
    } catch (ipCheckErr) {
      // If the IP table read fails, fail-open (allow login) to avoid locking everyone out
      console.error('IP whitelist check failed:', ipCheckErr.message)
    }
    const token = generateToken({ id: user.id, username: user.username, role: user.role })
    let userGroup = null
    if (user.user_group) { const { data: g } = await supabase.from('groups').select('*').eq('name', user.user_group); userGroup = g?.[0] }
    const mergedPerms = { ...(userGroup?.column_permissions || {}), ...(user.column_permissions || {}) }
    const gr = (k) => { if (user[k] === true || user[k] === false) return user[k]; if (userGroup && (userGroup[k] === true || userGroup[k] === false)) return userGroup[k]; return false }
    // grant if either the user OR their group allows (used for complaint access)
    const grAny = (k) => (user[k] === true) || !!(userGroup && userGroup[k] === true)
    const isAdmin = user.role === 'admin'
    // Log this login (fire-and-forget, never block the response)
    const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim()
    const ua = req.headers['user-agent'] || ''
    // Insert the login row and read back its id so the client can post that exact id to
    // /api/auth/log-location — this binds the location update to THIS login row (race-free),
    // instead of guessing "most recent row for this user in the last 2 min". Wrapped in
    // try/catch so a logging failure never blocks auth; locationLogId is simply null then.
    let locationLogId = null
    try {
      const { data: logRow } = await supabase.from('login_logs')
        .insert({ username: user.username, full_name: user.full_name || '', role: user.role, ip_address: ip, user_agent: ua })
        .select('id').single()
      locationLogId = logRow?.id ?? null
    } catch { /* login logging is best-effort; never block the response */ }
    res.json({ token, user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role, group: user.user_group || '', locationLogId, columnPermissions: isAdmin ? {} : mergedPerms, canEdit: isAdmin || gr('can_edit'), canReceipt: isAdmin || gr('can_receipt'), canAssignReminder: isAdmin || gr('can_assign_reminder'), canDelete: isAdmin || gr('can_delete'), canCreateQuote: isAdmin || gr('can_create_quote'), canColor: isAdmin || gr('can_color'), canComplaints: isAdmin || grAny('can_complaints'), canEditCompleted: isAdmin || grAny('can_edit_completed'), canEditDaily: isAdmin || grAny('can_edit_daily'), canEditReceipt: isAdmin || grAny('can_edit_receipt') } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
// Reject unreliable geolocation (68%-confidence radius worse than this many metres).
// User requirement: approximations up to ~2 km are acceptable, but 30-40 km blunders
// (wrong city) must not be shown as a confident location.
const ACCURACY_THRESHOLD_M = 2000
app.post('/api/auth/resend-unlock-code', async (req, res) => {
  try {
    const { username } = req.body
    if (!username) return res.status(400).json({ error: 'Username required' })
    const clientIp = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim()
    // Generate new code
    const unlockCode = String(Math.floor(100000 + Math.random() * 900000))
    // Replace existing active lockout with new code
    await supabase.from('ip_lockouts').update({ is_unlocked: true }).eq('ip_address', clientIp).eq('username', username).eq('is_unlocked', false)
    await supabase.from('ip_lockouts').insert({ ip_address: clientIp, username, unlock_code: unlockCode })
    await sendLockoutUnlockCode(clientIp, username, unlockCode)
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/auth/verify-unlock-code', async (req, res) => {
  try {
    const { username, code } = req.body
    if (!username || !code) return res.status(400).json({ error: 'Required' })
    const clientIp = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim()
    // Find active lockout for this IP+username
    const { data: lockouts } = await supabase.from('ip_lockouts')
      .select('*').eq('ip_address', clientIp).eq('username', username).eq('is_unlocked', false)
      .order('created_at', { ascending: false }).limit(1)
    const lockout = lockouts?.[0]
    if (!lockout) return res.status(400).json({ error: 'No active lockout found' })
    if (lockout.unlock_code !== String(code).trim()) return res.status(400).json({ error: 'Invalid unlock code' })
    // Mark as unlocked
    await supabase.from('ip_lockouts').update({ is_unlocked: true, unlocked_at: new Date().toISOString() }).eq('id', lockout.id)
    res.json({ success: true, message: 'Login unlocked. You may now try logging in.' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/auth/check-lockout', async (req, res) => {
  try {
    const { username } = req.body
    if (!username) return res.status(400).json({ locked: false })
    const clientIp = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim()
    const { data: lockouts } = await supabase.from('ip_lockouts')
      .select('created_at').eq('ip_address', clientIp).eq('username', username).eq('is_unlocked', false)
      .order('created_at', { ascending: false }).limit(1)
    const lockout = lockouts?.[0]
    if (!lockout) return res.json({ locked: false })
    res.json({ locked: true })
  } catch (e) { res.json({ locked: false }) }
})

app.post('/api/auth/log-location', authenticate, async (req, res) => {
  try {
    const { lat, lon, accuracy, logId } = req.body
    if (!lat || !lon) return res.status(400).json({ error: 'lat/lon required' })
    const acc = (typeof accuracy === 'number' && isFinite(accuracy)) ? accuracy : null

    // Identify the EXACT login row this reading belongs to. Prefer the id threaded from the login
    // response (race-free even on rapid re-login); otherwise fall back to the most-recent row for
    // this user within 2 min. We also need the row's ip_address (captured at login insert, not sent
    // in this body) for the same-IP fallback below.
    let currentRow = null
    if (logId != null) {
      const { data } = await supabase.from('login_logs').select('id, ip_address').eq('id', logId).single()
      currentRow = data || null
    } else {
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      const { data } = await supabase.from('login_logs')
        .select('id, ip_address')
        .eq('username', req.user.username)
        .gte('logged_in_at', twoMinAgo)
        .order('logged_in_at', { ascending: false })
        .limit(1)
      currentRow = data?.[0] || null
    }

    let update
    if (acc !== null && acc <= ACCURACY_THRESHOLD_M) {
      // Reliable this-device reading: reverse-geocode via OpenStreetMap Nominatim (free, no key).
      // This row also becomes a "known good" source for its IP for future same-IP fallbacks.
      let city = '', country = ''
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
          headers: { 'User-Agent': 'OMS-Prestair/1.0' },
          signal: AbortSignal.timeout(3000)
        })
        const geoData = await geoRes.json()
        const addr = geoData.address || {}
        city = addr.city || addr.town || addr.village || addr.county || addr.state_district || ''
        country = addr.country || ''
      } catch {}
      update = { latitude: lat, longitude: lon, city, country, accuracy: acc, location_inherited: false }
    } else {
      // Unreliable (accuracy missing or > threshold). Before recording "not reliable", try to
      // inherit the MOST RECENT earlier reliable location from the SAME ip_address (same office
      // network). Match ip_address EXACTLY — never borrow across different IPs.
      let inherited = null
      const ip = currentRow?.ip_address || null
      if (ip) {
        const { data: priors } = await supabase.from('login_logs')
          .select('latitude, longitude, city, country, accuracy, logged_in_at')
          .eq('ip_address', ip)
          .not('city', 'is', null)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .lte('accuracy', ACCURACY_THRESHOLD_M)
          .order('logged_in_at', { ascending: false })
          .limit(1)
        inherited = priors?.[0] || null
      }
      if (inherited) {
        // Copy the prior reliable location but keep THIS reading's (bad) accuracy and flag it so the
        // UI can be honest that the location came from the IP's prior reading, not this device.
        update = { latitude: inherited.latitude, longitude: inherited.longitude, city: inherited.city, country: inherited.country, accuracy: acc, location_inherited: true }
      } else {
        // Nothing to inherit for this IP: record honestly as not reliable.
        update = { latitude: null, longitude: null, city: null, country: null, accuracy: acc, location_inherited: false }
      }
    }

    // Apply the update strictly to the identified row (by id when known, else the same
    // most-recent-within-2-min predicate used above) so an unrelated older row is never touched.
    let q = supabase.from('login_logs').update(update)
    if (currentRow?.id != null) {
      q = q.eq('id', currentRow.id)
    } else if (logId != null) {
      q = q.eq('id', logId)
    } else {
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      q = q.eq('username', req.user.username).gte('logged_in_at', twoMinAgo)
    }
    await q
    res.json({ message: 'Location saved' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.post('/api/auth/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const { data: users } = await supabase.from('users').select('*').eq('id', req.user.id)
    if (!users?.[0]) return res.status(404).json({ error: 'Not found' })
    if (!bcrypt.compareSync(currentPassword.toLowerCase(), users[0].password)) return res.status(400).json({ error: 'Wrong password' })
    await supabase.from('users').update({ password: bcrypt.hashSync(newPassword.toLowerCase(), 10) }).eq('id', req.user.id)
    res.json({ message: 'Changed' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// SALES REPS
app.get('/api/sales-reps', authenticate, async (req, res) => { try { const cached=cacheGet('sales_reps'); if(cached) return res.json(cached); const { data } = await supabase.from('sales_reps').select('*').order('name',{ascending:true}); const result=(data||[]).map(r=>({id:r.id,name:r.name})); cacheSet('sales_reps',result,TTL_SALES_REPS); res.json(result) } catch (e) { res.status(500).json({ error: e.message }) } })
app.post('/api/sales-reps', authenticate, adminOnly, async (req, res) => { try { const { name } = req.body; if(!name||!name.trim())return res.status(400).json({error:'Name required'}); const nm=name.trim(); const { data: ex } = await supabase.from('sales_reps').select('id').ilike('name',nm); if(ex&&ex.length)return res.status(400).json({error:'Sales rep already exists'}); const { data, error } = await supabase.from('sales_reps').insert({name:nm}).select(); if(error)return res.status(400).json({error:error.message}); cacheDel('sales_reps'); res.json(data[0]) } catch (e) { res.status(500).json({ error: e.message }) } })
app.delete('/api/sales-reps/:id', authenticate, adminOnly, async (req, res) => { try { await supabase.from('sales_reps').delete().eq('id',parseInt(req.params.id)); cacheDel('sales_reps'); res.json({message:'Deleted'}) } catch (e) { res.status(500).json({ error: e.message }) } })

// USERS
app.get('/api/users/list', authenticate, async (req, res) => { try { const cached=cacheGet('users_list'); if(cached) return res.json(cached); const { data } = await supabase.from('users').select('id, username, full_name, role'); const result=(data||[]).map(u=>({id:u.id,username:u.username,fullName:u.full_name,full_name:u.full_name,role:u.role})); cacheSet('users_list',result,TTL_USERS_LIST); res.json(result) } catch (e) { res.status(500).json({ error: e.message }) } })
app.get('/api/users/groups', authenticate, async (req, res) => { try { const { data } = await supabase.from('groups').select('*'); res.json(data || []) } catch (e) { res.status(500).json({ error: e.message }) } })
app.get('/api/users', authenticate, adminOnly, async (req, res) => { try { const { data } = await supabase.from('users').select('id,username,full_name,role,user_group,column_permissions,can_edit,can_receipt,can_assign_reminder,can_delete,can_create_quote,can_color,can_complaints,can_edit_completed,can_edit_daily,can_edit_receipt,plain_password'); res.json((data||[]).map(u=>({...u,fullName:u.full_name,group:u.user_group,columnPermissions:u.column_permissions,canEdit:u.can_edit,canReceipt:u.can_receipt,canAssignReminder:u.can_assign_reminder,canDelete:u.can_delete,canCreateQuote:u.can_create_quote,canColor:u.can_color,canComplaints:u.can_complaints,canEditCompleted:u.can_edit_completed,canEditDaily:u.can_edit_daily,canEditReceipt:u.can_edit_receipt,plainPassword:u.plain_password}))) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/users', authenticate, adminOnly, async (req, res) => { try { const {username,password,fullName,role,group,columnPermissions,canEdit,canReceipt,canAssignReminder,canDelete,canCreateQuote}=req.body; const{data,error}=await supabase.from('users').insert({username,password:bcrypt.hashSync(password.toLowerCase(),10),plain_password:password.toLowerCase(),full_name:fullName,role:role||'user',user_group:group||'',column_permissions:columnPermissions||{},can_edit:canEdit||false,can_receipt:canReceipt||false,can_assign_reminder:canAssignReminder||false,can_delete:canDelete||false,can_create_quote:canCreateQuote||false,can_color:req.body.canColor||false,can_complaints:req.body.canComplaints||false,can_edit_completed:req.body.canEditCompleted||false,can_edit_daily:req.body.canEditDaily||false,can_edit_receipt:req.body.canEditReceipt||false}).select(); if(error)return res.status(400).json({error:error.message}); cacheDel('users_list'); res.json(data[0]) } catch(e){res.status(500).json({error:e.message})} })
app.put('/api/users/:id', authenticate, adminOnly, async (req, res) => { try { const{fullName,role,group,columnPermissions,canEdit,canReceipt,canAssignReminder,canDelete,canCreateQuote}=req.body; await supabase.from('users').update({full_name:fullName,role,user_group:group||'',column_permissions:columnPermissions||{},can_edit:canEdit||false,can_receipt:canReceipt||false,can_assign_reminder:canAssignReminder||false,can_delete:canDelete||false,can_create_quote:canCreateQuote||false,can_color:req.body.canColor||false,can_complaints:req.body.canComplaints||false,can_edit_completed:req.body.canEditCompleted||false,can_edit_daily:req.body.canEditDaily||false,can_edit_receipt:req.body.canEditReceipt||false}).eq('id',parseInt(req.params.id)); cacheDel('users_list'); res.json({message:'Updated'}) } catch(e){res.status(500).json({error:e.message})} })
app.put('/api/users/:id/password', authenticate, adminOnly, async (req, res) => { try { const{newPassword}=req.body; await supabase.from('users').update({password:bcrypt.hashSync(newPassword.toLowerCase(),10),plain_password:newPassword.toLowerCase()}).eq('id',parseInt(req.params.id)); res.json({message:'Password reset'}) } catch(e){res.status(500).json({error:e.message})} })
app.delete('/api/users/:id', authenticate, adminOnly, async (req, res) => { try { if(parseInt(req.params.id)===req.user.id)return res.status(400).json({error:'Cannot delete yourself'}); await supabase.from('users').delete().eq('id',parseInt(req.params.id)); cacheDel('users_list'); res.json({message:'User deleted'}) } catch(e){res.status(500).json({error:e.message})} })
app.put('/api/users/:id/force-logout', authenticate, adminOnly, async (req, res) => { try { await supabase.from('users').update({force_logout_at:new Date().toISOString()}).eq('id',parseInt(req.params.id)); delete forceLogoutCache[parseInt(req.params.id)]; res.json({message:'User forced to logout'}) } catch(e){res.status(500).json({error:e.message})} })
app.get('/api/users/login-logs', authenticate, adminOnly, async (req, res) => { try { const limit = parseInt(req.query.limit) || 500; const username = req.query.username || null; let q = supabase.from('login_logs').select('*').order('logged_in_at', { ascending: false }).limit(limit); if (username) q = q.eq('username', username); const { data, error } = await q; if (error) return res.status(400).json({ error: error.message }); res.json(data || []) } catch(e){res.status(500).json({error:e.message})} })
app.delete('/api/users/login-logs/bulk', authenticate, adminOnly, async (req, res) => {
  try {
    const { ipAddress, date } = req.body
    if (!ipAddress || !date) return res.status(400).json({ error: 'ipAddress and date required' })
    // date is YYYY-MM-DD in IST. Convert IST day boundaries to UTC (IST = UTC+5:30).
    const istStart = new Date(date + 'T00:00:00+05:30').toISOString()
    const istEnd   = new Date(date + 'T23:59:59.999+05:30').toISOString()
    const { error } = await supabase.from('login_logs').delete()
      .eq('ip_address', ipAddress)
      .gte('logged_in_at', istStart)
      .lte('logged_in_at', istEnd)
    if (error) return res.status(400).json({ error: error.message })
    res.json({ deleted: true })
  } catch(e) { res.status(500).json({ error: e.message }) }
})
app.delete('/api/users/login-logs/:id', authenticate, adminOnly, async (req, res) => { try { const { error } = await supabase.from('login_logs').delete().eq('id', parseInt(req.params.id)); if (error) return res.status(400).json({ error: error.message }); res.json({ message: 'Deleted' }) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/users/groups', authenticate, adminOnly, async (req, res) => { try { const b=req.body; const name=b.name; const column_permissions=b.column_permissions||b.columnPermissions; const can_edit=b.can_edit??b.canEdit; const can_receipt=b.can_receipt??b.canReceipt; const can_assign_reminder=b.can_assign_reminder??b.canAssignReminder; const can_delete=b.can_delete??b.canDelete; const can_create_quote=b.can_create_quote??b.canCreateQuote; const can_complaints=b.can_complaints??b.canComplaints; const can_color=b.can_color??b.canColor; const can_edit_completed=b.can_edit_completed??b.canEditCompleted; const can_edit_daily=b.can_edit_daily??b.canEditDaily; const can_edit_receipt=b.can_edit_receipt??b.canEditReceipt; const{data,error}=await supabase.from('groups').insert({name:(name||'').toUpperCase(),column_permissions:column_permissions||{},can_complaints:can_complaints||false,can_edit:can_edit||false,can_receipt:can_receipt||false,can_assign_reminder:can_assign_reminder||false,can_delete:can_delete||false,can_create_quote:can_create_quote||false,can_color:can_color||false,can_edit_completed:can_edit_completed||false,can_edit_daily:can_edit_daily||false,can_edit_receipt:can_edit_receipt||false}).select(); if(error)return res.status(400).json({error:error.message}); res.json(data[0]) } catch(e){res.status(500).json({error:e.message})} })
app.put('/api/users/groups/:id', authenticate, adminOnly, async (req, res) => { try { const b=req.body; const name=b.name; const column_permissions=b.column_permissions||b.columnPermissions; const can_edit=b.can_edit??b.canEdit; const can_receipt=b.can_receipt??b.canReceipt; const can_assign_reminder=b.can_assign_reminder??b.canAssignReminder; const can_delete=b.can_delete??b.canDelete; const can_create_quote=b.can_create_quote??b.canCreateQuote; const can_complaints=b.can_complaints??b.canComplaints; const can_color=b.can_color??b.canColor; const can_edit_completed=b.can_edit_completed??b.canEditCompleted; const can_edit_daily=b.can_edit_daily??b.canEditDaily; const can_edit_receipt=b.can_edit_receipt??b.canEditReceipt; await supabase.from('groups').update({name:(name||'').toUpperCase(),column_permissions:column_permissions||{},can_complaints:can_complaints||false,can_edit:can_edit||false,can_receipt:can_receipt||false,can_assign_reminder:can_assign_reminder||false,can_delete:can_delete||false,can_create_quote:can_create_quote||false,can_color:can_color||false,can_edit_completed:can_edit_completed||false,can_edit_daily:can_edit_daily||false,can_edit_receipt:can_edit_receipt||false}).eq('id',parseInt(req.params.id)); res.json({message:'Updated'}) } catch(e){res.status(500).json({error:e.message})} })
app.delete('/api/users/groups/:id', authenticate, adminOnly, async (req, res) => { try { await supabase.from('groups').delete().eq('id',parseInt(req.params.id)); res.json({message:'Group deleted'}) } catch(e){res.status(500).json({error:e.message})} })

// ORDERS
app.get('/api/orders', authenticate, async (req, res) => { try { const cached=cacheGet('orders'); if(cached) return res.json(cached); const{data}=await supabase.from('orders').select('id,date,po_no,client,order_no,status,delivery_date,delivery_remarks,customer_name,gst,billing_address,follow_up,sales_rep,delivery_address,phone_no,site_verification,site_verification_remarks,installation_status,installation_remarks,lop,section_drawing,section_drawing_remarks,in_production,billing,installation,akhil_points,total_amount,received_amount,follow_up_type,payment_remarks,payment_proof_url,days_to_order,remarks,audit_proof_url,akhil_sir_audit,advance_bill,advance_bill_remarks,or_recvd,photography,photography_remarks,site_video,site_video_remarks,review,review_remarks,row_color,created_at,wapp_group,wapp_number,wapp_group_made'); const mapped=(data||[]).map(o=>mapOrder(o)); const getOrderParts=(orderNo)=>{if(!orderNo)return{fy:0,num:0};const parts=orderNo.split('/');let fy=0;let num=0;if(parts.length>=3){const fyDigits=parts[1].match(/^(\d{4})/);if(fyDigits)fy=parseInt(fyDigits[1]);const numDigits=parts[2].match(/^(\d+)/);if(numDigits)num=parseInt(numDigits[1])}return{fy,num}}; mapped.sort((a,b)=>{const pa=getOrderParts(a.orderNo);const pb=getOrderParts(b.orderNo);if(pb.fy!==pa.fy)return pb.fy-pa.fy;return pb.num-pa.num}); cacheSet('orders',mapped,TTL_ORDERS); res.json(mapped) } catch(e){res.status(500).json({error:e.message})} })
// Lightweight change-detection signal for the orders list. Orders table has NO reliable updated_at
// (mapOrder reads only created_at), so we return { count, maxId, sumId } where sumId = SUM(id).
// This is DELETE-AWARE: deleting any row (even a non-max row) changes sumId even if a later insert
// restores count, so the frontend always detects the change. We fetch ONLY the `id` column
// (select('id') — tiny vs the full ~50-column rows) and compute all three scalars in JS; the
// response is still just a few integers, never full rows, so egress stays minimal. The read is
// shared/coalesced and briefly cached (cachedRead, 15s) and bounded by a timeout to limit Vercel
// function work.
// LIMITATION: in-place edits that change neither row count, max id, nor id sum are not reflected
// here; the frontend compensates with a periodic safety-net full refetch.
app.get('/api/orders/signal', authenticate, async (req, res) => {
  try {
    const result = await cachedRead('orders_signal', 30000, async () => {
      const { data: idRows, error } = await supabase.from('orders').select('id').abortSignal(AbortSignal.timeout(10000))
      if (error) throw error
      const rows = idRows || []
      const count = rows.length
      const maxId = rows.reduce((m, r) => r.id > m ? r.id : m, 0)
      const sumId = rows.reduce((s, r) => s + (r.id || 0), 0)
      return { count, maxId, sumId }
    })
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.get('/api/orders/deleted/all', authenticate, async (req, res) => { try { const cached=cacheGet('deleted_orders'); if(cached) return res.json(cached); const{data}=await supabase.from('deleted_orders').select('*'); const getOrderParts=(orderNo)=>{if(!orderNo)return{fy:0,num:0};const parts=orderNo.split('/');let fy=0;let num=0;if(parts.length>=3){const fyDigits=parts[1].match(/^(\d{4})/);if(fyDigits)fy=parseInt(fyDigits[1]);const numDigits=parts[2].match(/^(\d+)/);if(numDigits)num=parseInt(numDigits[1])}return{fy,num}}; const mapped=(data||[]).map(d=>({...d.data,id:d.original_id,deletedBy:d.deleted_by,deletedAt:d.deleted_at})); mapped.sort((a,b)=>{const pa=getOrderParts(a.orderNo);const pb=getOrderParts(b.orderNo);if(pb.fy!==pa.fy)return pb.fy-pa.fy;return pb.num-pa.num}); cacheSet('deleted_orders',mapped,TTL_DELETED); res.json(mapped) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders/deleted/import', authenticate, adminOnly, async (req, res) => { try { const{orders}=req.body; if(!orders?.length)return res.status(400).json({error:'No orders provided'}); let added=0; const duplicates=[]; for(const o of orders){ const{data:existing}=await supabase.from('deleted_orders').select('original_id').eq('data->>order_no',o.orderNo); if(existing?.length){duplicates.push(o.orderNo);continue} const{data:maxRow}=await supabase.from('deleted_orders').select('original_id').order('original_id',{ascending:false}).limit(1); const nextId=maxRow?.length?(maxRow[0].original_id+1):90000; const orderData={date:o.date||'',poNo:o.poNo||'',client:o.client||'',orderNo:o.orderNo||'',status:o.status||'',deliveryDate:o.deliveryDate||'',deliveryRemarks:o.deliveryRemarks||'',customerName:o.customerName||'',gst:o.gst||'',billingAddress:o.billingAddress||'',followUp:o.followUp||'',photography:o.photography||'',photographyRemarks:o.photographyRemarks||'',siteVideo:o.siteVideo||'',siteVideoRemarks:o.siteVideoRemarks||'',review:o.review||'',reviewRemarks:o.reviewRemarks||'',salesRep:o.salesRep||'',deliveryAddress:o.deliveryAddress||'',phoneNo:o.phoneNo||'',siteVerification:o.siteVerification||'',siteVerificationRemarks:o.siteVerificationRemarks||'',installationStatus:o.installationStatus||'',installationRemarks:o.installationRemarks||'',lop:o.lop||'',sectionDrawing:o.sectionDrawing||'',sectionDrawingRemarks:o.sectionDrawingRemarks||'',inProduction:o.inProduction||'',installation:o.installation||'',totalAmount:o.totalAmount||0,receivedAmount:o.receivedAmount||0,balance:o.balance||0,percentReceived:o.percentReceived||0,followUpType:o.followUpType||'',paymentRemarks:o.paymentRemarks||'',akhilPoints:o.akhilPoints||'',daysToOrder:o.daysToOrder||0,akhilSirAudit:o.akhilSirAudit||'',remarks:o.remarks||'',advanceBill:o.advanceBill||'',advanceBillRemarks:o.advanceBillRemarks||'',orRecvd:o.orRecvd||'',wappGroup:o.wappGroup||'',wappNumber:o.wappNumber||'',wappGroupMade:o.wappGroupMade||''}; const{error}=await supabase.from('deleted_orders').insert({original_id:nextId+added,data:orderData,deleted_by:o.deletedBy||req.user.username}); if(!error)added++ } res.json({added,duplicates}) } catch(e){res.status(500).json({error:e.message})} })
app.get('/api/orders/payments/all', authenticate, async (req, res) => { try { const cached=cacheGet('payments_all'); if(cached) return res.json(cached); const{data:payments}=await supabase.from('payments').select('id,order_id,date,amount,mode,remarks').order('date',{ascending:false}); const{data:allOrders}=await supabase.from('orders').select('id,order_no,client,date,total_amount,received_amount,balance'); const om={};(allOrders||[]).forEach(o=>{om[o.id]=o}); const result=(payments||[]).map(p=>{const o=om[p.order_id]||{};return{id:p.id,orderId:p.order_id,paymentDate:p.date,amount:p.amount,mode:p.mode,remarks:p.remarks,orderNo:o.order_no||'',client:o.client||'',orderDate:o.date||'',totalAmount:o.total_amount||0,receivedAmount:o.received_amount||0,balance:o.balance||0}}); cacheSet('payments_all',result,TTL_PAYMENTS_ALL); res.json(result) } catch(e){res.status(500).json({error:e.message})} })
app.get('/api/orders/reminders/due', authenticate, async (req, res) => { try { const cached=cacheGet('reminders_all'); if(cached){ const filtered=(cached||[]).filter(r=>{if(r.responded_by)return false;if(req.user.role==='admin')return true;if(r.created_by===req.user.username)return true;if(r.visible_to&&r.visible_to.includes(req.user.username))return true;return false}); return res.json(filtered) } const{data}=await supabase.from('reminders').select('id,order_id,order_no,client,description,date,visible_to,assigned_to,created_by,response_text,response_date,responded_by,created_at'); cacheSet('reminders_all',data||[],TTL_REMINDERS); const filtered=(data||[]).filter(r=>{if(r.responded_by)return false; if(req.user.role==='admin')return true;if(r.created_by===req.user.username)return true;if(r.visible_to&&r.visible_to.includes(req.user.username))return true;return false}); res.json(filtered.map(r=>({...r,orderNo:r.order_no,createdBy:r.created_by,orderId:r.order_id,visibleTo:r.visible_to,responseText:r.response_text}))) } catch(e){res.status(500).json({error:e.message})} })
app.get('/api/app-version', async (req, res) => { try { const cached=cacheGet('app_version'); if(cached) return res.json(cached); const{data}=await supabase.from('app_settings').select('value').eq('key','app_version').limit(1); const result={version:data?.[0]?.value||'1'}; cacheSet('app_version',result,TTL_APP_VERSION); res.json(result) } catch(e){res.json({version:'1'})} })
app.post('/api/force-refresh', authenticate, adminOnly, async (req, res) => { try { const newVersion=Date.now().toString(); const{data:existing}=await supabase.from('app_settings').select('key').eq('key','app_version'); if(existing&&existing.length>0){await supabase.from('app_settings').update({value:newVersion}).eq('key','app_version')}else{await supabase.from('app_settings').insert({key:'app_version',value:newVersion})} cacheDel('app_version'); res.json({message:'Force refresh triggered',version:newVersion}) } catch(e){res.status(500).json({error:e.message})} })
app.delete('/api/orders/reminders/:id', authenticate, async (req, res) => { try { await supabase.from('reminders').delete().eq('id',parseInt(req.params.id)); cacheDel('reminders_all'); res.json({message:'Dismissed'}) } catch(e){res.status(500).json({error:e.message})} })
app.put('/api/orders/reminders/:id/respond', authenticate, async (req, res) => { try { const{responseText}=req.body; if(!responseText||responseText.trim().length<10)return res.status(400).json({error:'Response must be at least 10 characters'}); if(responseText.trim().length>250)return res.status(400).json({error:'Response must not exceed 250 characters'}); const{data:existing}=await supabase.from('reminders').select('response_text').eq('id',parseInt(req.params.id)); const prev=existing?.[0]?.response_text||''; const dateStr=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'2-digit'}); const newResponse=prev?`${prev} | ${dateStr}: ${responseText.toUpperCase()}`:`${dateStr}: ${responseText.toUpperCase()}`; await supabase.from('reminders').update({response_text:newResponse,response_date:new Date().toISOString(),responded_by:req.user.username}).eq('id',parseInt(req.params.id)); cacheDel('reminders_all'); res.json({message:'Response saved'}) } catch(e){res.status(500).json({error:e.message})} })
app.put('/api/orders/reminders/:id/reassign', authenticate, async (req, res) => { try { const{reason}=req.body; const{data:existing}=await supabase.from('reminders').select('response_text').eq('id',parseInt(req.params.id)); const prev=existing?.[0]?.response_text||''; const dateStr=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'2-digit'}); const reasonText=reason?` - ${reason}`:'' ; const appendText=`${prev?prev+' | ':''}${dateStr}: REASSIGNED BY ${req.user.username.toUpperCase()}${reasonText}`; await supabase.from('reminders').update({response_text:appendText,response_date:null,responded_by:null,date:new Date().toISOString().split('T')[0]}).eq('id',parseInt(req.params.id)); cacheDel('reminders_all'); res.json({message:'Reminder reassigned'}) } catch(e){res.status(500).json({error:e.message})} })
app.get('/api/orders/reminders/all', authenticate, async (req, res) => { try { const cached=cacheGet('reminders_all'); const raw=cached||(await (async()=>{const{data}=await supabase.from('reminders').select('id,order_id,order_no,client,description,date,visible_to,assigned_to,created_by,response_text,response_date,responded_by,created_at').order('created_at',{ascending:false}); cacheSet('reminders_all',data||[],TTL_REMINDERS); return data||[]})()) ; const isAdmin=req.user.role==='admin'; const filtered=(raw||[]).filter(r=>{if(isAdmin)return true;return r.created_by===req.user.username}); res.json(filtered.map(r=>({...r,orderNo:r.order_no,createdBy:r.created_by,orderId:r.order_id,visibleTo:r.visible_to,assignedTo:r.assigned_to,responseText:r.response_text,responseDate:r.response_date,respondedBy:r.responded_by}))) } catch(e){res.status(500).json({error:e.message})} })
// Lightweight change-detection signal for reminders. { count, maxId } catches new/deleted reminders;
// maxResponseDate = max(response_date) catches responses/reassigns (what checkNewResponses watches).
app.get('/api/orders/reminders/signal', authenticate, async (req, res) => {
  try {
    const result = await cachedRead('reminders_signal', 30000, async () => {
      const [countResult, maxResult, responseResult] = await Promise.all([
        supabase.from('reminders').select('id', { count: 'exact', head: true }).abortSignal(AbortSignal.timeout(10000)),
        supabase.from('reminders').select('id').order('id', { ascending: false }).limit(1).abortSignal(AbortSignal.timeout(10000)),
        supabase.from('reminders').select('response_date').order('response_date', { ascending: false, nullsFirst: false }).limit(1).abortSignal(AbortSignal.timeout(10000))
      ])
      const error = countResult.error || maxResult.error || responseResult.error
      if (error) throw error
      return { count: countResult.count || 0, maxId: maxResult.data?.[0]?.id || 0, maxResponseDate: responseResult.data?.[0]?.response_date || null }
    })
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.get('/api/orders/paper-requests/all', authenticate, async (req, res) => { try { const cached=cacheGet('paper_requests_all'); if(cached) return res.json(cached); const{data}=await supabase.from('paper_requests').select('*').order('id',{ascending:false}); const result=(data||[]).map(r=>({...r,orderNo:r.order_no,requestedBy:r.requested_by,issueTo:r.issue_to,acceptedBy:r.accepted_by,acceptedAt:r.accepted_at,rejectRemarks:r.reject_remarks,createdAt:r.created_at,placedByAdmin:r.placed_by_admin})); cacheSet('paper_requests_all',result,TTL_PAPER); res.json(result) } catch(e){res.status(500).json({error:e.message})} })
app.get('/api/orders/paper-requests/my', authenticate, async (req, res) => { try { const cacheKey = `paper_my_${req.user.username}`; const result = await cachedRead(cacheKey, 60000, async () => { const{data}=await supabase.from('paper_requests').select('*').eq('issue_to',req.user.username).eq('status','PENDING'); return (data||[]).map(r=>({...r,orderNo:r.order_no,requestedBy:r.requested_by,issueTo:r.issue_to})) }); res.json(result) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders/paper-requests', authenticate, async (req, res) => { try { const{orderNo,issueTo,onBehalfOf,requestDate}=req.body; const effectiveRequester=(req.user.role==='admin'&&onBehalfOf)?onBehalfOf:req.user.username; const placedByAdmin=(req.user.role==='admin'&&onBehalfOf)?req.user.username:null; const backDate=(req.user.role==='admin'&&requestDate&&!isNaN(new Date(requestDate).getTime()))?new Date(requestDate).toISOString():null; if(!orderNo||!issueTo)return res.status(400).json({error:'Order No and Issue To required'}); const{data:pendingReturn}=await supabase.from('return_requests').select('*').eq('order_no',orderNo).eq('status','PENDING'); if(pendingReturn&&pendingReturn.length>0)return res.status(400).json({error:`${(pendingReturn[0].requested_by||'').toUpperCase()}'s return request is pending for ${orderNo}. Please close it first.`}); const{data:pendingReqs}=await supabase.from('paper_requests').select('*').eq('order_no',orderNo).eq('status','PENDING'); if(pendingReqs&&pendingReqs.length>0){return res.status(400).json({error:`Other issue request already in progress, contact Administrator`})} const{data:acceptedReqs}=await supabase.from('paper_requests').select('*').eq('order_no',orderNo).eq('status','ACCEPTED'); if(acceptedReqs&&acceptedReqs.length>0){const{data:returnAccepted}=await supabase.from('return_requests').select('*').eq('order_no',orderNo).eq('status','ACCEPTED');if(!returnAccepted||returnAccepted.length===0){const issuedTo=acceptedReqs[0].requested_by||acceptedReqs[0].issue_to;return res.status(400).json({error:`Order ${orderNo} is already issued to ${issuedTo.toUpperCase()} (not returned yet)`,issuedTo:issuedTo,canReissue:true})}else{await supabase.from('paper_requests').update({status:'RETURNED'}).eq('order_no',orderNo).eq('status','ACCEPTED')}} const{data:orders}=await supabase.from('orders').select('client').eq('order_no',orderNo); let client=orders?.[0]?.client||''; if(!client){const{data:delOrd}=await supabase.from('deleted_orders').select('data').eq('data->>order_no',orderNo).limit(1); client=delOrd?.[0]?.data?.client||''} const{data,error}=await supabase.from('paper_requests').insert({order_no:orderNo,client,requested_by:effectiveRequester,issue_to:issueTo,status:'PENDING',placed_by_admin:placedByAdmin,...(backDate?{created_at:backDate}:{})}).select(); if(error)return res.status(400).json({error:error.message}); cacheDel('paper_requests_all'); cacheClear('paper_my_'); res.json(data[0]) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders/paper-requests/:id/accept', authenticate, async (req, res) => { try { const{data:reqs}=await supabase.from('paper_requests').select('*').eq('id',parseInt(req.params.id)); if(!reqs?.length)return res.status(404).json({error:'Not found'}); const request=reqs[0]; const{data:pendRet}=await supabase.from('return_requests').select('*').eq('order_no',request.order_no).eq('status','PENDING'); if(pendRet&&pendRet.length>0)return res.status(400).json({error:`${(pendRet[0].requested_by||'').toUpperCase()}'s return request is pending for ${request.order_no}. Please close it first.`}); if(request.reject_remarks==='REISSUE'){await supabase.from('paper_requests').update({status:`REISSUED BY ${req.user.username.toUpperCase()} TO ${request.requested_by.toUpperCase()}`}).eq('order_no',request.order_no).eq('status','ACCEPTED'); await supabase.from('paper_requests').update({status:'ACCEPTED',accepted_by:req.user.username,accepted_at:new Date().toISOString(),reject_remarks:null}).eq('id',request.id)}else{await supabase.from('paper_requests').update({status:'ACCEPTED',accepted_by:req.user.username,accepted_at:new Date().toISOString()}).eq('id',parseInt(req.params.id))} cacheDel('paper_requests_all'); cacheClear('paper_my_'); res.json({message:'Accepted'}) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders/paper-requests/reissue', authenticate, async (req, res) => { try { const{orderNo}=req.body; if(!orderNo)return res.status(400).json({error:'Order No required'}); const{data:allReqs}=await supabase.from('paper_requests').select('status').eq('order_no',orderNo); const reissueCount=(allReqs||[]).filter(r=>r.status&&r.status.startsWith('REISSUED')).length; if(reissueCount>=2)return res.status(400).json({error:'Maximum 2 reissues reached. Please use Return Request.'}); const{data:acceptedReqs}=await supabase.from('paper_requests').select('*').eq('order_no',orderNo).eq('status','ACCEPTED'); if(!acceptedReqs||acceptedReqs.length===0)return res.status(400).json({error:'No active issue found'}); const currentHolder=acceptedReqs[0].requested_by||acceptedReqs[0].issue_to; const{data:orders}=await supabase.from('orders').select('client').eq('order_no',orderNo); const client=orders?.[0]?.client||''; const{data,error}=await supabase.from('paper_requests').insert({order_no:orderNo,client,requested_by:req.user.username,issue_to:currentHolder,status:'PENDING',reject_remarks:'REISSUE'}).select(); if(error)return res.status(400).json({error:error.message}); cacheDel('paper_requests_all'); cacheClear('paper_my_'); res.json(data[0]) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders/paper-requests/:id/reject', authenticate, async (req, res) => { try { const{remarks}=req.body; await supabase.from('paper_requests').update({status:`REJECTED: ${remarks||''}`,rejected_by:req.user.username,reject_remarks:remarks||''}).eq('id',parseInt(req.params.id)); cacheDel('paper_requests_all'); cacheClear('paper_my_'); res.json({message:'Rejected'}) } catch(e){res.status(500).json({error:e.message})} })
app.put('/api/orders/paper-requests/:id/change-user', authenticate, async (req, res) => { try { const{issueTo}=req.body; const{data:reqs}=await supabase.from('paper_requests').select('*').eq('id',parseInt(req.params.id)); if(!reqs?.length)return res.status(404).json({error:'Not found'}); if(reqs[0].requested_by!==req.user.username&&req.user.role!=='admin')return res.status(403).json({error:'Only requester can change'}); if(reqs[0].status!=='PENDING')return res.status(400).json({error:'Can only change before acceptance'}); await supabase.from('paper_requests').update({issue_to:issueTo}).eq('id',parseInt(req.params.id)); cacheDel('paper_requests_all'); cacheClear('paper_my_'); res.json({message:'Updated'}) } catch(e){res.status(500).json({error:e.message})} })
app.put('/api/orders/return-requests/:id/change-user', authenticate, async (req, res) => { try { const{returnTo}=req.body; const{data:reqs}=await supabase.from('return_requests').select('*').eq('id',parseInt(req.params.id)); if(!reqs?.length)return res.status(404).json({error:'Not found'}); if(reqs[0].requested_by!==req.user.username&&req.user.role!=='admin')return res.status(403).json({error:'Only requester can change'}); if(reqs[0].status!=='PENDING')return res.status(400).json({error:'Can only change before acceptance'}); await supabase.from('return_requests').update({return_to:returnTo}).eq('id',parseInt(req.params.id)); cacheDel('return_requests_all'); cacheClear('return_my_'); res.json({message:'Updated'}) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders/paper-requests/:id/reroute', authenticate, async (req, res) => { try { const{rerouteTo}=req.body; const{data:reqs}=await supabase.from('paper_requests').select('*').eq('id',parseInt(req.params.id)); if(!reqs?.length)return res.status(404).json({error:'Not found'}); const r=reqs[0]; await supabase.from('paper_requests').update({status:`REROUTED TO ${rerouteTo.toUpperCase()}`,rerouted_by:req.user.username}).eq('id',r.id); const{data}=await supabase.from('paper_requests').insert({order_no:r.order_no,client:r.client,requested_by:r.requested_by,issue_to:rerouteTo,status:'PENDING'}).select(); cacheDel('paper_requests_all'); cacheClear('paper_my_'); res.json(data[0]) } catch(e){res.status(500).json({error:e.message})} })
app.delete('/api/orders/paper-requests/:id', authenticate, adminOnly, async (req, res) => { try { await supabase.from('paper_requests').delete().eq('id',parseInt(req.params.id)); cacheDel('paper_requests_all'); cacheClear('paper_my_'); res.json({message:'Deleted'}) } catch(e){res.status(500).json({error:e.message})} })
app.get('/api/orders/return-requests/all', authenticate, async (req, res) => { try { const cached=cacheGet('return_requests_all'); if(cached) return res.json(cached); const{data}=await supabase.from('return_requests').select('*').order('id',{ascending:false}); const result=(data||[]).map(r=>({...r,orderNo:r.order_no,requestedBy:r.requested_by,returnTo:r.return_to,acceptedBy:r.accepted_by,acceptedAt:r.accepted_at,createdAt:r.created_at,rejectRemarks:r.reject_remarks,placedByAdmin:r.placed_by_admin})); cacheSet('return_requests_all',result,TTL_PAPER); res.json(result) } catch(e){res.status(500).json({error:e.message})} })
app.get('/api/orders/return-requests/my', authenticate, async (req, res) => { try { const cacheKey = `return_my_${req.user.username}`; const result = await cachedRead(cacheKey, 60000, async () => { const{data}=await supabase.from('return_requests').select('*').eq('return_to',req.user.username).eq('status','PENDING'); return (data||[]).map(r=>({...r,orderNo:r.order_no,requestedBy:r.requested_by,returnTo:r.return_to})) }); res.json(result) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders/return-requests', authenticate, async (req, res) => { try { const{orderNo,returnTo,onBehalfOf,requestDate}=req.body; const actor=(req.user.role==='admin'&&onBehalfOf)?onBehalfOf:req.user.username; const effectiveRequester=(req.user.role==='admin'&&onBehalfOf)?onBehalfOf:req.user.username; const placedByAdmin=(req.user.role==='admin'&&onBehalfOf)?req.user.username:null; const backDate=(req.user.role==='admin'&&requestDate&&!isNaN(new Date(requestDate).getTime()))?new Date(requestDate).toISOString():null; if(!orderNo||!returnTo)return res.status(400).json({error:'Required'}); const{data:acceptedReqs}=await supabase.from('paper_requests').select('*').eq('order_no',orderNo).eq('status','ACCEPTED'); if(!acceptedReqs||acceptedReqs.length===0)return res.status(400).json({error:`Order ${orderNo} is not currently issued to anyone`}); const holder=acceptedReqs[0].requested_by; if(holder!==actor)return res.status(400).json({error:`Order ${orderNo} paper is with ${holder.toUpperCase()}, only they can submit a return request`}); const{data:pendingReturn}=await supabase.from('return_requests').select('*').eq('order_no',orderNo).eq('status','PENDING'); if(pendingReturn&&pendingReturn.length>0)return res.status(400).json({error:`Return request for ${orderNo} is already pending`}); const{data:orders}=await supabase.from('orders').select('client').eq('order_no',orderNo); let rtClient=orders?.[0]?.client||''; if(!rtClient){const{data:delOrd}=await supabase.from('deleted_orders').select('data').eq('data->>order_no',orderNo).limit(1); rtClient=delOrd?.[0]?.data?.client||''} const{data}=await supabase.from('return_requests').insert({order_no:orderNo,client:rtClient,requested_by:effectiveRequester,return_to:returnTo,status:'PENDING',placed_by_admin:placedByAdmin,...(backDate?{created_at:backDate}:{})}).select(); cacheDel('return_requests_all'); cacheClear('return_my_'); res.json(data[0]) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders/return-requests/:id/accept', authenticate, async (req, res) => { try { const{data:reqs}=await supabase.from('return_requests').select('*').eq('id',parseInt(req.params.id)); if(!reqs?.length)return res.status(404).json({error:'Not found'}); await supabase.from('return_requests').update({status:'ACCEPTED',accepted_by:req.user.username,accepted_at:new Date().toISOString()}).eq('id',parseInt(req.params.id)); await supabase.from('paper_requests').update({status:'RETURNED'}).eq('order_no',reqs[0].order_no).eq('status','ACCEPTED'); await supabase.from('paper_requests').update({status:'CANCELLED'}).eq('order_no',reqs[0].order_no).eq('status','PENDING'); cacheDel('return_requests_all','paper_requests_all'); cacheClear('return_my_'); cacheClear('paper_my_'); res.json({message:'Accepted'}) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders/return-requests/:id/reject', authenticate, async (req, res) => { try { const{remarks}=req.body; await supabase.from('return_requests').update({status:`REJECTED: ${remarks||''}`,rejected_by:req.user.username,reject_remarks:remarks||''}).eq('id',parseInt(req.params.id)); cacheDel('return_requests_all'); cacheClear('return_my_'); res.json({message:'Rejected'}) } catch(e){res.status(500).json({error:e.message})} })
app.get('/api/orders/:id', authenticate, async (req, res) => { try { const{data}=await supabase.from('orders').select('*').eq('id',parseInt(req.params.id)); if(!data?.length)return res.status(404).json({error:'Not found'}); const{data:payments}=await supabase.from('payments').select('*').eq('order_id',parseInt(req.params.id)); res.json({...mapOrder(data[0]),payments}) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders', authenticate, async (req, res) => { try { const{data,error}=await supabase.from('orders').insert(snakeOrder(req.body)).select(); if(error)return res.status(400).json({error:error.message}); cacheDel('orders','payments_all'); res.json(mapOrder(data[0])) } catch(e){res.status(500).json({error:e.message})} })
app.put('/api/orders/:id', authenticate, async (req, res) => { try { const AUTO_FIELDS=['receivedAmount','balance','percentReceived','received_amount','percent_received','id','createdAt','created_at','payments','_needsOrderNo','daysToOrder','rowColor','paymentProofUrl','payment_proof_url','auditProofUrl','audit_proof_url']; const{data:existing}=await supabase.from('orders').select('*').eq('id',parseInt(req.params.id)); const oldOrder=existing?.[0]?mapOrder(existing[0]):{}; const{error}=await supabase.from('orders').update(snakeOrder(req.body)).eq('id',parseInt(req.params.id)); if(error)return res.status(400).json({error:error.message}); if(req.body.totalAmount!==undefined||req.body.receivedAmount!==undefined){const{data:updated}=await supabase.from('orders').select('total_amount,received_amount').eq('id',parseInt(req.params.id));if(updated?.[0]){const ta=parseFloat(updated[0].total_amount)||0;const ra=parseFloat(updated[0].received_amount)||0;const bal=ta-ra;const pct=ta?parseFloat(((ra/ta)*100).toFixed(2)):0;await supabase.from('orders').update({balance:bal,percent_received:pct}).eq('id',parseInt(req.params.id))}} const changes=[]; Object.keys(req.body).forEach(key=>{if(AUTO_FIELDS.includes(key))return;const oldVal=String(oldOrder[key]||'').trim();const newVal=String(req.body[key]||'').trim();if(oldVal!==newVal&&!(oldVal==='0'&&newVal==='')&&!(oldVal===''&&newVal==='0'))changes.push({field:key,oldValue:oldVal,newValue:newVal})}); if(changes.length>0){await supabase.from('order_edit_history').insert({order_id:parseInt(req.params.id),order_no:oldOrder.orderNo||'',edit_type:'ORDER_EDIT',edited_by:req.user.username,changes})} try{const akhilChanged=changes.some(c=>c.field==='akhilPoints');const nv=String(req.body.akhilPoints||'').trim();if(akhilChanged&&nv&&req.user.role==='admin'){const{data:pg}=await supabase.from('users').select('username').ilike('full_name','POONAM GUPTA').limit(1);const pgUser=pg?.[0]?.username;if(pgUser){const today=new Date().toISOString().split('T')[0];await supabase.from('reminders').insert({order_id:parseInt(req.params.id),order_no:oldOrder.orderNo||'',client:oldOrder.client||'',description:`AKHIL PAYMENT REMARKS UPDATED: ${nv}`,date:today,visible_to:[pgUser],assigned_to:pgUser,created_by:req.user.username}); cacheDel('reminders_all')}}}catch(remErr){console.error('Akhil reminder failed',remErr)} cacheDel('orders','payments_all'); res.json({message:'Updated'}) } catch(e){res.status(500).json({error:e.message})} })
app.delete('/api/orders/:id', authenticate, async (req, res) => { try { const{data:orders}=await supabase.from('orders').select('*').eq('id',parseInt(req.params.id)); if(!orders?.length)return res.status(404).json({error:'Not found'}); let delId=orders[0].id; const{data:existDel}=await supabase.from('deleted_orders').select('original_id').eq('original_id',delId); if(existDel?.length){const{data:maxRow}=await supabase.from('deleted_orders').select('original_id').order('original_id',{ascending:false}).limit(1); delId=(maxRow?.length?maxRow[0].original_id:90000)+1} const{data:insDel,error:insErr}=await supabase.from('deleted_orders').insert({original_id:delId,data:mapOrder(orders[0]),deleted_by:req.user.username}).select(); if(insErr)return res.status(400).json({error:insErr.message}); if(!insDel||!insDel.length)return res.status(400).json({error:'Delete failed - could not archive order'}); if(delId!==orders[0].id){await supabase.from('payments').update({order_id:delId}).eq('order_id',orders[0].id)} await supabase.from('orders').delete().eq('id',parseInt(req.params.id)); cacheDel('orders','deleted_orders','payments_all'); res.json({message:'Deleted'}) } catch(e){res.status(500).json({error:e.message})} })
app.put('/api/orders/deleted/:id/update', authenticate, async (req, res) => { try { if(!(await userHasRight(req,'can_edit_completed'))) return res.status(403).json({error:'No permission'}); const{data:dels}=await supabase.from('deleted_orders').select('*').eq('original_id',parseInt(req.params.id)); if(!dels?.length)return res.status(404).json({error:'Not found'}); const updatedData={...dels[0].data,...req.body}; const{error}=await supabase.from('deleted_orders').update({data:updatedData}).eq('original_id',parseInt(req.params.id)); if(error)return res.status(400).json({error:error.message}); cacheDel('deleted_orders'); res.json({message:'Updated'}) } catch(e){res.status(500).json({error:e.message})} })
app.delete('/api/orders/deleted/:id', authenticate, adminOnly, async (req, res) => { try { await supabase.from('payments').delete().eq('order_id',parseInt(req.params.id)); await supabase.from('deleted_orders').delete().eq('original_id',parseInt(req.params.id)); cacheDel('deleted_orders','payments_all'); res.json({message:'Permanently deleted'}) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders/deleted/:id/restore', authenticate, adminOnly, async (req, res) => { try { const{data:dels}=await supabase.from('deleted_orders').select('*').eq('original_id',parseInt(req.params.id)); if(!dels?.length)return res.status(404).json({error:'Not found'}); const orderData=dels[0].data; const snaked={}; Object.keys(orderData).forEach(k=>{const s=snakeOrder({[k]:orderData[k]}); Object.assign(snaked,s)}); delete snaked.id; delete snaked.created_at; const{data:inserted,error}=await supabase.from('orders').insert(snaked).select(); if(error)return res.status(400).json({error:error.message}); if(!inserted||!inserted.length)return res.status(400).json({error:'Restore failed - order not inserted'}); const newId=inserted[0].id; await supabase.from('payments').update({order_id:newId}).eq('order_id',parseInt(req.params.id)); const{data:rPays}=await supabase.from('payments').select('amount').eq('order_id',newId); const rTot=(rPays||[]).reduce((s,p)=>s+(p.amount||0),0); const rTa=inserted[0].total_amount||0; await supabase.from('orders').update({received_amount:rTot,balance:rTa-rTot,percent_received:rTa?parseFloat(((rTot/rTa)*100).toFixed(2)):0}).eq('id',newId); await supabase.from('deleted_orders').delete().eq('original_id',parseInt(req.params.id)); cacheDel('orders','deleted_orders','payments_all'); res.json({message:'Restored'}) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders/import', authenticate, adminOnly, async (req, res) => { try { const{orders,overwrite}=req.body;let added=0;const dupes=[]; for(const o of orders){const{data:ex}=await supabase.from('orders').select('id').eq('order_no',o.orderNo);if(ex?.length){if(overwrite){await supabase.from('orders').update(snakeOrder(o)).eq('order_no',o.orderNo);added++}else{dupes.push(o.orderNo)}}else{await supabase.from('orders').insert(snakeOrder(o));added++}} cacheDel('orders','payments_all'); res.json({added,duplicates:dupes}) } catch(e){res.status(500).json({error:e.message})} })
app.get('/api/orders/:id/payments', authenticate, async (req, res) => { try { const{data}=await supabase.from('payments').select('*').eq('order_id',parseInt(req.params.id)).order('date',{ascending:false}); res.json(data||[]) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders/:id/payments', authenticate, async (req, res) => { try { const{date,mode,amount,remarks}=req.body; await supabase.from('payments').insert({order_id:parseInt(req.params.id),date,mode,amount:parseFloat(amount),remarks}).select(); const{data:pays}=await supabase.from('payments').select('amount').eq('order_id',parseInt(req.params.id)); const tot=(pays||[]).reduce((s,p)=>s+(p.amount||0),0); const{data:ord}=await supabase.from('orders').select('total_amount').eq('id',parseInt(req.params.id)); if(ord?.length){const ta=ord[0].total_amount||0; await supabase.from('orders').update({received_amount:tot,balance:ta-tot,percent_received:ta?parseFloat(((tot/ta)*100).toFixed(2)):0}).eq('id',parseInt(req.params.id))}else{const{data:del}=await supabase.from('deleted_orders').select('data').eq('original_id',parseInt(req.params.id)); if(del?.length){const d=del[0].data||{}; const ta=d.total_amount??d.totalAmount??0; const newData={...d,received_amount:tot,balance:ta-tot,percent_received:ta?parseFloat(((tot/ta)*100).toFixed(2)):0}; await supabase.from('deleted_orders').update({data:newData}).eq('original_id',parseInt(req.params.id)); cacheDel('deleted_orders')}} cacheDel('orders','payments_all'); res.json({message:'Added'}) } catch(e){res.status(500).json({error:e.message})} })
app.put('/api/orders/:id/payments/:pid', authenticate, async (req, res) => { try { if(!(await userHasRight(req,'can_edit_receipt'))) return res.status(403).json({error:'No permission'}); const{date,mode,amount,remarks}=req.body; const{data:oldPay}=await supabase.from('payments').select('*').eq('id',parseInt(req.params.pid)); const old=oldPay?.[0]||{}; await supabase.from('payments').update({date,mode,amount:parseFloat(amount),remarks}).eq('id',parseInt(req.params.pid)); const{data:pays}=await supabase.from('payments').select('amount').eq('order_id',parseInt(req.params.id)); const tot=(pays||[]).reduce((s,p)=>s+(p.amount||0),0); const{data:ord}=await supabase.from('orders').select('total_amount,order_no').eq('id',parseInt(req.params.id)); if(ord?.length){const ta=ord[0].total_amount||0; await supabase.from('orders').update({received_amount:tot,balance:ta-tot,percent_received:ta?parseFloat(((tot/ta)*100).toFixed(2)):0}).eq('id',parseInt(req.params.id))}else{const{data:del}=await supabase.from('deleted_orders').select('data').eq('original_id',parseInt(req.params.id)); if(del?.length){const d=del[0].data||{}; const ta=d.total_amount??d.totalAmount??0; const newData={...d,received_amount:tot,balance:ta-tot,percent_received:ta?parseFloat(((tot/ta)*100).toFixed(2)):0}; await supabase.from('deleted_orders').update({data:newData}).eq('original_id',parseInt(req.params.id)); cacheDel('deleted_orders')}} const changes=[]; if(String(old.date||'')!==String(date||''))changes.push({field:'Receipt Date',oldValue:old.date||'',newValue:date||''}); if(String(old.mode||'')!==String(mode||''))changes.push({field:'Receipt Mode',oldValue:old.mode||'',newValue:mode||''}); if(String(old.amount||'')!==String(amount||''))changes.push({field:'Receipt Amount',oldValue:String(old.amount||''),newValue:String(amount||'')}); if(String(old.remarks||'')!==String(remarks||''))changes.push({field:'Receipt Remarks',oldValue:old.remarks||'',newValue:remarks||''}); if(changes.length>0){await supabase.from('order_edit_history').insert({order_id:parseInt(req.params.id),order_no:ord?.[0]?.order_no||'',edit_type:'RECEIPT_EDIT',edited_by:req.user.username,changes})} cacheDel('orders','payments_all'); res.json({message:'Updated'}) } catch(e){res.status(500).json({error:e.message})} })
app.delete('/api/orders/:id/payments/:pid', authenticate, async (req, res) => { try { if(!(await userHasRight(req,'can_edit_receipt'))) return res.status(403).json({error:'No permission'}); await supabase.from('payments').delete().eq('id',parseInt(req.params.pid)); const{data:pays}=await supabase.from('payments').select('amount').eq('order_id',parseInt(req.params.id)); const tot=(pays||[]).reduce((s,p)=>s+(p.amount||0),0); const{data:ord}=await supabase.from('orders').select('total_amount').eq('id',parseInt(req.params.id)); if(ord?.length){const ta=ord[0].total_amount||0; await supabase.from('orders').update({received_amount:tot,balance:ta-tot,percent_received:ta?parseFloat(((tot/ta)*100).toFixed(2)):0}).eq('id',parseInt(req.params.id))}else{const{data:del}=await supabase.from('deleted_orders').select('data').eq('original_id',parseInt(req.params.id)); if(del?.length){const d=del[0].data||{}; const ta=d.total_amount??d.totalAmount??0; const newData={...d,received_amount:tot,balance:ta-tot,percent_received:ta?parseFloat(((tot/ta)*100).toFixed(2)):0}; await supabase.from('deleted_orders').update({data:newData}).eq('original_id',parseInt(req.params.id)); cacheDel('deleted_orders')}} cacheDel('orders','payments_all'); res.json({message:'Deleted'}) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/orders/:id/reminders', authenticate, async (req, res) => { try { const{description,date,visibleTo}=req.body; const{data:orders}=await supabase.from('orders').select('order_no,client').eq('id',parseInt(req.params.id)); const o=orders?.[0]; const users=visibleTo&&visibleTo.length>0?visibleTo:[req.user.username]; const rows=users.map(u=>({order_id:parseInt(req.params.id),order_no:o?.order_no,client:o?.client,description,date,visible_to:[u],assigned_to:u,created_by:req.user.username})); const{data}=await supabase.from('reminders').insert(rows).select(); cacheDel('reminders_all'); res.json(data?.[0]||{message:'Reminders created'}) } catch(e){res.status(500).json({error:e.message})} })

app.get('/api/orders/edit-logs/all', authenticate, async (req, res) => { try { const{data}=await supabase.from('order_edit_history').select('*').order('created_at',{ascending:false}).limit(500); res.json(data||[]) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/upload-payment-proof', authenticate, async (req, res) => { try { const{orderId,fileData,fileName}=req.body; if(!fileData||!fileName)return res.status(400).json({error:'File required'}); const buffer=Buffer.from(fileData,'base64'); if(buffer.length>2*1024*1024)return res.status(400).json({error:'Image size must be less than 2MB'}); const ext=(fileName.split('.').pop()||'jpg').toLowerCase(); const allowedExts=['jpg','jpeg','png','gif','bmp','webp','tiff','tif','svg']; if(!allowedExts.includes(ext))return res.status(400).json({error:'Only image files allowed (jpg, png, gif, bmp, webp, tiff, svg)'}); const contentTypes={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',bmp:'image/bmp',webp:'image/webp',tiff:'image/tiff',tif:'image/tiff',svg:'image/svg+xml'}; const contentType=contentTypes[ext]||'image/jpeg'; const safeName=fileName.replace(/[^a-zA-Z0-9._-]/g,'_').substring(0,50); const filePath=`${orderId}/${Date.now()}_${safeName}`; const{error:uploadErr}=await supabase.storage.from('payment-proofs').upload(filePath,buffer,{contentType,upsert:true}); if(uploadErr)return res.status(400).json({error:uploadErr.message}); const{data:urlData}=supabase.storage.from('payment-proofs').getPublicUrl(filePath); const publicUrl=urlData.publicUrl; await supabase.from('orders').update({payment_proof_url:publicUrl}).eq('id',parseInt(orderId)); res.json({url:publicUrl}) } catch(e){res.status(500).json({error:e.message})} })
app.delete('/api/delete-payment-proof/:orderId', authenticate, async (req, res) => { try { const orderId=parseInt(req.params.orderId); const{data:order}=await supabase.from('orders').select('payment_proof_url').eq('id',orderId); const url=order?.[0]?.payment_proof_url; if(url&&url.includes('/payment-proofs/')){const path=url.split('/payment-proofs/')[1]; if(path){try{await supabase.storage.from('payment-proofs').remove([decodeURIComponent(path)])}catch{}}} await supabase.from('orders').update({payment_proof_url:null}).eq('id',orderId); res.json({message:'Deleted'}) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/upload-audit-proof', authenticate, async (req, res) => { try { const{orderId,fileData,fileName}=req.body; if(!fileData||!fileName)return res.status(400).json({error:'File required'}); const buffer=Buffer.from(fileData,'base64'); if(buffer.length>1*1024*1024)return res.status(400).json({error:'Image size must be less than 1MB'}); const ext=(fileName.split('.').pop()||'jpg').toLowerCase(); const allowedExts=['jpg','jpeg','png','gif','bmp','webp','tiff','tif','svg']; if(!allowedExts.includes(ext))return res.status(400).json({error:'Only image files allowed (jpg, png, gif, bmp, webp, tiff, svg)'}); const contentTypes={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',bmp:'image/bmp',webp:'image/webp',tiff:'image/tiff',tif:'image/tiff',svg:'image/svg+xml'}; const contentType=contentTypes[ext]||'image/jpeg'; const safeName=fileName.replace(/[^a-zA-Z0-9._-]/g,'_').substring(0,50); const filePath=`${orderId}/${Date.now()}_${safeName}`; const{error:uploadErr}=await supabase.storage.from('audit-proofs').upload(filePath,buffer,{contentType,upsert:true}); if(uploadErr)return res.status(400).json({error:uploadErr.message}); const{data:urlData}=supabase.storage.from('audit-proofs').getPublicUrl(filePath); const publicUrl=urlData.publicUrl; await supabase.from('orders').update({audit_proof_url:publicUrl}).eq('id',parseInt(orderId)); res.json({url:publicUrl}) } catch(e){res.status(500).json({error:e.message})} })
app.delete('/api/delete-audit-proof/:orderId', authenticate, async (req, res) => { try { const orderId=parseInt(req.params.orderId); const{data:order}=await supabase.from('orders').select('audit_proof_url').eq('id',orderId); const url=order?.[0]?.audit_proof_url; if(url&&url.includes('/audit-proofs/')){const path=url.split('/audit-proofs/')[1]; if(path){try{await supabase.storage.from('audit-proofs').remove([decodeURIComponent(path)])}catch{}}} await supabase.from('orders').update({audit_proof_url:null}).eq('id',orderId); res.json({message:'Deleted'}) } catch(e){res.status(500).json({error:e.message})} })
app.get('/api/orders/:id/edit-logs', authenticate, async (req, res) => { try { const{data}=await supabase.from('order_edit_history').select('*').eq('order_id',parseInt(req.params.id)).order('created_at',{ascending:false}); res.json(data||[]) } catch(e){res.status(500).json({error:e.message})} })

// COMPLAINTS MANAGEMENT
function mapComplaint(c) {
  if (!c) return c
  return { id: c.id, complaintNo: c.complaint_no, complaintDate: c.complaint_date, client: c.client, customerName: c.customer_name, phone: c.phone, purchaseBillNo: c.purchase_bill_no, purchaseDate: c.purchase_date, warrantyStatus: c.warranty_status, product: c.product, problemReported: c.problem_reported, priority: c.priority, technician: c.technician, helper: c.helper, assignmentType: c.assignment_type, scheduledDate: c.scheduled_date, status: c.status, problemIdentified: c.problem_identified, resolution: c.resolution, billRequired: c.bill_required || false, billNo: c.bill_no, amount: c.amount, serviceSlipNo: c.service_slip_no, resolutionDate: c.resolution_date, resolutionHistory: c.resolution_history || [], createdBy: c.created_by, createdAt: c.created_at }
}
function snakeComplaint(c) {
  if (!c) return c; const s = {}
  if (c.complaintNo !== undefined) s.complaint_no = c.complaintNo; if (c.complaintDate !== undefined) s.complaint_date = c.complaintDate; if (c.client !== undefined) s.client = c.client; if (c.customerName !== undefined) s.customer_name = c.customerName; if (c.phone !== undefined) s.phone = c.phone; if (c.purchaseBillNo !== undefined) s.purchase_bill_no = c.purchaseBillNo; if (c.purchaseDate !== undefined) s.purchase_date = c.purchaseDate; if (c.warrantyStatus !== undefined) s.warranty_status = c.warrantyStatus; if (c.product !== undefined) s.product = c.product; if (c.problemReported !== undefined) s.problem_reported = c.problemReported; if (c.priority !== undefined) s.priority = c.priority; if (c.technician !== undefined) s.technician = c.technician; if (c.helper !== undefined) s.helper = c.helper; if (c.assignmentType !== undefined) s.assignment_type = c.assignmentType; if (c.scheduledDate !== undefined) s.scheduled_date = c.scheduledDate; if (c.status !== undefined) s.status = c.status; if (c.problemIdentified !== undefined) s.problem_identified = c.problemIdentified; if (c.resolution !== undefined) s.resolution = c.resolution; if (c.billRequired !== undefined) s.bill_required = !!c.billRequired; if (c.billNo !== undefined) s.bill_no = c.billNo; if (c.amount !== undefined) s.amount = parseFloat(c.amount) || 0; if (c.serviceSlipNo !== undefined) s.service_slip_no = c.serviceSlipNo; if (c.resolutionDate !== undefined) s.resolution_date = c.resolutionDate; if (c.resolutionHistory !== undefined) s.resolution_history = c.resolutionHistory; if (c.createdBy !== undefined) s.created_by = c.createdBy
  return s
}
app.get('/api/complaints', authenticate, async (req, res) => { try { const { data } = await supabase.from('complaints').select('id,complaint_no,complaint_date,client,customer_name,phone,purchase_bill_no,purchase_date,warranty_status,product,problem_reported,priority,technician,helper,assignment_type,scheduled_date,status,problem_identified,resolution,bill_required,bill_no,amount,service_slip_no,resolution_date,resolution_history,created_by,created_at').order('id',{ascending:false}); res.json((data||[]).map(c=>mapComplaint(c))) } catch(e){ res.status(500).json({error:e.message}) } })
app.post('/api/complaints', authenticate, async (req, res) => { try { const body = snakeComplaint(req.body); body.created_by = req.user.username; if (!body.status) body.status = 'OPEN'; if (!body.complaint_no) { const { data: last } = await supabase.from('complaints').select('id').order('id',{ascending:false}).limit(1); const nextNum = ((last?.[0]?.id) || 0) + 1; body.complaint_no = `CMP-${String(nextNum).padStart(4,'0')}` } const { data, error } = await supabase.from('complaints').insert(body).select(); if (error) return res.status(400).json({error:error.message}); res.json(mapComplaint(data[0])) } catch(e){ res.status(500).json({error:e.message}) } })
app.put('/api/complaints/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const closureAction = req.body.closureAction // 'closed' | 'pending' | undefined
    const update = snakeComplaint(req.body)
    if (closureAction === 'closed' || closureAction === 'pending') {
      const { data: existing } = await supabase.from('complaints').select('*').eq('id', id)
      const cur = existing?.[0] || {}
      const history = Array.isArray(cur.resolution_history) ? cur.resolution_history : []
      // snapshot: prefer values just submitted, fall back to stored
      const pick = (camel, snake) => (req.body[camel] !== undefined ? req.body[camel] : cur[snake])
      const entry = {
        attempt: history.length + 1,
        outcome: closureAction === 'closed' ? 'CLOSED' : 'PENDING',
        technician: pick('technician', 'technician'),
        helper: pick('helper', 'helper'),
        assignmentType: pick('assignmentType', 'assignment_type'),
        scheduledDate: pick('scheduledDate', 'scheduled_date'),
        problemIdentified: pick('problemIdentified', 'problem_identified'),
        resolution: pick('resolution', 'resolution'),
        billRequired: !!pick('billRequired', 'bill_required'),
        billNo: pick('billNo', 'bill_no'),
        amount: parseFloat(pick('amount', 'amount')) || 0,
        serviceSlipNo: pick('serviceSlipNo', 'service_slip_no'),
        resolutionDate: pick('resolutionDate', 'resolution_date'),
        savedBy: req.user.username,
        savedAt: new Date().toISOString()
      }
      update.resolution_history = [...history, entry]
      if (closureAction === 'closed') {
        update.status = 'CLOSED'
      } else {
        // Pending: re-open for a new attempt, but KEEP the last attempt's data visible in the row
        // (submitted values remain in `update`; history keeps the full log). New assignment overwrites.
        update.status = 'OPEN'
      }
    }
    delete update.closureAction
    const { error } = await supabase.from('complaints').update(update).eq('id', id)
    if (error) return res.status(400).json({ error: error.message })
    res.json({ message: 'Updated' })
  } catch(e){ res.status(500).json({error:e.message}) }
})
app.delete('/api/complaints/:id', authenticate, adminOnly, async (req, res) => { try { await supabase.from('complaints').delete().eq('id',parseInt(req.params.id)); res.json({message:'Deleted'}) } catch(e){ res.status(500).json({error:e.message}) } })
app.post('/api/complaints/import', authenticate, adminOnly, async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : []
    if (!rows.length) return res.status(400).json({ error: 'No rows to import' })
    // next running number for auto complaint_no
    const { data: last } = await supabase.from('complaints').select('id').order('id',{ascending:false}).limit(1)
    let nextNum = ((last?.[0]?.id) || 0)
    const toInsert = rows.map(r => {
      const s = snakeComplaint(r)
      if (!s.complaint_no || !String(s.complaint_no).trim()) { nextNum += 1; s.complaint_no = `CMP-${String(nextNum).padStart(4,'0')}` }
      if (!s.status || !String(s.status).trim()) s.status = 'OPEN'
      s.created_by = req.user.username
      delete s.id
      return s
    })
    const { data, error } = await supabase.from('complaints').insert(toInsert).select()
    if (error) return res.status(400).json({ error: error.message })
    res.json({ imported: (data || []).length })
  } catch(e){ res.status(500).json({ error: e.message }) }
})

// AUTHORISED IPS
// Two distinct cache keys prevent a projection mismatch:
// 'authorised_ips_guard' — login path, selects only ip_address (lean objects)
// 'authorised_ips_admin' — admin GET route, selects * (full rows for the management UI)
app.get('/api/authorised-ips', authenticate, adminOnly, async (req, res) => {
  try {
    const result = await cachedRead('authorised_ips_admin', TTL_AUTHORISED_IPS, async () => {
      const { data, error } = await supabase.from('authorised_ips').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    })
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/authorised-ips', authenticate, adminOnly, async (req, res) => {
  try {
    const { ipAddress, label } = req.body
    if (!ipAddress || !ipAddress.trim()) return res.status(400).json({ error: 'IP address is required' })
    if (net.isIP(ipAddress.trim()) === 0) return res.status(400).json({ error: 'Invalid IP address format' })
    const { data, error } = await supabase.from('authorised_ips').insert({
      ip_address: ipAddress.trim(),
      label: label || '',
      created_by: req.user.username
    }).select()
    if (error) return res.status(400).json({ error: error.message })
    cacheDel('authorised_ips_guard', 'authorised_ips_admin')
    res.json(data[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/authorised-ips/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { error } = await supabase.from('authorised_ips').delete().eq('id', parseInt(req.params.id))
    if (error) return res.status(400).json({ error: error.message })
    cacheDel('authorised_ips_guard', 'authorised_ips_admin')
    res.json({ message: 'Deleted' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = app
