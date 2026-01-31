class Logger {
  log(msg) {
    console.log(msg)
  }
  
  error(msg, ...args) {
    console.error(msg, ...args)
  }
}

module.exports = { Logger }
