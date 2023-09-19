import argparse
import cv2
import json
import numpy as np
import os
import queue
import threading
import shutil
import time
from yolov8.utils import nms, xywh2xyxy
from damoyolo.damoyolo_onnx import DAMOYOLO
from PIL import Image 
import psutil

DEFAULT_MODEL_PATH = 'todo'
CLASS_NAMES = ['face', 'person', 'license-plate', 'car', 'bus', 'truck', 'motorcycle', 'bicycle']

width = 2028
height = 1024

input_names = []
indexed_names = {}

def readImage(f, w, h): 
  im = Image.open(f).resize((w, h), Image.NEAREST)
  return np.asarray(im)

def combine_images(images, folder_path, grid_size):
  global read_time
  
  w = int(width / grid_size)
  h = int(height / grid_size)

  img = np.zeros((height, width, 3), dtype=np.uint8)

  coords = [(i * w, j * h) for j in range(grid_size) for i in range(grid_size)]
  read_time = 0  

  # Loop through each image and place it in the grid
  for i in range(grid_size * grid_size): 
    if i < len(images):  
      image_name = images[i]
      img_path = os.path.join(folder_path, image_name)
      start = time.perf_counter()
      orig_resized = readImage(img_path, w, h)
      orig_resized = cv2.cvtColor(orig_resized, cv2.COLOR_RGB2BGR)
      read_time += (time.perf_counter() - start) * 1000
    else:
      # Use an empty (black) image for spots without images
      orig_resized = np.zeros((h, w, 3), dtype=np.uint8)
    x, y = coords[i]
    img[y:y+h, x:x+w] = orig_resized

  return img

def transform_box(box, w_offset=0, h_offset=0, width=None, height=None, multiplier=2):
  # Apply transformations: scale, offset, round
  new_box = np.floor(np.array([
    (box[0] - w_offset) * multiplier,
    (box[1] - h_offset) * multiplier,
    (box[2] - w_offset) * multiplier,
    (box[3] - h_offset) * multiplier
  ])).astype(int)
  
  # Making sure all the box coordinates are within the boundaries
  if width is not None:
    new_box[::2] = np.clip(new_box[::2], 0, width)  # for x-coordinates
  if height is not None:
    new_box[1::2] = np.clip(new_box[1::2], 0, height)  # for y-coordinates
  
  return new_box

# 2x2, 3x3, 4x4
def determine_grid_dimension(num_images):
  if num_images <= 30:
    return 2
  elif num_images <= 70:
    return 3
  else:
    return 4

