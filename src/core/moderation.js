const crypto = require('crypto')
const { TrustEngine } = require('./trust')
const { Logger } = require('../utils/logger')

class ModerationSystem {
  constructor(reputationSystem, trustEngine = null) {
    this.reputationSystem = reputationSystem
    if (!this.reputationSystem || !(this.reputationSystem.scores instanceof Map)) {
      this.reputationSystem = { scores: new Map() }
      this.logger = new Logger()
      this.logger.log('[MODERATION] Warning: Invalid reputationSystem, using fallback')
    }
    this.trustEngine = trustEngine || new TrustEngine()
    this.logger = new Logger()
    
    this.pendingReports = new Map()
    this.bannedNodes = new Map()
    
    this.MODERATION_THRESHOLDS = {
      SPAM: { ban: 4, warn: 2, timeout: 86400000 },
      OFFENSIVE: { ban: 3, warn: 1, timeout: 'PERMANENT' },
      COLLUSION: { ban: 5, warn: 0, timeout: 'PERMANENT' },
      OFF_TOPIC: { ban: 5, warn: 3, timeout: 3600000 }
    }
    
    this.penaltyMatrix = {
      SPAM: { first: { action: 'REMOVE', penalty: -20 }, second: { action: 'BAN', timeout: 86400000 }, third: { action: 'PERMANENT_BAN' } },
      FLOOD: { first: { action: 'WARN', penalty: -10 }, second: { action: 'BAN', timeout: 3600000 }, third: { action: 'BAN', timeout: 86400000 } },
      OFF_TOPIC: { first: { action: 'WARN' }, second: { action: 'PENALTY', penalty: -5 }, third: { action: 'PENALTY', penalty: -15 } },
      COLLUSION: { first: { action: 'PERMANENT_BAN' } },
      NO_SHOW: { first: { action: 'PENALTY', penalty: -2 }, second: { action: 'PENALTY', penalty: -5 }, third: { action: 'PENALTY', penalty: -10 } },
      TIMEOUT: { first: { action: 'NONE' }, second: { action: 'PENALTY', penalty: -1 }, third: { action: 'PENALTY', penalty: -2 } }
    }
    
    this.violationHistory = new Map()
  }
  
  createReport(reporter, target, reason, severity, evidence) {
    const reportId = crypto.createHash('sha256').update(target.roomId + Date.now()).digest('hex')
    
    const report = {
      type: 'REPORT',
      version: '1.0',
      id: reportId,
      
      reporter: {
        publicKey: reporter.publicKey,
        reputation: reporter.reputation || 0,
        timestamp: Date.now()
      },
      
      target: {
        roomId: target.roomId,
        messageId: target.messageId,
        author: target.author,
        content: target.content,
        contentHash: crypto.createHash('sha256').update(target.content || '').digest('hex'),
        timestamp: target.timestamp
      },
      
      reason,
      severity,
      
      evidence: {
        description: evidence.description,
        roomLog: evidence.roomLog || [],
        context: evidence.context || {},
        automatedFlags: evidence.automatedFlags || []
      },
      
      submittedAt: Date.now(),
      status: 'PENDING'
    }
    
    this.pendingReports.set(reportId, report)
    this.logger.log(`[MODERATION] Report ${reportId.slice(0,8)} created: ${reason}`)
    
    return report
  }
  
  selectModerators(report, count = 5) {
    const eligibleNodes = this.reputationSystem.scores ?
      Array.from(this.reputationSystem.scores.entries())
        .filter(([_nodeId, score]) => score >= 150)
        .map(([nodeId]) => ({ publicKey: nodeId })) : []
    
    const filtered = eligibleNodes.filter(n => 
      n.publicKey !== report.target.author &&
      !this.isBanned(n.publicKey)
    )
    
    const seed = crypto.createHash('sha256')
      .update(report.target.roomId + report.submittedAt)
      .digest('hex')
    
    const seeded = this._shuffleWithSeed(filtered, seed)
    const selected = seeded.slice(0, count)
    
    this.logger.log(`[MODERATION] Selected ${selected.length} moderators for report ${report.id.slice(0,8)}`)
    
    return selected
  }
  
  evaluateReport(report, moderatorVotes) {
    if (!this.MODERATION_THRESHOLDS[report.reason]) {
      return { verdict: 'INVALID_REASON', error: 'Unknown violation type' }
    }
    
    const threshold = this.MODERATION_THRESHOLDS[report.reason]
    const banCount = moderatorVotes.filter(v => v.decision === 'BAN').length
    const warnCount = moderatorVotes.filter(v => v.decision === 'WARN').length
    
    let verdict
    let action
    
    if (banCount >= threshold.ban) {
      verdict = 'BAN'
      action = this.applyBan(report.target.author, threshold.timeout)
    } else if (warnCount >= threshold.warn) {
      verdict = 'WARN'
      action = this.applyWarning(report.target.author, threshold.timeout)
    } else {
      verdict = 'INNOCENT'
      action = this.clearReport(report.id)
    }
    
    const result = {
      verdict,
      action,
      voteDistribution: {
        ban: banCount,
        warn: warnCount,
        innocent: moderatorVotes.length - banCount - warnCount
      },
      votes: moderatorVotes,
      timestamp: Date.now()
    }
    
    report.status = 'RESOLVED'
    report.result = result
    
    this.logger.log(`[MODERATION] Report ${report.id.slice(0,8)} resolved: ${verdict}`)
    
    return result
  }
  
