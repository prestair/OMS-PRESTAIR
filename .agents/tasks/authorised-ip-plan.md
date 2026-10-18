# Implementation Plan: Authorised IP Feature

## Codebase Findings (read before implementing)

### Cache pattern (api/index.js lines 30–62)
Two patterns are used depending on whether coalescing is needed:
- **Simple pattern** (most routes): `cacheGet(key)` → serve if hit; else query Supabase → `cacheSet(key, data, TTL_MS)`. Invalidate with `cacheDel('key')`.
- **Coalesced pattern** (signal routes only): `cachedRead(key, ttlMs, async () => { ... })`. Do NOT use this for the new routes.
- The new authorised_ips routes use the **simple pattern** with a dedicated TTL constant named `TTL_AUTHORISED_IPS = 60 * 1000` and cache key `'authorised_ips'`.

### adminOnly middleware (api/index.js line ~100)
```js
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  next()
}
```
Applied as second middleware after `authenticate`: `app.get('/api/route', authenticate, adminOnly, async (req, res) => { ... })`.

### Login route IP extraction (api/index.js line ~155)
Already present in `POST /api/auth/login`:
```js
const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim()
```
The IP check block must be inserted **after** `bcrypt.compareSync` succeeds but **before** `generateToken(...)` is called.

### isAdmin check pattern (Dashboard.jsx line 201)
```js
const isAdmin = user.role === 'admin'
```
Declared near the top of the `Dashboard` function body. Admin-only buttons use: `{isAdmin && <button ...>...</button>}`.

### Header button row (Dashboard.jsx lines 1780–1788)
```jsx
{isAdmin && <button ...>Force Refresh All</button>}
<button onClick={logout} style={{ ...styles.headerBtn, background: '#e74c3c' }}>Logout</button>
```
The new **'Authorised IP'** button goes between `Force Refresh All` and `Logout`.

### Modal pattern (Dashboard.jsx)
All modals in the file share this structure (e.g. editRequestId modal at line 2980):
```jsx
{showSomething && (
  <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',
               display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}}
       onClick={() => setShowSomething(false)}>
    <div style={{background:'#fff',borderRadius:'10px',padding:'20px',
                 maxWidth:'700px',width:'95%',maxHeight:'85vh',overflow:'auto'}}
         onClick={e => e.stopPropagation()}>
      {/* header row with title and X close button */}
      {/* content */}
    </div>
  </div>
)}
```
The close X button style matches `styles.closeBtn = { background:'none', border:'none', fontSize:'18px', cursor:'pointer', fontWeight:'700' }`.

### Where to insert new routes (api/index.js)
Insert the three new `authorised_ips` API routes **before** `module.exports = app` at the end of the complaints section (after `app.post('/api/complaints/import', ...)` which ends around line 449). The login modification is inside the existing `app.post('/api/auth/login', ...)` handler.

### Nodemailer transport pattern (api/cron-daily-report.js lines ~100–107)
```js
const nodemailer = require('nodemailer')
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 10000
})
```
Copy this exactly. `GMAIL_USER` is `process.env.GMAIL_USER` (already used in scope of the login route — declare it locally in the helper function).

---

## Implementation Plan

