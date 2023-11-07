
const http              = require('http')
const { pushToDb }      = require('../pushToSQL')
const Logger            = require('node-json-logger')
const logger            = new Logger({ loggerName: 'homey' })
const { Client }        = require('pg')

/*
 * Usage:
 * cd /root/homey && forever start -l /root/lade_logg.txt -a -c /root/.bun/bin/bun main.js
 */

const deviationTime = 10 * 60 * 1000 // 10 minutes
const logInterval = 10 * 60 * 1000 // 10 minutes

let counters = {}
let lastValue = {}
let lastUpdate = {}
let lastValue2 = {}
let lastUpdate2 = {}

/**
 * Push query for raw data
 * @param {string} query SQL query to execute
 * @param {function} _callback Result
 */
function writeToDb(query, _callback){
  try {
    const client = new Client({ connectionString: `postgres://${Bun.env.USERNAME}:${Bun.env.PASS}@${Bun.env.IP}:${Bun.env.PORT}/${Bun.env.DB}` })

    client.connect((err) => {
      if (err) {
        _callback('Database connection error')
        return
      }
    })
    client.query(query, (err, res) => {
      _callback(err ? err.stack : `SQL INSERT OK`)
      client.end()
    }) 
  } catch (error) {
    console.error("Meh", error)
  }
}

// Log the number of inserts for each tag every 10 minutes
setInterval(() => {
  let noOfTags = Object.keys(counters).length
  let totalCount = 0
  Object.entries(counters).forEach(([tag, count]) => {
    totalCount += count
  })
  logger.debug(`💾 ${noOfTags} tags inserted ${totalCount} times`)
  counters = {}
}, logInterval)

// Webserver
var server = http.createServer((req, res) => {
  /**
   * API is for motion and contact data
   */
  if (req.url == '/api' && req.method == 'POST'){
    console.log('api')
    let data = ''
    req.on('data', chunk => data += chunk)

    req.on('end', () => {
      try {
        const jsonData = JSON.parse(data)
        const now = Date.now()
        let sqlName = `Homey_${jsonData.device.replace(" ", "_")}_${jsonData.sensor}`

        // Convert boolean to number
        let value = jsonData.value
        if (typeof value === 'boolean') {
          value = Number(value)
        }

        // Ignore if device is none
        if (jsonData.device === 'none') {
          res.writeHead(200, { "Content-Type": "application/json" })
          res.write(JSON.stringify({ message: 'OK' }))
          res.end()
          return
        }
        
        if (lastValue[sqlName] === value && (lastUpdate[sqlName] && now - lastUpdate[sqlName] < deviationTime)) {
          //logger.debug(`Skipping push for ${sqlName}.  Equal values and too soon since last push`)
          return
        }

        lastValue[sqlName] = value
        lastUpdate[sqlName] = now

        // Push to database
        pushToDb([[ sqlName, value ]], () => {
          counters[sqlName] = (counters[sqlName] || 0) + 1
        })

        // Respond
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

  /**
   * API2 is for raw data
   */
  } else if (req.url == '/api2' && req.method == 'POST') {
    let data = ''
    req.on('data', chunk => data += chunk)
    req.on('end', () => {
      try {
        const now = Date.now()
        const jsonData = JSON.parse(data)

        let query = 'INSERT INTO raw ( tagname, value ) VALUES '
      
        for (let [key, value] of Object.entries(jsonData)) {
          const sqlName = `Homey_${key}`

          // Boolean to number
          if (typeof value === 'boolean') {
            value = Number(value)
          }
          
          // Deviation time/filter
          if (lastValue2[sqlName] === value && (lastUpdate2[sqlName] && now - lastUpdate2[sqlName] < deviationTime)) {
            //logger.debug(`Skipping push for ${sqlName}.  Equal values and too soon since last push`)
          } else {
            query += `( '${sqlName}', '${value}' ), `
            lastValue2[sqlName]  = value
            lastUpdate2[sqlName] = now
          }
  
        }

        writeToDb(query.substring(0, query.length - 2), (result) => { logger.debug(result) })

        // Respond
        res.writeHead(200, { "Content-Type": "application/json" })
        res.write(JSON.stringify({ message: 'OK' }))
        res.end()

      } catch (error) {
        logger.error('Error: ' + error)
        res.writeHead(400, { "Content-Type": "application/json" })
        res.write(JSON.stringify({ message: 'ERROR' }))
        res.end();
      }
    })
  } else {
    res.writeHead(401)
    res.end('No access')
  }
})

server.listen(5557)
logger.info("🚀 Homey Webserver started")
