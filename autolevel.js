const io = require('socket.io-client');
const SocketWrap = require('./socketwrap');
module.exports = class Autolevel {
    constructor(socket,options) {
        this.gcodeFileName='';
        this.gcode='';
        this.sckw=new SocketWrap(socket,options.port);
        this.delta = 20.0; // step
        this.feed = 100; // probing feedrate
        this.height = 2; // travelling height
        this.depth = 2; // probing max depth
        this.probedPoints = [];
        this.planedPointCount = 0;
        this.wco = {
            x:0,
            y:0,
            z:0
        };
        socket.on('gcode:load', function(file,gc) {
             this.gcodeFileName=file;
             this.gcode=gc;
             console.log("gcode loaded:", file);
         });

        socket.on('serialport:read', (data) => {
            if(data.indexOf("PRB")>=0) {
                let prbm = /\[PRB:([\+\-\.\d]+),([\+\-\.\d]+),([\+\-\.\d]+),?([\+\-\.\d]+)?:(\d)\]/g.exec(data);
                if (prbm) {
                    let prb = [parseFloat(prbm[1]), parseFloat(prbm[2]), parseFloat(prbm[3]), parseFloat(prbm[4])]
                    let pt = {
                        x: prb[0] - this.wco.x,
                        y: prb[1] - this.wco.y,
                        z: prb[2] - this.wco.z
                    };
                    this.probedPoints.push(pt)
                    console.log("probed " + this.probedPoints.length  + "/" +  this.planedPointCount + ">", pt);
                }
            }
        });

        //  this.socket.emit.apply(socket, ['write', this.port, "gcode", "G91 G1 Z1 F1000"]);
     }

     start(cmd,context) {
        console.log(cmd,context)
        this.wco = {
            x: context.mposx-context.posx,
            y: context.mposy-context.posy,
            z: context.mposz-context.posz,
        };
        this.probedPoints = [];
        console.log(this.wco) ;
        let code = [];
        let dx=(context.xmax-context.xmin)/parseInt((context.xmax-context.xmin)/this.delta);
        let dy=(context.ymax-context.ymin)/parseInt((context.ymax-context.ymin)/this.delta);

        code.push(`G90 G0 X${context.xmin.toFixed(3)} Y${context.ymin.toFixed(3)} Z${this.height}`);
        code.push(`G38.2 Z-${this.depth} F${this.feed/2}`);
        code.push(`G10 L20 P1 Z0`); // set the z zero
        code.push(`G0 Z${this.height}`);
        this.planedPointCount ++;

        let y=context.ymin - dy;

        while(y<context.ymax-0.01) {
            y+=dy;
            if(y>context.ymax) y=context.ymax;

            let x=context.xmin - dx;
            if(y<=context.ymin+0.01) x=context.xmin; // don't probe first point twice

            while(x<context.xmax-0.01) {
                x+=dx;
                if(x>context.xmax) x=context.xmax;
                code.push(`G90 G0 X${x.toFixed(3)} Y${y.toFixed(3)} Z${this.height}`);
                code.push(`G38.2 Z-${this.depth} F${this.feed}`);
                code.push(`G0 Z${this.height}`);
                this.planedPointCount ++;
            }
        }
        this.sckw.sendGcode(code.join('\n'));
     }
}