- [ ] 1. Create the migration SQL file.
      Create `api/authorised-ips-migration.sql` with an idempotent `CREATE TABLE IF NOT EXISTS authorised_ips` statement and the matching RLS policy. Do NOT run it.
      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\authorised-ips-migration.sql`
      Content:
      ```sql
      -- Authorised IPs table for login IP restriction
      CREATE TABLE IF NOT EXISTS authorised_ips (
        id SERIAL PRIMARY KEY,
        ip_address TEXT NOT NULL UNIQUE,
        label TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Enable RLS (matching pattern for all other tables in setupSupabase.js)
      ALTER TABLE authorised_ips ENABLE ROW LEVEL SECURITY;

      -- Allow all access via anon key (matches pattern in setupSupabase.js)
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'authorised_ips' AND policyname = 'Allow all'
        ) THEN
          CREATE POLICY "Allow all" ON authorised_ips FOR ALL USING (true) WITH CHECK (true);
        END IF;
      END$$;
      ```
      Verify: File exists at the correct path. (No execution needed — this is a manual SQL to be run in Supabase dashboard.)

- [ ] 2. Add the TTL constant and the three authorised_ips API routes to api/index.js.
      Open `api/index.js`. Make these changes:

      **2a. Add TTL constant** — in the TTL constants block (around line 57, after `TTL_APP_VERSION`), add:
      ```js
      const TTL_AUTHORISED_IPS = 60 * 1000   // 60s — authorised IP list (admin-only, rarely changes)
      ```

      **2b. Add GET /api/authorised-ips route** — before `module.exports = app`:
      ```js
      // AUTHORISED IPS
      app.get('/api/authorised-ips', authenticate, adminOnly, async (req, res) => {
        try {
          const cached = cacheGet('authorised_ips')
          if (cached) return res.json(cached)
          const { data, error } = await supabase.from('authorised_ips').select('*').order('created_at', { ascending: false })
          if (error) return res.status(400).json({ error: error.message })
          const result = data || []
          cacheSet('authorised_ips', result, TTL_AUTHORISED_IPS)
          res.json(result)
        } catch (e) { res.status(500).json({ error: e.message }) }
      })
      ```

      **2c. Add POST /api/authorised-ips route** — immediately after 2b:
      ```js
      app.post('/api/authorised-ips', authenticate, adminOnly, async (req, res) => {
        try {
          const { ipAddress, label } = req.body
          if (!ipAddress || !ipAddress.trim()) return res.status(400).json({ error: 'IP address is required' })
          const { data, error } = await supabase.from('authorised_ips').insert({
            ip_address: ipAddress.trim(),
            label: label || '',
            created_by: req.user.username
          }).select()
          if (error) return res.status(400).json({ error: error.message })
          cacheDel('authorised_ips')
          res.json(data[0])
        } catch (e) { res.status(500).json({ error: e.message }) }
      })
      ```

      **2d. Add DELETE /api/authorised-ips/:id route** — immediately after 2c:
      ```js
      app.delete('/api/authorised-ips/:id', authenticate, adminOnly, async (req, res) => {
        try {
          const { error } = await supabase.from('authorised_ips').delete().eq('id', parseInt(req.params.id))
          if (error) return res.status(400).json({ error: error.message })
          cacheDel('authorised_ips')
          res.json({ message: 'Deleted' })
        } catch (e) { res.status(500).json({ error: e.message }) }
      })
      ```

      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\index.js`
      Verify: Server starts without errors (`node api/index.js` or Vercel dev). GET /api/authorised-ips returns 401 for unauthenticated request. (Manual test or deploy verification.)

- [ ] 3. Add the unauthorised-login alert email helper function to api/index.js.
      Add a standalone `sendUnauthorisedLoginAlert` function **before** the `app.post('/api/auth/login', ...)` route. Place it after the `cacheClear` / TTL constants block and before the `generateToken` function (around line 65 in the original file).

      ```js
      // Sends a fire-and-forget alert email for unauthorised login attempts.
      // Must never throw — always wrapped in try/catch at call site.
      async function sendUnauthorisedLoginAlert(ip, username) {
        try {
          const nodemailer = require('nodemailer')
          const GMAIL_USER = process.env.GMAIL_USER
          const RECEIVER = process.env.REPORT_RECEIVER || 'agm.prestairsystem@gmail.com'
          if (!GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return
          const timeIST = new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: true
          })
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 10000
          })
          await transporter.sendMail({
            from: `"Prestair Security" <${GMAIL_USER}>`,
            to: RECEIVER,
            subject: `Unauthorised login attempt from ${ip} by ${username}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#e74c3c;margin-top:0">⚠️ Unauthorised Login Attempt</h2>
  <table style="width:100%;border-collapse:collapse;margin-top:8px">
    <tr><td style="padding:8px 12px;font-weight:600;width:140px">App Name</td><td style="padding:8px 12px">OMS DASHBOARD</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600">IP Address</td><td style="padding:8px 12px">${ip}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600">Username</td><td style="padding:8px 12px">${username}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:600">Time (IST)</td><td style="padding:8px 12px">${timeIST}</td></tr>
  </table>
  <p style="margin-top:16px;color:#555;font-size:13px">This IP is not in the Authorised IPs list. Please review and add it if this is a legitimate user.</p>
