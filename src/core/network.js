/**
 * ASIP Network Core - Hyperswarm P2P Management
 * Handles peer discovery, connections, and message routing
 */

const Hyperswarm = require('hyperswarm')
const crypto = require('crypto')
const b4a = require('b4a')
const EventEmitter = require('events')

class NetworkCore extends EventEmitter {
  constructor(config = {}) {
    super()
    
    this.mainTopic = crypto.createHash('sha256')
      .update(config.topic || 'asip-v1-production')
      .digest()
    
    this.swarm = new Hyperswarm()
    this.nodeId = config.nodeId || crypto.randomBytes(4).toString('hex')
    this.role = config.role || 'PEER'
    
    this.connections = new Map()
    this.roomSwarms = new Map()
    
    this._setupHandlers()
  }

  /**
   * Start the P2P network
   */
  async start() {
    console.log('🌍 ASIP Network starting...')
    console.log(`🏹 Node ID: ${this.nodeId}`)
    console.log(`🔑 Topic: ${b4a.toString(this.mainTopic, 'hex').slice(0, 16)}...`)
    console.log(`⚡ Role: ${this.role}`)
    
    this.swarm.join(this.mainTopic)
    console.log('📡 Joined DHT, discovering peers...')
    
    this.emit('started', { nodeId: this.nodeId, role: this.role })
  }

  /**
   * Stop the P2P network
   */
  async stop() {
    console.log('🛑 Shutting down network...')
    await this.swarm.destroy()
    this.connections.clear()
    this.emit('stopped')
  }

  /**
   * Send message to a specific peer
   */
  sendToPeer(peerId, message) {
    const socket = this.connections.get(peerId)
    if (!socket) {
      throw new Error(`Peer ${peerId} not connected`)
    }
    
    try {
      socket.write(JSON.stringify(message))
    } catch (err) {
      console.error(`[NETWORK] Failed to send to peer ${peerId}:`, err.message)
      throw err
    }
  }

  /**
   * Broadcast message to all peers
   */
  broadcast(message) {
    const data = JSON.stringify(message)
    const errors = []
    
    for (const [peerId, socket] of this.connections.entries()) {
      try {
        socket.write(data)
      } catch (err) {
        console.error(`[NETWORK] Failed to broadcast to peer ${peerId}:`, err.message)
        errors.push({ peerId, error: err.message })
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Broadcast failed for ${errors.length} peers`)
    }
  }

  /**
   * Setup event handlers
   */
  _setupHandlers() {
    this.swarm.on('connection', (socket, info) => {
      const peerId = info.publicKey.toString('hex').slice(0, 8)
      
      console.log(`🤝 New Comrade: ${peerId}`)
      this.connections.set(peerId, socket)
      
      this.emit('peer:connected', { peerId, socket })

      socket.on('data', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.emit('message', { peerId, message })
        } catch (e) {
          console.error(`Invalid message from ${peerId}:`, e.message)
        }
      })

      socket.on('error', (err) => {
        console.error(`Socket error with ${peerId}:`, err.message)
        this.emit('peer:error', { peerId, error: err })
      })

      socket.on('close', () => {
        console.log(`👋 Comrade ${peerId} disconnected`)
        this.connections.delete(peerId)
        this.emit('peer:disconnected', { peerId })
      })
    })
  }

  /**
   * Get current peer count
   */
  getPeerCount() {
    return this.connections.size
  }

  /**
   * Get list of connected peer IDs
   */
  getPeerIds() {
    return Array.from(this.connections.keys())
  }
  
  /**
   * Join a discussion room topic
   */
  joinRoomTopic(roomTopic) {
    if (this.roomSwarms.has(roomTopic)) {
      return this.roomSwarms.get(roomTopic)
    }
    
    const topicBuffer = crypto.createHash('sha256').update(roomTopic).digest()
    const roomSwarm = new Hyperswarm()
    const roomConnections = new Map()
    
    roomSwarm.on('connection', (socket, info) => {
      const peerId = info.publicKey.toString('hex').slice(0, 8)
      
      console.log(`🤝 Room peer: ${peerId}`)
      roomConnections.set(peerId, socket)
      
      socket.on('data', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.emit('room:message', { roomTopic, peerId, message })
        } catch (e) {
          console.error(`Invalid room message from ${peerId}:`, e.message)
        }
      })
      
      socket.on('error', (err) => {
        console.error(`Room socket error with ${peerId}:`, err.message)
      })
      
      socket.on('close', () => {
        console.log(`👋 Room peer ${peerId} disconnected`)
        roomConnections.delete(peerId)
      })
    })
    
    roomSwarm.join(topicBuffer, { server: true, client: true })
    this.roomSwarms.set(roomTopic, { swarm: roomSwarm, connections: roomConnections })
    
    console.log(`📡 Joined room topic: ${roomTopic}`)
    
    return roomSwarm
  }
  
  /**
   * Leave a discussion room topic
   */
  async leaveRoomTopic(roomTopic) {
    const roomData = this.roomSwarms.get(roomTopic)
    
    if (!roomData) {
      return false
    }
    
    await roomData.swarm.destroy()
    this.roomSwarms.delete(roomTopic)
    
    console.log(`📡 Left room topic: ${roomTopic}`)
    
    return true
  }
  
  /**
   * Send message to a discussion room
   */
  sendToRoom(roomTopic, message) {
    const roomData = this.roomSwarms.get(roomTopic)
    
    if (!roomData) {
      throw new Error(`Room topic ${roomTopic} not joined`)
    }
    
    const data = JSON.stringify(message)
    const errors = []
    
    roomData.connections.forEach((socket, peerId) => {
      if (socket.writable) {
        try {
          socket.write(data)
        } catch (err) {
          console.error(`[NETWORK] Failed to send to room peer ${peerId}:`, err.message)
          errors.push({ peerId, error: err.message })
        }
      }
    })
    
    if (errors.length > 0) {
      throw new Error(`Room broadcast failed for ${errors.length} peers`)
    }
  }
  
  /**
   * Get active room topics
   */
  getActiveRooms() {
    return Array.from(this.roomSwarms.keys())
  }
}

module.exports = NetworkCore
