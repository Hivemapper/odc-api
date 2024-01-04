import argparse
import cv2
import numpy as np
import os
import queue
import threading
import time
from yolov8.utils import nms, xywh2xyxy
import sqlite
import image
from openvino.inference_engine import IECore

SPEED_THRESHOLD_FOR_OPTIMISED_MODEL = 60 # miles per hour
IMAGE_WIDTH = 2028
IMAGE_HEIGHT = 1024

def rescale_boxes(boxes, img_width, img_height, model_width, model_height):
  # Rescale boxes to original image dimensions
  input_shape = np.array([model_width, model_height, model_width, model_height])
  boxes = np.divide(boxes, input_shape, dtype=np.float32)
  boxes *= np.array([img_width, img_height, img_width, img_height])
  return boxes

def detect(image_path, session, conf_threshold, nms_threshold, tensor_type):
  start = time.perf_counter()

  input_blob = next(iter(session.input_info))
  model_shape = session.input_info[input_blob].input_data.shape[2]
  tensor, img = image.load(image_path, model_shape, model_shape, tensor_type)
  output = session.infer(inputs={input_blob: tensor})

  predictions = np.squeeze(output['output0']).T
  scores = np.max(predictions[:, 4:], axis=1)
  predictions = predictions[scores > conf_threshold, :]
  class_ids = np.argmax(predictions[:, 4:], axis=1)
  boxes = predictions[:, :4]
  boxes = xywh2xyxy(boxes)
  indices = nms(xywh2xyxy(boxes), scores, nms_threshold)
  boxes = rescale_boxes(boxes, IMAGE_WIDTH, IMAGE_HEIGHT, model_shape, model_shape)
  blur(img, image_path, boxes, indices, scores, class_ids)
  inference_time += (time.perf_counter() - start) * 1000

  return list(zip(boxes[indices].tolist(), scores[indices].tolist(), class_ids[indices].tolist())), inference_time

def blur(img, boxes):
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

  return result

def main(model_path, tensor_type, device, conf_threshold, nms_threshold, num_threads):

  # Load 2 models: small and medium
  ie = IECore()
  session_sm = ie.import_network(model_file=os.path.join(model_path, '_sm.blob'), device_name=device)
  session_md = ie.import_network(model_file=os.path.join(model_path, '_md.blob'), device_name=device)

  q = queue.Queue()

  # Read model hashes
  model_hash_sm = ''
  model_hash_path = os.path.join(model_path, '_sm.hash')
  with open(model_hash_path, 'r') as file:
    model_hash_sm = file.read().strip()

  model_hash_md = ''
  model_hash_path = os.path.join(model_path, '_md.hash')
  with open(model_hash_path, 'r') as file:
    model_hash_md = file.read().strip()

  currently_processing = set()

  def worker():
    while True:
      image = q.get()
      is_optimised = getattr(image, 'speed', 0) > SPEED_THRESHOLD_FOR_OPTIMISED_MODEL
      try:
        detections, inference_time = detect(image, session_sm if is_optimised else session_md, conf_threshold, nms_threshold, tensor_type)
        sqlite.set_frame_ml(image, model_hash_sm if is_optimised else model_hash_md, detections, inference_time)
      except Exception as e:
        sqlite.set_frame_ml(image, model_hash_sm if is_optimised else model_hash_md, [], None)
        print(f"Error processing frame {image}. Error: {e}")
      finally:
        currently_processing.remove(image)
        q.task_done()

  # init threads
  for i in range(num_threads):
    threading.Thread(target=worker, daemon=True).start()

  # init watcher
  try:
    print('Starting watcher')

    while True:
      images = sqlite.get_frames_for_ml(num_threads)
      for image in images:
        if image not in currently_processing:
          currently_processing.add(image)
          q.put(image)
      q.join()
      time.sleep(2)

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
  parser.add_argument('--num_threads', type=int, default=4)

  args = parser.parse_args()

  main(
    args.model_path,
    args.tensor_type,
    args.device,
    args.conf_threshold,
    args.nms_threshold,
    args.num_threads
  )
