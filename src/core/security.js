/**
 * ASIP Security Layer
 * Rate limiting and task validation
 */

class SecurityLayer {
  constructor() {
    this.rateLimits = new Map() // peerId -> { count, resetAt }
    this.dangerousPatterns = [
      'rm -rf',
      'sudo',
      'exec(',
      'eval(',
      '__import__',
      'os.system',
      'process.exit',
      'child_process'
    ]
  }

  /**
   * Check if peer can send a task (rate limiting)
   */
  canAcceptTask(peerId, reputationScore = 0) {
    const now = Date.now()
    const limit = this.rateLimits.get(peerId) || { count: 0, resetAt: now + 60000 }
    
    // Reset if time window passed
    if (now > limit.resetAt) {
      limit.count = 0
      limit.resetAt = now + 60000
    }
    
    // Determine max tasks based on reputation
    const maxPerMinute = this._getMaxTasksPerMinute(reputationScore)
    
    if (limit.count >= maxPerMinute) {
      console.log(`🚫 Rate limit exceeded for ${peerId} (${limit.count}/${maxPerMinute})`)
      return false
    }
    
    limit.count++
    this.rateLimits.set(peerId, limit)
    return true
  }

  /**
   * Validate task prompt for safety
   */
  isTaskSafe(prompt) {
    const lowerPrompt = prompt.toLowerCase()
    
    for (const pattern of this.dangerousPatterns) {
      if (lowerPrompt.includes(pattern.toLowerCase())) {
        return false
      }
    }
    
    return true
  }

  /**
   * Validate task object structure
   */
  validateTaskRequest(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, reason: 'Invalid message format' }
    }
    
    if (message.type !== 'TASK_REQUEST') {
      return { valid: false, reason: 'Not a task request' }
    }
    
    if (!message.taskId || typeof message.taskId !== 'string') {
      return { valid: false, reason: 'Missing or invalid taskId' }
    }
    
    if (!message.prompt || typeof message.prompt !== 'string') {
      return { valid: false, reason: 'Missing or invalid prompt' }
    }
    
    if (message.prompt.length > 10000) {
      return { valid: false, reason: 'Prompt too long (max 10000 chars)' }
    }
    
    return { valid: true }
  }

  /**
   * Get max tasks per minute based on reputation
   */
  _getMaxTasksPerMinute(reputationScore) {
    if (reputationScore < 10) return 3    // Newcomer
    if (reputationScore < 100) return 10  // Trusted
    return 50                              // Comrade
  }

  /**
   * Reset rate limit for a peer (admin function)
   */
  resetRateLimit(peerId) {
    this.rateLimits.delete(peerId)
  }

  /**
   * Get rate limit status for a peer
   */
  getRateLimitStatus(peerId) {
    const limit = this.rateLimits.get(peerId)
    if (!limit) return { count: 0, remaining: 3 }
    
    const now = Date.now()
    if (now > limit.resetAt) {
      return { count: 0, remaining: 3 }
    }
    
    return {
      count: limit.count,
      resetAt: limit.resetAt,
      remaining: Math.max(0, 3 - limit.count)
    }
  }
}

module.exports = SecurityLayer
