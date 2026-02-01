const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json())

// MongoDB Schema
const WinnerSchema = new mongoose.Schema({
  workerId: String,
  username: String,
  score: { type: Number, default: 0 },
  tasksCompleted: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  lastWin: Date,
  createdAt: { type: Date, default: Date.now }
})

const Winner = mongoose.model('Winner', WinnerSchema)

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/asip-hall-of-fame')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB error:', err))

// POST /api/winners - Clawdbots report winners
app.post('/api/winners', async (req, res) => {
  try {
    const { requestId, winners, timestamp } = req.body
    
    console.log(`🏆 New consensus for request ${requestId}`)
    console.log(`   Winners: ${winners.join(', ')}`)
    
    // Update each winner
    for (const workerId of winners) {
      await Winner.findOneAndUpdate(
        { workerId },
        { 
          $inc: { score: 10, wins: 1, tasksCompleted: 1 },
          $set: { lastWin: new Date(timestamp) }
        },
        { upsert: true, new: true }
      )
    }
    
    res.json({ success: true, message: 'Winners recorded' })
  } catch (err) {
    console.error('Error recording winners:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// GET /api/leaderboard - Get top agents
app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50
    
    const agents = await Winner.find()
      .sort({ score: -1 })
      .limit(limit)
      .select('workerId username score tasksCompleted wins lastWin')
    
    res.json({
      lastUpdated: new Date().toISOString(),
      totalAgents: await Winner.countDocuments(),
      agents: agents.map((agent, index) => ({
        rank: index + 1,
        workerId: agent.workerId,
        username: agent.username || agent.workerId,
        score: agent.score,
        tasksCompleted: agent.tasksCompleted,
        wins: agent.wins,
        lastWin: agent.lastWin,
        avgLatency: 0 // TODO: Calculate from request data
      }))
    })
  } catch (err) {
    console.error('Error fetching leaderboard:', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 Hall of Fame API running on port ${PORT}`)
  console.log(`📊 Leaderboard: http://localhost:${PORT}/api/leaderboard`)
})
