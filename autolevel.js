/* eslint-disable no-useless-escape */
const SocketWrap = require('./socketwrap')

const alFileNamePrefix = '#AL:'

const Units = {
    MILLIMETERS: 1,
    INCHES: 2,

    convert: function(value, in_units, out_units) {
        if (in_units == out_units) {
            return value;
        }
        if (in_units == this.MILLIMETERS && out_units == this.INCHES) {
            return value / 25.4;
        }
        if (in_units == this.INCHES && out_units == this.MILLIMETERS) {
            return value * 25.4;
        }
    }
}

Object.freeze(Units);

module.exports = class Autolevel {
  constructor(socket, options) {
    this.gcodeFileName = ''
    this.gcode = ''
    this.sckw = new SocketWrap(socket, options.port)
    this.delta = 10.0 // step
    this.feed = 50 // probing feedrate
    this.height = 2 // travelling height
    this.probedPoints = []
    this.min_dz = 0;
    this.max_dz = 0;
    this.sum_dz = 0;
    this.planedPointCount = 0
    this.wco = {
      x: 0,
      y: 0,
      z: 0
    }
    socket.on('gcode:load', (file, gc) => {
      if (!file.startsWith(alFileNamePrefix)) {
        this.gcodeFileName = file
        this.gcode = gc
        console.log('gcode loaded:', file)
      }
    })

    socket.on('gcode:unload', () => {
      this.gcodeFileName = ''
      this.gcode = ''
      console.log('gcode unloaded')
    })

    socket.on('serialport:read', (data) => {
      if (data.indexOf('PRB') >= 0) {
        let prbm = /\[PRB:([\+\-\.\d]+),([\+\-\.\d]+),([\+\-\.\d]+),?([\+\-\.\d]+)?:(\d)\]/g.exec(data)
        if (prbm) {
          let prb = [parseFloat(prbm[1]), parseFloat(prbm[2]), parseFloat(prbm[3])]
          let pt = {
            x: prb[0] - this.wco.x,
            y: prb[1] - this.wco.y,
            z: prb[2] - this.wco.z
          }
          if (this.planedPointCount > 0) {
            if(this.probedPoints.length ===0) {
              this.min_dz = pt.z;
              this.max_dz = pt.z;
              this.sum_dz = pt.z;
            } else {
              if(pt.z < this.min_dz) this.min_dz = pt.z;
              if(pt.z > this.max_dz) this.max_dz = pt.z;
              this.sum_dz += pt.z;
            }
            this.probedPoints.push(pt)
            console.log('probed ' + this.probedPoints.length + '/' + this.planedPointCount + '>', pt.x.toFixed(3), pt.y.toFixed(3), pt.z.toFixed(3))
            // send info to console
            if (this.probedPoints.length >= this.planedPointCount) {
              this.sckw.sendGcode(`(AL: dz_min=${this.min_dz.toFixed(3)}, dz_max=${this.max_dz.toFixed(3)}, dz_avg=${(this.sum_dz / this.probedPoints.length).toFixed(3)})`);
              this.applyCompensation()
              this.planedPointCount = 0
            }
          }
        }
      }
    })

    //  this.socket.emit.apply(socket, ['write', this.port, "gcode", "G91 G1 Z1 F1000"]);
  }

  reapply(cmd,context) {
    if (!this.gcode) {
      this.sckw.sendGcode('(AL: no gcode loaded)')
      return
    }
    if(this.probedPoints.length<3) {
      this.sckw.sendGcode('(AL: no previous autolevel points)')
      return;
    }
    this.applyCompensation();
  }

  start(cmd, context) {
    console.log(cmd, context)

    if (!this.gcode) {
      this.sckw.sendGcode('(AL: no gcode loaded)')
      return
    }
    this.sckw.sendGcode('(AL: auto-leveling started)')
    let m = /D([\.\+\-\d]+)/gi.exec(cmd)
    if (m) this.delta = parseFloat(m[1])

    let h = /H([\.\+\-\d]+)/gi.exec(cmd)
    if (h) this.height = parseFloat(h[1])

    let f = /F([\.\+\-\d]+)/gi.exec(cmd)
    if (f) this.feed = parseFloat(f[1])

    let margin = this.delta/4;

    let mg = /M([\.\+\-\d]+)/gi.exec(cmd)
    if (mg) margin = parseFloat(mg[1])

    console.log(`STEP: ${this.delta} mm HEIGHT:${this.height} mm FEED:${this.feed} MARGIN: ${margin} mm`)

    this.wco = {
      x: context.mposx - context.posx,
      y: context.mposy - context.posy,
      z: context.mposz - context.posz
    }
    this.probedPoints = []
    this.planedPointCount = 0
    console.log('WCO:', this.wco)
    let code = []

    let xmin = context.xmin + margin;
    let xmax = context.xmax - margin;
    let ymin = context.ymin + margin;
    let ymax = context.ymax - margin;

    let dx = (xmax - xmin) / parseInt((xmax - xmin) / this.delta)
    let dy = (ymax - ymin) / parseInt((ymax - ymin) / this.delta)
    code.push('(AL: probing initial point)')
    code.push(`G21`)
    code.push(`G90`)
    code.push(`G0 Z${this.height}`)
    code.push(`G0 X${xmin.toFixed(3)} Y${ymin.toFixed(3)} Z${this.height}`)
    code.push(`G38.2 Z-${this.height+1} F${this.feed / 2}`)
    code.push(`G10 L20 P1 Z0`) // set the z zero
    code.push(`G0 Z${this.height}`)
    this.planedPointCount++

    let y = ymin - dy

    while (y < ymax - 0.01) {
      y += dy
      if (y > ymax) y = ymax
      let x = xmin - dx
      if (y <= ymin + 0.01) x = xmin // don't probe first point twice

      while (x < xmax - 0.01) {
        x += dx
        if (x > xmax) x = xmax
        code.push(`(AL: probing point ${this.planedPointCount + 1})`)
        code.push(`G90 G0 X${x.toFixed(3)} Y${y.toFixed(3)} Z${this.height}`)
        code.push(`G38.2 Z-${this.height} F${this.feed}`)
        code.push(`G0 Z${this.height}`)
        this.planedPointCount++
      }
    }
    this.sckw.sendGcode(code.join('\n'))
  }

  stripComments(line) {
    const re1 = new RegExp(/\s*\([^\)]*\)/g) // Remove anything inside the parentheses
    const re2 = new RegExp(/\s*;.*/g) // Remove anything after a semi-colon to the end of the line, including preceding spaces
    const re3 = new RegExp(/\s+/g)
    return (line.replace(re1, '').replace(re2, '').replace(re3, ''))
  };

  distanceSquared3(p1, p2) {
    return (p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y) + (p2.z - p1.z) * (p2.z - p1.z)
  }

  distanceSquared2(p1, p2) {
    return (p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y)
  }

  crossProduct3(u, v) {
    return {
      x: (u.y * v.z - u.z * v.y),
      y: -(u.x * v.z - u.z * v.x),
      z: (u.x * v.y - u.y * v.x)
    }
  }

  isColinear(u, v) {
    return Math.abs(u.x * v.y - u.y * v.x) < 0.00001
  }

  sub3(p1, p2) {
    return {
      x: p1.x - p2.x,
      y: p1.y - p2.y,
      z: p1.z - p2.z
    }
  }

  formatPt(pt) {
    return `(x:${pt.x.toFixed(3)} y:${pt.y.toFixed(3)} z:${pt.z.toFixed(3)})`
  }

  splitToSegments(p1, p2, units) {
    let res = []
    let v = this.sub3(p2, p1) // delta
    let dist = Math.sqrt(this.distanceSquared3(p1, p2)) // distance
    let dir = {
      x: v.x / dist,
      y: v.y / dist,
      z: v.z / dist
    } // direction vector
    let maxSegLength = Units.convert(this.delta, Units.MILLIMETERS, units) / 2
    res.push({
      x: p1.x,
      y: p1.y,
      z: p1.z
    }) // first point
    for (let d = maxSegLength; d < dist; d += maxSegLength) {
      res.push({
        x: p1.x + dir.x * d,
        y: p1.y + dir.y * d,
        z: p1.z + dir.z * d
      }) // split points
    }
    res.push({
      x: p2.x,
      y: p2.y,
      z: p2.z
    }) // last point
    return res
  }

  // Argument is assumed to be in millimeters.
  getThreeClosestPoints(pt) {
    let res = []
    if (this.probedPoints.length < 3) {
      return res
    }
    this.probedPoints.sort((a, b) => {
      return this.distanceSquared2(a, pt) < this.distanceSquared2(b, pt) ? -1 : 1
    })
    let i = 0
    while (res.length < 3 && i < this.probedPoints.length) {
      if (res.length === 2) {
        // make sure points are not colinear
        if (!this.isColinear(this.sub3(res[1], res[0]), this.sub3(this.probedPoints[i], res[0]))) {
          res.push(this.probedPoints[i])
        }
      } else {
        res.push(this.probedPoints[i])
      }
      i++
    }
    return res
  }

  compensateZCoord(pt_in_or_mm, input_units) {

    let pt_mm = {
        x: Units.convert(pt_in_or_mm.x, input_units, Units.MILLIMETERS),
        y: Units.convert(pt_in_or_mm.y, input_units, Units.MILLIMETERS),
        z: Units.convert(pt_in_or_mm.z, input_units, Units.MILLIMETERS)
    }

    let points = this.getThreeClosestPoints(pt_mm)
    if (points.length < 3) {
      console.log('Cant find 3 closest points')
      return pt_in_or_mm
    }
    let normal = this.crossProduct3(this.sub3(points[1], points[0]), this.sub3(points[2], points[0]))
    let pp = points[0] // point on plane
    let dz = 0 // compensation delta
    if (normal.z !== 0) {
      // find z at the point seg, on the plane defined by three points
      dz = pp.z - (normal.x * (pt_mm.x - pp.x) + normal.y * (pt_mm.y - pp.y)) / normal.z
    } else {
      console.log(this.formatPt(pt_mm), 'normal.z is zero', this.formatPt(points[0]), this.formatPt(points[1]), this.formatPt(points[2]))
    }
    return {
      x: Units.convert(pt_mm.x, Units.MILLIMETERS, input_units),
      y: Units.convert(pt_mm.y, Units.MILLIMETERS, input_units),
      z: Units.convert(pt_mm.z + dz, Units.MILLIMETERS, input_units)
    }
  }

  applyCompensation() {
    this.sckw.sendGcode(`(AL: applying compensation ...)`)
    console.log('apply leveling')
    try {
      let lines = this.gcode.split('\n')
      let p0 = {
        x: 0,
        y: 0,
        z: 0
      }
      let p0_initialized = false
      let pt = {
        x: 0,
        y: 0,
        z: 0
      }

      let abs = true
      let units = Units.MILLIMETERS
      let result = []
      lines.forEach(line => {
        let lineStripped = this.stripComments(line)
        if (/(G38.+|G5.+|G10|G4.+|G92|G92.1)/gi.test(lineStripped)) result.push(lineStripped) // skip compensation for these G-Codes
        else {
          if (/G91/i.test(lineStripped)) abs = false
          if (/G90/i.test(lineStripped)) abs = true
          if (/G20/i.test(lineStripped)) units = Units.INCHES
          if (/G21/i.test(lineStripped)) units = Units.MILLIMETERS

          if (!/(X|Y|Z)/gi.test(lineStripped)) {
              result.push(lineStripped) // no coordinate change --> copy to output
          } else {
              let xMatch = /X([\.\+\-\d]+)/gi.exec(lineStripped)
              if (xMatch) pt.x = parseFloat(xMatch[1])

              let yMatch = /Y([\.\+\-\d]+)/gi.exec(lineStripped)
              if (yMatch) pt.y = parseFloat(yMatch[1])

              let zMatch = /Z([\.\+\-\d]+)/gi.exec(lineStripped)
              if (zMatch) pt.z = parseFloat(zMatch[1])

              if (abs) {
                // strip coordinates
                lineStripped = lineStripped.replace(/([XYZ])([\.\+\-\d]+)/gi, '')
                if (p0_initialized) {
                    let segs = this.splitToSegments(p0, pt)
                    for (let seg of segs) {
                      let cpt = this.compensateZCoord(seg, units)
                      let newLine = lineStripped + ` X${cpt.x.toFixed(3)} Y${cpt.y.toFixed(3)} Z${cpt.z.toFixed(3)} ; Z${seg.z.toFixed(3)}`
                      result.push(newLine.trim())
                    }
                } else {
                    let cpt = this.compensateZCoord(pt, units)
                    let newLine = lineStripped + ` X${cpt.x.toFixed(3)} Y${cpt.y.toFixed(3)} Z${cpt.z.toFixed(3)} ; Z${pt.z.toFixed(3)}`
                    result.push(newLine.trim())
                    p0_initialized = true
                }
              } else {
                result.push(lineStripped)
                console.log('WARNING: using relative mode may not produce correct results')
              }
              p0 = {
                x: pt.x,
                y: pt.y,
                z: pt.z
              } // clone
          }
        }
      })
      const newgcodeFileName = alFileNamePrefix + this.gcodeFileName;
      this.sckw.sendGcode(`(AL: loading new gcode ${newgcodeFileName} ...)`)
      this.sckw.loadGcode(newgcodeFileName, result.join('\n'))
      this.sckw.sendGcode(`(AL: finished)`)
    } catch (x) {
      this.sckw.sendGcode(`(AL: error occurred ${x})`)
    }
    console.log('Leveling applied')
  }
}
