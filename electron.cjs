const { app, BrowserWindow } = require('electron')
const path = require('path')
const { fork } = require('child_process')
const http = require('http')

let mainWindow
let serverProcess

function startServer() {
  serverProcess = fork(path.join(__dirname, 'server', 'index.js'), [], {
    env: { ...process.env },
    stdio: 'pipe'
  })
  serverProcess.on('error', (err) => console.error('Server error:', err))
}

function waitForServer(url, callback) {
  const check = () => {
    http.get(url, (res) => {
      callback()
    }).on('error', () => {
      setTimeout(check, 500)
    })
  }
  check()
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'OMS - Prestair Systems LLP',
    icon: path.join(__dirname, 'public', 'logo.PNG'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Load from server URL so API calls work
  mainWindow.loadURL('http://localhost:5000')
  mainWindow.setMenuBarVisibility(false)

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  startServer()
  // Wait for server to be ready then open window
  waitForServer('http://localhost:5000', createWindow)
})

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill()
  app.quit()
})

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill()
})
