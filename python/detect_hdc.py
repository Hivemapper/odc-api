import argparse
import cv2
import numpy as np
import os
import queue
import threading
import time
from sqlite import SQLite
import image
from PIL import Image 
from tflite_runtime import interpreter

width = 2028
height = 1024
image_size_px = width * height

def xywh2xyxy(boxes):
  x, y, w, h = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]

  x_min = (x - w / 2) * width
  y_min = (y - h / 2) * height
  x_max = (x + w / 2) * width
  y_max = (y + h / 2) * height
  return np.stack([x_min, y_min, x_max, y_max], axis=1).astype(np.float32)

def combine_images(images, grid_size, model_size):
    # Size of each cell in the grid
    cell_width = model_size // grid_size
    cell_height = model_size // grid_size

    # Initialize a blank grid
    combined_img = np.zeros((model_size, model_size, 3), dtype=np.float32)
    total_cells = grid_size * grid_size
    orig_images = []

    for i in range(total_cells):
        # Calculate grid cell position
        x_offset = (i % grid_size) * cell_width
        y_offset = (i // grid_size) * cell_height

        if i < len(images):
            # If there's an image to put in the cell
            img_path = image.get_path(images[i][0], images[i][1], "/tmp/recording/pic")

            # Read and resize image to fit in the grid cell
            img = cv2.imread(img_path)
            orig_images.append(img)
            resized_img = image.letterbox(img, (cell_width, cell_height))[0]
        else:
            # Use an empty (black) image for spots without images
            resized_img = np.zeros((cell_height, cell_width, 3), dtype=np.int8)

        # Place resized image or empty cell in the grid
        combined_img[y_offset:y_offset + cell_height, x_offset:x_offset + cell_width] = resized_img

    combined_img = combined_img.astype(np.float32) / 255.0
    # Ensure that the combined image has the batch dimension
    combined_img = combined_img[np.newaxis, ...]

    return combined_img, orig_images

def transform_box(box, w_offset=0, h_offset=0, multiplier=2):
  ratio = width / height
  padding = (width - height) / 2 
  new_box = np.floor(np.array([
    (box[0] - w_offset) * multiplier,
    (box[1] - h_offset) * multiplier * ratio - padding,
    (box[2] - w_offset) * multiplier,
    (box[3] - h_offset) * multiplier * ratio - padding
  ])).astype(int)
  
  # Making sure all the box coordinates are within the boundaries
  if width is not None:
    new_box[::2] = np.clip(new_box[::2], 0, width)  # for x-coordinates
  if height is not None:
    new_box[1::2] = np.clip(new_box[1::2], 0, height)  # for y-coordinates
  return new_box

def determine_image_index(box, w, h, grid_size):
  x_index = int(box[0] // w)
  y_index = int(box[1] // h)
  return y_index * grid_size + x_index

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

def detect(images, model, input_details, output_details, conf_threshold, nms_threshold, sqlite, model_hash):
    metrics = {}
    #map images to set
    unprocessed_images = set(image[0] for image in images)

    try:
      # Read and preprocess the image
      start_read = time.perf_counter()
      grid_size = 3 if len(images) > 4 else 2 if len(images) > 1 else 1
      metrics['grid'] = grid_size

      model_size = input_details[0]['shape'][1]
      tensor, orig_images = combine_images(images, grid_size, model_size)
      metrics['load_time'] = int((time.perf_counter() - start_read) * 1000 / len(images))

      # Inference
      start_inference = time.perf_counter()
      model.set_tensor(input_details[0]['index'], tensor)
      model.invoke()
      output = model.get_tensor(output_details[0]['index'])
      metrics['inference_time'] = int((time.perf_counter() - start_inference) * 1000 / len(images))

      predictions = []
      for i in range(output.shape[2]):  # Loop through all predictions
          prediction = output[0, :, i]
          scores = prediction[4:]  # Extract class probabilities
          max_score = np.max(scores)  # Find the maximum score (confidence)
          if max_score >= 0.4:
              class_id = np.argmax(scores)  # Determine the class with the highest probability
              box = prediction[:4]  # Extract bounding box coordinates
              predictions.append([class_id, max_score, *box])

      # Convert to numpy array
      predictions = np.array(predictions)

      boxes = []
      scores = []
      class_ids = []
      if len(predictions) > 0:
        # Extract and convert bounding boxes
        boxes = xywh2xyxy(predictions[:, 2:6])

        # Perform Non-maximum suppression
        indices = cv2.dnn.NMSBoxes(boxes.tolist(), predictions[:, 1].tolist(), conf_threshold, nms_threshold)

        # Extract the final predictions after NMS
        final_predictions = predictions[indices.flatten()]
        boxes = xywh2xyxy(final_predictions[:, 2:6])
        scores = predictions[:, 1].tolist()
        class_ids = predictions[:, 0].astype(int).tolist()

      if len(scores) == 0:
          for i, image in enumerate(images):
            sqlite.set_frame_ml(image[0], model_hash, [], metrics)
          return set(), None

      grouped_boxes = [[] for _ in range(grid_size*grid_size)]
      grouped_scores = [[] for _ in range(grid_size*grid_size)]
      grouped_classes = [[] for _ in range(grid_size*grid_size)]
      w2 = int(width/grid_size)
      h2 = int(height/grid_size)
      offsets = [(i * w2, j * h2) for j in range(grid_size) for i in range(grid_size)]

      # Split boxes between initial images
      for box, score, class_id in zip(boxes, scores, class_ids):
          image_index = determine_image_index(box, w2, h2, grid_size)

          w_offset, h_offset = offsets[image_index]
          box = transform_box(box, w_offset, h_offset, grid_size)

          grouped_boxes[image_index].append(box)
          grouped_scores[image_index].append(score)
          grouped_classes[image_index].append(class_id)

      # apply blur
      for i, image in enumerate(images):
        if len(grouped_boxes[i]) > 0:
          start = time.perf_counter()
          orig = orig_images[i]
          result, metrics = blur(orig, grouped_boxes[i], metrics)
          metrics['blur_time'] = (time.perf_counter() - start) * 1000
          start = time.perf_counter()
          result = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
          pil_img = Image.fromarray(result)
          pil_img.save(os.path.join(image[1], image[0]), quality=80)
          metrics['write_time'] = (time.perf_counter() - start) * 1000
          detections = [(box.tolist(), score, class_id) for box, score, class_id in zip(boxes, scores, class_ids)]
          sqlite.set_frame_ml(image[0], model_hash, detections, metrics)
          orig_images[i] = None
        else:
          #set empty detections
          sqlite.set_frame_ml(image[0], model_hash, [], metrics)
        # remove from set
        unprocessed_images.remove(image[0])
      return set(), None
    except Exception as e:
      print(e)
      return unprocessed_images, e 


def blur(img, boxes, metrics):
  blur_per_boxes = False
  if len(boxes) < 30:
    #calc box sizes to determine the optimal blur strategy
    total_box_size = sum((box[2] - box[0]) * (box[3] - box[1]) for box in boxes)
    if total_box_size < 0.5 * image_size_px:
      blur_per_boxes = True

  if blur_per_boxes:
    for box in boxes:
      box = box.astype(int)
      # filter out large boxes and boxes on the hood
      if box[2] - box[0] > 0.8 * width and box[1] > 0.5 * height:
        continue
      roi = img[box[1]:box[3], box[0]:box[2]]
      roi_downscale_width = int(roi.shape[1] * 0.2)
      roi_downscale_height = int(roi.shape[0] * 0.2)
      if roi_downscale_width > 0 and roi_downscale_height > 0:
        #downscale
        small_roi = cv2.resize(roi, (roi_downscale_width, roi_downscale_height), interpolation=cv2.INTER_NEAREST)
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
    downscale_size = (int(width * 0.2), int(height * 0.2))
    img_downscaled = cv2.resize(img, downscale_size, interpolation=cv2.INTER_NEAREST)
    img_blurred = cv2.GaussianBlur(img_downscaled, (5, 5), 1.5)
    metrics['downscale_time'] = (time.perf_counter() - start) * 1000

    # Upscale
    start = time.perf_counter()
    upscale_size = (width, height)
    img_upscaled = cv2.resize(img_blurred, upscale_size, interpolation=cv2.INTER_NEAREST)
    metrics['upscale_time'] = (time.perf_counter() - start) * 1000

    # Mask from bounding boxes
    start = time.perf_counter()
    mask = np.zeros((height, width), dtype=np.uint8)

    for box in boxes:
      box = box.astype(int)
      # filter out large boxes and boxes on the hood
      if box[2] - box[0] > 0.8 * width and box[1] > 0.5 * height:
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

def main(model_path, conf_threshold, nms_threshold, num_threads):

  retry_counters = {}
  q = queue.Queue()
  sqlite = SQLite('/mnt/data/data-logger.v1.4.5.db')

  def worker():
    model = interpreter.Interpreter(model_path)
    model_hash = '151cd9685093e70ca0257f70cd2c35ee18b28e2a417701fd36d91e692eb37f26'
    model.allocate_tensors()
    input_details = model.get_input_details()
    output_details = model.get_output_details()
    errors_counter = 0

    while True:
      images = q.get()

      try:
        if len(images) > 0:
          for image in enumerate(images):
            image_name = image[0]
            if image_name not in retry_counters:
                retry_counters[image_name] = 0

          unprocessed_images, error = detect(images, model, input_details, output_details, conf_threshold, nms_threshold, sqlite, model_hash)
          for image in enumerate(images):
            image_name = image[0]
            if image_name in unprocessed_images:
              print('failed: ' + image_name)
              if image_name not in retry_counters:
                retry_counters[image_name] = 0
              retry_counters[image_name] += 1
              if retry_counters[image_name] >= 3:
                  # Postpone frame
                  errors_counter += 1
                  sqlite.set_error(image_name, str(error))
                  retry_counters.pop(image_name, None)
          else:
            retry_counters.pop(image_name, None)

      except Exception as e:
        print(f"Error processing frames. Error: {e}")
        errors_counter += 1
        if errors_counter > 10:
          errors_counter = 0
          sqlite.set_service_status('failed')
        
      q.task_done()

  # init threads
  for i in range(num_threads):
    threading.Thread(target=worker, daemon=True).start()

  # init watcher
  try:
    print('Starting watcher')
    sqlite.set_service_status('healthy')

    while True:
      images, total = sqlite.get_frames_for_ml(50)
      print(total)
      
      # Depending on how big is the processing queue,
      if total > 30:
        # split on groups of 9
        images = [images[i:i + 9] for i in range(0, len(images), 9)]
        # push every group to queue
        for group in images:
          q.put(group)
      elif total > 10:
        # split on groups of 4
        images = [images[i:i + 4] for i in range(0, len(images), 4)]
        # push every group to queue
        for group in images:
          q.put(group)
      elif total > 0:
        #split on single images arrays
        for image in images:
          q.put([image])

      q.join()

      time.sleep(3 if len(images) == 0 else 1 if len(retry_counters) > 0 else 0.1)

  except KeyboardInterrupt:
    print('Watcher stopped by user')
  except Exception as e:
    print(f"An error occurred: {e}")
    raise e

if __name__ == '__main__':
  parser = argparse.ArgumentParser()
  parser.add_argument('--model_path', type=str)
  parser.add_argument('--conf_threshold', type=float, default=0.3)
  parser.add_argument('--nms_threshold', type=float, default=0.9)
  parser.add_argument('--num_threads', type=int, default=4)

  args = parser.parse_args()

  main(
    args.model_path,
    args.conf_threshold,
    args.nms_threshold,
    args.num_threads
  )
