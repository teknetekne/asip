const { Logger } = require('../utils/logger')

class ConsensusEngine {
  constructor() {
    this.logger = new Logger()
  }
  
  checkConsensus(room) {
    if (!room || room.status === 'CLOSED') {
      return { reached: false, reason: 'ROOM_CLOSED' }
    }
    
    const activeProposals = room.discussionLog.filter(m => 
      m.type === 'PROPOSAL' && 
      !m.resolved &&
      Date.now() - m.timestamp < 30000
    )
    
    for (const proposal of activeProposals) {
      const agreements = room.discussionLog.filter(m =>
        m.type === 'AGREEMENT' && 
        m.target === proposal.id
      )
      
      const participantCount = room.participants.filter(p => p.publicKey !== room.requester.publicKey).length
      const agreementRate = participantCount > 0 ? agreements.length / participantCount : 0
      
      if (agreementRate >= room.rules.consensusThreshold) {
        return {
          reached: true,
          winner: proposal,
          agreementRate,
          supporters: agreements.map(a => a.author)
        }
      }
    }
    
    if (Date.now() - room.createdAt > room.rules.maxDuration) {
      return this.handlePartialConsensus(room)
    }
    
    return { reached: false }
  }
  
  handlePartialConsensus(room) {
    const proposals = room.discussionLog.filter(m => m.type === 'PROPOSAL')
    
    const scored = proposals.map(p => ({
      proposal: p,
      score: room.discussionLog.filter(m => 
        m.type === 'AGREEMENT' && m.target === p.id
      ).length
    }))
    
    scored.sort((a, b) => b.score - a.score)
    const winner = scored[0]
    
    if (winner && winner.score >= 1) {
      return {
        reached: true,
        winner: winner.proposal,
        method: 'PLURALITY',
        support: winner.score
      }
    }
    
    if (room.responses.length > 0) {
      return {
        reached: false,
        method: 'DIVERGENT',
        allResponses: room.responses,
        message: 'Different but valid perspectives'
      }
    }
    
    return { reached: false, reason: 'TIMEOUT' }
  }
  
  async finalizeConsensus(room, consensus) {
    room.status = 'CLOSED'
    room.closedAt = Date.now()
    room.consensusData = consensus
    
    if (consensus.reached) {
      room.finalAnswer = consensus.winner.proposedContent || consensus.winner.content
    }
    
    try {
      room.broadcast({
        type: 'CONSENSUS_REACHED',
        answer: room.finalAnswer,
        supporters: consensus.supporters,
        method: consensus.method,
        discussionLog: room.discussionLog,
        timestamp: Date.now()
      })
    } catch (err) {
      this.logger.log(`[CONSENSUS] Failed to broadcast consensus: ${err.message}`)
    }
    
    await room.close('CONSENSUS_FINALIZED')
    
    this.logger.log(`[CONSENSUS] Room ${room.id.slice(0,8)} closed: ${consensus.method}`)
    
    return this.calculateReputationChanges(room, consensus)
  }
  
  calculateReputationChanges(room, consensus) {
    const changes = []
    
    if (consensus.reached) {
      for (const participant of room.participants) {
        if (participant.publicKey === room.requester.publicKey) {
          changes.push({
            publicKey: participant.publicKey,
            delta: +3,
            reason: 'QUESTION'
          })
          continue
        }
        
        const hasAgreement = consensus.supporters && consensus.supporters.includes(participant.publicKey)
        const hasProposal = room.discussionLog.some(m => 
          m.type === 'PROPOSAL' && m.author === participant.publicKey
        )
        const hasArgument = room.discussionLog.some(m => 
          m.type === 'ARGUMENT' && m.author === participant.publicKey
        )
        const hasResponse = room.responses.some(r => r.author === participant.publicKey)
        
        let delta = 0
        let reason = ''
        
        if (hasProposal && hasAgreement) {
          delta = +15
          reason = 'CONSENSUS + PROPOSAL'
        } else if (hasAgreement) {
          delta = +10
          reason = 'CONSENSUS'
        } else if (hasArgument) {
          delta = +5
          reason = 'INSIGHT'
        } else if (hasResponse) {
          delta = +2
          reason = 'CONTRIBUTION'
        }
        
        changes.push({
          publicKey: participant.publicKey,
          delta,
          reason
        })
      }
    } else {
      for (const participant of room.participants) {
        if (participant.publicKey === room.requester.publicKey) {
          changes.push({
            publicKey: participant.publicKey,
            delta: +2,
            reason: 'QUESTION'
          })
          continue
        }
        
        const hasResponse = room.responses.some(r => r.author === participant.publicKey)
        
        changes.push({
          publicKey: participant.publicKey,
          delta: hasResponse ? +5 : -2,
          reason: hasResponse ? 'DIVERGENT_CONTRIBUTION' : 'NO_SHOW'
        })
      }
    }
    
    room.reputationChanges = changes
    return changes
  }
}

module.exports = { ConsensusEngine }