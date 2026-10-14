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

module.exports = { authorizeReport }
