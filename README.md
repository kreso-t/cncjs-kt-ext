# **Auto-leveling extension for CNCjs**

CNCjs Auto-leveling extension intended to be used primarily for PCB isolation milling. Currently only Grbl is supported/tested.

It will probe the surface (within gcode boundaries (xmin,ymin) - (xmax,ymax)) and transform the gcode currently loaded to cncjs and load auto-leveled gcode into CNCjs, ready to be run.

## Install and run

First of all, the `CNCJS_SECRET` environment variable must be set.

```
export CNCJS_SECRET=$(grep secret ~/.cncrc | sed "s/[ \t]+//g" | tr ',' ' ' | cut -d':' -f2 | sed 's/"//g' | sed 's/ //g')
```

Instalation

```bash
git clone https://github.com/kreso-t/cncjs-kt-ext.git
cd cncjs-kt-ext
npm install
node . --port /dev/ttyACM0
```

Once started it will (by default) connect to local cncjs server and register it self for listening and sending commands (similar way as i.e. cncjs keyboard pendant).

To list all start options use:

```bash
node . --help
```

Once it receives the #autolevel command it will execute the probing and update the gcode with fixed values.

## How to use
    
Jog your tool at PCB origin point and zero it (i.e. set work coordinates: 0,0,0).
Then, by using a macro you may send the following command:

```
(#autolevel)
```

Without any options it will probe every 10 mm, with travel height at 2 mm, and probing feedrate 50 mm/min.
    
Please, note that this command will be ignored when put inside the gcode file or type it in the console, you must run it from a macro.

Once the probing is finished and gcode updated you may run the gcode.

You can customize the probing distance, height and feedrate you may use the following syntax:

```
(#autolevel D[distance] H[height] F[feedrate])

# Example
(#autolevel D7.5 H1.0 F20)
```

This will instruct it to use probing distance of 7.5 mm (i.e. distance in XY plane between probed points), travel height 1 mm and feedrate 20.0 mm/min.


