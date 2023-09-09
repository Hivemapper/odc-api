import argparse
import cv2
import json
import numpy as np
import os
import queue
import threading
import time
from yolov8.utils import nms, xywh2xyxy
from damoyolo.damoyolo_onnx import DAMOYOLO

DEFAULT_MODEL_PATH = 'todo'
CLASS_NAMES = ['face', 'person', 'license-plate', 'car', 'bus', 'truck', 'motorcycle', 'bicycle']

width = 2028
height = 1024
w2 = int(width/2)
h2 = int(height/2)

input_names = []

def combine_images(images, folder_path):
  img = np.zeros((height, width, 3), dtype=np.uint8)

  coords = [(0, 0), (w2, 0), (0, h2), (w2, h2)]

  for i, image_name in enumerate(images):
      img_path = os.path.join(folder_path, image_name)
      orig = cv2.imread(img_path)
      orig_resized = cv2.resize(orig, (w2, h2))
      x, y = coords[i]
      img[y:y+h2, x:x+w2] = orig_resized

  return img

def detect(folder_path, images, session, conf_threshold, nms_threshold):

  # combine images to 2x2 grid & execute
  img = combine_images(images, folder_path)
  boxes, scores, class_ids = session(img, nms_th=nms_threshold, score_th=conf_threshold)

  res_output = [[], [], [], []]
  if len(scores) == 0:
      return res_output

  grouped_boxes = [[], [], [], []]

  # split boxes between initial images
  for box, score, class_id in zip(boxes, scores, class_ids):
    image_index = 0
    if box[0] < w2 and box[1] < h2:
      box = np.array([box[0]*2, box[1]*2, box[2]*2, box[3]*2])
    elif box[0] >= w2 and box[1] < h2:
      box = np.array([(box[0] - w2)*2, box[1]*2, (box[2] - w2)*2, box[3]*2])
      image_index = 1
    elif box[0] < w2 and box[1] >= h2:
      box = np.array([box[0]*2, (box[1] - h2)*2, box[2]*2, (box[3] - h2)*2])
      image_index = 2
    else:
      box = np.array([(box[0] - w2)*2, (box[1] - h2)*2, (box[2] - w2)*2, (box[3] - h2)*2])
      image_index = 3
    grouped_boxes[image_index].append(box)
    res_output[image_index].append([CLASS_NAMES[class_id]] + list(box) + [score])
     
  # apply blur
  for i, image_name in enumerate(images):
    if len(grouped_boxes[i]) > 0:
      img_path = os.path.join(folder_path, image_name)
      orig = cv2.imread(img_path)
      result = blur(orig, grouped_boxes[i])
      cv2.imwrite(os.path.join(folder_path, image_name), result, [int(cv2.IMWRITE_JPEG_QUALITY), 80])

  return res_output 

def blur(img, boxes):
  #Downscale & blur
  downscale_size = (int(img.shape[1] * 0.2), int(img.shape[0] * 0.2))
  img_downscaled = cv2.resize(img, downscale_size, interpolation=cv2.INTER_AREA)
  img_blurred = cv2.GaussianBlur(img_downscaled, (5, 5), 1.5)

  # # Upscale
  upscale_size = (img.shape[1], img.shape[0])
  img_upscaled = cv2.resize(img_blurred, upscale_size, interpolation=cv2.INTER_LINEAR)

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

  # Save
  result = cv2.add(composite_img, img_unmasked)

  return result

def main(input_path, output_path, model_path, conf_threshold, nms_threshold, num_threads):
  if not os.path.exists(model_path):
    # default model path
    model_path = '/opt/dashcam/bin/ml/pvc.onnx'
  session = DAMOYOLO(
        model_path,
        providers=[
            'CPUExecutionProvider',
        ],
    )

  q = queue.Queue()

  model_hash = ''
  model_hash_path = model_path + '.hash'

  if os.path.exists(model_hash_path):
      with open(model_hash_path, 'r') as file:
          model_hash = file.read().strip()

  metadata = {
    'hash': model_hash,
    'inference_time': 0,
    'blurring_time': 0,
    'sample_count': 0,
    'detections': {},
  }

  folder_path = input_path

  def worker():
    global input_names
    while True:
      images = q.get()
      try:
        outputs = detect(folder_path, images, session, conf_threshold, nms_threshold)
        for i, image_name in enumerate(images):
          if len(outputs[i]):
            metadata['detections'][input_names.index(image_name)] = outputs[i]
          
      except Exception as e:
        print(f"Error processing frame {image_name}. Error: {e}")
      q.task_done()

  # init threads
  for i in range(num_threads):
      threading.Thread(target=worker, daemon=True).start()

  # init folder watcher
  try:
    print('Starting watcher')
    in_process = False
    seen_folders = set()

    if not os.path.exists(input_path):
      os.makedirs(input_path)

    while True:
      current_folders = {f for f in os.listdir(input_path) if f.startswith('km_')}
      new_folders = sorted(current_folders - seen_folders)

      if not in_process:  # Only process if not currently in process
          for folder in new_folders:
              global blurring_time, sample_count, input_names, composite_time, saving_time, inference_time
              print('Started processing folder:', folder)
              folder_path = os.path.join(input_path, folder)
              # once new folder discovered, push all the items in the queue
              in_process = True

              metadata['start'] = int(time.time()*1000)
              metadata['detections'] = {}

              try:
                input_names = [f for f in sorted(os.listdir(folder_path)) if f.endswith('.jpg')]
                metadata['sample_count'] = len(input_names)

                i = 0
                while i < len(input_names):
                  subset = input_names[i:i+4]

                  # hack for full 2x2 grid. Better do black instead
                  while (len(subset) < 4):
                     subset.append(input_names[i])

                  q.put(subset) 
                  i += 4

                q.join()

                if not os.path.exists(output_path):
                    os.makedirs(output_path)
                
                metadata['end'] = int(time.time()*1000)
                metadata['inference_time'] = int((metadata['end'] - metadata['start']) / len(input_names))
                print('Took', int(metadata['inference_time']), 'msecs')

                with open(os.path.join(output_path, folder + '.json'), 'w') as f:
                  json.dump(metadata, f, cls=NumpyEncoder)
                os.rename(folder_path, os.path.join(input_path, 'ready_' + folder))

              except Exception as e:
                print(f"Error processing folder {folder_path}. Error: {e}")
              in_process = False  # Reset the flag once processing is done

      seen_folders.update(new_folders)
      time.sleep(3)
  except KeyboardInterrupt:
      print('Watcher stopped by user')
  except Exception as e:
      print(f"An error occurred: {e}")
      raise e
  
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.float32):
            return float(obj)
        return json.JSONEncoder.default(self, obj)

if __name__ == '__main__':
  parser = argparse.ArgumentParser()
  parser.add_argument('--input_path', type=str)
  parser.add_argument('--output_path', type=str)
  parser.add_argument('--model_path', type=str, default=DEFAULT_MODEL_PATH)
  parser.add_argument('--conf_threshold', type=float, default=0.4)
  parser.add_argument('--nms_threshold', type=float, default=0.9)
  parser.add_argument('--num_threads', type=int, default=4)

  args = parser.parse_args()

  main(
    args.input_path,
    args.output_path,
    args.model_path,
    args.conf_threshold,
    args.nms_threshold,
    args.num_threads,
  )
