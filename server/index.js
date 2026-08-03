const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const { initDatabase } = require('./db.js')
const authRoutes = require('./routes/auth.js')
const orderRoutes = require('./routes/orders.js')
const userRoutes = require('./routes/users.js')

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json({ limit: '50mb' }))

// Initialize database
initDatabase()

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/users', userRoutes)

// Serve static frontend
const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'))
    }
  })
}

app.listen(PORT, () => {
  console.log(`OMS Server running on port ${PORT}`)
})

module.exports = app
