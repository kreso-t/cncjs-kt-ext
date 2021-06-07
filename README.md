# **Auto-leveling extension for CNCjs**

CNCjs Auto-leveling extension intended to be used primarily for PCB isolation milling. Currently only Grbl is supported/tested.

It will probe the surface (within gcode boundaries (xmin,ymin) - (xmax,ymax)) and transform the gcode currently loaded to cncjs and load auto-leveled gcode into CNCjs, ready to be run.

## Install and run

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

## Available Commands


| Command  | Description |
| -------------- | ---------- |
| `(#autolevel)` | Probes the Z-offset in a grid way fixing the uploaded gcode. |
| `(#autolevel_reapply)` | reapply previous probed Z-offset values when importing a new gcode |
| `(PROBEOPEN filename)` | save the probed values to a file named 'filename'
| `(PROBECLOSE)` | close the probe capture file opened with PROBEOPEN. This happens automatically when (#autolevel) completes, so this is only for probe commands issued by other software


### Installation with `pm2`

If you manage cncjs with `pm2`, you may want to manage this extension the same way. This assumes you've already set up [cncjs with pm2](https://cnc.js.org/docs/rpi-setup-guide/#install-production-process-manager-pm2).

```bash
git clone https://github.com/kreso-t/cncjs-kt-ext.git
cd cncjs-kt-ext
npm install
cp pm2.example.config.js pm2.config.js
pm2 start pm2.config.js
pm2 save
```

This will start the extension in pm2 using the first user in your cncrc. If you wish to use a different user, you can modify the `pm2.config.js` to with command line options for the user name and id.

## How to use
    
Jog your tool at PCB origin point and zero it (i.e. set work coordinates: 0,0,0).
Then, by using a macro you may send the following command:

```
(#autolevel)
```

Without any options it will probe the area covered by the gcode every 10 mm, with travel height at 2 mm, and probing feedrate 50 mm/min.
    
Please, note that this command will be ignored when put inside the gcode file or type it in the console, you must run it from a macro.

Once the probing is finished, the loaded gcode will be updated to reflect probed z levels and you may run the gcode.

You can customize the probing distance, height and feedrate and/or probing mode by using the following syntax:

```
(#autolevel D[distance] H[height] F[feedrate] M[margin] P[probeOnly] X[xSize] Y[ySize])
```

The "probeOnly" value indicates if the probing should be applied to any loaded GCode or not. The default value of "0" indicates that yes, the probe results should be applied immediately to any loaded GCode.  A probeOnly of "1" indicates that
probing should NOT be applied to any loaded GCode. This special mode is used in conjunction with the PROBEOPEN command to save probe values to an external file (see below). This is the only mode that allows probing to occur where no g-code is
currently loaded.

The probed area will be comprised of cells that are each "distance" in width and height. Normally, the area covered
by the loaded gcode is probed. However, if no gcode is loaded (for example, in the case of a probeOnly), you can
instead expliticly specify the max X,Y size with the xSize,ySize parameters.  In that case, the probe area will be 0,0 to xSize,YSize.


If a new related gcode is needed, after the first mill process. Autolevel values can be reapplyed with the following command:

```
(#autolevel_reapply)
```

In the case of the different drill bit lengths, after changing the drill bit to another having different length, you have to Z-Probe the PCB surface at approximately starting point (xmin, ymin) and set the Z WCO to zero again before firing the `#autolevel_reapply` command.

### Custom usage examples

```
(#autolevel D7.5 H1.0 F20 M0.2)
```

This will instruct it to use probing distance of 7.5 mm (i.e. distance in XY plane between probed points), travel height 1 mm and feedrate 20.0 mm/min considerin a margin of 0.2 mm around the PCB area.



```
(#autolevel P1 X30 Y50)
```

This will instruct it to probe an area area 30mm by 50 mm (starting at the work zero) using use default probing distance of 10 mm, travel height 2 mm and feedrate 50.0 mm/min. The loaded gcode will NOT be modified. If a (PROBEOPEN) has not been issued to save the values to a specific file, the probed values will be saved to a default file that can be used in a future run using (#autolevel_reapply).
