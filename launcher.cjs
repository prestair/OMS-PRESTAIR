const { execFile } = require('child_process')
const path = require('path')
const http = require('http')
const { exec } = require('child_process')
const fs = require('fs')

// Load env vars
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
}

console.log('============================================')
console.log('  OMS - PRESTAIR SYSTEMS LLP')
console.log('  Starting Server...')
console.log('============================================')
console.log('')

// Start the ESM server using node
const serverPath = path.join(__dirname, 'server', 'index.js')
const nodeExe = process.execPath
const child = execFile(nodeExe, [serverPath], {
  env: { ...process.env },
  cwd: __dirname
})

child.stdout.on('data', (d) => process.stdout.write(d))
child.stderr.on('data', (d) => process.stderr.write(d))

// Wait and open browser
function waitAndOpen(attempts) {
  if (attempts > 20) {
    console.log('Server failed to start!')
    process.exit(1)
  }
  http.get('http://localhost:5000', () => {
    console.log('')
    console.log('  Server running! Opening browser...')
    console.log('  URL: http://localhost:5000')
    console.log('')
    console.log('  DO NOT CLOSE THIS WINDOW!')
    console.log('============================================')
    exec('start http://localhost:5000')
  }).on('error', () => {
    setTimeout(() => waitAndOpen(attempts + 1), 1000)
  })
}

setTimeout(() => waitAndOpen(0), 2000)

// Keep alive
process.on('SIGINT', () => {
  child.kill()
  process.exit()
})
