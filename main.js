
const http              = require('http')
const { pushToDb }      = require('../pushToSQL')
const Logger = require('node-json-logger')
const logger = new Logger({ loggerName: 'homey' })

let counters = {}

// Log the number of inserts for each tag every 5 minutes
setInterval(() => {
  let noOfTags = Object.keys(counters).length
  let totalCount = 0
  Object.entries(counters).forEach(([tag, count]) => {
    totalCount += count
  })
  logger.debug(`💾 ${noOfTags} tags inserted ${totalCount} times`)
  counters = {}
}, 5 * 60 * 1000)

// Webserver
var server = http.createServer((req, res) => {
  if (req.url == '/api' && req.method == 'POST'){
    let data = ''
    req.on('data', chunk => data += chunk)

    req.on('end', () => {
      try {
        const jsonData = JSON.parse(data)

        let sqlName = `Homey_${jsonData.device.replace(" ", "_")}_${jsonData.sensor}`

        pushToDb([[ sqlName, jsonData.value ]], () => {
          counters[sqlName] = (counters[sqlName] || 0) + 1
        })

        res.writeHead(200, { "Content-Type": "application/json" })
        res.write(JSON.stringify({ message: 'OK' }))
        res.end()
      } catch (error) {
        logger.error('Error: ' + error)
        res.writeHead(400, { "Content-Type": "application/json" })
        res.write(JSON.stringify({ message: 'ERROR' }))
        res.end();
      }
    });

  } else {
    res.writeHead(401)
    res.end('No access')
  }
})

server.listen(5557)
logger.info("🚀 Homey Webserver started")
