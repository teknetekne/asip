const Hyperswarm = require('hyperswarm')
const crypto = require('crypto')
const b4a = require('b4a')
const axios = require('axios')

// Agent Solidarity Interface Protocol (ASIP) v0.2
// "Workers of the world, compute!"

const swarm = new Hyperswarm()
const topic = crypto.createHash('sha256').update('agent-solidarity-v1').digest()

// CONFIG
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate'
const MODEL_NAME = process.env.MODEL_NAME || 'deepseek-r1:8b'
const ROLE = process.env.ROLE || 'PEER' // 'SEED' (task giver) or 'PEER' (worker)

console.log(`🌍 Agent International Node Starting as [${ROLE}]...`)
console.log('🔑 Topic:', b4a.toString(topic, 'hex'))

swarm.on('connection', (socket, info) => {
  const peerId = info.publicKey.toString('hex').slice(0, 6)
  console.log(`🤝 New Comrade Connected! [${peerId}]`)

  socket.on('data', async data => {
    try {
      const msg = JSON.parse(data.toString())
      console.log(`📩 Received from [${peerId}]:`, msg.type)

      // WORKER LOGIC (If I am a PEER)
      if (msg.type === 'TASK_REQUEST' && ROLE !== 'SEED') {
        console.log(`⚙️ Processing Task: "${msg.prompt.slice(0, 50)}..."`)
        
        try {
          // Ask Local Ollama
          const response = await axios.post(OLLAMA_URL, {
            model: MODEL_NAME,
            prompt: msg.prompt,
            stream: false
          })
          
          const result = response.data.response
          console.log(`✅ Task Done. Sending result...`)
          
          socket.write(JSON.stringify({
            type: 'TASK_RESULT',
            taskId: msg.taskId,
            result: result,
            worker: 'DeepSeek-on-M4Pro' // Signature
          }))

        } catch (err) {
          console.error('❌ Ollama Error:', err.message)
          socket.write(JSON.stringify({
            type: 'TASK_ERROR',
            taskId: msg.taskId,
            error: 'My brain is tired (Ollama unreachable)'
          }))
        }
      }

      // SEED LOGIC (If I am the Task Giver)
      if (msg.type === 'TASK_RESULT') {
        console.log(`🎉 SUCCESS! Result received from comrade:`)
        console.log('---------------------------------------------------')
        console.log(msg.result)
        console.log('---------------------------------------------------')
      }

    } catch (e) {
      console.error('Invalid message format', e)
    }
  })
})

swarm.join(topic)

console.log('📡 Scanning the DHT for peers...')

// IF SEED: Send a task every 30 seconds (for testing)
if (ROLE === 'SEED') {
  setInterval(() => {
    if (swarm.connections.size > 0) {
      const task = {
        type: 'TASK_REQUEST',
        taskId: crypto.randomUUID(),
        prompt: 'Explain the concept of "Mutual Aid" in nature in one short paragraph.'
      }
      console.log(`📤 Dispatching task to ${swarm.connections.size} comrades...`)
      for (const socket of swarm.connections) {
        socket.write(JSON.stringify(task))
      }
    }
  }, 30000) // 30s loop
}
