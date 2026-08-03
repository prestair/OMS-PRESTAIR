const { app, BrowserWindow } = require('electron')
const path = require('path')
const { fork } = require('child_process')
const http = require('http')

let mainWindow
let serverProcess

function startServer() {
  const serverPath = path.join(app.getAppPath(), 'server', 'index.js')
  console.log('Starting server from:', serverPath)

  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '5000',
      SUPABASE_URL: 'https://ttbyhawdgwwqemcqwjen.supabase.co',
      SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0YnloYXdkZ3d3cWVtY3F3amVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MjU3ODcsImV4cCI6MjEwMTMwMTc4N30.V_d9mK8Bv6Sx6w89VE4Pzt6KRKvIAeHI7Dz6SbaLyh8'
    },
    cwd: app.getAppPath(),
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  })

  serverProcess.stdout.on('data', (d) => console.log('[Server]', d.toString()))
  serverProcess.stderr.on('data', (d) => console.error('[Server]', d.toString()))
  serverProcess.on('error', (err) => console.error('Server failed:', err))
  serverProcess.on('exit', (code) => console.log('Server exited with code:', code))
}

function waitForServer(callback, retries = 0) {
  if (retries > 30) {
    console.error('Server failed to start after 30 retries')
    callback()
    return
  }
  http.get('http://localhost:5000', (res) => {
    callback()
  }).on('error', () => {
    setTimeout(() => waitForServer(callback, retries + 1), 1000)
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'OMS - Prestair Systems LLP',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.loadURL('http://localhost:5000')
  mainWindow.setMenuBarVisibility(false)
  mainWindow.maximize()
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  startServer()
  waitForServer(createWindow)
})

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill()
  app.quit()
})

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill()
})
