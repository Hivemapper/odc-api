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
from datetime import datetime
import gc
# from pympler.asizeof import asizeof
# import tracemalloc
# import yappi

DEFAULT_MODEL_PATH = 'todo'
CLASS_NAMES = ['face', 'person', 'license-plate', 'car', 'bus', 'truck', 'motorcycle', 'bicycle']

width = 2028
height = 1024

input_names = []
indexed_names = {}

total_samples = 0
read_time = 0
blurred_samples = 0
downscale_time = 0
blurring_time = 0
upscale_time = 0
combine_time = 0
inference_time = 0
mask_time = 0
composite_time = 0
save_time = 0
detections = 0

def readImage(f, w, h): 
    with Image.open(f) as im:
        arr = np.asarray(im.resize((w, h), Image.NEAREST))
    return arr

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
  
def extract_unix_timestamp_from_folder(folder_name):
  try:
    # Extract datetime string from folder name
    datetime_str = folder_name.split('_')[1:3]
    datetime_str = ''.join(datetime_str)

    # Convert to datetime object
    dt_obj = datetime.strptime(datetime_str, '%Y%m%d%H%M%S')

    # Compute the unix timestamp
    timestamp = int(dt_obj.timestamp())

    return timestamp
  except Exception as e:
    print(f"Error extracting timestamp from folder name {folder_name}: {e}")
    return None

