const { AsipNode } = require('./core/node')
const { Logger } = require('./utils/logger')

async function main() {
  const node = new AsipNode()
  const logger = new Logger()

  // Graceful Shutdown
  process.on('SIGINT', async () => {
    logger.log('\n[ASIP] Shutting down...')
    await node.stop()
    process.exit(0)
  })

  // Start Node
  await node.start()

  // Command Handling
  const args = process.argv.slice(2)
  const command = args[0]

  if (command === 'request') {
    const prompt = args[1]
    if (!prompt) {
      logger.error('Usage: asip request "your prompt here"')
      process.exit(1)
    }

    try {
      const response = await node.requestTask(prompt)
      logger.log('\n✅ Result Received:')
      console.log(response.result) // Plain output for piping
      
      // One-shot mode: exit after result
      await node.stop()
      process.exit(0)
    } catch (err) {
      logger.error('Request failed:', err.message)
      process.exit(1)
    }
  } else {
    // Daemon Mode (Worker + Listener)
    logger.log('🏹 ASIP v1.2 Node Running...')
    logger.log('   Waiting for tasks (or use "asip request" in another terminal)')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
