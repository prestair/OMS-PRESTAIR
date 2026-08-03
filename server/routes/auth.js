import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { getDb, save } from '../db.js'
import { generateToken, authenticate } from '../middleware/auth.js'

const router = Router()

router.post('/login', (req, res) => {
  const { username, password } = req.body
  const db = getDb()
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase())
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  const validPassword = bcrypt.compareSync(password.toLowerCase(), user.password)
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  const token = generateToken(user)
  const isAdminRole = user.role === 'admin'
  // If user has a group, get group settings
  const userGroup = user.group ? (db.groups || []).find(g => g.name === user.group) : null
  // Column permissions: group provides base, user overrides
  const mergedPerms = { ...(userGroup?.columnPermissions || {}), ...(user.columnPermissions || {}) }
  // Rights resolution: user's stored value takes priority, group is fallback only if user value is undefined/null
  const getUserRight = (key) => {
    const userVal = user[key]
    // If user has an explicit boolean stored, use it
    if (userVal === true || userVal === false) return userVal
    // Otherwise fall back to group
    if (userGroup && (userGroup[key] === true || userGroup[key] === false)) return userGroup[key]
    return false
  }
  res.json({
    token,
    user: {
      id: user.id, username: user.username, fullName: user.fullName, role: user.role, group: user.group || '',
      columnPermissions: isAdminRole ? {} : mergedPerms,
      canEdit: isAdminRole ? true : getUserRight('canEdit'),
      canReceipt: isAdminRole ? true : getUserRight('canReceipt'),
      canAssignReminder: isAdminRole ? true : getUserRight('canAssignReminder'),
      canDelete: isAdminRole ? true : getUserRight('canDelete'),
      canCreateQuote: isAdminRole ? true : getUserRight('canCreateQuote')
    }
  })
})

router.post('/change-password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body
  const db = getDb()
  const user = db.users.find(u => u.id === req.user.id)
  const validPassword = bcrypt.compareSync(currentPassword.toLowerCase(), user.password)
  if (!validPassword) {
    return res.status(400).json({ error: 'Current password is incorrect' })
  }
  user.password = bcrypt.hashSync(newPassword.toLowerCase(), 10)
  save()
  res.json({ message: 'Password changed successfully' })
})

export default router