def determine_image_index(box, w, h, grid_size):
  x_index = int(box[0] // w)
  y_index = int(box[1] // h)
  return y_index * grid_size + x_index

def detect(folder_path, images, session_sm, session_md, conf_threshold, nms_threshold, grid_size):
  global total_samples, blurred_samples, inference_time, combine_time, save_time

  w2 = int(width/grid_size)
  h2 = int(height/grid_size)
  
  # combine images to grid & execute
  start = time.perf_counter()
  img = combine_images(images, folder_path, grid_size)
  combine_time += (time.perf_counter() - start) * 1000
  start = time.perf_counter()
  # Execute smaller model over 2x2 grid, larger model over 3x3/4x4 grids
  session = session_sm
  conf = grid_size == 2 and conf_threshold or conf_threshold - 0.1

  boxes, scores, class_ids = session(img, nms_th=nms_threshold, score_th=conf)
  inference_time += (time.perf_counter() - start) * 1000

  # Draw the grid to debug
  # draw_img = session.draw(
  #       img,
  #       conf_threshold,
  #       boxes,
  #       scores,
  #       class_ids,
  #       CLASS_NAMES,
  #       thickness=3,
  #   )
  # cv2.imwrite(os.path.join(folder_path, 'combined_' + images[0]), draw_img)

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
      blurred_samples += 1
      img_path = os.path.join(folder_path, image_name)
      orig = cv2.imread(img_path)
      result = blur(orig, grouped_boxes[i])
      start = time.perf_counter()
      result = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
      pil_img = Image.fromarray(result)
      pil_img.save(os.path.join(folder_path, image_name), quality=80)
      # cv2.imwrite(os.path.join(folder_path, image_name), result, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
      save_time += (time.perf_counter() - start) * 1000

  return res_output 

def blur(img, boxes):
  global downscale_time, upscale_time, blurring_time, mask_time, composite_time
  #Downscale & blur
  downscale_size = (int(img.shape[1] * 0.2), int(img.shape[0] * 0.2))
  start = time.perf_counter()
  img_downscaled = cv2.resize(img, downscale_size, interpolation=cv2.INTER_NEAREST)
  downscale_time += (time.perf_counter() - start) * 1000
  start = time.perf_counter()
  img_blurred = cv2.GaussianBlur(img_downscaled, (5, 5), 1.5)
  blurring_time += (time.perf_counter() - start) * 1000

  # # Upscale
  upscale_size = (img.shape[1], img.shape[0])
  start = time.perf_counter()
  img_upscaled = cv2.resize(img_blurred, upscale_size, interpolation=cv2.INTER_NEAREST)
  upscale_time += (time.perf_counter() - start) * 1000

  # Mask from bounding boxes
  start = time.perf_counter()
  mask = np.zeros((img.shape[0], img.shape[1]), dtype=np.uint8)
  for box in boxes:
    box = box.astype(int)
    # filter out large boxes and boxes on the hood
    if box[2] - box[0] > 0.8 * img.shape[1] and box[1] > 0.5 * img.shape[0]:
      continue
    cv2.rectangle(mask, (box[0], box[1]), (box[2], box[3]), 255, -1)
  mask_time += (time.perf_counter() - start) * 1000

  # Composite
  start = time.perf_counter()
  composite_img = cv2.bitwise_and(img_upscaled, img_upscaled, mask=mask)
  mask_inv = cv2.bitwise_not(mask)
  img_unmasked = cv2.bitwise_and(img, img, mask=mask_inv)
  result = cv2.add(composite_img, img_unmasked)
  composite_time += (time.perf_counter() - start) * 1000

  return result

def main(input_path, output_path, model_path, conf_threshold, nms_threshold, num_threads, grid_dimension):
  global detections
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
    'inference_time': 0,
    'blurring_time': 0,
    'sample_count': 0,
    'detections': {},
  }

  folder_path = input_path

  def worker():
    global input_names, detections, indexed_names
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
            detections += len(outputs[i])
          
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

    # tracemalloc.start()
    # snapshot1 = tracemalloc.take_snapshot()

    while True:
      current_folders = {f for f in os.listdir(input_path) if f.startswith('km_')}
      new_folders = sorted(current_folders - seen_folders)

      if not in_process:  # Only process if not currently in process
          for folder in new_folders:
              global blurring_time, read_time, total_samples, blurred_samples, blurring_time, combine_time, input_names, indexed_names, composite_time, save_time, inference_time, downscale_time, upscale_time, mask_time, detections
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
              total_samples = 0
              blurred_samples = 0

              combine_time = 0
              read_time = 0
              inference_time = 0
              blurring_time = 0
              downscale_time = 0
              upscale_time = 0
              mask_time = 0
              composite_time = 0
              save_time = 0
              detections = 0

              # yappi.set_clock_type('cpu')
              # yappi.start(builtins=True)

              # Start tracing memory
              # tracemalloc.start()
              
              # # Initial snapshot
              # start_snapshot = tracemalloc.take_snapshot()
              
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
                # model_hash = grid_dimension == 2 and model_hash_sm or model_hash_md
                model_hash = model_hash_sm
                metadata['grid_dimension'] = grid_dimension
                metadata['hash'] = model_hash

                i = 0
                while i < total_images:
                  subset = input_names[i:i+grid_size]

                  q.put(subset) 
                  i += grid_size

                q.join()

                # yappi.stop()

                # threads = yappi.get_thread_stats()
                # for thread in threads:
                #   print(
                #       "Function stats for (%s) (%d)" % (thread.name, thread.id)
                #   )  # it is the Thread.__class__.__name__
                #   stats = yappi.get_func_stats(ctx_id=thread.id)
                #   stats.save('callgrind.filename.prof', type='callgrind')

                            
                # Snapshot after detect function has run
                # end_snapshot = tracemalloc.take_snapshot()

                # # Compare the two snapshots
                # top_stats = end_snapshot.compare_to(start_snapshot, 'lineno')

                # # Let's print top 5 memory consuming lines
                # print("[ Top 5 differences ]")
                # for stat in top_stats[:5]:
                #     print(stat)

                # # Stop tracing
                # tracemalloc.stop()

                if not os.path.exists(output_path):
                    os.makedirs(output_path)

                cpu = psutil.cpu_times()
                mem = psutil.virtual_memory()
                swap = psutil.swap_memory()
                disk_usage = psutil.disk_usage(os.path.dirname(input_path))
                
                metadata['end'] = int(time.time()*1000)
                metadata['cpu_idle'] = int(cpu.idle)
                metadata['ram_used'] = int(mem.used / 1024 / 1024)
                metadata['swap_used'] = int(swap.used / 1024 / 1024)
                metadata['disk_used'] = int(disk_usage.used / 1024 / 1024)
                metadata['num_detections'] = detections
                
                # Get the folder creation time
                creation_time = os.path.getctime(folder_path)
                current_timestamp = datetime.utcnow().timestamp()
                processing_delay = int(current_timestamp - creation_time)

                # let's make sure there's no mess with the time 
                # for example if folder was created earlier than system time was set
                if (processing_delay > 0 and processing_delay < 60 * 60 * 24 * 30):
                  metadata['processing_delay'] = processing_delay
                
                print('Detections', detections)
                total = int(metadata['end'] - metadata['start'])
                total_samples = len(input_names)
                metadata['duration'] = total
                print('Took', total, 'msecs')

                # current_process = psutil.Process(os.getpid())
                # print("Current memory usage:", current_process.memory_info().rss)
                # print('---MEM TRACE----')
                # snapshot2 = tracemalloc.take_snapshot()
                # top_stats = snapshot2.compare_to(snapshot1, 'lineno')
                # for stat in top_stats[:10]:  # print top 10 memory consuming line numbers
                #     print(stat)
                # print('---GARBAGE----')
                # print(gc.garbage)
                # print('--------------')
                # for name, size in sorted(((name, asizeof(value)) for name, value in globals().items()), key= lambda x: -x[1])[:10]:  # top 10 biggest variables
                #   print(f"Variable: {name}, Size: {size} bytes")
                all = combine_time + inference_time + downscale_time + upscale_time + blurring_time + mask_time + composite_time + save_time
                coef = 1
                if all > 0:
                  coef = total / all

                # per frame metrics
                if total_samples > 0:
                  coef_all = coef / total_samples
                  metadata['per_frame'] = int(total / len(input_names))
                  metadata['read_time'] = int(read_time * coef_all)
                  metadata['combine_time'] = int((combine_time - read_time) * coef_all)
                  metadata['inference_time'] = int(inference_time * coef_all)
                  print('Inference time', metadata['inference_time'])

                # blurred frames metrics
                if blurred_samples > 0:
                  coef_blurred = coef / blurred_samples
                  metadata['blurred_count'] = blurred_samples
                  metadata['downscale_time'] = int(downscale_time * coef_blurred)
                  metadata['blurring_time'] = int(blurring_time * coef_blurred)
                  metadata['upscale_time'] = int(upscale_time * coef_blurred)
                  metadata['mask_time'] = int(mask_time * coef_blurred)
                  metadata['composite_time'] = int(composite_time * coef_blurred)
                  metadata['save_time'] = int(save_time * coef_blurred)

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

              gc.collect()
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
