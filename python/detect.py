import argparse
import cv2
import numpy as np
import os
from collections import deque
import time
from yolov8.utils import nms, xywh2xyxy
import sqlite
import image
from openvino.inference_engine import IECore

SPEED_THRESHOLD_FOR_OPTIMISED_MODEL = 60 # miles per hour
IMAGE_WIDTH = 2028
IMAGE_HEIGHT = 1024

blurred_images = deque()

def rescale_boxes(boxes, img_width, img_height, model_width, model_height):
    # Rescale boxes to original image dimensions
    # paying attention to paddings of squared detections
    input_shape = np.array([model_width, model_height, model_width, model_height])
    aspect_ratio = img_width / img_height
    resize_ratio = model_width / img_width
    padding = (model_height - img_height * resize_ratio) / 2

    boxes -= np.array([0, padding, 0, padding])
    boxes = np.divide(boxes, input_shape, dtype=np.float32)
    boxes *= np.array([img_width, img_height * aspect_ratio, img_width, img_height * aspect_ratio])
    return boxes

def detect(image_path, session, conf_threshold, nms_threshold, tensor_type, as_copy=False):
  start = time.perf_counter()

  input_blob = next(iter(session.input_info))
  model_shape = session.input_info[input_blob].input_data.shape[2]
  tensor, img = image.load(image_path, model_shape, model_shape, tensor_type)
  output = session.infer(inputs={input_blob: tensor})

  predictions = np.squeeze(output['output0']).T

  scores = np.max(predictions[:, 4:], axis=1)
  predictions = predictions[scores > conf_threshold, :]

  scores = scores[scores > conf_threshold]
  class_ids = np.argmax(predictions[:, 4:], axis=1)
  boxes = predictions[:, :4]
  boxes = xywh2xyxy(boxes)
  indices = nms(xywh2xyxy(boxes), scores, nms_threshold)
  boxes = rescale_boxes(boxes, IMAGE_WIDTH, IMAGE_HEIGHT, model_shape, model_shape)
  print('detections: ', len(boxes[indices]))
  blur(img, image_path, boxes[indices], as_copy)
  inference_time = (time.perf_counter() - start) * 1000

  return list(zip(boxes[indices].tolist(), scores[indices].tolist(), class_ids[indices].tolist())), inference_time

def blur(img, image_name, boxes, as_copy):
  #Downscale & blur
  downscale_size = (int(img.shape[1] * 0.2), int(img.shape[0] * 0.2))
  img_downscaled = cv2.resize(img, downscale_size, interpolation=cv2.INTER_NEAREST)
  img_blurred = cv2.GaussianBlur(img_downscaled, (5, 5), 1.5)

  # # Upscale
  upscale_size = (img.shape[1], img.shape[0])
  img_upscaled = cv2.resize(img_blurred, upscale_size, interpolation=cv2.INTER_NEAREST)

  # Mask from bounding boxes
  mask = np.zeros((img.shape[0], img.shape[1]), dtype=np.uint8)

  for box in boxes:
    box = box.astype(int)
    # filter out large boxes and boxes on the hood
    if box[2] - box[0] > 0.8 * img.shape[1] and box[1] > 0.5 * img.shape[0]:
      continue
    cv2.rectangle(mask, (box[0], box[1]), (box[2], box[3]), 255, -1)

  # Composite
  composite_img = cv2.bitwise_and(img_upscaled, img_upscaled, mask=mask)
  mask_inv = cv2.bitwise_not(mask)
  img_unmasked = cv2.bitwise_and(img, img, mask=mask_inv)
  result = cv2.add(composite_img, img_unmasked)
  # result = draw(result, conf_threshold, boxes[indices], scores[indices], class_ids[indices], CLASS_NAMES)
  cv2.imwrite(image_name.rsplit('.', 1)[0] + '.jpeg' if as_copy else image_name, result, [int(cv2.IMWRITE_JPEG_QUALITY), 80])

  return result

