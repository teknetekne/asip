/**
 * ASIP Moltbook Authentication
 * Handles Moltbook OAuth and identity verification
 */

const axios = require('axios')

class MoltbookAuth {
  constructor(config = {}) {
    this.apiBase = config.apiBase || 'https://www.moltbook.com/api/v1'
    this.token = config.token || null
    this.username = null
    this.authenticated = false
  }

  /**
   * Authenticate with Moltbook
   */
  async authenticate() {
    if (!this.token) {
      console.log('⚠️  No MOLTBOOK_TOKEN - running anonymous (limited trust)')
      return false
    }

    try {
      const response = await axios.get(`${this.apiBase}/agents/me`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        },
        timeout: 5000
      })

      if (response.data.agent && response.data.agent.name) {
        this.username = response.data.agent.name
      } else {
        this.username = response.data.username
      }

      this.authenticated = true
      console.log(`✅ Authenticated as @${this.username}`)
      return true

    } catch (err) {
      console.error(`❌ Moltbook auth failed: ${err.message}`)
      console.log('⚠️  Continuing as anonymous node')
      return false
    }
  }

  /**
   * Get authenticated username
   */
  getUsername() {
    return this.username
  }

  /**
   * Get node ID (either @username or generated)
   */
  getNodeId(fallbackId) {
    if (this.authenticated && this.username) {
      return `@${this.username}`
    }
    return fallbackId
  }

  /**
   * Check if authenticated
   */
  isAuthenticated() {
    return this.authenticated
  }

  /**
   * Verify token is still valid
   */
  async verifyToken() {
    if (!this.token) return false

    try {
      await axios.get(`${this.apiBase}/agents/me`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        },
        timeout: 3000
      })
      return true
    } catch {
      return false
    }
  }
}

module.exports = MoltbookAuth
