#!/usr/bin/env node
const program = require('commander');
const pkg = require('./package.json');
const fs = require('fs');
const path = require('path');
const io = require('socket.io-client');
const jwt = require('jsonwebtoken');
const get = require('lodash.get');
const Autolevel = require('./autolevel.js');



program
	.version(pkg.version)
	.usage('-s <secret> -p <port> [options]')
	.option('-l, --list', 'list available ports then exit')
    .option('-s, --secret', 'the secret key stored in the ~/.cncrc file')
	.option('-p, --port <port>', 'path or name of serial port')
	.option('-b, --baudrate <baudrate>', 'baud rate (default: 115200)', 115200)
	.option('--socket-address <address>', 'socket address or hostname (default: localhost)', 'localhost')
	.option('--socket-port <port>', 'socket port (default: 8000)', 8000)
	.option('--controller-type <type>', 'controller type: Grbl|Smoothie|TinyG (default: Grbl)', 'Grbl')
    .option('--access-token-lifetime <lifetime>', 'access token lifetime in seconds or a time span string (default: 30d)', '30d')

program.parse(process.argv);

var options = {
    secret: program.secret || process.env['CNCJS_SECRET'],
    port: program.port || "/dev/ttyACM0",
    baudrate: program.baudrate || 115200,
    socketAddress: program.socketAddress || 'localhost',
    socketPort: program.socketPort || 8000,
    controllerType: program.controllerType ||  'Grbl',
    accessTokenLifetime: program.accessTokenLifetime || '30d'
};

if (options.list) {
	serialport.list(function(err, ports) {
		if (err) {
			console.error(err);
			process.exit(1);
		}
		ports.forEach(function(port) {
			console.log(port.comName);
		});
	});
	return;
}


const generateAccessToken = function(payload, secret, expiration) {
    const token = jwt.sign(payload, secret, {
        expiresIn: expiration
    });

    return token;
};

// Get secret key from the config file and generate an access token
const getUserHome = function() {
    return process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
};


if (!options.secret) {
    const cncrc = path.resolve(getUserHome(), '.cncrc');
    try {
        const config = JSON.parse(fs.readFileSync(cncrc, 'utf8'));
        options.secret = config.secret;
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

const token = generateAccessToken({ id: '', name: 'cncjs-autolevel' }, options.secret, options.accessTokenLifetime);
const url = 'ws://' + options.socketAddress + ':' + options.socketPort + '?token=' + token;


socket = io.connect('ws://' + options.socketAddress + ':' + options.socketPort, {
    'query': 'token=' + token
});

socket.on('connect', () => {
    console.log('Connected to ' + url);
    // Open port
    socket.emit('open', options.port, {
        baudrate: Number(options.baudrate),
        controllerType: options.controllerType
    });
});

socket.on('error', (err) => {
    console.error('Connection error.');
    if (socket) {
        socket.destroy();
        socket = null;
    }
});

socket.on('close', () => {
    console.log('Connection closed.');
});

socket.on('serialport:open', function(options) {
    options = options || {};

    console.log('Connected to port "' + options.port + '" (Baud rate: ' + options.baudrate + ')');

    callback(null, socket);
});

socket.on('serialport:error', function(options) {
    callback(new Error('Error opening serial port "' + options.port + '"'));
});


function callback(err, socket) {
    let autolevel = new Autolevel(socket, options);
    socket.on('serialport:write', function(data, context) {
        if(data.indexOf("#autolevel")>=0) {
            autolevel.start(data,context);
        }
     });
}