def determine_image_index(box, w, h, grid_size):
  x_index = int(box[0] // w)
  y_index = int(box[1] // h)
  return y_index * grid_size + x_index

def detect(folder_path, images, session_sm, session_md, conf_threshold, nms_threshold, grid_size):

  w2 = int(width/grid_size)
  h2 = int(height/grid_size)
  
  # combine images to grid & execute
  img = combine_images(images, folder_path, grid_size)

  # Execute smaller model over 2x2 grid, larger model over 3x3/4x4 grids
  session = grid_size == 2 and session_sm or session_md
  conf = grid_size == 4 and conf_threshold - 0.1 or conf_threshold

  boxes, scores, class_ids = session(img, nms_th=nms_threshold, score_th=conf)

  # Initialize empty output
  res_output = [[] for _ in range(grid_size*grid_size)]

  if len(scores) == 0:
      return res_output

  grouped_boxes = [[] for _ in range(grid_size*grid_size)]
  offsets = [(i * w2, j * h2) for j in range(grid_size) for i in range(grid_size)]

  # Split boxes between initial images
  for box, score, class_id in zip(boxes, scores, class_ids):
      image_index = determine_image_index(box, w2, h2, grid_size)

      w_offset, h_offset = offsets[image_index]
      box = transform_box(box, w_offset, h_offset, width, height, grid_size)

      grouped_boxes[image_index].append(box)
      res_output[image_index].append([CLASS_NAMES[class_id]] + list(box) + [score])

     
  # apply blur
  for i, image_name in enumerate(images):
    if len(grouped_boxes[i]) > 0:
      img_path = os.path.join(folder_path, image_name)
      orig = cv2.imread(img_path)
      result = blur(orig, grouped_boxes[i])
      result = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
      pil_img = Image.fromarray(result)
      pil_img.save(os.path.join(folder_path, image_name), quality=80)
      # cv2.imwrite(os.path.join(folder_path, image_name), result, [int(cv2.IMWRITE_JPEG_QUALITY), 80])

  return res_output 

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

def main(input_path, output_path, model_path, conf_threshold, nms_threshold, num_threads, grid_dimension):
  if not os.path.exists(model_path):
    # default model path
    model_path = '/opt/dashcam/bin/ml'

  session_sm = DAMOYOLO(
    os.path.join(model_path, 'pvc_sm.onnx'),
    providers=[
      'CPUExecutionProvider',
    ],
  )
  session_md = DAMOYOLO(
    os.path.join(model_path, 'pvc_md.onnx'),
    providers=[
      'CPUExecutionProvider',
    ],
  )

  q = queue.Queue()

  model_hash_sm = ''
  model_hash_path = os.path.join(model_path, 'pvc_sm.onnx.hash')

  if os.path.exists(model_hash_path):
      with open(model_hash_path, 'r') as file:
          model_hash_sm = file.read().strip()

  model_hash_md = ''
  model_hash_path = os.path.join(model_path, 'pvc_md.onnx.hash')

  if os.path.exists(model_hash_path):
      with open(model_hash_path, 'r') as file:
          model_hash_md = file.read().strip()

  metadata = {
    'hash': model_hash_sm,
    'name': '',
    'sample_count': 0,
    'detections': {},
  }

  folder_path = input_path

  def worker():
    global input_names, indexed_names
    while True:
      images = q.get()
      try:
        outputs = detect(folder_path, images, session_sm, session_md, conf_threshold, nms_threshold, grid_dimension)
        for i, image_name in enumerate(images):
          if len(outputs[i]):
            if image_name.find('ww') > 0:
              parts = image_name.split('ww')
              bundle_name = parts[0]
              if bundle_name not in metadata['detections']:
                metadata['detections'][bundle_name] = {}
              metadata['detections'][bundle_name][indexed_names[image_name]] = outputs[i]
            else:
              metadata['detections'][indexed_names[image_name]] = outputs[i]
          
      except Exception as e:
        print(f"Error processing frame {images[0]}. Error: {e}")
      q.task_done()

  # init threads
  for i in range(num_threads):
      threading.Thread(target=worker, daemon=True).start()

  # init folder watcher
  try:
    print('Starting watcher')
    in_process = False
    bundled = False
    seen_folders = set()

    if not os.path.exists(input_path):
      os.makedirs(input_path)

    while True:
      current_folders = {f for f in os.listdir(input_path) if f.startswith('km_')}
      new_folders = sorted(current_folders - seen_folders)

      if not in_process:  # Only process if not currently in process
          for folder in new_folders:
              global input_names, indexed_names
              print('Started processing folder:', folder)
              bundled = folder.endswith('_bundled')
              indexed_names = {}
              folder_path = os.path.join(input_path, folder)

              # once new folder discovered, push all the items in the queue
              in_process = True

              metadata['start'] = int(time.time()*1000)
              metadata['name'] = folder
              metadata['bundled'] = bundled
              metadata['detections'] = {}

              try:
                input_names = [f for f in sorted(os.listdir(folder_path)) if f.endswith('.jpg')]
                total_images = len(input_names)
                cur_bundle_name = ''
                cur_index = 0
                for f in input_names:
                  if bundled:
                    parts = f.split('ww')
                    bundle_name = parts[0]
                    if cur_bundle_name != bundle_name:
                      cur_bundle_name = bundle_name
                      metadata['detections'][bundle_name] = {}
                      cur_index = 0
                    indexed_names[f] = cur_index
                    cur_index += 1
                  else: 
                    indexed_names[f] = input_names.index(f)
                metadata['sample_count'] = total_images

                grid_dimension = determine_grid_dimension(total_images)
                grid_size = grid_dimension * grid_dimension
                print('Total images:', total_images)
                print('Grid size:', grid_size)
                model_hash = grid_dimension == 2 and model_hash_sm or model_hash_md
                metadata['grid_dimension'] = grid_dimension
                metadata['hash'] = model_hash

                i = 0
                while i < total_images:
                  subset = input_names[i:i+grid_size]

                  q.put(subset) 
                  i += grid_size

                q.join()


                if not os.path.exists(output_path):
                    os.makedirs(output_path)

                cpu = psutil.cpu_times()
                print('User CPU time', cpu.idle)
                mem = psutil.virtual_memory()
                print('Used memory', mem.used)
                swap = psutil.swap_memory()
                print('Used swap', swap.used) 
                
                metadata['end'] = int(time.time()*1000)
                metadata['cpu_idle'] = int(cpu.idle)
                metadata['ram_used'] = int(mem.used / 1024 / 1024)
                metadata['swap_used'] = int(swap.used / 1024 / 1024)
                total = int(metadata['end'] - metadata['start'])
                print('Took', total, 'msecs')

                if bundled:
                  submeta = metadata.copy()
                  for key in metadata['detections']:
                    d = metadata['detections'][key]
                    submeta['detections'] = d
                    with open(os.path.join(output_path, key + '.json'), 'w') as meta_file:
                      json.dump(submeta, meta_file, cls=NumpyEncoder)
                else: 
                  with open(os.path.join(output_path, folder + '.json'), 'w') as meta_file:
                    json.dump(metadata, meta_file, cls=NumpyEncoder)

              except Exception as e:
                print(f"Error processing folder {folder}. Error: {e}")

              try: 
                rename_to = os.path.join(input_path, 'ready_' + folder)
                if os.path.exists(rename_to):
                  shutil.rmtree(rename_to)
                os.rename(folder_path, rename_to)
              except Exception as e:
                print(f"Error renaming folder {folder}. Possible deleted by another process. Error: {e}")

              in_process = False  # Reset the flag once processing is done

      seen_folders.update(new_folders)
      time.sleep(2)
  except KeyboardInterrupt:
      print('Watcher stopped by user')
  except Exception as e:
      print(f"An error occurred: {e}")
      raise e
  
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.float32):
            return float(obj)
        elif isinstance(obj, np.int64):
          return int(obj)
        return json.JSONEncoder.default(self, obj)

if __name__ == '__main__':
  parser = argparse.ArgumentParser()
  parser.add_argument('--input_path', type=str)
  parser.add_argument('--output_path', type=str)
  parser.add_argument('--model_path', type=str, default=DEFAULT_MODEL_PATH)
  parser.add_argument('--conf_threshold', type=float, default=0.4)
  parser.add_argument('--nms_threshold', type=float, default=0.9)
  parser.add_argument('--num_threads', type=int, default=4)
  parser.add_argument('--grid_dimension', type=int, default=3)

  args = parser.parse_args()

  main(
    args.input_path,
    args.output_path,
    args.model_path,
    args.conf_threshold,
    args.nms_threshold,
    args.num_threads,
    args.grid_dimension,
  )
