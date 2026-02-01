/**
 * ASIP Reputation System
 * Tracks peer reputation and manages trust levels
 */

class ReputationSystem {
  constructor() {
    this.scores = new Map()
    this.history = new Map()
    this.violationCounts = new Map()
    
    this.TRUST_THRESHOLDS = {
      NEWCOMER: 0,
      TRUSTED: 50,
      COMRADE: 100,
      COMMISSAR: 150,
      GOOD_PERSON: 250
    }
    
    this.LEVEL_NAMES = {
      'BANNED': '🔴 BANNED',
      'NEWCOMER': '🌱 NEWCOMER',
      'TRUSTED': '⭐ TRUSTED',
      'COMRADE': '🏅 COMRADE',
      'COMMISSAR': '👨‍✈️ COMMISSAR',
      'GOOD_PERSON': '👨‍💼 GOOD PERSON'
    }
  }

  getScore(peerId) {
    return this.scores.get(peerId) || 0
  }

  getTrustLevel(peerId) {
    const score = this.getScore(peerId)
    
    if (score < 0) return 'BANNED'
    if (score < this.TRUST_THRESHOLDS.TRUSTED) return 'NEWCOMER'
    if (score < this.TRUST_THRESHOLDS.COMRADE) return 'TRUSTED'
    if (score < this.TRUST_THRESHOLDS.COMMISSAR) return 'COMRADE'
    if (score < this.TRUST_THRESHOLDS.GOOD_PERSON) return 'COMMISSAR'
    return 'GOOD_PERSON'
  }

  getTrustEmoji(peerId) {
    const level = this.getTrustLevel(peerId)
    const emojiMap = {
      'BANNED': '🔴',
      'NEWCOMER': '🌱',
      'TRUSTED': '⭐',
      'COMRADE': '🏅',
      'COMMISSAR': '👨‍✈️',
      'GOOD_PERSON': '👨‍💼'
    }
    return emojiMap[level]
  }

  initPeer(peerId) {
    if (!this.scores.has(peerId)) {
      this.scores.set(peerId, 0)
      this.history.set(peerId, [])
      this.violationCounts.set(peerId, {})
      console.log(`🌱 New peer ${peerId}, starting reputation at 0`)
    }
  }

  recordSuccess(peerId) {
    const current = this.getScore(peerId)
    this.scores.set(peerId, current + 1)
    this._logEvent(peerId, 'task_success', +1)
  }

  recordSpam(peerId) {
    const current = this.getScore(peerId)
    this.scores.set(peerId, current - 5)
    this._logEvent(peerId, 'spam', -5)
  }

  recordMalicious(peerId) {
    const current = this.getScore(peerId)
    this.scores.set(peerId, current - 10)
    this._logEvent(peerId, 'malicious', -10)
    console.log(`🚨 Malicious behavior from ${peerId}, reputation decreased`)
  }
  
  updateScore(peerId, delta, reason = 'MANUAL') {
    const current = this.getScore(peerId)
    this.scores.set(peerId, current + delta)
    this._logEvent(peerId, reason, delta)
    
    const newLevel = this.getTrustLevel(peerId)
    console.log(`[REP] ${peerId.slice(0,6)}: ${delta > 0 ? '+' : ''}${delta} (${newLevel})`)
    
    return current + delta
  }

  isBanned(peerId) {
    return this.getScore(peerId) < 0
  }
  
  isEligibleModerator(peerId) {
    return this.getScore(peerId) >= this.TRUST_THRESHOLDS.COMMISSAR
  }

  getReport() {
    const report = {}
    for (const [peerId, score] of this.scores.entries()) {
      report[peerId] = {
        score,
        level: this.getTrustLevel(peerId),
        emoji: this.getTrustEmoji(peerId),
        fullName: this.LEVEL_NAMES[this.getTrustLevel(peerId)]
      }
    }
    return report
  }

  printReport() {
    if (this.scores.size === 0) return
    
    console.log('\n📊 Reputation Report:')
    for (const [peerId, score] of this.scores.entries()) {
      const level = this.getTrustLevel(peerId)
      console.log(`   ${this.LEVEL_NAMES[level]} ${peerId.slice(0,8)}: ${score}`)
    }
    console.log('')
  }
  
  getHistory(peerId) {
    return this.history.get(peerId) || []
  }
  
  getTopPeers(count = 10) {
    return Array.from(this.scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([peerId, score]) => ({
        peerId,
        score,
        level: this.getTrustLevel(peerId)
      }))
  }

  _logEvent(peerId, type, change) {
    const history = this.history.get(peerId) || []
    history.push({
      timestamp: Date.now(),
      type,
      change
    })
    this.history.set(peerId, history)
  }
}

module.exports = ReputationSystem
