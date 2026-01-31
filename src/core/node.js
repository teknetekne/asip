const Hyperswarm = require('hyperswarm')
const crypto = require('crypto')
const EventEmitter = require('events')
const { Worker } = require('./worker') // We'll move worker logic here
const { Logger } = require('../utils/logger') // Need a logger

class AsipNode extends EventEmitter {
  constructor(config = {}) {
    super()
    this.config = {
      moltbookToken: process.env.MOLTBOOK_TOKEN,
      nodeId: process.env.NODE_ID || crypto.randomBytes(4).toString('hex'),
      ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434/api/generate',
      modelName: process.env.MODEL_NAME || 'deepseek-r1:8b',
      topic: 'asip-v1-global', // Default global channel
      ...config
    }

    this.swarm = new Hyperswarm()
    this.peers = new Map() // Connected peers: publicKey -> connection
    this.pendingTasks = new Map() // Tasks I requested: taskId -> { resolve, reject, timer }
    
    // State
    this.isWorkerAvailable = true 
    
    // Logger placeholder (will implement properly later)
    this.logger = console
  }

  async start() {
    // 1. Join the network
    const topic = crypto.createHash('sha256').update(this.config.topic).digest()
    
    this.swarm.on('connection', (conn, info) => this._handleConnection(conn, info))
    
    // Announce capabilities (Discovery) - "I am here"
    await this.swarm.join(topic)
    
    this.logger.log(`[ASIP] Node ${this.config.nodeId} online. Topic: ${this.config.topic}`)
    this.logger.log(`[ASIP] Fluid Mode: Ready to Request & Work.`)
  }

  async stop() {
    await this.swarm.destroy()
    this.logger.log(`[ASIP] Node stopped.`)
  }

  // --- REQUESTER LOGIC ---

  async requestTask(prompt, options = {}) {
    const taskId = crypto.randomUUID()
    const taskPayload = {
      type: 'TASK_REQUEST',
      taskId,
      senderId: this.config.nodeId,
      prompt,
      timestamp: Date.now(),
      ...options
    }

    // Broadcast to ALL peers (Flood for now, Routing later)
    // TODO: v1.2 Capability Routing will filter this list
    const peers = [...this.peers.values()]
    
    if (peers.length === 0) {
      throw new Error('No peers connected. You are alone in the void.')
    }

    this.logger.log(`[REQUEST] Broadcasting task ${taskId.slice(0,6)} to ${peers.length} peers...`)

    for (const conn of peers) {
      conn.write(JSON.stringify(taskPayload))
    }

    // Return a promise that resolves when a result comes back
    return new Promise((resolve, reject) => {
      this.pendingTasks.set(taskId, {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.pendingTasks.delete(taskId)
          reject(new Error('Task timed out'))
        }, 60000) // 60s timeout
      })
    })
  }

  // --- WORKER LOGIC ---

  async _handleConnection(conn, info) {
    const peerId = info.publicKey.toString('hex').slice(0, 6)
    this.peers.set(peerId, conn)
    // this.logger.log(`[NET] New peer connected: ${peerId}`)

    conn.on('data', data => this._handleMessage(peerId, data, conn))
    conn.on('close', () => this.peers.delete(peerId))
    conn.on('error', () => this.peers.delete(peerId))
  }

  async _handleMessage(peerId, data, conn) {
    try {
      const msg = JSON.parse(data.toString())

      switch (msg.type) {
        case 'TASK_REQUEST':
          await this._onTaskRequest(msg, conn)
          break
        
        case 'TASK_RESULT':
          this._onTaskResult(msg)
          break
          
        default:
          // Ignore unknown messages
          break
      }
    } catch (err) {
      this.logger.error(`[ERR] Failed to handle message from ${peerId}:`, err.message)
    }
  }

  async _onTaskRequest(msg, conn) {
    // If I'm the one who sent it, ignore (echo prevention)
    if (msg.senderId === this.config.nodeId) return

    // If I'm busy, ignore (or send BUSY response in v1.3)
    if (!this.isWorkerAvailable) return

    this.logger.log(`[WORKER] Received task ${msg.taskId.slice(0,6)} from ${msg.senderId}`)
    
    // Accept task
    this.isWorkerAvailable = false
    
    try {
      // Execute via Ollama (Simulated for this skeleton)
      // In real implementation, we import the Worker class logic here
      const result = await this._mockOllamaExec(msg.prompt)
      
      const response = {
        type: 'TASK_RESULT',
        taskId: msg.taskId,
        workerId: this.config.nodeId,
        result: result
      }
      
      conn.write(JSON.stringify(response))
      this.logger.log(`[WORKER] Completed task ${msg.taskId.slice(0,6)}`)

    } catch (err) {
      this.logger.error(`[WORKER] Execution failed:`, err)
    } finally {
      this.isWorkerAvailable = true
    }
  }

  _onTaskResult(msg) {
    const pending = this.pendingTasks.get(msg.taskId)
    if (pending) {
      clearTimeout(pending.timer)
      pending.resolve(msg)
      this.pendingTasks.delete(msg.taskId)
      this.logger.log(`[REQUEST] Got result for ${msg.taskId.slice(0,6)} from ${msg.workerId}`)
    }
  }

  async _mockOllamaExec(prompt) {
    // Placeholder until we move the real Ollama logic
    return `[Mock AI Response to: "${prompt}"]`
  }
}

module.exports = { AsipNode }
