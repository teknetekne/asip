const fs = require('fs')
const path = require('path')
const os = require('os')
const sodium = require('sodium-native')

class Identity {
  constructor(options = {}) {
    this.storagePath = options.storagePath || path.join(os.homedir(), '.asip')
    this.keyFile = path.join(this.storagePath, 'identity.json')
    this.publicKey = null
    this.secretKey = null
    this.moltbookToken = process.env.MOLTBOOK_TOKEN || null
  }

  init() {
    // Create storage dir if not exists
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true })
    }

    // Load or Generate Keys
    if (fs.existsSync(this.keyFile)) {
      this._loadKeys()
    } else {
      this._generateKeys()
    }

    return {
      nodeId: this.getNodeId(),
      publicKey: this.publicKey.toString('hex')
    }
  }

  getNodeId() {
    // NodeID is just the first 12 chars of hex public key for brevity
    return this.publicKey.toString('hex').slice(0, 12)
  }

  sign(message) {
    // Message can be string or buffer
    const buf = Buffer.isBuffer(message) ? message : Buffer.from(message)
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES)
    
    sodium.crypto_sign_detached(signature, buf, this.secretKey)
    return signature.toString('hex')
  }

  verify(message, signatureHex, publicKeyHex) {
    const signature = Buffer.from(signatureHex, 'hex')
    const publicKey = Buffer.from(publicKeyHex, 'hex')
    const messageBuf = Buffer.isBuffer(message) ? message : Buffer.from(message)

    return sodium.crypto_sign_verify_detached(signature, messageBuf, publicKey)
  }

  _generateKeys() {
    this.publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
    this.secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)

    sodium.crypto_sign_keypair(this.publicKey, this.secretKey)

    const data = {
      publicKey: this.publicKey.toString('hex'),
      secretKey: this.secretKey.toString('hex'),
      created: Date.now()
    }

    fs.writeFileSync(this.keyFile, JSON.stringify(data, null, 2))
    console.log(`[IDENTITY] Generated new identity: ${this.getNodeId()}`)
  }

  _loadKeys() {
    try {
      const data = JSON.parse(fs.readFileSync(this.keyFile))
      this.publicKey = Buffer.from(data.publicKey, 'hex')
      this.secretKey = Buffer.from(data.secretKey, 'hex')
      // console.log(`[IDENTITY] Loaded identity: ${this.getNodeId()}`)
    } catch (err) {
      console.error('[IDENTITY] Key file corrupt. Regenerating...')
      this._generateKeys()
    }
  }
}

module.exports = { Identity }
