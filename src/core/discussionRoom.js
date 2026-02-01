const crypto = require('crypto')
const Hyperswarm = require('hyperswarm')
const { Logger } = require('../utils/logger')

class DiscussionRoom {
  constructor(question, requester, firstResponder) {
    this.id = crypto.createHash('sha256')
      .update(question.id + Date.now())
      .digest('hex')
    
    this.topic = `asip-discuss-${crypto.createHash('sha256')
      .update(question.id)
      .digest('hex')
      .slice(0, 8)}`
    
    this.question = question
    this.requester = requester
    this.participants = [requester, firstResponder]
    this.status = 'OPEN'
    this.createdAt = Date.now()
    this.timeout = 120000
    
    this.responses = []
    this.discussionLog = []
    
    this.rules = {
      maxDuration: 120000,
      minParticipants: 2,
      maxParticipants: 10,
      consensusThreshold: 0.6,
      allowedMessages: ['RESPONSE', 'ARGUMENT', 'PROPOSAL', 'AGREEMENT', 'OBJECTION', 'MERGE']
    }
    
    this.swarm = new Hyperswarm()
    const topicBuffer = crypto.createHash('sha256').update(this.topic).digest()
    this.swarm.join(topicBuffer, { server: true, client: true })
    
    this.logger = new Logger()
    
    this._logEvent('ROOM_CREATED', requester.publicKey)
  }
  
  join(newResponder) {
    if (this.status !== 'OPEN') {
      return { error: 'ROOM_CLOSED' }
    }
    if (this.participants.length >= this.rules.maxParticipants) {
      return { error: 'ROOM_FULL' }
    }
    
    this.participants.push(newResponder)
    
    const roomState = {
      question: this.question,
      existingResponses: this.responses,
      discussionLog: this.discussionLog
    }
    
    this._logEvent('PARTICIPANT_JOINED', newResponder.publicKey)
    
    try {
      this.broadcast({
        type: 'PARTICIPANT_JOINED',
        participant: newResponder.publicKey,
        timestamp: Date.now()
      })
    } catch (err) {
      this.logger.log(`[ROOM] Failed to broadcast participant join: ${err.message}`)
    }
    
    return { success: true, state: roomState }
  }
  
  addResponse(response) {
    this.responses.push(response)
    this._logEvent('RESPONSE_SUBMITTED', response.author, { content: response.content })
  }
  
  addMessage(message) {
    if (!this.rules.allowedMessages.includes(message.type)) {
      return { error: 'INVALID_MESSAGE_TYPE' }
    }
    
    this.discussionLog.push(message)
    this._logEvent('MESSAGE', message.author, { type: message.type })
    
    try {
      this.broadcast(message)
    } catch (err) {
      this.logger.log(`[ROOM] Failed to broadcast message: ${err.message}`)
      return { error: 'BROADCAST_FAILED', message: err.message }
    }
    
    return { success: true }
  }
  
  broadcast(message) {
    const errors = []
    
    for (const participant of this.participants) {
      if (participant.socket && participant.socket.writable) {
        try {
          participant.socket.write(JSON.stringify({
            roomId: this.id,
            message
          }))
        } catch (err) {
          errors.push({
            participant: participant.publicKey,
            error: err.message
          })
          this.logger.log(`[ROOM] Socket write failed for ${participant.publicKey?.slice(0, 6)}: ${err.message}`)
        }
      }
    }
    
    if (errors.length > 0) {
      const failedParticipants = errors.map(e => e.participant?.slice(0, 6) || 'unknown').join(', ')
      throw new Error(`Broadcast failed for ${errors.length} participants: ${failedParticipants}`)
    }
  }
  
  async close(reason = 'CONSENSUS_REACHED') {
    this.status = 'CLOSED'
    this.closedAt = Date.now()
    
    try {
      this.broadcast({
        type: 'ROOM_CLOSED',
        reason,
        timestamp: Date.now()
      })
    } catch (err) {
      this.logger.log(`[ROOM] Failed to broadcast close message: ${err.message}`)
    }
    
    this._logEvent('ROOM_CLOSED', 'SYSTEM', { reason })
    
    await this.destroy()
  }
  
  async destroy() {
    this.status = 'DESTROYED'
    
    if (this.swarm) {
      await this.swarm.destroy()
      this.logger.log(`[ROOM] Swarm destroyed for room ${this.id.slice(0, 8)}`)
    }
    
    this.participants = []
    this.responses = []
    this.discussionLog = []
  }
  
  getParticipantCount() {
    return this.participants.length
  }
  
  isFull() {
    return this.participants.length >= this.rules.maxParticipants
  }
  
  _logEvent(event, by, data = {}) {
    this.discussionLog.push({
      event,
      by,
      timestamp: Date.now(),
      ...data
    })
  }
  
  toJSON() {
    return {
      id: this.id,
      topic: this.topic,
      question: this.question,
      participants: this.participants.map(p => p.publicKey),
      status: this.status,
      createdAt: this.createdAt,
      closedAt: this.closedAt,
      responses: this.responses,
      discussionLog: this.discussionLog,
      rules: this.rules
    }
  }
}

module.exports = { DiscussionRoom }