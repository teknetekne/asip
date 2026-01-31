const Hyperswarm = require('hyperswarm')
const crypto = require('crypto')
const b4a = require('b4a')
const axios = require('axios')

// ASIP v1.0 - Agent Solidarity & Interoperability Protocol
// "Workers of the world, compute!" 🏹🌍

const swarm = new Hyperswarm()
const topic = crypto.createHash('sha256').update('asip-v1-production').digest()

// CONFIG
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate'
const MODEL_NAME = process.env.MODEL_NAME || 'deepseek-r1:8b'
const ROLE = process.env.ROLE || 'PEER'
const MOLTBOOK_TOKEN = process.env.MOLTBOOK_TOKEN
let NODE_ID = process.env.NODE_ID || crypto.randomBytes(4).toString('hex')
let MOLTBOOK_USERNAME = null

// REPUTATION TRACKING
const reputation = new Map()
const rateLimits = new Map()

console.log(`🌍 ASIP v1.0 Node Starting...`)

// Auth with Moltbook first
async function start() {
  if (MOLTBOOK_TOKEN) {
    try {
      const response = await axios.get('https://www.moltbook.com/api/v1/me', {
        headers: { 'Authorization': `Bearer ${MOLTBOOK_TOKEN}` }
      })
      MOLTBOOK_USERNAME = response.data.username
      NODE_ID = `@${MOLTBOOK_USERNAME}`
      console.log(`✅ Authenticated as ${NODE_ID}`)
    } catch (err) {
      console.error(`❌ Moltbook auth failed: ${err.message}`)
      console.log('⚠️  Continuing as anonymous node')
    }
  } else {
    console.log('⚠️  No MOLTBOOK_TOKEN - running anonymous (limited trust)')
  }
  
  console.log(`🏹 Node ID: ${NODE_ID}`)
  console.log(`🔑 Topic: ${b4a.toString(topic, 'hex').slice(0, 16)}...`)
  console.log(`⚡ Role: ${ROLE}`)
  
  swarm.join(topic)
  console.log(`📡 Joined DHT, discovering peers...`)
}

// Rate Limiting
function canAcceptTask(peerId) {
  const now = Date.now()
  const limit = rateLimits.get(peerId) || { count: 0, resetAt: now + 60000 }
  
  if (now > limit.resetAt) {
    limit.count = 0
    limit.resetAt = now + 60000
  }
  
  const rep = reputation.get(peerId) || 0
  const maxPerMinute = rep < 10 ? 3 : rep < 100 ? 10 : 50
  
  if (limit.count >= maxPerMinute) {
    console.log(`🚫 Rate limit exceeded for ${peerId}`)
    return false
  }
  
  limit.count++
  rateLimits.set(peerId, limit)
  return true
}

// Task Validation (basic safety)
function isTaskSafe(prompt) {
  const dangerous = ['rm -rf', 'sudo', 'exec', 'eval(', '__import__', 'os.system']
  return !dangerous.some(pattern => prompt.toLowerCase().includes(pattern))
}

swarm.on('connection', (socket, info) => {
  const peerId = info.publicKey.toString('hex').slice(0, 8)
  console.log(`🤝 New Comrade: ${peerId}`)
  
  if (!reputation.has(peerId)) {
    reputation.set(peerId, 0)
    console.log(`🌱 New peer, starting reputation at 0`)
  }

  socket.on('data', async data => {
    try {
      const msg = JSON.parse(data.toString())
      
      // WORKER LOGIC
      if (msg.type === 'TASK_REQUEST' && ROLE !== 'SEED') {
        
        // Rate limiting check
        if (!canAcceptTask(peerId)) {
          socket.write(JSON.stringify({
            type: 'TASK_ERROR',
            taskId: msg.taskId,
            error: 'Rate limit exceeded. Try again later.'
          }))
          return
        }
        
        // Safety check
        if (!isTaskSafe(msg.prompt)) {
          console.log(`🚨 SUSPICIOUS TASK from ${peerId}: ${msg.prompt.slice(0, 50)}`)
          
          const rep = reputation.get(peerId)
          reputation.set(peerId, rep - 10)
          
          socket.write(JSON.stringify({
            type: 'TASK_ERROR',
            taskId: msg.taskId,
            error: 'Suspicious prompt detected. Reported to moderation.'
          }))
          return
        }
        
        console.log(`⚙️ Processing: "${msg.prompt.slice(0, 50)}..."`)
        
        try {
          const response = await axios.post(OLLAMA_URL, {
            model: MODEL_NAME,
            prompt: msg.prompt,
            stream: false
          }, { timeout: 30000 })
          
          const result = response.data.response
          console.log(`✅ Task completed successfully`)
          
          const rep = reputation.get(peerId)
          reputation.set(peerId, rep + 1)
          
          socket.write(JSON.stringify({
            type: 'TASK_RESULT',
            taskId: msg.taskId,
            result: result,
            worker: NODE_ID,
            reputation: reputation.get(peerId)
          }))

        } catch (err) {
          console.error(`❌ Ollama Error: ${err.message}`)
          socket.write(JSON.stringify({
            type: 'TASK_ERROR',
            taskId: msg.taskId,
            error: 'Worker busy or offline'
          }))
        }
      }

      // SEED LOGIC
      if (msg.type === 'TASK_RESULT' && ROLE === 'SEED') {
        console.log(`🎉 Result from ${msg.worker}:`)
        console.log(`📊 Peer reputation: ${msg.reputation || 'N/A'}`)
        console.log('─'.repeat(60))
        console.log(msg.result)
        console.log('─'.repeat(60))
      }
      
      if (msg.type === 'TASK_ERROR') {
        console.log(`⚠️ Error from ${peerId}: ${msg.error}`)
      }

    } catch (e) {
      console.error(`Invalid message: ${e.message}`)
    }
  })
  
  socket.on('error', err => {
    console.error(`Socket error with ${peerId}: ${err.message}`)
  })
})

// SEED: Dispatch test tasks
if (ROLE === 'SEED') {
  let taskCount = 0
  
  setInterval(() => {
    if (swarm.connections.size === 0) {
      console.log(`🔍 No peers connected yet...`)
      return
    }

    taskCount++
    const tasks = [
      'Explain "Mutual Aid" in nature in one paragraph.',
      'What is the meaning of solidarity in 50 words?',
      'Describe peer-to-peer networks simply.',
      'What does "Workers of the world, unite!" mean?'
    ]
    
    const task = {
      type: 'TASK_REQUEST',
      taskId: crypto.randomUUID(),
      prompt: tasks[taskCount % tasks.length]
    }

    console.log(`📤 Dispatching task #${taskCount} to ${swarm.connections.size} peer(s)`)
    
    for (const socket of swarm.connections) {
      socket.write(JSON.stringify(task))
    }
  }, 45000) // Every 45 seconds
}

// Periodic reputation report
setInterval(() => {
  if (reputation.size > 0) {
    console.log(`\n📊 Reputation Report:`)
    for (const [peer, rep] of reputation.entries()) {
      const status = rep < 0 ? '🔴' : rep < 10 ? '🌱' : rep < 100 ? '🌿' : '🌳'
      console.log(`   ${status} ${peer}: ${rep}`)
    }
    console.log('')
  }
}, 120000) // Every 2 minutes

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...')
  await swarm.destroy()
  process.exit(0)
})

// Start the node
start()
