import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { getDb, save } from '../db.js'
import { authenticate, adminOnly } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// Public for authenticated users - get user list for reminder assignment
router.get('/list', (req, res) => {
  const db = getDb()
  const users = db.users.map(u => ({ id: u.id, username: u.username, fullName: u.fullName, role: u.role }))
  res.json(users)
})

// Get all groups (authenticated users can see)
router.get('/groups', (req, res) => {
  const db = getDb()
  res.json(db.groups || [])
})

router.use(adminOnly)

// --- Group Management (Admin only) ---
router.post('/groups', (req, res) => {
  const db = getDb()
  if (!db.groups) { db.groups = []; db.nextGroupId = 1 }
  const { name, columnPermissions, canEdit, canReceipt, canAssignReminder, canDelete } = req.body
  if (!name) return res.status(400).json({ error: 'Group name is required' })
  if (db.groups.find(g => g.name.toUpperCase() === name.toUpperCase())) {
    return res.status(400).json({ error: 'Group already exists' })
  }
  const group = { id: db.nextGroupId++, name: name.toUpperCase(), columnPermissions: columnPermissions || {}, canEdit: canEdit || false, canReceipt: canReceipt || false, canAssignReminder: canAssignReminder || false, canDelete: canDelete || false }
  db.groups.push(group)
  save()
  res.json(group)
})

router.put('/groups/:id', (req, res) => {
  const db = getDb()
  const group = (db.groups || []).find(g => g.id === parseInt(req.params.id))
  if (!group) return res.status(404).json({ error: 'Group not found' })
  const { name, columnPermissions, canEdit, canReceipt, canAssignReminder, canDelete } = req.body
  if (name) group.name = name.toUpperCase()
  if (columnPermissions !== undefined) group.columnPermissions = columnPermissions
  if (canEdit !== undefined) group.canEdit = canEdit
  if (canReceipt !== undefined) group.canReceipt = canReceipt
  if (canAssignReminder !== undefined) group.canAssignReminder = canAssignReminder
  if (canDelete !== undefined) group.canDelete = canDelete
  save()
  res.json(group)
})

router.delete('/groups/:id', (req, res) => {
  const db = getDb()
  const id = parseInt(req.params.id)
  db.groups = (db.groups || []).filter(g => g.id !== id)
  save()
  res.json({ message: 'Group deleted' })
})

router.get('/', (req, res) => {
  const db = getDb()
  const users = db.users.map(({ password, ...rest }) => rest)
  res.json(users)
})

router.post('/', (req, res) => {
  const { username, password, fullName, role, columnPermissions, canEdit, canReceipt, canAssignReminder, canDelete, canCreateQuote, group } = req.body
  const db = getDb()
  if (db.users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists' })
  }
  const newUser = {
    id: db.nextUserId++,
    username,
    password: bcrypt.hashSync(password.toLowerCase(), 10),
    fullName,
    role: role || 'user',
    group: group || '',
    columnPermissions: columnPermissions || {},
    canEdit: canEdit !== undefined ? canEdit : true,
    canReceipt: canReceipt !== undefined ? canReceipt : true,
    canAssignReminder: canAssignReminder || false,
    canDelete: canDelete || false,
    canCreateQuote: canCreateQuote || false,
    createdAt: new Date().toISOString()
  }
  db.users.push(newUser)
  save()
  const { password: _, ...userRes } = newUser
  res.json(userRes)
})

router.put('/:id', (req, res) => {
  const { fullName, role, columnPermissions, canEdit, canReceipt, canAssignReminder, canDelete, canCreateQuote, group } = req.body
  const db = getDb()
  const user = db.users.find(u => u.id === parseInt(req.params.id))
  if (!user) return res.status(404).json({ error: 'User not found' })
  user.fullName = fullName
  user.role = role
  if (group !== undefined) user.group = group
  if (columnPermissions !== undefined) user.columnPermissions = columnPermissions
  if (canEdit !== undefined) user.canEdit = canEdit
  if (canReceipt !== undefined) user.canReceipt = canReceipt
  if (canAssignReminder !== undefined) user.canAssignReminder = canAssignReminder
  if (canDelete !== undefined) user.canDelete = canDelete
  if (canCreateQuote !== undefined) user.canCreateQuote = canCreateQuote
  save()
  res.json({ message: 'User updated' })
})

router.put('/:id/password', (req, res) => {
  const { newPassword } = req.body
  const db = getDb()
  const user = db.users.find(u => u.id === parseInt(req.params.id))
  if (!user) return res.status(404).json({ error: 'User not found' })
  user.password = bcrypt.hashSync(newPassword.toLowerCase(), 10)
  save()
  res.json({ message: 'Password reset successfully' })
})

router.delete('/:id', (req, res) => {
  const db = getDb()
  const id = parseInt(req.params.id)
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' })
  }
  db.users = db.users.filter(u => u.id !== id)
  save()
  res.json({ message: 'User deleted' })
})

export default router

