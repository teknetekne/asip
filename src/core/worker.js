class Worker {
  constructor(config = {}) {
    this.ollamaUrl = config.ollamaUrl || 'http://localhost:11434/api/generate'
    this.modelName = config.modelName || 'deepseek-r1:8b'
  }

  async execute(prompt) {
    // 1. Check if Ollama is alive
    try {
      const health = await fetch(this.ollamaUrl.replace('/api/generate', ''))
      if (!health.ok) throw new Error('Ollama not reachable')
    } catch (err) {
      throw new Error(`Ollama connection failed: ${err.message}`)
    }

    // 2. Run Inference
    const response = await fetch(this.ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        prompt: prompt,
        stream: false
      })
    })

    if (!response.ok) {
      throw new Error(`Ollama Error: ${response.statusText}`)
    }

    const data = await response.json()
    return data.response
  }
}

module.exports = { Worker }
