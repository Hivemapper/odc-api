#!/usr/bin/env python3

import depthai as dai
from pathlib import Path
import time
import signal
import sys
import threading
from collections import deque
from utils.sqlite import SQLite
from utils.jpeg_tools import JpegMemoryControl
from ml import nn_process_input_queue, handle_nn_output

jpeg_root_folder = '/tmp/recording/pics'
stereo_root_folder = '/data/recording/stereo'
db_path = '/data/recording/data-logger.v1.4.5.db'
cachedStereoQueue = deque()

# Define the signal handler function
def signal_handler(sig, frame):
    print('You pressed Ctrl+C!')
    # Perform any clean-up tasks here
    # Finally, exit the program
    print("To view the encoded data, convert the stream file (.h265) into a video file (.mp4) using a command below:")
    print("ffmpeg -framerate 30 -i video.h265 -c copy video.mp4")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)

def calculate_fps(prev_time, frame_count):
    current_time = time.time()
    if current_time - prev_time >= 1:  # Every second
        fps = frame_count / (current_time - prev_time)
        frame_count = 0
        prev_time = current_time
        return fps, prev_time, frame_count
    return None, prev_time, frame_count
 
def record_jpeg(queue, dirName):
    Path(dirName).mkdir(parents=True, exist_ok=True)
    prev_time = time.time()
    frame_count = 0
    while True:
        img = queue.get()
        # insert into DB frames instead
        ts = img.getTimestamp()
        latencyMs = int((dai.Clock.now() - ts).total_seconds() * 1000000)
        timeNow = time.time() * 1000000
        timestamp = int(timeNow - latencyMs)
        timestamp_str = str(timestamp)
        prefix = timestamp_str[:-6]
        suffix = timestamp_str[-6:]
        fName = f"{dirName}/{prefix}_{suffix}.jpg"
        with open(fName, "wb") as f:
            f.write(img.getData())
            if frame_count % 5 == 0:  # Send every other frame to nnThread
                db.add_frame(fName, int(ts.total_seconds() * 1000))
            jpegMemoryControl.add(fName)
            # print(f'Image with timestamp {fName} (latency: {int(latencyMs)})')

        frame_count += 1
        fps, prev_time, frame_count = calculate_fps(prev_time, frame_count)
        if fps:
            print(f"JPEG FPS: {fps}")

def record_h265(queue, dirName):
    Path(dirName).mkdir(parents=True, exist_ok=True)
    while True:
        h265Packet = queue.get()
        # with open(f'{dirName}/video.h265', 'wb') as videoFile:
        #     t_end = time.time() + 20
        #     while time.time() < t_end:
        #         h265Packet = queue.get()  # Blocking call, will wait until a new data has arrived
        #         h265Packet.getData().tofile(videoFile)  # Appends the packet data to the opened file
        #         # convert to mp4 later as part of postprocessig

def record_mono(qLeft, qRight, dirName, cachedStereoQueue=None, capture_lock=None):
    Path(dirName).mkdir(parents=True, exist_ok=True)
    while True:
        try:
            inLeft = qLeft.tryGet()
            inRight = qRight.tryGet()
            with capture_lock:
                if inLeft is not None:
                    cachedStereoQueue.append(("left", inLeft, int(inLeft.getTimestamp().total_seconds() * 1000)))
                if inRight is not None:
                    cachedStereoQueue.append(("right", inRight, int(inRight.getTimestamp().total_seconds() * 1000)))
                if len(cachedStereoQueue) > 1200:
                    # remove the oldest stereo pair
                    cachedStereoQueue.popleft()
                    cachedStereoQueue.popleft()
        except Exception as e:
            print(e)
            time.sleep(1)

print("DepthAI version:", dai.__version__)

# Create pipeline
pipeline = dai.Pipeline()

# Define nodes for RGB
camRgb = pipeline.create(dai.node.ColorCamera)
videoEncH265 = pipeline.create(dai.node.VideoEncoder)
xoutH265 = pipeline.create(dai.node.XLinkOut)
videoEncJpeg = pipeline.create(dai.node.VideoEncoder)
xoutJpeg = pipeline.create(dai.node.XLinkOut)

