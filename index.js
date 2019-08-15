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
  .usage('-s <secret> -p <port> [options]')
  .option('-s, --secret', 'the secret key stored in the ~/.cncrc file')
  .option('-p, --port <port>', 'path or name of serial port', '')
  .option('-b, --baudrate <baudrate>', 'baud rate (default: 115200)', 0)
  .option('-c, --config <filename>', 'set the config file (deafult: ~/.cncrc)', '')
  .option('--socket-address <address>', 'socket address or hostname (default: localhost)', '')
  .option('--socket-port <port>', 'socket port (default: 8000)', '')
  .option('--controller-type <type>', 'controller type: Grbl|Smoothie|TinyG (default: Grbl)', '')
  .option('--access-token-lifetime <lifetime>', 'access token lifetime in seconds or a time span string (default: 30d)', '')

program.parse(process.argv)

var options = {
  secret: program.secret,
  port: program.port,
  baudrate: program.baudrate,
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

const generateAccessToken = function (payload, secret, expiration) {
  const token = jwt.sign(payload, secret, {
    expiresIn: expiration
  })

  return token
}

// Get secret key from the config file and generate an access token
const getUserHome = function () {
  return process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME']
}

const cncrc = (program.config)? program.config: path.resolve(getUserHome(), '.cncrc')
var config

Object.keys(options).forEach((key) => {
    if(!options[key]) {
        options[key] = defaults[key]
    }
})

if(program.config) {
    config = JSON.parse(fs.readFileSync(cncrc, 'utf8'))
    
    if(!program.port) {
        if(config.hasOwnProperty('ports') && config.ports[0] && config.ports[0].comName) {
            options.port = config.ports[0].comName
        }
    }

    if(!program.baudrate) {
        if(config.hasOwnProperty('baudrates') && config.baudrates[0]) {
            options.baudrate = config.baudrates[0]
        }
    }

    if(!program.controllerType) {
        if(config.hasOwnProperty('controller')) {
            options.controllerType = config.controller
        }
    }
}

if (!options.secret) {
  try {
    if(!config) {
        config = JSON.parse(fs.readFileSync(cncrc, 'utf8'))
    }
    options.secret = config.secret
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

const token = generateAccessToken({ id: '', name: 'cncjs-autolevel' }, options.secret, options.accessTokenLifetime)
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
  let autolevel = new Autolevel(socket, options)
  socket.on('serialport:write', function (data, context) {
    if (data.indexOf('#autolevel') >= 0 && context && context.source === 'feeder') {
      autolevel.start(data, context)
    }
  })
}
