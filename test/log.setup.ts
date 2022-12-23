import log from 'loglevel'

log.methodFactory = (methodName) => {
  return (message) => {
    console.log(`${new Date().toISOString()} [${methodName.toUpperCase()}] ${message}`)
  }
}
log.setDefaultLevel('TRACE')
