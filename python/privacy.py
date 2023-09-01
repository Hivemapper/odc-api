import argparse
import cv2
import json
import numpy as np
import onnxruntime
import os
import queue
import threading
from yolov8.utils import multiclass_nms

DEFAULT_MODEL_PATH = 'todo'

def load_img(image_path, width, height, tensor_type):
  dtype = None
  if tensor_type == 'float32':
    dtype = np.float32
  elif tensor_type == 'float16':
    dtype = np.float16

  img = cv2.imread(image_path)
  cv2.cvtColor(img, img, cv2.COLOR_BGR2RGB)
  cv2.resize(img, img, (width, height), cv2.INTER_NEAREST)

  img = img / 255.0
  img = img.transpose(2, 0, 1)
  tensor = img[np.newaxis, :, :, :].astype(dtype)

  return tensor

def detect(image_path, session, width, height, output_names, input_names, tensor_type, conf_threshold):
  tensor = load_img(image_path, width, height, tensor_type)
  outputs = session.run(output_names, {input_names[0]: tensor})
  predictions = np.squeeze(output[0]).T

  # Filter out object confidence scores below threshold
  scores = np.max(predictions[:, 4:], axis=1)
  predictions = predictions[scores > conf_threshold, :]
  scores = scores[scores > conf_threshold]

  if len(scores) == 0:
      return [], [], []

  # Get the class with the highest confidence
  class_ids = np.argmax(predictions[:, 4:], axis=1)

  # Apply non-maxima suppression to suppress weak, overlapping bounding boxes
  # indices = nms(boxes, scores, self.iou_threshold)
  indices = multiclass_nms(boxes, scores, class_ids, self.iou_threshold)

  return predictions[indices], scores[indices], class_ids[indices]  

def main(input_path, output_path, model_path, tensor_type, conf_threshold, num_threads):
  session = onnxruntime.InferenceSession(path, providers=onnxruntime.get_available_providers())
  inputs = session.get_inputs()
  outputs = session.get_outputs()

  height, width = inputs[0].shape[2:3]
  input_names = [i.name for i in inputs]
  output_names = [output.name for output in outputs]

  q = queue.Queue()
  predictions = {}

  def worker():
    while True:
      image_name = q.get()
      image_path = os.path.join(input_path, image_name)
      output = detect(image_path, session, width, height, output_names, input_names, tensor_type, conf_threshold)
      predictions[image_name] = output
      q.task_done()

  for i in range(num_threads):
      threading.Thread(target=worker, daemon=True).start()

  input_names = os.listdir(input_path)
  for name in input_names:
    q.put(name)

  q.join()

  with open(output_path, 'w') as f:
    json.dump(predictions)

if __name__ == '__main__':
  parser = argparse.ArgumentParser()
  parser.add_argument('--input_path', type=str)
  parser.add_argument('--output_path', type=str)
  parser.add_argument('--model_path', type=str, default=DEFAULT_MODEL_PATH)
  parser.add_argument('--tensor_type', type=str, default='float32')
  parser.add_argument('--conf_threshold', type=float, default=0.1)
  parser.add_argument('--num_threads', type=int, default=4)

  args = parser.parse_args()

  main(
    args.input_path,
    args.output_path,
    args.model_path,
    args.tensor_type,
    args.conf_threshold,
    args.num_threads,
  )
