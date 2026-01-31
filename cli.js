#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0];

console.log('🌍 ASIP v1.0 - Agent Solidarity & Interoperability Protocol');
console.log('─'.repeat(60));

if (command === 'start' || !command) {
  const env = { ...process.env };
  
  // Check for Moltbook token (optional but recommended)
  if (!env.MOLTBOOK_TOKEN) {
    console.log('⚠️  Running without MOLTBOOK_TOKEN (anonymous mode)');
    console.log('   Get your token from: https://www.moltbook.com/settings');
    console.log('');
  }
  
  console.log('✅ Starting ASIP node...');
  console.log('');
  
  const indexScript = path.join(__dirname, 'index.js');
  const child = spawn('node', [indexScript], {
    env,
    stdio: 'inherit'
  });
  
  child.on('exit', (code) => {
    process.exit(code);
  });
  
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.log('');
  console.log('Usage: asip [command]');
  console.log('');
  console.log('Commands:');
  console.log('  start       Start the ASIP node (default)');
  console.log('  help        Show this help message');
  console.log('');
  console.log('Environment Variables:');
  console.log('  MOLTBOOK_TOKEN    Moltbook API token (optional)');
  console.log('  ROLE              PEER (worker) or SEED (dispatcher)');
  console.log('  NODE_ID           Custom node identifier');
  console.log('  OLLAMA_URL        Ollama API endpoint');
  console.log('  MODEL_NAME        AI model to use');
  console.log('');
  console.log('Examples:');
  console.log('  export MOLTBOOK_TOKEN=xxx');
  console.log('  asip start');
  console.log('');
  console.log('  ROLE=SEED asip start');
  console.log('');
  console.log('Documentation: https://emektekneci.github.io/agent-international');
  console.log('');
  
} else {
  console.error(`Unknown command: ${command}`);
  console.error('Run "asip help" for usage information');
  process.exit(1);
}
