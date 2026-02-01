class TrustEngine {
  constructor() {
    this.spamKeywords = ['buy now', 'click here', 'free money', 'subscribe', 'discount', 'offer', 'http://', 'https://']
    this.TRUST_THRESHOLDS = {
      HIGHLY_SUSPICIOUS: 0.3,
      SUSPICIOUS: 0.5,
      NEUTRAL: 0.7,
      TRUSTED: 0.8,
      HIGHLY_TRUSTED: 0.9
    }
  }
  
  calculateTrustScore(message, room) {
    let score = 0.5
    
    score += this.checkSpamScore(message.content) * -0.4
    score += this.checkRelevanceScore(message.content, room.question) * 0.3
    score += this.checkPatternScore(message) * 0.2
    
    return Math.max(0, Math.min(1, score))
  }
  
  checkSpamScore(content) {
    if (!content || typeof content !== 'string') {
      return 1
    }
    
    const lower = content.toLowerCase()
    let spamScore = 0
    
    for (const keyword of this.spamKeywords) {
      if (lower.includes(keyword)) {
        spamScore += 0.3
      }
    }
    
    const repeatScore = this.checkRepeatedPatterns(content)
    spamScore += repeatScore * 0.2
    
    return Math.min(1, spamScore)
  }
  
  checkRepeatedPatterns(content) {
    if (!content || typeof content !== 'string') {
      return 1
    }
    
    const words = content.toLowerCase().split(/\s+/)
    const wordCounts = new Map()
    
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1)
    }
    
    let maxRepeat = 0
    for (const count of wordCounts.values()) {
      if (count > maxRepeat) {
        maxRepeat = count
      }
    }
    
    const repeatRatio = content.length > 0 ? maxRepeat / words.length : 0
    return repeatRatio
  }
  
  checkRelevanceScore(content, question) {
    if (!content || typeof content !== 'string') return 0.5
    if (!question || !question.content) return 0.5
    
    const contentWords = new Set(content.toLowerCase().split(/\s+/))
    const questionWords = new Set(question.content.toLowerCase().split(/\s+/))
    
    let overlap = 0
    for (const word of contentWords) {
      if (questionWords.has(word)) {
        overlap++
      }
    }
    
    const relevanceRatio = questionWords.size > 0 ? overlap / questionWords.size : 0
    return Math.min(1, relevanceRatio * 2)
  }
  
  checkLengthScore(content) {
    return 1
  }
  
  checkPatternScore(message) {
    let score = 1
    
    const content = message.content || ''
    
    if (/^[A-Z\s]+$/.test(content) && content.length > 10) {
      score -= 0.3
    }
    
    if (/(.)\1{4,}/.test(content)) {
      score -= 0.4
    }
    
    if (/[!?.]{3,}/.test(content)) {
      score -= 0.2
    }
    
    return Math.max(0, score)
  }
  
  monitorDiscussion(room) {
    const flags = []
    const messageRates = new Map()
    
    for (const message of room.discussionLog) {
      if (!messageRates.has(message.author)) {
        messageRates.set(message.author, [])
      }
      messageRates.get(message.author).push(message.timestamp)
    }
    
    for (const [author, timestamps] of messageRates) {
      const messageCount = timestamps.length
      const duration = (Date.now() - room.createdAt) / 1000
      const rate = duration > 0 ? messageCount / duration : 0
      
      if (rate > 5) {
        flags.push({
          type: 'FLOOD',
          author,
          rate,
          severity: 'MEDIUM'
        })
      }
    }
    
    const spamMessages = room.discussionLog.filter(m => {
      const trustScore = this.calculateTrustScore(m, room)
      return trustScore < this.TRUST_THRESHOLDS.HIGHLY_SUSPICIOUS
    })
    
    if (spamMessages.length > 0) {
      const spamAuthors = new Set(spamMessages.map(m => m.author))
      for (const author of spamAuthors) {
        flags.push({
          type: 'SPAM',
          author,
          messages: spamMessages.filter(m => m.author === author),
          severity: 'HIGH'
        })
      }
    }
    
    const offTopicMessages = room.discussionLog.filter(m => {
      const relevanceScore = this.checkRelevanceScore(m.content, room.question)
      return relevanceScore < 0.3
    })
    
    if (offTopicMessages.length > 3) {
      const offTopicAuthors = new Set(offTopicMessages.map(m => m.author))
      for (const author of offTopicAuthors) {
        flags.push({
          type: 'OFF_TOPIC',
          author,
          messages: offTopicMessages.filter(m => m.author === author),
          severity: 'LOW'
        })
      }
    }
    
    const collusion = this.detectCollusion(room)
    if (collusion.suspicious) {
      flags.push({
        type: 'COLLUSION',
        pairs: collusion.pairs,
        severity: 'CRITICAL'
      })
    }
    
    return flags
  }
  
  detectCollusion(room) {
    const pairs = []
    const interactions = new Map()
    
    for (const p1 of room.participants) {
      for (const p2 of room.participants) {
        if (p1.publicKey === p2.publicKey) continue
        
        const pairKey = [p1.publicKey, p2.publicKey].sort().join('-')
        if (!interactions.has(pairKey)) {
          interactions.set(pairKey, { agreements: 0, total: 0 })
        }
        
        const data = interactions.get(pairKey)
        
        for (const message of room.discussionLog) {
          if (message.type === 'AGREEMENT' && message.author === p1.publicKey) {
            const proposal = room.discussionLog.find(m => m.id === message.target)
            if (proposal && proposal.author === p2.publicKey) {
              data.agreements++
            }
          }
          if ((message.author === p1.publicKey && room.discussionLog.some(m => m.referencesResponse && m.author === p2.publicKey)) ||
              (message.author === p2.publicKey && room.discussionLog.some(m => m.referencesResponse && m.author === p1.publicKey))) {
            data.total++
          }
        }
      }
    }
    
    for (const [pairKey, data] of interactions) {
      if (data.total > 5 && data.total > 0 && data.agreements / data.total > 0.9) {
        const [p1, p2] = pairKey.split('-')
        pairs.push({ p1, p2, agreementRate: data.agreements / data.total, interactions: data.total })
      }
    }
    
    return {
      suspicious: pairs.length > 0,
      pairs
    }
  }
  
  validateMessage(message, room) {
    if (!message.content || typeof message.content !== 'string') {
      return { valid: false, reason: 'INVALID_CONTENT' }
    }
    
    if (message.content.length > 1000) {
      return { valid: false, reason: 'CONTENT_TOO_LONG' }
    }
    
    const spamScore = this.checkSpamScore(message.content)
    if (spamScore > 0.8) {
      return { valid: false, reason: 'SPAM_DETECTED' }
    }
    
    const trustScore = this.calculateTrustScore(message, room)
    if (trustScore < this.TRUST_THRESHOLDS.HIGHLY_SUSPICIOUS) {
      return { valid: false, reason: 'LOW_TRUST_SCORE' }
    }
    
    return { valid: true, trustScore }
  }
}

module.exports = { TrustEngine }