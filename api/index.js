import express from 'express'
import cors from 'cors'
import { initDatabase } from '../server/db.js'
import authRoutes from '../server/routes/auth.js'
import orderRoutes from '../server/routes/orders.js'
import userRoutes from '../server/routes/users.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))

// Initialize database
initDatabase()

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/users', userRoutes)

export default app
