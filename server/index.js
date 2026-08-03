import express from 'express'
import cors from 'cors'
import { initDatabase } from './db.js'
import authRoutes from './routes/auth.js'
import orderRoutes from './routes/orders.js'
import userRoutes from './routes/users.js'

const app = express()
const PORT = 5000

app.use(cors())
app.use(express.json({ limit: '50mb' }))

// Initialize database
initDatabase()

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/users', userRoutes)

app.listen(PORT, () => {
  console.log(`OMS Server running on port ${PORT}`)
})
