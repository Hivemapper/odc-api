import argparse
import cv2
import json
import numpy as np
import onnxruntime
import os
import queue
import threading
import time
from yolov8.utils import nms, xywh2xyxy

DEFAULT_MODEL_PATH = 'todo'

def load_img(image_path, width, height, tensor_type):
  dtype = None
  if tensor_type == 'float32':
    dtype = np.float32
  elif tensor_type == 'float16':
    dtype = np.float16

  img = cv2.imread(image_path)
  img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
  #keep original image for blurring
  resized_img = cv2.resize(img, (width, height), cv2.INTER_NEAREST)

  resized_img = resized_img / 255.0
  resized_img = resized_img.transpose(2, 0, 1)
  tensor = resized_img[np.newaxis, :, :, :].astype(dtype)

  return tensor, img

def detect(image_path, session, width, height, output_names, input_names, tensor_type, conf_threshold, iou_threshold):
  tensor, img = load_img(image_path, width, height, tensor_type)
  start = time.perf_counter()
  outputs = session.run(output_names, {input_names[0]: tensor})
  inference_time = int((time.perf_counter() - start) * 1000)
  predictions = np.squeeze(outputs[0]).T

  # Filter out object confidence scores below threshold
  scores = np.max(predictions[:, 4:], axis=1)
  predictions = predictions[scores > conf_threshold, :]
  scores = scores[scores > conf_threshold]

  if len(scores) == 0:
      return [], [], []

  # Get the class with the highest confidence
  class_ids = np.argmax(predictions[:, 4:], axis=1)

  boxes = predictions[:, :4]
  boxes = rescale_boxes(boxes, img.shape[1], img.shape[0], width, height)
  boxes = xywh2xyxy(boxes)
  indices = nms(xywh2xyxy(boxes), scores, iou_threshold)
  blur_time = blur(img, image_path, boxes, indices)
  return list(zip(predictions[:, :4][indices].tolist(), scores[indices].tolist(), class_ids[indices].tolist())), inference_time, blur_time 

def blur(img, image_path, boxes, indices):
  start = time.perf_counter()
  #Downscale & blur
  downscale_size = (int(img.shape[1] * 0.2), int(img.shape[0] * 0.2))
  img_downscaled = cv2.resize(img, downscale_size, interpolation=cv2.INTER_AREA)
  img_blurred = cv2.GaussianBlur(img_downscaled, (5, 5), 1.5)

  # Upscale
  upscale_size = (img.shape[1], img.shape[0])
  img_upscaled = cv2.resize(img_blurred, upscale_size, interpolation=cv2.INTER_LINEAR)

  # Mask from bounding boxes
  mask = np.zeros((img.shape[0], img.shape[1]), dtype=np.uint8)
  for i in indices:
      box = boxes[i].astype(int)
      cv2.rectangle(mask, (box[0], box[1]), (box[2], box[3]), 255, -1)

  # Composite
  composite_img = cv2.bitwise_and(img_upscaled, img_upscaled, mask=mask)
  mask_inv = cv2.bitwise_not(mask)
  img_unmasked = cv2.bitwise_and(img, img, mask=mask_inv)

  # Save
  result = cv2.add(composite_img, img_unmasked)
  result = cv2.cvtColor(result, cv2.COLOR_RGB2BGR)
  cv2.imwrite(image_path, result)
  return int((time.perf_counter() - start) * 1000)

def rescale_boxes(boxes, img_width, img_height, model_width, model_height):
    # Rescale boxes to original image dimensions
    input_shape = np.array([model_width, model_height, model_width, model_height])
    boxes = np.divide(boxes, input_shape, dtype=np.float32)
    boxes *= np.array([img_width, img_height, img_width, img_height])
    return boxes

def main(input_path, output_path, model_path, tensor_type, conf_threshold, iou_threshold, num_threads):
  session = onnxruntime.InferenceSession(model_path, providers=onnxruntime.get_available_providers())
  inputs = session.get_inputs()
  outputs = session.get_outputs()

  height, width = inputs[0].shape[2:4]
  model_input_names = [i.name for i in inputs]

  output_names = [output.name for output in outputs]

  q = queue.Queue()
  predictions = {}

  def worker():
    global current_image_index, expected_image_index
    while True:
      
      image_name = q.get()
      image_path = os.path.join(input_path, image_name)
      output = detect(image_path, session, width, height, output_names, model_input_names, tensor_type, conf_threshold, iou_threshold)

      predictions[image_name] = output
      q.task_done()

  for i in range(num_threads):
      threading.Thread(target=worker, daemon=True).start()

  input_names = sorted(os.listdir(input_path))
  for name in input_names:
    q.put(name)

  q.join()

  with open(output_path, 'w') as f:
    json.dump(predictions, f)

if __name__ == '__main__':
  parser = argparse.ArgumentParser()
  parser.add_argument('--input_path', type=str)
  parser.add_argument('--output_path', type=str)
  parser.add_argument('--model_path', type=str, default=DEFAULT_MODEL_PATH)
  parser.add_argument('--tensor_type', type=str, default='float32')
  parser.add_argument('--conf_threshold', type=float, default=0.5)
  parser.add_argument('--iou_threshold', type=float, default=0.5)
  parser.add_argument('--num_threads', type=int, default=4)

  args = parser.parse_args()

  main(
    args.input_path,
    args.output_path,
    args.model_path,
    args.tensor_type,
    args.conf_threshold,
    args.iou_threshold,
    args.num_threads,
  )