def find_latest_jpg(directory):
    global blurred_images
    latest_file = None
    latest_time = 0

    with os.scandir(directory) as it:
        for entry in it:
            if entry.is_file() and entry.name.lower().endswith('.jpg') and entry.name != 'cam0pipe.jpg':
                file_ctime = entry.stat().st_ctime
                if file_ctime > latest_time:
                    latest_time = file_ctime
                    latest_file = entry.path

    if len(blurred_images) > 10:
      try: 
        file = blurred_images.popleft()
        os.remove(file)
        print('removed: ' + file)
      except Exception as e:
        print(e)
    return latest_file

def main(model_path, tensor_type, device, conf_threshold, nms_threshold):
  # Load 2 models: small and medium
  ie = IECore()

  # sm_path = model_path + '_sm.blob'
  # session_sm = ie.import_network(model_file=sm_path, device_name=device)
  # md_path = model_path + '_md.blob'
  # session_md = ie.import_network(model_file=md_path, device_name=device)

  # Read model hashes
  # model_hash_sm = ''
  # model_hash_path = sm_path = model_path + '_sm.hash'
  # with open(model_hash_path, 'r') as file:
  #   model_hash_sm = file.read().strip()

  # model_hash_md = ''
  # model_hash_path = model_path + '_md.hash'
  # with open(model_hash_path, 'r') as file:
  #   model_hash_md = file.read().strip()
  model_hash_md = ''
  session_md = None

  session_sm = ie.import_network(model_file=model_path, device_name=device)
  model_hash_sm = '6e12a935a195df151b7d47bff84220d860bc19b94b03b0c20a5a9182e3f4e9c1'

  currently_processing = set()

  # init watcher
  try:
    print('Starting watcher')

    while True:
      images = sqlite.get_frames_for_ml()
      for image in images:
        
        if image[0] not in currently_processing:
          currently_processing.add(image[0])
          is_optimised = True
          # is_optimised = image[2] > SPEED_THRESHOLD_FOR_OPTIMISED_MODEL
          try:
            detections, inference_time = detect(os.path.join(image[1], image[0]), session_sm if is_optimised else session_md, conf_threshold, nms_threshold, tensor_type)
            sqlite.set_frame_ml(image[0], model_hash_sm if is_optimised else model_hash_md, detections, inference_time)
          except Exception as e:
            sqlite.set_frame_ml(image[0], model_hash_sm if is_optimised else model_hash_md, [], None)
            print(f"Error processing frame {image[0]}. Error: {e}")
            if "RequestInference" in str(e):
              ie = IECore()
              session_sm = ie.import_network(model_file=model_path, device_name=device)
            try:
              sqlite.log_error(e)
            except Exception as e:
              print(f"Error logging error: {e}")
          finally:
            currently_processing.remove(image[0])

      try:
        latest_image = find_latest_jpg('/tmp/recording/pics')
        if latest_image:
          print(latest_image)
          detect(latest_image, session_sm, conf_threshold, nms_threshold, tensor_type, True)
          blurred_images.append(latest_image.rsplit('.', 1)[0] + '.jpeg')
      except Exception as e:
        print(f"Error finding latest image. Error: {e}")
        if "RequestInference" in str(e):
          ie = IECore()
          session_sm = ie.import_network(model_file=model_path, device_name=device)
        try:
          sqlite.log_error(e)
        except Exception as e:
          print(f"Error logging error: {e}")

      time.sleep(2 if len(images) == 0 else 0.1)

  except KeyboardInterrupt:
    print('Watcher stopped by user')
  except Exception as e:
    print(f"An error occurred: {e}")
    raise e

if __name__ == '__main__':
  parser = argparse.ArgumentParser()
  parser.add_argument('--model_path', type=str)
  parser.add_argument('--tensor_type', type=str, default='float16')
  parser.add_argument('--device', type=str, default='VPUX')
  parser.add_argument('--conf_threshold', type=float, default=0.4)
  parser.add_argument('--nms_threshold', type=float, default=0.9)

  args = parser.parse_args()

  main(
    args.model_path,
    args.tensor_type,
    args.device,
    args.conf_threshold,
    args.nms_threshold
  )
