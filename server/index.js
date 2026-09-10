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

// Sales Reps routes
import { supabase as _sb } from './db.js'
import { authenticate as _auth, adminOnly as _admin } from './middleware/auth.js'
app.get('/api/sales-reps', _auth, async (req, res) => { try { const { data } = await _sb.from('sales_reps').select('*').order('name',{ascending:true}); res.json((data||[]).map(r=>({id:r.id,name:r.name}))) } catch(e){res.status(500).json({error:e.message})} })
app.post('/api/sales-reps', _auth, _admin, async (req, res) => { try { const { name } = req.body; if(!name||!name.trim())return res.status(400).json({error:'Name required'}); const nm=name.trim(); const { data: ex } = await _sb.from('sales_reps').select('id').ilike('name',nm); if(ex&&ex.length)return res.status(400).json({error:'Sales rep already exists'}); const { data, error } = await _sb.from('sales_reps').insert({name:nm}).select(); if(error)return res.status(400).json({error:error.message}); res.json(data[0]) } catch(e){res.status(500).json({error:e.message})} })
app.delete('/api/sales-reps/:id', _auth, _admin, async (req, res) => { try { await _sb.from('sales_reps').delete().eq('id',parseInt(req.params.id)); res.json({message:'Deleted'}) } catch(e){res.status(500).json({error:e.message})} })

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