# Define nodes for Mono
monoLeft = pipeline.create(dai.node.MonoCamera)
monoRight = pipeline.create(dai.node.MonoCamera)
xoutLeft = pipeline.create(dai.node.XLinkOut)
xoutRight = pipeline.create(dai.node.XLinkOut)

# Add Neural Network to the pipeline
nn = pipeline.create(dai.node.NeuralNetwork)
nnOut = pipeline.create(dai.node.XLinkOut)
nnIn = pipeline.create(dai.node.XLinkIn)

nnOut.setStreamName("nn")
nnIn.setStreamName("nn_in")

nn.setBlobPath(sys.argv[1])
nn.input.setQueueSize(1)
nn.input.setBlocking(False)
nn.setNumInferenceThreads(4)

nnIn.out.link(nn.input)
nn.out.link(nnOut.input)

#Set stream names
xoutH265.setStreamName('h265')
xoutJpeg.setStreamName('jpeg')
xoutLeft.setStreamName('left')
xoutRight.setStreamName('right')

# Properties RGB
camRgb.setBoardSocket(dai.CameraBoardSocket.CAM_A)
camRgb.setResolution(dai.ColorCameraProperties.SensorResolution.THE_4_K)
camRgb.setVideoSize(3840, 2160)
camRgb.setPreviewSize(2028, 1024)
camRgb.setPreviewType(dai.ImgFrame.Type.NV12)
camRgb.initialControl.setMisc("stride-align", 64)
camRgb.initialControl.setMisc("scanline-align", 64)

videoEncH265.setDefaultProfilePreset(30, dai.VideoEncoderProperties.Profile.H265_MAIN)
videoEncH265.setBitrateKbps(35*1000)
videoEncH265.setQuality(50)
videoEncJpeg.setDefaultProfilePreset(30, dai.VideoEncoderProperties.Profile.MJPEG)
videoEncJpeg.setQuality(50)
# Properties Mono
monoLeft.setBoardSocket(dai.CameraBoardSocket.CAM_B)
monoLeft.setResolution(dai.MonoCameraProperties.SensorResolution.THE_480_P)

monoRight.setBoardSocket(dai.CameraBoardSocket.CAM_C)
monoRight.setResolution(dai.MonoCameraProperties.SensorResolution.THE_480_P)

# Linking RGB
camRgb.video.link(videoEncH265.input)
videoEncH265.bitstream.link(xoutH265.input)

camRgb.preview.link(videoEncJpeg.input)
videoEncJpeg.bitstream.link(xoutJpeg.input)
# Linking Mono
monoRight.out.link(xoutRight.input)
monoLeft.out.link(xoutLeft.input)

# Connect to device and start pipeline
with dai.Device(pipeline) as device:

    # Queue for NN input
    nnQ = device.getInputQueue("nn_in")
    jpegMemoryControl = JpegMemoryControl(jpeg_root_folder)
    db = SQLite(db_path)
    capture_lock = threading.Lock()

    # Output queue will be used to get the encoded data from the output defined above
    qH265 = device.getOutputQueue(name="h265", maxSize=30, blocking=True)
    qjpeg = device.getOutputQueue(name="jpeg", maxSize=30, blocking=True)
    qLeft = device.getOutputQueue(name="left", maxSize=4, blocking=True)
    qRight = device.getOutputQueue(name="right", maxSize=4, blocking=True)
    qNNOut = device.getOutputQueue(name="nn", maxSize=4, blocking=False)
    # The .h265 file is a raw stream file (not playable yet)
    thread_h265 = threading.Thread(target=record_h265, args=(qH265, "h265",))
    thread_jpeg = threading.Thread(target=record_jpeg, args=(qjpeg, jpeg_root_folder,))
    thread_mono = threading.Thread(target=record_mono, args=(qLeft, qRight, stereo_root_folder,cachedStereoQueue,capture_lock,))
    thread_nn_input = threading.Thread(target=nn_process_input_queue, args=(nnQ, cachedStereoQueue, db, jpeg_root_folder,stereo_root_folder,capture_lock,))
    thread_nn_output = threading.Thread(target=handle_nn_output, args=(qNNOut,db,))

    thread_h265.start()
    thread_jpeg.start()
    thread_mono.start()
    thread_nn_input.start()
    thread_nn_output.start()

    thread_h265.join()
    thread_jpeg.join()
    thread_mono.join()
    thread_nn_input.join()
    thread_nn_output.join()
