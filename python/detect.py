import argparse
import cv2
import numpy as np
import os
import queue
import threading
from collections import deque
import time
from yolov8.utils import nms, xywh2xyxy
from sqlite import SQLite
import image
from openvino.inference_engine import IECore

SPEED_THRESHOLD_FOR_OPTIMISED_MODEL = 60 # miles per hour
IMAGE_WIDTH = 2028
IMAGE_HEIGHT = 1024
IMAGE_SIZE_PX = IMAGE_WIDTH * IMAGE_HEIGHT

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

def detect(image_name, image_path, session, model_shape, input_blob, conf_threshold, nms_threshold, tensor_type):
    metrics = {}

    # Read and preprocess the image
    start_read = time.perf_counter()
    read_path = image.get_path(image_name, image_path)
    tensor, img, metrics = image.load(read_path, model_shape, model_shape, tensor_type, metrics)
    metrics['load_time'] = (time.perf_counter() - start_read) * 1000

    # Inference
    start_inference = time.perf_counter()
    output = session.infer(inputs={input_blob: tensor})
    metrics['inference_time'] = (time.perf_counter() - start_inference) * 1000

    # Post-processing and NMS
    predictions = np.squeeze(output['output0']).T
    scores = np.max(predictions[:, 4:], axis=1)
    predictions = predictions[scores > conf_threshold, :]
    scores = scores[scores > conf_threshold]
    class_ids = np.argmax(predictions[:, 4:], axis=1)
    boxes = predictions[:, :4]
    boxes = xywh2xyxy(boxes)
    indices = nms(xywh2xyxy(boxes), scores, nms_threshold)
    boxes = rescale_boxes(boxes[indices], IMAGE_WIDTH, IMAGE_HEIGHT, model_shape, model_shape)
    print('detections: ', len(boxes))

    # Blur
    start_blur = time.perf_counter()
    if len(boxes) > 0:
      img, metrics = blur(img, boxes, metrics)
    metrics['blur_time'] = (time.perf_counter() - start_blur) * 1000

    # Write image
    start_write = time.perf_counter()
    save_path = os.path.join(image_path, image_name)
    cv2.imwrite(save_path, img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    metrics['write_time'] = (time.perf_counter() - start_write) * 1000

    # Return detections and metrics
    detections = list(zip(boxes.tolist(), scores[indices].tolist(), class_ids[indices].tolist()))
    return detections, metrics

def blur(img, boxes, metrics):
  blur_per_boxes = False
  if len(boxes) < 30:
    #calc box sizes to determine the optimal blur strategy
    total_box_size = sum((box[2] - box[0]) * (box[3] - box[1]) for box in boxes)
    if total_box_size < 0.5 * IMAGE_SIZE_PX:
      blur_per_boxes = True

  if blur_per_boxes:
    for box in boxes:
      box = box.astype(int)
      # filter out large boxes and boxes on the hood
      if box[2] - box[0] > 0.8 * img.shape[1] and box[1] > 0.5 * img.shape[0]:
        continue
      roi = img[box[1]:box[3], box[0]:box[2]]
      #downscale
      small_roi = cv2.resize(roi, (int(roi.shape[1] * 0.2), int(roi.shape[0] * 0.2)), interpolation=cv2.INTER_NEAREST)
      #blur
      blurred_small_roi = cv2.GaussianBlur(small_roi, (5, 5), 1.5)
      #upscale
      blurred_roi = cv2.resize(blurred_small_roi, (roi.shape[1], roi.shape[0]), interpolation=cv2.INTER_NEAREST)
      #apply
      img[box[1]:box[3], box[0]:box[2]] = blurred_roi

    return img, metrics
  else:
    #Downscale & blur
    start = time.perf_counter()
    downscale_size = (int(img.shape[1] * 0.2), int(img.shape[0] * 0.2))
    img_downscaled = cv2.resize(img, downscale_size, interpolation=cv2.INTER_NEAREST)
    img_blurred = cv2.GaussianBlur(img_downscaled, (5, 5), 1.5)
    metrics['downscale_time'] = (time.perf_counter() - start) * 1000

    # Upscale
    start = time.perf_counter()
    upscale_size = (img.shape[1], img.shape[0])
    img_upscaled = cv2.resize(img_blurred, upscale_size, interpolation=cv2.INTER_NEAREST)
    metrics['upscale_time'] = (time.perf_counter() - start) * 1000

    # Mask from bounding boxes
    start = time.perf_counter()
    mask = np.zeros((img.shape[0], img.shape[1]), dtype=np.uint8)

    for box in boxes:
      box = box.astype(int)
      # filter out large boxes and boxes on the hood
      if box[2] - box[0] > 0.8 * img.shape[1] and box[1] > 0.5 * img.shape[0]:
        continue
      cv2.rectangle(mask, (box[0], box[1]), (box[2], box[3]), 255, -1)

    metrics['mask_time'] = (time.perf_counter() - start) * 1000

    # Composite
    start = time.perf_counter()
    composite_img = cv2.bitwise_and(img_upscaled, img_upscaled, mask=mask)
    mask_inv = cv2.bitwise_not(mask)
    img_unmasked = cv2.bitwise_and(img, img, mask=mask_inv)
    result = cv2.add(composite_img, img_unmasked)
    metrics['composite_time'] = (time.perf_counter() - start) * 1000

    return result, metrics

def main(model_path, tensor_type, device, conf_threshold, nms_threshold, num_threads):

  currently_processing = set()
  q = queue.Queue()
  sqlite = SQLite()

  def worker():
    ie = IECore()
    session_sm = ie.import_network(model_file=model_path, device_name=device)
    model_hash_sm = '9d7e463c3288f3caadb0c2709238cc2b62433c1d100138fdd8ab12131d6ffa8e'
    input_blob = next(iter(session_sm.input_info))
    model_shape = session_sm.input_info[input_blob].input_data.shape[2]
    errors_counter = 0

    while True:
      image = q.get()

      try:
        # to switch between two models depending on speed, temporarily disabled
        # is_optimised = image[1] > SPEED_THRESHOLD_FOR_OPTIMISED_MODEL
        # session = session_sm if is_optimised else session_md
        detections, metrics = detect(image[0], image[1], session_sm, model_shape, input_blob, conf_threshold, nms_threshold, tensor_type)
        sqlite.set_frame_ml(image[0], model_hash_sm, detections, metrics)
      except Exception as e:

        errors_counter += 1
        if errors_counter > 10:
          errors_counter = 0
          sqlite.set_service_status('failed')

        sqlite.set_frame_ml(image[0], model_hash_sm, [], {})
        print(f"Error processing frame {image[0]}. Error: {e}")
        try: 
          if "VpualCoreNNExecutor" in str(e) or "NnXlinkPlg" in str(e):
            ie = IECore()
            session_sm = ie.import_network(model_file=model_path, device_name=device)
        except Exception as err:
           sqlite.set_service_status('failed')

        try:
          sqlite.log_error(e)
        except Exception as e:
          print(f"Error logging error: {e}")
      finally:
        currently_processing.remove(image[0])
        
      q.task_done()

  # init threads
  for i in range(num_threads):
    threading.Thread(target=worker, daemon=True).start()

  # init watcher
  try:
    print('Starting watcher')
    sqlite.set_service_status('healthy')

    while True:
      # start_process = time.perf_counter()
      images = sqlite.get_frames_for_ml(num_threads)
      for image in images:
        print(image)
        if image[0] not in currently_processing:
          currently_processing.add(image[0])
          q.put(image)
      q.join()

      if len(currently_processing) > 0:
        sqlite.set_service_status('failed')

      time.sleep(3 if len(images) == 0 else 0.1)

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
