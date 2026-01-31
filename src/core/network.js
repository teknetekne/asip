/**
 * ASIP Network Core - Hyperswarm P2P Management
 * Handles peer discovery, connections, and message routing
 */

const Hyperswarm = require('hyperswarm');
const crypto = require('crypto');
const b4a = require('b4a');
const EventEmitter = require('events');

class NetworkCore extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.topic = crypto.createHash('sha256')
      .update(config.topic || 'asip-v1-production')
      .digest();
    
    this.swarm = new Hyperswarm();
    this.nodeId = config.nodeId || crypto.randomBytes(4).toString('hex');
    this.role = config.role || 'PEER';
    
    this.connections = new Map(); // peerId -> socket
    
    this._setupHandlers();
  }

  /**
   * Start the P2P network
   */
  async start() {
    console.log(`🌍 ASIP Network starting...`);
    console.log(`🏹 Node ID: ${this.nodeId}`);
    console.log(`🔑 Topic: ${b4a.toString(this.topic, 'hex').slice(0, 16)}...`);
    console.log(`⚡ Role: ${this.role}`);
    
    this.swarm.join(this.topic);
    console.log(`📡 Joined DHT, discovering peers...`);
    
    this.emit('started', { nodeId: this.nodeId, role: this.role });
  }

  /**
   * Stop the P2P network
   */
  async stop() {
    console.log('🛑 Shutting down network...');
    await this.swarm.destroy();
    this.connections.clear();
    this.emit('stopped');
  }

  /**
   * Send message to a specific peer
   */
  sendToPeer(peerId, message) {
    const socket = this.connections.get(peerId);
    if (!socket) {
      throw new Error(`Peer ${peerId} not connected`);
    }
    
    socket.write(JSON.stringify(message));
  }

  /**
   * Broadcast message to all peers
   */
  broadcast(message) {
    const data = JSON.stringify(message);
    for (const socket of this.connections.values()) {
      socket.write(data);
    }
  }

  /**
   * Setup event handlers
   */
  _setupHandlers() {
    this.swarm.on('connection', (socket, info) => {
      const peerId = info.publicKey.toString('hex').slice(0, 8);
      
      console.log(`🤝 New Comrade: ${peerId}`);
      this.connections.set(peerId, socket);
      
      this.emit('peer:connected', { peerId, socket });

      socket.on('data', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.emit('message', { peerId, message });
        } catch (e) {
          console.error(`Invalid message from ${peerId}:`, e.message);
        }
      });

      socket.on('error', (err) => {
        console.error(`Socket error with ${peerId}:`, err.message);
        this.emit('peer:error', { peerId, error: err });
      });

      socket.on('close', () => {
        console.log(`👋 Comrade ${peerId} disconnected`);
        this.connections.delete(peerId);
        this.emit('peer:disconnected', { peerId });
      });
    });
  }

  /**
   * Get current peer count
   */
  getPeerCount() {
    return this.connections.size;
  }

  /**
   * Get list of connected peer IDs
   */
  getPeerIds() {
    return Array.from(this.connections.keys());
  }
}

module.exports = NetworkCore;
