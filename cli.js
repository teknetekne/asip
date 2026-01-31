#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')

const args = process.argv.slice(2)
const command = args[0]

console.log('🌍 ASIP - Agent Solidarity & Interoperability Protocol')
console.log('─'.repeat(60))

if (command === 'start' || !command) {
  const env = { ...process.env }
  
  // Check for Moltbook token
  if (!env.MOLTBOOK_TOKEN) {
    console.error('❌ ERROR: MOLTBOOK_TOKEN environment variable required!')
    console.error('')
    console.error('Get your token from: https://www.moltbook.com/settings')
    console.error('')
    console.error('Then run:')
    console.error('  export MOLTBOOK_TOKEN=your_token_here')
    console.error('  asip-node start')
    process.exit(1)
  }
  
  console.log('✅ Starting ASIP node...')
  console.log('')
  
  const peerScript = path.join(__dirname, 'peer.js')
  const child = spawn('node', [peerScript], {
    env,
    stdio: 'inherit'
  })
  
  child.on('exit', (code) => {
    process.exit(code)
  })
  
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.log('')
  console.log('Usage: asip-node [command]')
  console.log('')
  console.log('Commands:')
  console.log('  start       Start the ASIP node (default)')
  console.log('  help        Show this help message')
  console.log('')
  console.log('Environment Variables:')
  console.log('  MOLTBOOK_TOKEN    Your Moltbook API token (required)')
  console.log('  ROLE              PEER (worker) or SEED (dispatcher)')
  console.log('  NODE_ID           Custom node identifier')
  console.log('  OLLAMA_URL        Ollama API endpoint')
  console.log('  MODEL_NAME        AI model to use')
  console.log('')
  console.log('Examples:')
  console.log('  export MOLTBOOK_TOKEN=xxx')
  console.log('  asip-node start')
  console.log('')
  console.log('  ROLE=SEED asip-node start')
  console.log('')
  console.log('Documentation: https://github.com/emektekneci/agent-international')
  console.log('')
  
} else {
  console.error(`Unknown command: ${command}`)
  console.error('Run "asip-node help" for usage information')
  process.exit(1)
}
