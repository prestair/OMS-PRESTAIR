const { Router } = require('express')
const bcrypt = require('bcryptjs')
const { supabase } = require('../db.js')
const { generateToken, authenticate } = require('../middleware/auth.js')

const router = Router()

router.post('/login', async (req, res) => {
  const { username, password } = req.body
  const { data: users } = await supabase.from('users').select('*').ilike('username', username)
  const user = users?.[0]
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })

  const validPassword = bcrypt.compareSync(password.toLowerCase(), user.password)
  if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' })

  const token = generateToken({ id: user.id, username: user.username, role: user.role })
  const isAdminRole = user.role === 'admin'

  // Get group rights
  let userGroup = null
  if (user.user_group) {
    const { data: groups } = await supabase.from('groups').select('*').eq('name', user.user_group)
    userGroup = groups?.[0]
  }

  const mergedPerms = { ...(userGroup?.column_permissions || {}), ...(user.column_permissions || {}) }

  const getUserRight = (key) => {
    const userVal = user[key]
    if (userVal === true || userVal === false) return userVal
    if (userGroup && (userGroup[key] === true || userGroup[key] === false)) return userGroup[key]
    return false
  }

  res.json({
    token,
    user: {
      id: user.id, username: user.username, fullName: user.full_name, role: user.role, group: user.user_group || '',
      columnPermissions: isAdminRole ? {} : mergedPerms,
      canEdit: isAdminRole ? true : getUserRight('can_edit'),
      canReceipt: isAdminRole ? true : getUserRight('can_receipt'),
      canAssignReminder: isAdminRole ? true : getUserRight('can_assign_reminder'),
      canDelete: isAdminRole ? true : getUserRight('can_delete'),
      canCreateQuote: isAdminRole ? true : getUserRight('can_create_quote')
    }
  })
})

module.exports = router