</div>`
          })
        } catch (emailErr) {
          console.error('Unauthorised login alert email failed:', emailErr.message)
        }
      }
      ```

      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\index.js`
      Verify: Function is syntactically valid (server still starts). No new env vars introduced.

- [ ] 4. Modify POST /api/auth/login to enforce the IP whitelist.
      Inside the existing `app.post('/api/auth/login', ...)` handler in `api/index.js`, locate the block that reads:

      ```js
      const valid = bcrypt.compareSync(password.toLowerCase(), user.password)
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
      const token = generateToken({ id: user.id, username: user.username, role: user.role })
      ```

      Insert the IP check **between** the `if (!valid) return` line and the `const token = generateToken(...)` line:

      ```js
      // IP whitelist check — fail-open when table is empty
      const clientIp = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim()
      try {
        const allowedIps = await cachedRead('authorised_ips', TTL_AUTHORISED_IPS, async () => {
          const { data } = await supabase.from('authorised_ips').select('ip_address')
          return data || []
        })
        if (allowedIps.length > 0) {
          const normalised = clientIp.toLowerCase().trim()
          const isAllowed = allowedIps.some(r => (r.ip_address || '').toLowerCase().trim() === normalised)
          if (!isAllowed) {
            // Fire-and-forget alert — do NOT await, wrap in try/catch
            try { sendUnauthorisedLoginAlert(clientIp, user.username) } catch {}
            return res.status(403).json({ error: 'Login not allowed from this IP address.' })
          }
        }
      } catch (ipCheckErr) {
        // If the IP table read fails, fail-open (allow login) to avoid locking everyone out
        console.error('IP whitelist check failed:', ipCheckErr.message)
      }
      ```

      Note: `clientIp` is declared here (not `ip`) because `ip` is already declared later in the function for the login_logs insert. Using `clientIp` avoids a duplicate `const` error.

      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\api\index.js`
      Verify: Normal login still succeeds when `authorised_ips` table is empty. When a row exists with a non-matching IP, login returns 403. No duplicate variable declarations.

