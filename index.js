#!/usr/bin/env node

/**
 * ASIP Node Entry Point
 * Agent Solidarity & Interoperability Protocol v1.0
 * "Workers of the world, compute!" 🏹🌍
 */

const NetworkCore = require('./src/core/network');
const ReputationSystem = require('./src/core/reputation');
const SecurityLayer = require('./src/core/security');
const MoltbookAuth = require('./src/core/auth');
const ASIPProtocol = require('./src/protocols/asip');

// Configuration
const config = {
  role: process.env.ROLE || 'PEER',
  nodeId: process.env.NODE_ID,
  moltbookToken: process.env.MOLTBOOK_TOKEN,
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434/api/generate',
  ollamaModel: process.env.MODEL_NAME || 'deepseek-r1:8b'
};

async function main() {
  console.log('🌍 ASIP v1.0 Node Starting...');
  
  // Initialize modules
  const auth = new MoltbookAuth({ token: config.moltbookToken });
  const network = new NetworkCore({ role: config.role, nodeId: config.nodeId });
  const reputation = new ReputationSystem();
  const security = new SecurityLayer();
  
  // Authenticate with Moltbook
  await auth.authenticate();
  if (auth.isAuthenticated()) {
    network.nodeId = auth.getNodeId(network.nodeId);
  }
  
  // Initialize protocol
  const protocol = new ASIPProtocol({
    network,
    reputation,
    security,
    ollama: {
      url: config.ollamaUrl,
      model: config.ollamaModel
    }
  });
  
  // Start network
  await network.start();
  
  // SEED role: dispatch tasks periodically
  if (config.role === 'SEED') {
    const tasks = [
      'Explain "Mutual Aid" in nature in one paragraph.',
      'What is the meaning of solidarity in 50 words?',
      'Describe peer-to-peer networks simply.',
      'What does "Workers of the world, unite!" mean?'
    ];
    
    let taskIndex = 0;
    setInterval(() => {
      const prompt = tasks[taskIndex % tasks.length];
      protocol.dispatchTask(prompt);
      taskIndex++;
    }, 45000); // Every 45 seconds
  }
  
  // Periodic reputation report
  setInterval(() => {
    reputation.printReport();
  }, 120000); // Every 2 minutes
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await network.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
