const { Router } = require('express')
const bcrypt = require('bcryptjs')
const { supabase } = require('../db.js')
const { authenticate, adminOnly } = require('../middleware/auth.js')

const router = Router()
router.use(authenticate)

// Public - user list for reminders
router.get('/list', async (req, res) => {
  const { data } = await supabase.from('users').select('id, username, full_name, role')
  res.json((data || []).map(u => ({ id: u.id, username: u.username, fullName: u.full_name, full_name: u.full_name, role: u.role })))
})

// Public - get groups
router.get('/groups', async (req, res) => {
  const { data } = await supabase.from('groups').select('*')
  res.json(data || [])
})

router.use(adminOnly)

// Group CRUD
router.post('/groups', async (req, res) => {
  const { name, column_permissions, can_edit, can_receipt, can_assign_reminder, can_delete, can_create_quote } = req.body
  if (!name) return res.status(400).json({ error: 'Group name required' })
  const { data, error } = await supabase.from('groups').insert({ name: name.toUpperCase(), column_permissions: column_permissions || {}, can_edit: can_edit || false, can_receipt: can_receipt || false, can_assign_reminder: can_assign_reminder || false, can_delete: can_delete || false, can_create_quote: can_create_quote || false }).select()
  if (error) return res.status(400).json({ error: error.message })
  res.json(data[0])
})

router.put('/groups/:id', async (req, res) => {
  const { name, column_permissions, can_edit, can_receipt, can_assign_reminder, can_delete, can_create_quote } = req.body
  const updates = {}
  if (name) updates.name = name.toUpperCase()
  if (column_permissions !== undefined) updates.column_permissions = column_permissions
  if (can_edit !== undefined) updates.can_edit = can_edit
  if (can_receipt !== undefined) updates.can_receipt = can_receipt
  if (can_assign_reminder !== undefined) updates.can_assign_reminder = can_assign_reminder
  if (can_delete !== undefined) updates.can_delete = can_delete
  if (can_create_quote !== undefined) updates.can_create_quote = can_create_quote
  await supabase.from('groups').update(updates).eq('id', parseInt(req.params.id))
  res.json({ message: 'Group updated' })
})

router.delete('/groups/:id', async (req, res) => {
  await supabase.from('groups').delete().eq('id', parseInt(req.params.id))
  res.json({ message: 'Group deleted' })
})

// User CRUD
router.get('/', async (req, res) => {
  const { data } = await supabase.from('users').select('id, username, full_name, role, user_group, column_permissions, can_edit, can_receipt, can_assign_reminder, can_delete, can_create_quote, can_color, created_at, plain_password')
  const mapped = (data || []).map(u => ({ ...u, fullName: u.full_name, group: u.user_group, columnPermissions: u.column_permissions, canEdit: u.can_edit, canReceipt: u.can_receipt, canAssignReminder: u.can_assign_reminder, canDelete: u.can_delete, canCreateQuote: u.can_create_quote, canColor: u.can_color, createdAt: u.created_at, plainPassword: u.plain_password }))
  res.json(mapped)
})

router.post('/', async (req, res) => {
  const { username, password, fullName, role, group, columnPermissions, canEdit, canReceipt, canAssignReminder, canDelete, canCreateQuote } = req.body
  const { data: existing } = await supabase.from('users').select('id').eq('username', username)
  if (existing?.length) return res.status(400).json({ error: 'Username already exists' })

  const { data, error } = await supabase.from('users').insert({
    username, password: bcrypt.hashSync(password.toLowerCase(), 10), plain_password: password.toLowerCase(), full_name: fullName, role: role || 'user',
    user_group: group || '', column_permissions: columnPermissions || {},
    can_edit: canEdit !== undefined ? canEdit : false, can_receipt: canReceipt !== undefined ? canReceipt : false,
    can_assign_reminder: canAssignReminder || false, can_delete: canDelete || false, can_create_quote: canCreateQuote || false, can_color: req.body.canColor || false
  }).select()
  if (error) return res.status(400).json({ error: error.message })
  res.json(data[0])
})

router.put('/:id', async (req, res) => {
  const { fullName, role, group, columnPermissions, canEdit, canReceipt, canAssignReminder, canDelete, canCreateQuote } = req.body
  const updates = { full_name: fullName, role }
  if (group !== undefined) updates.user_group = group
  if (columnPermissions !== undefined) updates.column_permissions = columnPermissions
  if (canEdit !== undefined) updates.can_edit = canEdit
  if (canReceipt !== undefined) updates.can_receipt = canReceipt
  if (canAssignReminder !== undefined) updates.can_assign_reminder = canAssignReminder
  if (canDelete !== undefined) updates.can_delete = canDelete
  if (canCreateQuote !== undefined) updates.can_create_quote = canCreateQuote
  if (req.body.canColor !== undefined) updates.can_color = req.body.canColor
  await supabase.from('users').update(updates).eq('id', parseInt(req.params.id))
  res.json({ message: 'User updated' })
})

router.put('/:id/password', async (req, res) => {
  const { newPassword } = req.body
  await supabase.from('users').update({ password: bcrypt.hashSync(newPassword.toLowerCase(), 10), plain_password: newPassword.toLowerCase() }).eq('id', parseInt(req.params.id))
  res.json({ message: 'Password reset successfully' })
})

router.delete('/:id', async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' })
  await supabase.from('users').delete().eq('id', parseInt(req.params.id))
  res.json({ message: 'User deleted' })
})

module.exports = router
