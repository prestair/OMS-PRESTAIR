const { app, BrowserWindow } = require('electron')
const path = require('path')

let mainWindow

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

  // Load the publicly deployed app
  mainWindow.loadURL('https://oms-prestair.onrender.com')
  mainWindow.setMenuBarVisibility(false)

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
