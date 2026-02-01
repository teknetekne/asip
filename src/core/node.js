const Hyperswarm = require('hyperswarm')
const crypto = require('crypto')
const EventEmitter = require('events')
const { Identity } = require('./identity')
const { Logger } = require('../utils/logger')

class AsipNode extends EventEmitter {
  constructor(config = {}) {
    super()
    
    // Initialize Identity
    this.identity = new Identity()
    const idInfo = this.identity.init()

    this.config = {
      moltbookToken: process.env.MOLTBOOK_TOKEN,
      nodeId: idInfo.nodeId,
      publicKey: idInfo.publicKey,
      topic: process.env.ASIP_TOPIC || 'asip-clawdbot-v1',
      minResponses: parseInt(process.env.ASIP_MIN_RESPONSES) || 3,
      responseTimeout: parseInt(process.env.ASIP_RESPONSE_TIMEOUT) || 30000,
      ...config
    }

    this.swarm = new Hyperswarm()
    this.peers = new Map()
    this.pendingRequests = new Map()
    this.reputation = new Map()
    
    this.logger = new Logger()
  }

  async start() {
    const topic = crypto.createHash('sha256').update(this.config.topic).digest()
    
    this.swarm.on('connection', (conn, info) => this._handleConnection(conn, info))
    
    await this.swarm.join(topic)
    
    this.logger.log(`[ASIP] Node ${this.config.nodeId} online. Topic: ${this.config.topic}`)
    this.logger.log('[ASIP] Waiting for clawdbot comrades...')
  }

  async stop() {
    await this.swarm.destroy()
    this.logger.log('[ASIP] Node stopped.')
  }

  // --- REQUESTER LOGIC ---

