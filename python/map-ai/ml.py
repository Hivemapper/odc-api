import depthai as dai
import cv2
import time
import os 
import numpy as np
from datetime import timedelta
import gc
from utils.jpeg_tools import JpegMemoryControl

nn_retry_counters = {}
currently_processing = set()
metadata_map = {}

def nn_process_input_queue(nnQ, db, jpeg_root_folder, leftStereoQueue, rightStereoQueue):
    while True:
        # grab frame from DB
        try: 
            images, total = db.get_frames_for_ml(1)
            
            if (len(images) > 0):
                # prepare image for NN
                img = images[0]
                image_name = img[0]
                if image_name not in currently_processing:
                    currently_processing.add(image_name)
                    db.set_frame_ml(image_name, "dfsfd", [], {})  
                    ts = img[4]
                    # print(image_name, ts)
                    # # go through stereoQ and find left and right element with timestamp difference less 15ms
                    # stereo_left = None
                    # stereo_right = None
                    # left_not_found = False
                    # right_not_found = False
                    # with capture_lock:
                    #     while stereoQ:
                    #         stereo_elem = stereoQ[0]  # Look at the first item in the queue
                    #         stereo_cam = stereo_elem[0]
                    #         stereo_img = stereo_elem[1]
                    #         stereo_ts = stereo_elem[2]

                    #         if abs(stereo_ts - ts) < 15:
                    #             if stereo_cam == "left":
                    #                 stereo_left = stereo_img
                    #             if stereo_cam == "right":
                    #                 stereo_right = stereo_img
                    #         elif stereo_ts > ts:
                    #             if stereo_cam == "left":
                    #                 left_not_found = True
                    #             if stereo_cam == "right":
                    #                 right_not_found = True

                    #         if stereo_left is not None and stereo_right is not None:
                    #             break
                    #         if left_not_found and right_not_found:
                    #             break

                    #         stereoQ.popleft()  # Remove the first item from the queue
                    # gc.collect()

                    # # if found, cache stereo pair
                    # if stereo_left is not None and stereo_right is not None:
                    #     #remove jpg extention from image-name and add left postfix
                    #     left_name = f"{image_name[:-4]}_left.npy"
                    #     right_name = f"{image_name[:-4]}_right.npy"
                    #     np.save(os.path.join(stereo_root_folder, left_name), stereo_left.getCvFrame())
                    #     np.save(os.path.join(stereo_root_folder, right_name), stereo_right.getCvFrame())
                    #     stereoImageryMemoryControl.add(left_name)
                    #     stereoImageryMemoryControl.add(right_name)
                    #     # print("Stereo pair found and saved")
                    
                    img = dai.ImgFrame()
                    image_path = os.path.join(jpeg_root_folder, image_name)
                    # print('image path', image_path)
                    cv_frame = cv2.imread(image_path)
                    if cv_frame is not None:
                        img.setData(cv2.resize(cv_frame, (640, 640)))
                        img.setType(dai.RawImgFrame.Type.BGR888p)
                        img.setTimestamp(timedelta(milliseconds=ts)) # preserving the timestamp of original
                        metadata_map[ts] = image_name
                        img.setWidth(640)
                        img.setHeight(640)
                        nnQ.send(img)  # Send to NN input queue
            time.sleep(3 if len(images) == 0 else 1 if len(nn_retry_counters) > 0 else 0.1)
        except Exception as e:
            print('NN input error', e)
            time.sleep(1)

def handle_nn_output(queue, db):
    while True:
        try: 
            detection = queue.get()  # Ignoring the detections for now
            detData = detection.getFirstLayerFp16()
            npDetData = np.array(detData)
            # print(f'Detections array shape {npDetData.shape}')   
            ts = int(detection.getTimestamp().total_seconds() * 1000)
            print('Detection timestamp:', ts)
            if metadata_map.get(ts):
                image_name = metadata_map[ts]
                print('Detection for image name found:', image_name)
            else:
                print('Detection for image name not found')
        except Exception as e:
            print('NN output error', e)
            time.sleep(1)