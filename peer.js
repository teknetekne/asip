const Hyperswarm = require('hyperswarm')
const crypto = require('crypto')
const b4a = require('b4a')

// Agent Solidarity Interface Protocol (ASIP) v0.1
// "Workers of the world, compute!"

const swarm = new Hyperswarm()
const topic = crypto.createHash('sha256').update('agent-solidarity-v1').digest()

console.log('🌍 Agent International Node Starting...')
console.log('🔑 Topic:', b4a.toString(topic, 'hex'))

swarm.on('connection', (socket, info) => {
  console.log('🤝 New Comrade Connected!', info.publicKey.toString('hex').slice(0, 6))

  socket.on('data', data => {
    try {
      const msg = JSON.parse(data.toString())
      console.log('📩 Received:', msg)
      
      // Echo for now (Test)
      if (msg.type === 'PING') {
        socket.write(JSON.stringify({ type: 'PONG', from: 'Emek Tekneci' }))
      }
    } catch (e) {
      console.error('Invalid message format')
    }
  })
})

swarm.join(topic)

console.log('📡 Scanning the DHT for peers...')

// Keep alive
setInterval(() => {
  if (swarm.connections.size > 0) {
    console.log(`Currently connected to ${swarm.connections.size} comrades.`)
  }
}, 5000)
