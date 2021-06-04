#!/usr/bin/env node

const program = require('commander')
const pkg = require('./package.json')
const fs = require('fs')
const path = require('path')
const io = require('socket.io-client')
const jwt = require('jsonwebtoken')
const Autolevel = require('./autolevel.js')
program
  .version(pkg.version)
  .usage('-s <secret> -p <port> -id <id> -name <username> [options]')
  .option('-i, --id <id>', 'the id stored in the ~/.cncrc file')
  .option('-n, --name <name>', 'the user name stored in the ~/.cncrc file')
  .option('-s, --secret <secret>', 'the secret key stored in the ~/.cncrc file')
  .option('-p, --port <port>', 'path or name of serial port', '/dev/ttyACM0')
  .option('-b, --baudrate <baudrate>', 'baud rate', '115200')
  .option('-c, --config <filepath>', 'set the config file', '')
  .option('--socket-address <address>', 'socket address or hostname', 'localhost')
  .option('--socket-port <port>', 'socket port', '8000')
  .option('--controller-type <type>', 'controller type: Grbl|Smoothie|TinyG', 'Grbl')
  .option('--access-token-lifetime <lifetime>', 'access token lifetime in seconds or a time span string', '30d')

program.parse(process.argv)

var options = {
  id: program.id,
  name: program.name,
  secret: program.secret,
  port: program.port,
  baudrate: program.baudrate,
  config: program.config,
  socketAddress: program.socketAddress,
  socketPort: program.socketPort,
  controllerType: program.controllerType,
  accessTokenLifetime: program.accessTokenLifetime
}

var defaults = {
  secret: process.env['CNCJS_SECRET'],
  port: '/dev/ttyACM0',
  baudrate: 115200,
  socketAddress: 'localhost',
  socketPort: 8000,
  controllerType: 'Grbl',
  accessTokenLifetime: '30d'
}

// Get secret key from the config file and generate an access token
const getUserHome = function () {
  return process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME']
}

const cncrc = (program.config) ? program.config : path.resolve(getUserHome(), '.cncrc')
var config

const generateAccessToken = function (payload, secret, expiration) {
  const token = jwt.sign(payload, secret, {
    expiresIn: expiration
  })

  return token
}

Object.keys(options).forEach((key) => {
  if (!options[key]) {
    options[key] = defaults[key]
  }
})

if (program.config) {
  config = JSON.parse(fs.readFileSync(cncrc, 'utf8'))
  if (!program.port) {
    if (config.hasOwnProperty('ports') && config.ports[0] && config.ports[0].comName) {
      options.port = config.ports[0].comName
    }
  }

  if (!program.baudrate) {
    if (config.hasOwnProperty('baudrates') && config.baudrates[0]) {
      options.baudrate = config.baudrates[0]
    }
  }

  if (!program.controllerType) {
    if (config.hasOwnProperty('controller')) {
      options.controllerType = config.controller
    }
  }
}

if (!options.secret) {
  try {
    if (!config) {
      config = JSON.parse(fs.readFileSync(cncrc, 'utf8'))
    }
    options.secret = config.secret
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

if(!options.id && !options.name) {
  try {
    if (!config) {
      config = JSON.parse(fs.readFileSync(cncrc, 'utf8'))
    }
    options.id = config.users[0].id
    options.name = config.users[0].name
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

const token = generateAccessToken({ id: options.id, name: options.name }, options.secret, options.accessTokenLifetime)
const url = 'ws://' + options.socketAddress + ':' + options.socketPort + '?token=' + token

let socket = io.connect('ws://' + options.socketAddress + ':' + options.socketPort, {
  'query': 'token=' + token
})

socket.on('connect', () => {
  console.log('Connected to ' + url)
  // Open port
  socket.emit('open', options.port, {
    baudrate: Number(options.baudrate),
    controllerType: options.controllerType
  })
})

socket.on('error', (err) => {
  console.error('Connection error.', err)
  if (socket) {
    socket.destroy()
    socket = null
  }
})

socket.on('close', () => {
  console.log('Connection closed.')
})

socket.on('serialport:open', function (options) {
  options = options || {}

  console.log('Connected to port "' + options.port + '" (Baud rate: ' + options.baudrate + ')')

  callback(null, socket)
})

socket.on('serialport:error', function (options) {
  callback(new Error('Error opening serial port "' + options.port + '"'))
})

// eslint-disable-next-line handle-callback-err
function callback (err, socket) {

  if (err) {
    // SOME kind of error handling if an error occurs
    throw err;
  }  

  let autolevel = new Autolevel(socket, options)
  socket.on('serialport:write', function (data, context) {
    if (data.indexOf('#autolevel_reapply') >= 0 && context && context.source === 'feeder') {
      autolevel.reapply(data, context)
    } else if (data.indexOf('#autolevel') >= 0 && context && context.source === 'feeder') {
      autolevel.start(data, context)
    } else if (data.indexOf('PROBEOPEN') > 0) {
      console.log(`Probe file open command: ${data}`);
      let startNdx = data.indexOf('PROBEOPEN') + 9;
      let endParen = data.indexOf(')');
      if (endParen > 0) {
         let fileName = data.substring(startNdx, endParen).trim();
         autolevel.fileOpen(fileName);
      }
    } else if (data.indexOf('PROBECLOSE') > 0) {
         console.log('Probe file close command');
         autolevel.fileClose();
    }
    else {
      autolevel.updateContext(context)
    }
  })
}
