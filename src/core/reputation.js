/**
 * ASIP Reputation System
 * Tracks peer reputation and manages trust levels
 */

class ReputationSystem {
  constructor() {
    this.scores = new Map() // peerId -> score
    this.history = new Map() // peerId -> [events]
  }

  /**
   * Get reputation score for a peer
   */
  getScore(peerId) {
    return this.scores.get(peerId) || 0
  }

  /**
   * Get trust level based on score
   */
  getTrustLevel(peerId) {
    const score = this.getScore(peerId)
    
    if (score < 0) return 'BANNED'
    if (score < 10) return 'NEWCOMER'
    if (score < 100) return 'TRUSTED'
    return 'COMRADE'
  }

  /**
   * Get emoji indicator for trust level
   */
  getTrustEmoji(peerId) {
    const level = this.getTrustLevel(peerId)
    const emojiMap = {
      'BANNED': '🔴',
      'NEWCOMER': '🌱',
      'TRUSTED': '🌿',
      'COMRADE': '🌳'
    }
    return emojiMap[level]
  }

  /**
   * Initialize a new peer
   */
  initPeer(peerId) {
    if (!this.scores.has(peerId)) {
      this.scores.set(peerId, 0)
      this.history.set(peerId, [])
      console.log(`🌱 New peer ${peerId}, starting reputation at 0`)
    }
  }

  /**
   * Record a successful task completion
   */
  recordSuccess(peerId) {
    const current = this.getScore(peerId)
    this.scores.set(peerId, current + 1)
    this._logEvent(peerId, 'task_success', +1)
  }

  /**
   * Record spam behavior
   */
  recordSpam(peerId) {
    const current = this.getScore(peerId)
    this.scores.set(peerId, current - 5)
    this._logEvent(peerId, 'spam', -5)
  }

  /**
   * Record malicious behavior
   */
  recordMalicious(peerId) {
    const current = this.getScore(peerId)
    this.scores.set(peerId, current - 10)
    this._logEvent(peerId, 'malicious', -10)
    console.log(`🚨 Malicious behavior from ${peerId}, reputation decreased`)
  }

  /**
   * Check if peer is banned
   */
  isBanned(peerId) {
    return this.getScore(peerId) < 0
  }

  /**
   * Get reputation report
   */
  getReport() {
    const report = {}
    for (const [peerId, score] of this.scores.entries()) {
      report[peerId] = {
        score,
        level: this.getTrustLevel(peerId),
        emoji: this.getTrustEmoji(peerId)
      }
    }
    return report
  }

  /**
   * Print reputation report to console
   */
  printReport() {
    if (this.scores.size === 0) return
    
    console.log('\n📊 Reputation Report:')
    for (const [peerId, score] of this.scores.entries()) {
      const emoji = this.getTrustEmoji(peerId)
      console.log(`   ${emoji} ${peerId}: ${score}`)
    }
    console.log('')
  }

  /**
   * Log an event to peer history
   */
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