  applyBan(publicKey, timeout) {
    const banRecord = {
      publicKey,
      bannedAt: Date.now(),
      expiresAt: timeout === 'PERMANENT' ? null : Date.now() + timeout,
      reason: 'MODERATION',
      permanent: timeout === 'PERMANENT'
    }
    
    this.bannedNodes.set(publicKey, banRecord)
    
    if (this.reputationSystem) {
      const currentScore = this.reputationSystem.getScore(publicKey)
      this.reputationSystem.scores.set(publicKey, currentScore - 100)
    }
    
    return { banned: true, banRecord }
  }
  
  applyWarning(publicKey, timeout) {
    if (timeout && timeout !== 'PERMANENT') {
      const banRecord = {
        publicKey,
        bannedAt: Date.now(),
        expiresAt: Date.now() + timeout,
        reason: 'WARNING',
        permanent: false
      }
      
      this.bannedNodes.set(publicKey, banRecord)
    }
    
    if (this.reputationSystem) {
      const currentScore = this.reputationSystem.getScore(publicKey)
      this.reputationSystem.scores.set(publicKey, currentScore - 20)
    }
    
    return { warned: true }
  }
  
  clearReport(reportId) {
    this.pendingReports.delete(reportId)
    return { cleared: true }
  }
  
  isBanned(publicKey) {
    const ban = this.bannedNodes.get(publicKey)
    if (!ban) return false
    
    if (ban.expiresAt && ban.expiresAt < Date.now()) {
      this.bannedNodes.delete(publicKey)
      return false
    }
    
    return true
  }
  
  handleFlag(room, flag) {
    const author = flag.author || (flag.messages && flag.messages[0]?.author)
    
    if (!author) return { error: 'NO_AUTHOR' }
    
    const violations = this.violationHistory.get(author) || []
    const violationCount = violations.filter(v => v.type === flag.type).length + 1
    
    if (!this.penaltyMatrix[flag.type]) {
      return { error: 'UNKNOWN_FLAG_TYPE' }
    }
    
    const penalty = violationCount <= 3 ? 
      this.penaltyMatrix[flag.type].first :
      violationCount <= 6 ?
        this.penaltyMatrix[flag.type].second :
        this.penaltyMatrix[flag.type].third
    
    let result = {}
    
    switch (penalty.action) {
    case 'REMOVE':
      this._removeParticipant(room, author)
      this.createReport(
        { publicKey: 'SYSTEM', reputation: 1000 },
        { roomId: room.id, author, content: flag.messages?.[0]?.content },
        flag.type,
        'HIGH',
        { description: 'Automated flag detected', automatedFlags: [flag.type] }
      )
      result = { action: 'REMOVED', reason: flag.type, penalty: penalty.penalty }
      break
        
    case 'BAN':
      this.applyBan(author, penalty.timeout)
      result = { action: 'BANNED', timeout: penalty.timeout }
      break
        
    case 'WARN':
      result = { action: 'WARNED', reason: flag.type, penalty: penalty.penalty }
      break
        
    case 'PENALTY':
      if (penalty.penalty && this.reputationSystem) {
        const current = this.reputationSystem.getScore(author)
        this.reputationSystem.scores.set(author, current + penalty.penalty)
      }
      result = { action: 'PENALTY', penalty: penalty.penalty }
      break
        
    case 'PERMANENT_BAN':
      this.applyBan(author, 'PERMANENT')
      result = { action: 'PERMANENT_BANNED' }
      break
        
    case 'NONE':
      result = { action: 'NONE' }
      break
    }
    
    this.violationHistory.set(author, [
      ...violations,
      { type: flag.type, timestamp: Date.now() }
    ])
    
    return result
  }
  
  _removeParticipant(room, publicKey) {
    room.participants = room.participants.filter(p => p.publicKey !== publicKey)
    try {
      room.broadcast({
        type: 'PARTICIPANT_REMOVED',
        participant: publicKey,
        reason: 'AUTOMATED_FLAG',
        timestamp: Date.now()
      })
    } catch (err) {
      this.logger.log(`[MODERATION] Failed to broadcast participant removal: ${err.message}`)
    }
  }
  
  _shuffleWithSeed(array, seed) {
    let m = array.length
    const result = [...array]
    
    while (m) {
      const i = Math.floor(this._pseudoRandom(seed) * m--)
      ;[result[m], result[i]] = [result[i], result[m]]
    }
    
    return result
  }
  
  _pseudoRandom(seed) {
    let x = 0
    for (let i = 0; i < seed.length; i++) {
      x = (x * 31 + seed.charCodeAt(i)) % 2147483647
    }
    return x / 2147483647
  }
  
  getBanStatus(publicKey) {
    return this.bannedNodes.get(publicKey) || null
  }
  
  getViolationHistory(publicKey) {
    return this.violationHistory.get(publicKey) || []
  }
}

module.exports = { ModerationSystem }