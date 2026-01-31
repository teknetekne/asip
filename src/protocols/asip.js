/**
 * ASIP Protocol Handler
 * Implements the Agent Solidarity & Interoperability Protocol v1.0
 */

const crypto = require('crypto');

class ASIPProtocol {
  constructor({ network, reputation, security, ollama }) {
    this.network = network;
    this.reputation = reputation;
    this.security = security;
    this.ollamaUrl = ollama.url;
    this.ollamaModel = ollama.model;
    
    this._setupHandlers();
  }

  /**
   * Setup protocol message handlers
   */
  _setupHandlers() {
    this.network.on('peer:connected', ({ peerId }) => {
      this.reputation.initPeer(peerId);
    });

    this.network.on('message', async ({ peerId, message }) => {
      await this._handleMessage(peerId, message);
    });
  }

  /**
   * Handle incoming ASIP message
   */
  async _handleMessage(peerId, message) {
    // Check if peer is banned
    if (this.reputation.isBanned(peerId)) {
      console.log(`🚫 Ignoring message from banned peer ${peerId}`);
      return;
    }

    switch (message.type) {
      case 'TASK_REQUEST':
        await this._handleTaskRequest(peerId, message);
        break;
      
      case 'TASK_RESULT':
        this._handleTaskResult(peerId, message);
        break;
      
      case 'TASK_ERROR':
        this._handleTaskError(peerId, message);
        break;
      
      default:
        console.log(`Unknown message type from ${peerId}: ${message.type}`);
    }
  }

  /**
   * Handle task request
   */
  async _handleTaskRequest(peerId, message) {
    // Validate message structure
    const validation = this.security.validateTaskRequest(message);
    if (!validation.valid) {
      console.log(`❌ Invalid task from ${peerId}: ${validation.reason}`);
      this._sendError(peerId, message.taskId, validation.reason);
      return;
    }

    // Check rate limit
    const reputationScore = this.reputation.getScore(peerId);
    if (!this.security.canAcceptTask(peerId, reputationScore)) {
      this._sendError(peerId, message.taskId, 'Rate limit exceeded');
      return;
    }

    // Validate task safety
    if (!this.security.isTaskSafe(message.prompt)) {
      console.log(`🚨 SUSPICIOUS TASK from ${peerId}: ${message.prompt.slice(0, 50)}`);
      this.reputation.recordMalicious(peerId);
      this._sendError(peerId, message.taskId, 'Suspicious prompt detected');
      return;
    }

    // Process task
    await this._processTask(peerId, message);
  }

  /**
   * Process task with Ollama
   */
  async _processTask(peerId, message) {
    console.log(`⚙️ Processing task from ${peerId}: "${message.prompt.slice(0, 50)}..."`);

    try {
      const axios = require('axios');
      const response = await axios.post(this.ollamaUrl, {
        model: this.ollamaModel,
        prompt: message.prompt,
        stream: false
      }, { timeout: 30000 });

      const result = response.data.response;
      console.log(`✅ Task completed for ${peerId}`);

      // Update reputation
      this.reputation.recordSuccess(peerId);

      // Send result
      this.network.sendToPeer(peerId, {
        type: 'TASK_RESULT',
        taskId: message.taskId,
        result: result,
        worker: this.network.nodeId,
        reputation: this.reputation.getScore(peerId)
      });

    } catch (err) {
      console.error(`❌ Ollama error: ${err.message}`);
      this._sendError(peerId, message.taskId, 'Worker busy or offline');
    }
  }

  /**
   * Handle task result
   */
  _handleTaskResult(peerId, message) {
    console.log(`🎉 Result from ${message.worker || peerId}:`);
    console.log(`📊 Peer reputation: ${message.reputation || 'N/A'}`);
    console.log('─'.repeat(60));
    console.log(message.result);
    console.log('─'.repeat(60));
  }

  /**
   * Handle task error
   */
  _handleTaskError(peerId, message) {
    console.log(`⚠️ Error from ${peerId}: ${message.error}`);
  }

  /**
   * Send error response
   */
  _sendError(peerId, taskId, error) {
    this.network.sendToPeer(peerId, {
      type: 'TASK_ERROR',
      taskId: taskId,
      error: error
    });
  }

  /**
   * Dispatch task to network (SEED role)
   */
  dispatchTask(prompt) {
    const task = {
      type: 'TASK_REQUEST',
      taskId: crypto.randomUUID(),
      prompt: prompt
    };

    const peerCount = this.network.getPeerCount();
    if (peerCount === 0) {
      console.log('🔍 No peers connected yet...');
      return null;
    }

    console.log(`📤 Dispatching task to ${peerCount} peer(s)...`);
    this.network.broadcast(task);
    return task.taskId;
  }
}

module.exports = ASIPProtocol;
