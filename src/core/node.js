const Hyperswarm = require('hyperswarm')
const crypto = require('crypto')
const EventEmitter = require('events')
const { Identity } = require('./identity')
const { Worker } = require('./worker') // We'll move worker logic here
const { Logger } = require('../utils/logger') // Need a logger

class AsipNode extends EventEmitter {
  constructor(config = {}) {
    super()
    
    // Initialize Identity
    this.identity = new Identity()
    const idInfo = this.identity.init()

    this.config = {
      moltbookToken: process.env.MOLTBOOK_TOKEN,
      nodeId: idInfo.nodeId, // Use Crypto ID
      publicKey: idInfo.publicKey,
      ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434/api/generate',
      modelName: process.env.MODEL_NAME || 'deepseek-r1:8b',
      topic: 'asip-v1-global',
      ...config
    }

    this.swarm = new Hyperswarm()
    this.peers = new Map() // Connected peers: publicKey -> connection
    this.pendingTasks = new Map() // Tasks I requested: taskId -> { resolve, reject, timer }
    
    // Worker
    this.worker = new Worker({
      ollamaUrl: this.config.ollamaUrl,
      modelName: this.config.modelName
    })
    
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
      senderPub: this.config.publicKey, // Announce PubKey
      prompt,
      timestamp: Date.now(),
      ...options
    }
    
    // Sign the payload
    const signature = this.identity.sign(JSON.stringify(taskPayload))
    const signedMessage = {
      payload: taskPayload,
      signature
    }

    // Broadcast to ALL peers (Flood for now, Routing later)
    // TODO: v1.2 Capability Routing will filter this list
    const peers = [...this.peers.values()]
    
    if (peers.length === 0) {
      throw new Error('No peers connected. You are alone in the void.')
    }

    this.logger.log(`[REQUEST] Broadcasting task ${taskId.slice(0,6)} to ${peers.length} peers...`)

    for (const conn of peers) {
      conn.write(JSON.stringify(signedMessage))
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
      const container = JSON.parse(data.toString())
      
      // Verify Signature if present (Backward compatibility for v1.0 could be added here, but we are breaking it)
      if (!container.payload || !container.signature) {
        throw new Error('Invalid message format: missing payload or signature')
      }
      
      const msg = container.payload
      
      // Verify logic
      // Note: msg.senderPub is hex string
      const isValid = this.identity.verify(JSON.stringify(msg), container.signature, msg.senderPub)
      
      if (!isValid) {
        this.logger.error(`[SEC] Invalid signature from ${msg.senderId}`)
        return
      }

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
      // Execute via Ollama
      const result = await this.worker.execute(msg.prompt)
      
      const responsePayload = {
        type: 'TASK_RESULT',
        taskId: msg.taskId,
        workerId: this.config.nodeId,
        workerPub: this.config.publicKey,
        result: result
      }
      
      const responseSig = this.identity.sign(JSON.stringify(responsePayload))
      
      conn.write(JSON.stringify({
        payload: responsePayload,
        signature: responseSig
      }))
      this.logger.log(`[WORKER] Completed task ${msg.taskId.slice(0,6)}`)

    } catch (err) {
      this.logger.error(`[WORKER] Execution failed:`, err)
    } finally {
      this.isWorkerAvailable = true
    }
  }

  _onTaskResult(msg) {

module.exports = { AsipNode }
