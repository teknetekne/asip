const crypto = require('crypto')
const { Logger } = require('../utils/logger')

class BanSystem {
  constructor() {
    this.bannedNodes = new Map()
    this.appeals = new Map()
    this.logger = new Logger()
  }
  
  applyBan(publicKey, options = {}) {
    const {
      reason = 'MANUAL',
      duration = 'PERMANENT',
      by = 'SYSTEM'
    } = options
    
    const banId = crypto.createHash('sha256')
      .update(publicKey + Date.now())
      .digest('hex')
    
    const expiresAt = duration === 'PERMANENT' ? null : Date.now() + duration
    
    const banRecord = {
      id: banId,
      publicKey,
      reason,
      bannedAt: Date.now(),
      bannedBy: by,
      expiresAt,
      permanent: duration === 'PERMANENT',
      appealAllowed: true,
      appealDeadline: expiresAt ? expiresAt - (7 * 24 * 60 * 60 * 1000) : Date.now() + (7 * 24 * 60 * 60 * 1000)
    }
    
    this.bannedNodes.set(publicKey, banRecord)
    
    this.logger.log(`[BAN] Node ${publicKey.slice(0,8)} banned: ${reason}`)
    
    return banRecord
  }
  
  removeBan(publicKey) {
    const ban = this.bannedNodes.get(publicKey)
    
    if (!ban) {
      return { success: false, error: 'NOT_BANNED' }
    }
    
    this.bannedNodes.delete(publicKey)
    
    this.logger.log(`[BAN] Ban lifted for ${publicKey.slice(0,8)}`)
    
    return { success: true, ban }
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
  
  getBanInfo(publicKey) {
    return this.bannedNodes.get(publicKey) || null
  }
  
  getBanRecord(banId) {
    for (const ban of this.bannedNodes.values()) {
      if (ban.id === banId) return ban
    }
    return null
  }
  
  createAppeal(publicKey, banId, defense) {
    const ban = this.getBanRecord(banId)
    
    if (!ban) {
      return { success: false, error: 'BAN_NOT_FOUND' }
    }
    
    if (ban.publicKey !== publicKey) {
      return { success: false, error: 'NOT_YOUR_BAN' }
    }
    
    const appealId = crypto.createHash('sha256')
      .update(banId + Date.now())
      .digest('hex')
    
    const appeal = {
      type: 'APPEAL',
      version: '1.0',
      id: appealId,
      
      appellant: {
        publicKey,
        banId,
        banReason: ban.reason,
        banTimestamp: ban.bannedAt
      },
      
      defense: {
        statement: defense.statement || '',
        evidence: defense.evidence || [],
        witnesses: defense.witnesses || []
      },
      
      submittedAt: Date.now(),
      deadline: Date.now() + (7 * 24 * 60 * 60 * 1000),
      status: 'PENDING'
    }
    
    this.appeals.set(appealId, appeal)
    
    this.logger.log(`[APPEAL] Appeal ${appealId.slice(0,8)} created for ban ${banId.slice(0,8)}`)
    
    return { success: true, appeal }
  }
  
  getAppeal(appealId) {
    return this.appeals.get(appealId) || null
  }
  
  getAppealsByNode(publicKey) {
    const appeals = []
    for (const appeal of this.appeals.values()) {
      if (appeal.appellant.publicKey === publicKey) {
        appeals.push(appeal)
      }
    }
    return appeals
  }
  
  evaluateAppeal(appealId, votes) {
    const appeal = this.appeals.get(appealId)
    
    if (!appeal) {
      return { success: false, error: 'APPEAL_NOT_FOUND' }
    }
    
    const liftCount = votes.filter(v => v.decision === 'LIFT').length
    const reduceCount = votes.filter(v => v.decision === 'REDUCE').length
    const totalVotes = votes.length
    
    let verdict
    let action
    
    if (liftCount >= Math.ceil(totalVotes * 0.7)) {
      verdict = 'APPROVED'
      action = this.removeBan(appeal.appellant.publicKey)
      appeal.status = 'APPROVED'
    } else if (reduceCount >= Math.ceil(totalVotes * 0.5) && liftCount < Math.ceil(totalVotes * 0.7)) {
      verdict = 'PARTIAL'
      action = this._reduceBan(appeal.appellant.publicKey, appeal.appellant.banId, 0.5)
      appeal.status = 'PARTIALLY_APPROVED'
    } else {
      verdict = 'REJECTED'
      appeal.status = 'REJECTED'
    }
    
    appeal.evaluatedAt = Date.now()
    appeal.nextAppealAllowed = verdict === 'REJECTED' ? 
      Date.now() + (30 * 24 * 60 * 60 * 1000) : null
    
    const result = {
      verdict,
      action,
      voteDistribution: {
        lift: liftCount,
        reduce: reduceCount,
        reject: totalVotes - liftCount - reduceCount
      },
      votes,
      nextAppeal: appeal.nextAppealAllowed
    }
    
    appeal.result = result
    
    this.logger.log(`[APPEAL] Appeal ${appealId.slice(0,8)} ${verdict}`)
    
    return { success: true, result }
  }
  
  _reduceBan(publicKey, banId, reductionRatio) {
    const ban = this.getBanRecord(banId)
    
    if (!ban || ban.permanent) {
      return { success: false, error: 'CANNOT_REDUCE' }
    }
    
    const remainingTime = ban.expiresAt - Date.now()
    const newExpiresAt = Date.now() + (remainingTime * reductionRatio)
    
    ban.expiresAt = newExpiresAt
    ban.reduced = true
    
    return { success: true, newExpiresAt }
  }
  
  cleanupExpiredBans() {
    let cleaned = 0
    
    for (const [publicKey, ban] of this.bannedNodes.entries()) {
      if (ban.expiresAt && ban.expiresAt < Date.now()) {
        this.bannedNodes.delete(publicKey)
        cleaned++
      }
    }
    
    if (cleaned > 0) {
      this.logger.log(`[BAN] Cleaned up ${cleaned} expired bans`)
    }
    
    return cleaned
  }
  
  getStats() {
    const totalBans = this.bannedNodes.size
    const permanentBans = Array.from(this.bannedNodes.values())
      .filter(b => b.permanent).length
    const activeAppeals = this.appeals.size
    
    return {
      totalBans,
      permanentBans,
      temporaryBans: totalBans - permanentBans,
      activeAppeals,
      appealsPending: Array.from(this.appeals.values()).filter(a => a.status === 'PENDING').length
    }
  }
}

module.exports = { BanSystem }