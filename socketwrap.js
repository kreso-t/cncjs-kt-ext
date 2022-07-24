module.exports = class SocketWrap {
  constructor (socket, port) {
    this.socket = socket
    this.port = port
  }

  sendGcode (gcode) {
    // console.log('sending gcode:', gcode);
    this.socket.emit('command', this.port, 'gcode', gcode)    
  }

  loadGcode (name, gcode) {
    this.socket.emit('command', this.port, 'gcode:load', name, gcode)
  }

  stopGcode (file, gcode) {
    this.socket.emit('command', this.port, 'gcode:stop', { force: true })
  }
}
