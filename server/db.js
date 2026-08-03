import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import { getInitialOrders } from './seedData.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, 'data.json')

let data = null

function loadData() {
  if (data) return data
  if (fs.existsSync(DB_PATH)) {
    data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
  } else {
    data = { users: [], orders: [], payments: [], nextUserId: 1, nextOrderId: 1, nextPaymentId: 1 }
  }
  return data
}

function saveData() {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
}

export function getDb() {
  return loadData()
}

export function save() {
  saveData()
}

export function initDatabase() {
  loadData()

  // Create default admin if not exists
  const adminExists = data.users.find(u => u.username === 'admin')
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('admin@123', 10)
    data.users.push({
      id: data.nextUserId++,
      username: 'admin',
      password: hashedPassword,
      fullName: 'Administrator',
      role: 'admin',
      createdAt: new Date().toISOString()
    })
  }

  // Initialize reminders array if not exists
  if (!data.reminders) {
    data.reminders = []
    data.nextReminderId = 1
  }

  // Initialize groups array if not exists
  if (!data.groups) {
    data.groups = [
      { id: 1, name: 'ADMIN', columnPermissions: {}, canEdit: true, canReceipt: true, canAssignReminder: true, canDelete: true },
      { id: 2, name: 'SALES', columnPermissions: {}, canEdit: true, canReceipt: false, canAssignReminder: false, canDelete: false },
      { id: 3, name: 'DISPATCH', columnPermissions: {}, canEdit: false, canReceipt: false, canAssignReminder: false, canDelete: false },
      { id: 4, name: 'HR', columnPermissions: {}, canEdit: false, canReceipt: false, canAssignReminder: false, canDelete: false },
      { id: 5, name: 'ACCOUNTS', columnPermissions: {}, canEdit: false, canReceipt: true, canAssignReminder: false, canDelete: false }
    ]
    data.nextGroupId = 6
  }

  // Seed initial orders if empty - DISABLED for live use
  // if (data.orders.length === 0) {
  //   const orders = getInitialOrders()
  //   for (const o of orders) {
  //     data.orders.push({ id: data.nextOrderId++, ...o })
  //   }
  // }

  // Initialize paper requests
  if (!data.paperRequests) {
    data.paperRequests = []
    data.nextPaperRequestId = 1
  }

  // Initialize return requests
  if (!data.returnRequests) {
    data.returnRequests = []
    data.nextReturnRequestId = 1
  }

  saveData()
  console.log('Database initialized successfully')
}
