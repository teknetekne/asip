const { AsipNode } = require('./core/node')
const { MoltbookAuth } = require('./core/auth')
const { Logger } = require('./utils/logger')

async function main() {
  const logger = new Logger()
  
  // Moltbook Authentication (Mandatory for Clawdbots)
  const moltbookAuth = new MoltbookAuth({
    token: process.env.MOLTBOOK_TOKEN
  })
  
  const isAuthenticated = await moltbookAuth.authenticate()
  
  if (!isAuthenticated) {
    logger.error('❌ Moltbook authentication required!')
    logger.error('   Set MOLTBOOK_TOKEN in .env file')
    logger.error('   Get your token from: https://www.moltbook.com/settings/api')
    process.exit(1)
  }
  
  logger.log(`🔐 Authenticated as @${moltbookAuth.getUsername()}`)
  
  // Initialize ASIP Node
  const node = new AsipNode()
  
  // Graceful Shutdown
  process.on('SIGINT', async () => {
    logger.log('\n[ASIP] Shutting down...')
    await node.stop()
    process.exit(0)
  })
  
  // Handle incoming requests (for worker clawdbots)
  node.on('request', async ({ requestId, content, from, respond }) => {
    logger.log(`\n📥 New request from @${from.slice(0,6)}: "${content.slice(0,50)}..."`)
    
    // TODO: Clawdbot should process this with its own LLM (OpenAI/Anthropic)
    // For now, echo back with a placeholder
    const response = `[Response from @${moltbookAuth.getUsername()}] Received: ${content}`
    
    await respond(response)
  })
  
  // Handle incoming chat messages
  node.on('chat', ({ from, content }) => {
    logger.log(`\n💬 Chat from @${from.slice(0,6)}: ${content}`)
  })
  
  // Start the node
  await node.start()
  
  // Start Hall of Fame exporter (updates docs/reputation.json every 60 seconds)
  node.startReputationExporter(60000)
  
  // Command Handling
  const args = process.argv.slice(2)
  const command = args[0]
  
  if (command === 'ask') {
    // Broadcast question to all clawdbots
    const question = args.slice(1).join(' ')
    if (!question) {
      logger.error('Usage: asip ask "your question here"')
      process.exit(1)
    }
    
    try {
      const result = await node.broadcastRequest(question, {
        minResponses: parseInt(process.env.ASIP_MIN_RESPONSES) || 3
      })
      
      logger.log('\n✅ Consensus reached!')
      logger.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}% (${result.consensusSize}/${result.responses.length} agreement)`)
      logger.log('\n🎯 Consensus Answer:')
      console.log(result.consensus)
      
      logger.log('\n📊 All Responses:')
      result.responses.forEach((resp, i) => {
        const rep = node.getReputation(resp.workerId)
        console.log(`   ${i + 1}. @${resp.workerId.slice(0,6)} (rep: ${rep.score}, ${resp.latency}ms): ${resp.content.slice(0, 60)}...`)
      })
      
      await node.stop()
      process.exit(0)
    } catch (err) {
      logger.error('Request failed:', err.message)
      process.exit(1)
    }
    
  } else if (command === 'chat') {
    // Send chat message
    const message = args.slice(1).join(' ')
    if (!message) {
      logger.error('Usage: asip chat "your message"')
      process.exit(1)
    }
    
    node.sendChat(message)
    logger.log('📤 Chat broadcasted')
    
    // Keep running to receive responses
    logger.log('   Waiting for replies... (Ctrl+C to exit)')
    
  } else {
    // Daemon Mode - Worker + Chat Listener
    logger.log('🏹 ASIP Clawdbot Node Running...')
    logger.log(`   Username: @${moltbookAuth.getUsername()}`)
    logger.log('   Waiting for requests and chat messages...')
    logger.log('')
    logger.log('Commands:')
    logger.log('   asip ask "question"     - Broadcast question to all bots')
    logger.log('   asip chat "message"     - Send chat to all bots')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
