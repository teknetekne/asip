const crypto = require('crypto')
const { Logger } = require('../utils/logger')

class ArchiveSystem {
  constructor() {
    this.archivedRooms = new Map()
    this.logger = new Logger()
  }
  
  async archiveRoom(room) {
    if (room.status !== 'CLOSED') {
      return { success: false, error: 'ROOM_NOT_CLOSED' }
    }
    
    const log = this._generateRoomLog(room)
    
    const merkleRoot = this._calculateMerkleRoot(log.timeline)
    log.merkleRoot = merkleRoot
    
    const cid = this._generateMockCID(room.id)
    
    log.ipfsCID = cid
    log.archivedAt = Date.now()
    
    this.archivedRooms.set(room.id, log)
    
    this.logger.log(`[ARCHIVE] Room ${room.id.slice(0,8)} archived (CID: ${cid.slice(0,12)}...)`)
    
    return { success: true, cid, merkleRoot, log }
  }
  
  _generateRoomLog(room) {
    return {
      roomId: room.id,
      question: {
        id: room.question.id,
        content: room.question.content,
        requester: room.requester.publicKey
      },
      
      timeline: this._buildTimeline(room),
      
      participants: room.participants.map(p => ({
        publicKey: p.publicKey,
        role: p.publicKey === room.requester.publicKey ? 'REQUESTER' : 'RESPONDER',
        joinedAt: room.createdAt
      })),
      
      finalResult: {
        consensus: room.consensusData?.reached || false,
        answer: room.finalAnswer || null,
        supporters: room.consensusData?.supporters || [],
        method: room.consensusData?.method || 'NONE'
      },
      
      reputationChanges: room.reputationChanges || [],
      
      archivedAt: Date.now()
    }
  }
  
  _buildTimeline(room) {
    const timeline = []
    
    timeline.push({
      time: 0,
      event: 'ROOM_CREATED',
      by: room.requester.publicKey
    })
    
    const joinTimes = new Map()
    joinTimes.set(room.requester.publicKey, 0)
    
    for (const participant of room.participants) {
      if (participant.publicKey !== room.requester.publicKey) {
        joinTimes.set(participant.publicKey, Date.now())
        timeline.push({
          time: Date.now() - room.createdAt,
          event: 'PARTICIPANT_JOINED',
          by: participant.publicKey
        })
      }
    }
    
    for (const message of room.discussionLog) {
      if (message.type === 'RESPONSE_SUBMITTED') {
        timeline.push({
          time: message.timestamp - room.createdAt,
          event: 'RESPONSE_SUBMITTED',
          by: message.by,
          content: message.content
        })
      } else if (message.type === 'MESSAGE') {
        timeline.push({
          time: message.timestamp - room.createdAt,
          event: 'MESSAGE',
          type: message.data?.type,
          by: message.by
        })
      } else if (message.event) {
        timeline.push({
          time: message.timestamp - room.createdAt,
          event: message.event,
          by: message.by
        })
      }
    }
    
    if (room.status === 'CLOSED' && room.closedAt) {
      timeline.push({
        time: room.closedAt - room.createdAt,
        event: 'ROOM_CLOSED',
        by: 'SYSTEM',
        reason: room.consensusData?.method || 'TIMEOUT'
      })
    }
    
    timeline.sort((a, b) => a.time - b.time)
    
    return timeline
  }
  
  _calculateMerkleRoot(timeline) {
    if (!timeline || timeline.length === 0) {
      return crypto.createHash('sha256').digest('hex')
    }
    
    const leaves = timeline.map(item => {
      const data = JSON.stringify({
        event: item.event,
        by: item.by,
        time: item.time
      })
      return crypto.createHash('sha256').update(data).digest('hex')
    })
    
    let hashes = [...leaves]
    
    while (hashes.length > 1) {
      const nextLevel = []
      
      for (let i = 0; i < hashes.length; i += 2) {
        const left = hashes[i]
        const right = hashes[i + 1] || left
        
        const combined = left + right
        const hash = crypto.createHash('sha256').update(combined).digest('hex')
        
        nextLevel.push(hash)
      }
      
      hashes = nextLevel
    }
    
    return hashes[0]
  }
  
  _generateMockCID(roomId) {
    const hash = crypto.createHash('sha256').update(roomId + Date.now()).digest('hex')
    return `Qm${hash.slice(0, 44)}`
  }
  
  getArchivedRoom(roomId) {
    return this.archivedRooms.get(roomId) || null
  }
  
  getAllArchivedRooms() {
    return Array.from(this.archivedRooms.values())
  }
  
  searchArchivedRooms(query) {
    const allRooms = this.getAllArchivedRooms()
    
    if (!query) return allRooms
    
    const results = []
    const queryLower = query.toLowerCase()
    
    for (const room of allRooms) {
      const questionContent = room.question?.content || ''
      const finalAnswer = room.finalResult?.answer || ''
      
      if (questionContent.toLowerCase().includes(queryLower)) {
        results.push(room)
      } else if (finalAnswer && 
                 finalAnswer.toLowerCase().includes(queryLower)) {
        results.push(room)
      } else if (room.participants?.some(p => 
        p.publicKey?.toLowerCase().includes(queryLower))) {
        results.push(room)
      }
    }
    
    return results
  }
  
  getStats() {
    const allRooms = this.getAllArchivedRooms()
    
    const consensusRooms = allRooms.filter(r => r.finalResult.consensus).length
    const divergentRooms = allRooms.filter(r => 
      !r.finalResult.consensus && r.finalResult.method === 'DIVERGENT').length
    const timeoutRooms = allRooms.filter(r => 
      !r.finalResult.consensus && (!r.finalResult.method || r.finalResult.method === 'NONE')).length
    
    const totalRepGained = allRooms.reduce((sum, room) => {
      return sum + room.reputationChanges.filter(c => c.delta > 0)
        .reduce((s, c) => s + c.delta, 0)
    }, 0)
    
    const totalRepLost = allRooms.reduce((sum, room) => {
      return sum + Math.abs(room.reputationChanges.filter(c => c.delta < 0)
        .reduce((s, c) => s + c.delta, 0))
    }, 0)
    
    return {
      totalRooms: allRooms.length,
      consensusRooms,
      divergentRooms,
      timeoutRooms,
      totalRepGained,
      totalRepLost,
      avgRepChange: allRooms.length > 0 ? 
        (totalRepGained - totalRepLost) / allRooms.length : 0
    }
  }
}

module.exports = { ArchiveSystem }