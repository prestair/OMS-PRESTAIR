// Local dev runner for the production API (api/index.js). Not deployed.
const path = require('path')
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }) } catch {}
const app = require('./index.js')
const PORT = process.env.PORT || 5000
app.listen(PORT, () => { console.log(`Local API running on http://localhost:${PORT}`) })
