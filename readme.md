**Auto-leveling extension for CNCjs**

CNCjs Auto-leveling extension intended to be used primarily for PCB isolation milling. Currently only Grbl is supported/tested.

It will probe the surface (within gcode boundaries (xmin,ymin) - (xmax,ymax)) and transform the gcode currently loaded to cncjs and load auto-leveled gcode into CNCjs, ready to be run.

* How to install and run:
```
    git clone https://github.com/kreso-t/cncjs-kt-ext.git
    cd cncjs-kt-ext
    npm install
    npm start
```

once started it will (by default) connect to local cncjs server and port '/dev/ttyACM0' and register it self for listening and sending commands (similar way as i.e. cncjs keyboard pendant)

to see the other possible start options use:
```
    node . --help
```

once it receives the #autolevel command it will execute the probing and transform the gcode

* How to use:
    
    Jog your tool at PCB origin point and zero it (i.e. set work coordinates: 0,0,0)
    then by using a macro you may send the following command:
    ```
    (#autolevel)
    ```
    without any options it will probe every 10mm, with travel height at 2mm, and probing feedrate 50mm/min
    
    please note that this command will be ignored when put inside the gcode file or type it in the console, you must run it from a macro 

    once the probing is finished and gcode transformed you may run the gcode

If you want to customize the probing distance, height and feedrate you may use the following syntax:
```
(#autolevel D15.0 H5.0 F20)
```
this will instruct it to use probing distance of 15mm (i.e. distance in xy plane between probed points), travel height 5mm and feedrate 20.0 mm/min


