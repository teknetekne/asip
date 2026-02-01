const { Logger } = require('../utils/logger')

class AppealSystem {
  constructor(banSystem) {
    this.banSystem = banSystem
    this.logger = new Logger()
  }
  
  submitAppeal(publicKey, banId, defense) {
    if (!this.banSystem.isBanned(publicKey)) {
      return { success: false, error: 'NOT_BANNED' }
    }
    
    const existingAppeals = this.banSystem.getAppealsByNode(publicKey)
    const pendingAppeal = existingAppeals.find(a => a.status === 'PENDING')
    
    if (pendingAppeal) {
      return { success: false, error: 'APPEAL_ALREADY_PENDING' }
    }
    
    const lastAppeal = existingAppeals.sort((a, b) => b.submittedAt - a.submittedAt)[0]
    
    if (lastAppeal && lastAppeal.nextAppealAllowed && Date.now() < lastAppeal.nextAppealAllowed) {
      const daysUntil = Math.ceil((lastAppeal.nextAppealAllowed - Date.now()) / (24 * 60 * 60 * 1000))
      return { 
        success: false, 
        error: 'APPEAL_COOLDOWN',
        daysUntil
      }
    }
    
    const result = this.banSystem.createAppeal(publicKey, banId, defense)
    
    if (result.success) {
      this.logger.log(`[APPEAL] Appeal submitted by ${publicKey.slice(0,8)} for ban ${banId.slice(0,8)}`)
    }
    
    return result
  }
  
  selectAppealModerators(appeal, eligibleNodes = [], count = 7) {
    const ban = this.banSystem.getBanRecord(appeal.appellant.banId)
    
    if (!ban) {
      return []
    }
    
    const appellantKey = appeal.appellant.publicKey
    const bannedByKey = ban.bannedBy
    
    const filtered = eligibleNodes.filter(node => 
      node.publicKey !== appellantKey &&
      node.publicKey !== bannedByKey
    )
    
    if (filtered.length === 0) {
      return []
    }
    
    const seed = appeal.id + appeal.submittedAt
    const shuffled = this._shuffleWithSeed(filtered, seed)
    
    return shuffled.slice(0, count)
  }
  
  _shuffleWithSeed(array, seed) {
    const result = [...array]
    let m = result.length
    
    while (m) {
      const i = Math.floor(this._pseudoRandom(seed + m) * m--)
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
  
  evaluateAppeal(appealId, moderatorVotes) {
    return this.banSystem.evaluateAppeal(appealId, moderatorVotes)
  }
  
  getAppeal(appealId) {
    return this.banSystem.getAppeal(appealId)
  }
  
  getAppealsByNode(publicKey) {
    return this.banSystem.getAppealsByNode(publicKey)
  }
  
  getAllAppeals(status = null) {
    const appeals = Array.from(this.banSystem.appeals.values())
    
    if (status) {
      return appeals.filter(a => a.status === status)
    }
    
    return appeals
  }
  
  validateDefense(defense) {
    const errors = []
    
    if (!defense.statement || typeof defense.statement !== 'string' || defense.statement.trim().length < 10) {
      errors.push('Statement must be at least 10 characters')
    }
    
    if (!defense.evidence || !Array.isArray(defense.evidence)) {
      errors.push('Evidence must be an array')
    }
    
    if (defense.evidence.length > 10) {
      errors.push('Maximum 10 evidence items allowed')
    }
    
    for (const evidence of defense.evidence) {
      if (!evidence.type) {
        errors.push('Evidence must have a type')
      }
      
      if (evidence.content && typeof evidence.content === 'string' && evidence.content.length > 5000) {
        errors.push('Evidence content too long (max 5000 chars)')
      }
    }
    
    if (defense.witnesses && defense.witnesses.length > 5) {
      errors.push('Maximum 5 witnesses allowed')
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }
}

module.exports = { AppealSystem }