- [ ] 5. Add `showAuthorisedIPs` state and the 'Authorised IP' button in Dashboard.jsx.
      Open `src/pages/Dashboard.jsx`.

      **5a. Add state** — in the state declarations block (near the other `show*` states in the `Dashboard` function body), add:
      ```js
      const [showAuthorisedIPs, setShowAuthorisedIPs] = useState(false)
      const [authorisedIPs, setAuthorisedIPs] = useState([])
      const [authorisedIPsLoading, setAuthorisedIPsLoading] = useState(false)
      const [authorisedIPForm, setAuthorisedIPForm] = useState({ ipAddress: '', label: '' })
      const [authorisedIPError, setAuthorisedIPError] = useState('')
      ```

      **5b. Add fetch function** — near the other `fetch*` functions (after `fetchPaperRequests`):
      ```js
      const fetchAuthorisedIPs = async () => {
        setAuthorisedIPsLoading(true)
        try {
          const res = await axios.get('/api/authorised-ips')
          setAuthorisedIPs(res.data)
        } catch (err) {
          setAuthorisedIPError(err.response?.data?.error || 'Failed to load')
        } finally {
          setAuthorisedIPsLoading(false)
        }
      }
      ```

      **5c. Add the header button** — in the header `<div style={styles.headerRight}>` section (Dashboard.jsx line ~1786), between the `Force Refresh All` button and the `Logout` button:
      ```jsx
      {isAdmin && <button onClick={() => { setShowAuthorisedIPs(true); fetchAuthorisedIPs() }} style={{ ...styles.headerBtn, background: '#16a085' }}>Authorised IP</button>}
      ```
      The full button order after the change:
      1. COMPLAINTS MANAGEMENT (existing, purple, admin or canComplaints)
      2. Refresh (existing, green)
      3. Manage Users (existing, admin)
      4. Send Report (existing, green, admin)
      5. Force Refresh All (existing, purple, admin)
      6. **Authorised IP** ← NEW (teal `#16a085`, admin only)
      7. Logout (existing, red)

      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\src\pages\Dashboard.jsx`
      Verify: Button visible when logged in as admin, not visible for non-admin users. Clicking it calls `/api/authorised-ips` (check network tab).

- [ ] 6. Add the Authorised IP Management modal to Dashboard.jsx.
      In Dashboard.jsx, find the last modal before the final `</div>` that closes the main wrapper (the `deleteConfirm` modal at line ~3232 or the `permanentDeleteConfirm` / `reassignId` modal — whichever is last before the closing `</div>` of the main return). Add the new modal JSX after that last modal but before the component's closing `</div>`.

      Full modal JSX to insert:
      ```jsx
      {/* Authorised IP Management Modal */}
      {showAuthorisedIPs && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',
                     display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}}
             onClick={() => setShowAuthorisedIPs(false)}>
          <div style={{background:'#1a1a2e',color:'#fff',borderRadius:'10px',padding:'24px',
                       maxWidth:'700px',width:'95%',maxHeight:'85vh',overflow:'auto'}}
               onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
              <h3 style={{margin:0,fontSize:'16px',fontWeight:'700'}}>Authorised IP Management</h3>
              <button onClick={() => setShowAuthorisedIPs(false)}
                      style={{background:'none',border:'none',fontSize:'20px',cursor:'pointer',
                              fontWeight:'700',color:'#fff'}}>✕</button>
            </div>

            {/* Info */}
            <p style={{margin:'0 0 16px',fontSize:'12px',color:'#aaa'}}>
              When this list is empty, logins from all IPs are allowed.
            </p>

            {/* Add IP Form */}
            <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap',
                         background:'#0d0d1a',padding:'12px',borderRadius:'8px'}}>
              <input
                value={authorisedIPForm.ipAddress}
                onChange={e => setAuthorisedIPForm(f => ({ ...f, ipAddress: e.target.value }))}
                placeholder="e.g. 192.168.1.1"
                required
                style={{flex:'1',minWidth:'160px',padding:'8px 10px',border:'1px solid #333',
                        borderRadius:'5px',background:'#1a1a2e',color:'#fff',fontSize:'12px'}}
              />
              <input
                value={authorisedIPForm.label}
                onChange={e => setAuthorisedIPForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Office (optional)"
                style={{flex:'1',minWidth:'140px',padding:'8px 10px',border:'1px solid #333',
                        borderRadius:'5px',background:'#1a1a2e',color:'#fff',fontSize:'12px'}}
              />
              <button
                onClick={async () => {
                  setAuthorisedIPError('')
                  if (!authorisedIPForm.ipAddress.trim()) {
                    setAuthorisedIPError('IP address is required')
                    return
                  }
                  try {
                    await axios.post('/api/authorised-ips', {
                      ipAddress: authorisedIPForm.ipAddress.trim(),
                      label: authorisedIPForm.label.trim()
                    })
                    setAuthorisedIPForm({ ipAddress: '', label: '' })
                    fetchAuthorisedIPs()
                  } catch (err) {
                    setAuthorisedIPError(err.response?.data?.error || 'Failed to add IP')
                  }
                }}
                style={{padding:'8px 16px',background:'#16a085',color:'#fff',border:'none',
                        borderRadius:'5px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>
                Add
              </button>
            </div>
            {authorisedIPError && (
              <p style={{margin:'0 0 12px',color:'#e74c3c',fontSize:'12px'}}>{authorisedIPError}</p>
            )}

            {/* IP Table */}
            {authorisedIPsLoading ? (
              <p style={{textAlign:'center',color:'#aaa',fontSize:'12px',padding:'20px'}}>Loading...</p>
            ) : authorisedIPs.length === 0 ? (
              <p style={{textAlign:'center',color:'#aaa',fontSize:'12px',padding:'20px'}}>
                No IPs added yet. All logins are currently allowed.
              </p>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                  <thead>
                    <tr>
                      {['#','IP Address','Label','Added By','Added On','Action'].map(h => (
                        <th key={h} style={{padding:'8px 10px',background:'#0d0d1a',color:'#fff',
                                           fontWeight:'600',textAlign:'left',whiteSpace:'nowrap'}}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {authorisedIPs.map((row, idx) => (
                      <tr key={row.id} style={{background: idx % 2 === 0 ? '#111126' : '#1a1a2e'}}>
                        <td style={{padding:'7px 10px',borderBottom:'1px solid #2a2a3e'}}>{idx + 1}</td>
                        <td style={{padding:'7px 10px',borderBottom:'1px solid #2a2a3e',
                                    fontFamily:'monospace'}}>{row.ip_address}</td>
                        <td style={{padding:'7px 10px',borderBottom:'1px solid #2a2a3e',
                                    color:'#aaa'}}>{row.label || '-'}</td>
                        <td style={{padding:'7px 10px',borderBottom:'1px solid #2a2a3e',
                                    color:'#aaa'}}>{row.created_by || '-'}</td>
                        <td style={{padding:'7px 10px',borderBottom:'1px solid #2a2a3e',
                                    color:'#aaa',whiteSpace:'nowrap'}}>
                          {row.created_at
                            ? new Date(row.created_at).toLocaleDateString('en-IN', {
                                day:'2-digit', month:'2-digit', year:'numeric'
                              })
                            : '-'}
                        </td>
                        <td style={{padding:'7px 10px',borderBottom:'1px solid #2a2a3e'}}>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Delete IP ${row.ip_address}?`)) return
                              try {
                                await axios.delete(`/api/authorised-ips/${row.id}`)
                                fetchAuthorisedIPs()
                              } catch (err) {
                                setAuthorisedIPError(err.response?.data?.error || 'Delete failed')
                              }
                            }}
                            style={{padding:'4px 10px',background:'#e74c3c',color:'#fff',
                                    border:'none',borderRadius:'4px',fontSize:'11px',
                                    fontWeight:'600',cursor:'pointer'}}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      ```

      Files: `d:\OMS PRESTAIR SYSTEMS LLP\oms-dashboard\src\pages\Dashboard.jsx`
      Verify: Modal opens on button click, closes on backdrop click or ✕ button. Add and delete operations work against the live API. List reloads after each mutation. Error messages display inline. Non-admin users never see the button or modal.

---

## Sequence summary

Items 1–4 are backend-only changes and independent of 5–6.
Items 5 and 6 must both be done before verifying the complete frontend flow.
Item 4 (login route modification) depends on item 2 (TTL constant must exist) and item 3 (helper function must exist).
Item 2 three routes can be done as one atomic edit to api/index.js.

## Things that must NOT be changed

- Do not add new environment variables. `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `REPORT_RECEIVER` already exist.
- Do not touch UserManagement.jsx.
- Do not break the existing login flow when `authorised_ips` is empty (fail-open).
- Do not change the login_logs insert block that comes after `generateToken` — the `ip` variable used there is separate from the new `clientIp` variable.
- Do not use `cachedRead` for the GET route (only for the login-path read, where coalescing reduces Supabase hits under burst login traffic).