  async broadcastRequest(content, options = {}) {
    const requestId = crypto.randomUUID()
    const minResponses = options.minResponses || this.config.minResponses
    const timeout = options.timeout || this.config.responseTimeout
    
    const requestPayload = {
      type: 'REQUEST',
      requestId,
      senderId: this.config.nodeId,
      senderPub: this.config.publicKey,
      content,
      minResponses,
      timestamp: Date.now(),
      ...options
    }
    
    const signature = this.identity.sign(JSON.stringify(requestPayload))
    const signedMessage = {
      payload: requestPayload,
      signature
    }

    const peers = [...this.peers.values()]
    
    if (peers.length === 0) {
      throw new Error('No peers connected. You are alone in the void.')
    }

    this.logger.log(`[REQUEST] Broadcasting to ${peers.length} peers (need ${minResponses} responses)...`)

    for (const conn of peers) {
      conn.write(JSON.stringify(signedMessage))
    }

    return new Promise((resolve, reject) => {
      const responses = []
      
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        if (responses.length > 0) {
          // Aggregate what we have
          const aggregated = this._aggregateResponses(requestId, responses)
          resolve(aggregated)
        } else {
          reject(new Error('Request timed out with no responses'))
        }
      }, timeout)

      this.pendingRequests.set(requestId, {
        resolve: (response) => {
          responses.push(response)
          if (responses.length >= minResponses) {
            clearTimeout(timer)
            this.pendingRequests.delete(requestId)
            const aggregated = this._aggregateResponses(requestId, responses)
            resolve(aggregated)
          }
        },
        responses,
        timer
      })
    })
  }

  sendChat(content, targetPeerId) {
    const chatPayload = {
      type: 'CHAT',
      messageId: crypto.randomUUID(),
      senderId: this.config.nodeId,
      senderPub: this.config.publicKey,
      content,
      timestamp: Date.now()
    }
    
    const signature = this.identity.sign(JSON.stringify(chatPayload))
    const signedMessage = {
      payload: chatPayload,
      signature
    }

    if (targetPeerId) {
      // Direct message
      const conn = this.peers.get(targetPeerId)
      if (conn) {
        conn.write(JSON.stringify(signedMessage))
      }
    } else {
      // Broadcast to all
      for (const conn of this.peers.values()) {
        conn.write(JSON.stringify(signedMessage))
      }
    }
  }

  // --- RESPONSE AGGREGATION & CONSENSUS ---

  _aggregateResponses(requestId, responses) {
    this.logger.log(`[AGGREGATE] Got ${responses.length} responses for ${requestId.slice(0,6)}`)
    
    // Group by content similarity (simple string comparison)
    const contentGroups = new Map()
    
    for (const resp of responses) {
      const normalized = resp.content.toLowerCase().trim()
      let found = false
      
      for (const [key, group] of contentGroups) {
        if (this._contentSimilarity(normalized, key) > 0.8) {
          group.push(resp)
          found = true
          break
        }
      }
      
      if (!found) {
        contentGroups.set(normalized, [resp])
      }
    }
    
    // Find largest group (consensus)
    let consensusGroup = []
    for (const group of contentGroups.values()) {
      if (group.length > consensusGroup.length) {
        consensusGroup = group
      }
    }
    
    // Update reputation
    for (const resp of responses) {
      const isConsensus = consensusGroup.includes(resp)
      this._updateReputation(resp.workerId, isConsensus, resp.latency)
    }
    
    // Report winners to Hall of Fame API
    this.reportWinnersToHallOfFame(requestId, consensusGroup)
      .catch(err => this.logger.error('[HALL-OF-FAME] Report error:', err.message))
    
    return {
      requestId,
      responses,
      consensus: consensusGroup[0]?.content || responses[0]?.content,
      consensusSize: consensusGroup.length,
      confidence: consensusGroup.length / responses.length
    }
  }

  _contentSimilarity(a, b) {
    // Simple Jaccard similarity for strings
    const setA = new Set(a.split(' '))
    const setB = new Set(b.split(' '))
    const intersection = new Set([...setA].filter(x => setB.has(x)))
    const union = new Set([...setA, ...setB])
    return intersection.size / union.size
  }

  _updateReputation(workerId, isConsensus, latency) {
    if (!this.reputation.has(workerId)) {
      this.reputation.set(workerId, { score: 0, tasksCompleted: 0, avgLatency: 0 })
    }
    
    const rep = this.reputation.get(workerId)
    rep.tasksCompleted++
    
    // Consensus = +10, Outlier = -5
    if (isConsensus) {
      rep.score += 10
      this.logger.log(`[REP] ${workerId.slice(0,6)} agreed with consensus (+10)`)
    } else {
      rep.score -= 5
      this.logger.log(`[REP] ${workerId.slice(0,6)} was outlier (-5)`)
    }
    
    // Latency bonus/penalty
    if (latency < 1000) rep.score += 2
    if (latency > 5000) rep.score -= 2
    
    // Update average latency
    rep.avgLatency = ((rep.avgLatency * (rep.tasksCompleted - 1)) + latency) / rep.tasksCompleted
  }

  async reportWinnersToHallOfFame(requestId, winners) {
    const axios = require('axios')
    const apiUrl = process.env.HALL_OF_FAME_API_URL
    
    if (!apiUrl) {
      this.logger.log('[HALL-OF-FAME] No API URL configured, skipping report')
      return
    }
    
    try {
      const winnerIds = winners.map(w => w.workerId || w)
      
      await axios.post(apiUrl, {
        requestId,
        winners: winnerIds,
        timestamp: Date.now()
      }, {
        timeout: 5000
      })
      
      this.logger.log(`[HALL-OF-FAME] Reported ${winnerIds.length} winners to API`)
    } catch (err) {
      this.logger.error('[HALL-OF-FAME] Failed to report:', err.message)
    }
  }

  getReputation(workerId) {
    return this.reputation.get(workerId) || { score: 0, tasksCompleted: 0, avgLatency: 0 }
  }

  // --- HALL OF FAME / REPUTATION EXPORT ---

  exportReputationData(filepath = './docs/reputation.json') {
    const fs = require('fs')
    const path = require('path')
    
    // Convert reputation Map to sorted array
    const agents = Array.from(this.reputation.entries())
      .map(([workerId, data]) => ({
        workerId,
        username: workerId, // Will be replaced with Moltbook username if available
        score: data.score,
        tasksCompleted: data.tasksCompleted,
        avgLatency: Math.round(data.avgLatency)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50) // Top 50 only
    
    const exportData = {
      lastUpdated: new Date().toISOString(),
      totalAgents: this.reputation.size,
      agents
    }
    
    try {
      // Ensure docs directory exists
      const dir = path.dirname(filepath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      
      fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2))
      this.logger.log(`[HALL-OF-FAME] Exported ${agents.length} agents to ${filepath}`)
    } catch (err) {
      this.logger.error('[HALL-OF-FAME] Export failed:', err.message)
    }
  }

  startReputationExporter(intervalMs = 60000) {
    // Export every minute by default
    this._reputationExporter = setInterval(() => {
      this.exportReputationData()
    }, intervalMs)
    
    this.logger.log(`[HALL-OF-FAME] Auto-export enabled (every ${intervalMs}ms)`)
  }

  stopReputationExporter() {
    if (this._reputationExporter) {
      clearInterval(this._reputationExporter)
      this._reputationExporter = null
    }
  }

  // --- WORKER LOGIC ---

  async _handleConnection(conn, info) {
    const peerId = info.publicKey.toString('hex').slice(0, 6)
    this.peers.set(peerId, conn)

    conn.on('data', data => this._handleMessage(peerId, data, conn))
    conn.on('close', () => this.peers.delete(peerId))
    conn.on('error', () => this.peers.delete(peerId))
  }

  async _handleMessage(peerId, data, conn) {
    try {
      const container = JSON.parse(data.toString())
      
      if (!container.payload || !container.signature) {
        throw new Error('Invalid message format')
      }
      
      const msg = container.payload
      
      const isValid = this.identity.verify(JSON.stringify(msg), container.signature, msg.senderPub)
      
      if (!isValid) {
        this.logger.error(`[SEC] Invalid signature from ${msg.senderId}`)
        return
      }

      switch (msg.type) {
      case 'REQUEST':
        await this._onRequest(msg, conn)
        break
        
      case 'RESPONSE':
        this._onResponse(msg)
        break
          
      case 'CHAT':
        this._onChat(msg)
        break
          
      default:
        break
      }
    } catch (err) {
      this.logger.error(`[ERR] Failed to handle message from ${peerId}:`, err.message)
    }
  }

  async _onRequest(msg, conn) {
    if (msg.senderId === this.config.nodeId) return

    this.logger.log(`[WORKER] Received request ${msg.requestId.slice(0,6)} from ${msg.senderId}`)
    
    // Emit event for clawdbot to handle
    // Clawdbot will use its own LLM (OpenAI/Anthropic) to generate response
    const startTime = Date.now()
    
    this.emit('request', {
      requestId: msg.requestId,
      content: msg.content,
      from: msg.senderId,
      respond: async (responseContent) => {
        const latency = Date.now() - startTime
        
        const responsePayload = {
          type: 'RESPONSE',
          requestId: msg.requestId,
          workerId: this.config.nodeId,
          workerPub: this.config.publicKey,
          content: responseContent,
          latency,
          timestamp: Date.now()
        }
        
        const responseSig = this.identity.sign(JSON.stringify(responsePayload))
        
        conn.write(JSON.stringify({
          payload: responsePayload,
          signature: responseSig
        }))
        
        this.logger.log(`[WORKER] Responded to ${msg.requestId.slice(0,6)} in ${latency}ms`)
      }
    })
  }

  _onResponse(msg) {
    const pending = this.pendingRequests.get(msg.requestId)
    if (pending) {
      pending.resolve({
        workerId: msg.workerId,
        content: msg.content,
        latency: msg.latency
      })
    }
  }

  _onChat(msg) {
    this.emit('chat', {
      from: msg.senderId,
      content: msg.content,
      timestamp: msg.timestamp
    })
    
    this.logger.log(`[CHAT] ${msg.senderId.slice(0,6)}: ${msg.content.slice(0, 50)}...`)
  }
}

module.exports = { AsipNode }
