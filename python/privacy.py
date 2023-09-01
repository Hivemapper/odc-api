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

current_image_index = 0
expected_image_index = 0
write_lock = threading.Lock()
index_lock = threading.Lock()

DEFAULT_MODEL_PATH = 'todo'

def load_img(image_path, width, height, tensor_type):
  dtype = None
  if tensor_type == 'float32':
    dtype = np.float32
  elif tensor_type == 'float16':
    dtype = np.float16

  img = cv2.imread(image_path)
  img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
  img = cv2.resize(img, (width, height), cv2.INTER_NEAREST)

  img = img / 255.0
  img = img.transpose(2, 0, 1)
  tensor = img[np.newaxis, :, :, :].astype(dtype)

  return tensor

def detect(image_path, session, width, height, output_names, input_names, tensor_type, conf_threshold, iou_threshold):
  tensor = load_img(image_path, width, height, tensor_type)
  outputs = session.run(output_names, {input_names[0]: tensor})
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
  boxes = xywh2xyxy(boxes)
  # Apply non-maxima suppression to suppress weak, overlapping bounding boxes
  # indices = nms(boxes, scores, self.iou_threshold)
  indices = nms(xywh2xyxy(boxes), scores, iou_threshold)
  # print(predictions)
  # print(boxes.tolist())

  return list(zip(predictions[:, :4][indices].tolist(), scores[indices].tolist(), class_ids[indices].tolist()))  

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

      with index_lock:
        my_index = current_image_index
        current_image_index += 1
      
      while my_index != expected_image_index:
          time.sleep(0.01)

      with write_lock:
          with open('test', 'ab') as f:
              # write image into final framekm file in order
              # f.write(image_data)
          
          expected_image_index += 1

      predictions[image_name] = output
      q.task_done()

  for i in range(num_threads):
      threading.Thread(target=worker, daemon=True).start()

  input_names = os.listdir(input_path)
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
