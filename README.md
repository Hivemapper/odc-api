<p align="center">
  <img src="/Open_Dashcam_logo.png?raw=true" width=40% height=40% />
</p>

# About the Open Dashcam (ODC)

The Open Dashcam (ODC) project is an open source hardware and software toolkit for building dashcam devices that collect data on the [Hivemapper Mapping Network](https://hivemapper.com/mapping-network#introduction). The ODC API provides the core software needed to run the dashcam and connect the dashcam to the Hivemapper App enabling data to be transferred to the mapping network via the app.

The [Hivemapper Dashcam](https://hivemapper.com/hivemapper-dashcam) is one of the first dashcams being built using the ODC software toolkit.

# Data Flow

The Open Dashcam (ODC) device and software enables collection and transfer of imagery and location data to the Hivemapper Mapping Network as illustrated below.

![End to End Data Flow](/hivemapper_data_transfer_process-3.png?raw=true 'Open Dashcam')

# ODC API

To make it up-n-running, it's as simple as

1. Make sure you have NodeJS installed on your device
2. Copy `/compiled` folder to some cozy place on your device (better lib/opt folders, /tmp is not a good idea)
3. Run the ODC API single-file service: `node odc-api-<camera name>.js`
4. Check if it's working: `http://<YOUR_DEVICE_IP>:5000/api/1/info` should return readable JSON to you
5. Enjoy!

# How to Compile

For a quick start,
```
npm install
npm run build
npm run start
```
Check if it's healthy: `http://localhost:5000/api/1/info`.

# Compile on Dev

To configure it for your device,
create your own camera config file under `/config` folder, and make sure it is set as default under `/config/index.ts`

To build a standalone server file,
make sure you have ncc installed:

```
npm i -g @vercel/ncc
```
and then execute: `npm run compile-dev --camera=<camera name>`
```
npm run compile-dev --camera=hdc
```
Server will get compiled into single file with bunch of fixtures next to it, and located in `compiled/` folder

To check if everything OK with compiled server file, execute:

```
npm run start-compiled
```

And double-check if it's healthy: `http://localhost:5000/api/1/info`

# Troubleshooting
If you're on a mac, as you're starting up the server, you might run into an `EADDRINUSE` error on port 5000. This port is reserved for Apple's Airplay receiver. Turn it off here: *System Preferences > General > disable Airplay Receiver*

# Overview

## API

### Index

- [Info](#info)
- [Init](#init)

### GPS

- [List Files](#list-of-gps-files)
- [Get single file](#single-gps-single)
- [Get GPS sample](#get-gps-sample)
- [Get raw GPS messages](#get-raw-gps-messages)

### IMU

- [List Files](#list-of-imu-files)
- [Get single file](#single-imu-single)

### Recordings

- [List Files](#list-of-frames)
- [Get single Frame](#single-frame)

### Live Stream

- [Start Live Stream](#start-live-stream)
- [Stop Live Stream](#stop-live-stream)

### Networking

- [Switch to P2P](#switch-to-p2p)
- [Switch to AP](#switch-to-ap)

## API

**Please note:** the entire API prefixed with `api/1/` string.

So any API request for you will look like `http://<Dashcam_Host>:<Api_Port>/api/1/<Api_Url>`

**Please note #2:** If you fetch a static file (frame / GPS file / IMU file), prefix your request with `public/` string.

So any request for a static file will look like `http://<Dashcam_Host>:<Api_Port>/public/pic/<Frame_File_Name>`

## Index

### Info

**GET /info**

Method to return information about current ODC API version and firmware data (build, version, etc)

```javascript
$ curl --GET http://192.168.0.10:5000/api/1/info

{
  "api_version":"0.9.2"
  "build_date":"Thu Aug 25 16:27:26 UTC 2022",
  ...
}

```

### Init

**GET /init?time=<UNIX_TIMESTAMP>**

Request to initiate the communication between App and the camera. Requires current timestamp to be provided.

Camera time will be reset to the time provided by this API call.

```javascript
$ curl --GET http://192.168.0.10:5000/api/1/init?time=1661866828027

{"output":"done"}

```

## GPS

### List of GPS files

**GET /gps?since=<UNIX_TIMESTAMP>&until<UNIX_TIMESTAMP>**

Request to get the list of gps files containing on the dashcam. Filters `since` and `until` provide a possibility to get a particular range of results.

```javascript
$ curl --GET http://192.168.0.10:5000/api/1/gps

[
  {
    "path":"2022-08-30T00:10:07.455Z.json",
    "date":1661818207455
  },
  ...
]

```

### Single GPS file

**GET /public/gps/<FILENAME>**

Request to get the contents of particular GPS file

```javascript
$ curl --GET http://192.168.0.10:5000/public/gps/2022-08-30T00:10:07.455Z.json
```

### Get GPS sample

**GET /gps/sample**

Request to get the contents of particular GPS file

```javascript
$ curl --GET http://192.168.0.10:5000/api/1/gps/sample

{
  "fix":"3D",
  "timestamp": ...
},
```

### Get Raw GPS Messages

**GET /gps/raw/<num_msg>**

Request to get `num_msg` binary messages from the M9N.

```javascript
--GET http://192.168.0.10:5000/api/1/gps/raw/5
{
  "b64EncodedBytes":"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"
}
```

## IMU

### List of IMU files

**GET /imu?since=<UNIX_TIMESTAMP>&until<UNIX_TIMESTAMP>**

Request to get the list of IMU files containing on the dashcam. Filters `since` and `until` provide a possibility to get a particular range of results.

```javascript
$ curl --GET http://192.168.0.10:5000/api/1/imu

[
  {
    "path":"2022-08-30T00:10:07.455Z.json",
    "date":1661818207455
  },
  ...
]

```

### Single IMU file

**GET /public/imu/<FILENAME>**

Request to get the contents of particular IMU file

```javascript
$ curl --GET http://192.168.0.10:5000/public/imu/2022-08-30T00:10:07.455Z.json
```

## Recordings

### List of Frames

**GET /recordings?since=<UNIX_TIMESTAMP>&until<UNIX_TIMESTAMP>**

Request to get the list of frames being created on camera.

Filters `since` and `until` provide a possibility to get a particular range of results.

```javascript
$ curl --GET http://192.168.0.10:5000/api/1/recordings

[
  {
    "path":"1661867302_878800.jpg",
    "date":1661867302878
  },
  ...
]

```

### Single Frame

**GET /public/pic/<FILENAME>**

Request to get the particular frame by its filename.

```javascript
$ curl --GET http://192.168.0.10:5000/public/pic/1661867302_878800.jpg
```

## Live Stream

### Start Live Stream

**GET /preview/start**

Method to start the process of streaming live video from camera.
To access a live stream, once it successfully started, hit the following URL:

`http://192.168.0.10:9001/?action=stream`

**Obvious note:** your current connection with the camera is going to be terminated

```javascript
$ curl --GET http://192.168.0.10:5000/api/1/preview/start

{
  "status": "started"
}

```

### Stop Live Stream

**GET /preview/stop**

Method to tear down current P2P interface on camera, and make Wi-Fi Access Point up & running.

**Important note:** your current connection with the camera is going to be terminated

```javascript
$ curl --GET http://192.168.0.10:5000/api/1/preview/stop

{
  "status": "stopped"
}

```

## Networking

### Switch to P2P

**GET /network/p2p**

Method to tear down current Access Point interface on camera, and make Wi-Fi Direct P2P up & running.

**Obvious note:** your current connection with the camera is going to be terminated

```javascript
$ curl --GET http://192.168.0.10:5000/api/1/network/p2p

{
  "output": "done"
}

```

### Switch to AP

**GET /network/ap**

Method to tear down current P2P interface on camera, and make Wi-Fi Access Point up & running.

**Important note:** your current connection with the camera is going to be terminated

```javascript
$ curl --GET http://192.168.0.10:5000/api/1/network/ap

{
  "output": "done"
}

```
