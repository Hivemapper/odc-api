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

def xywh2xyxy(box, model_size, grid_size):
    x, y, w, h = box
    multiplier = model_size if grid_size > 1 else 1
    x_min = (x - w / 2) * multiplier
    y_min = (y - h / 2) * multiplier
    x_max = (x + w / 2) * multiplier
    y_max = (y + h / 2) * multiplier

    return np.array([x_min, y_min, x_max, y_max], dtype=np.float32)

def combine_images(images, grid_size, model_size):
    # Adjust the number of cells based on the grid size
    if grid_size == 1:  # 1x2 grid
        total_cells = 2  # Two cells stacked vertically
        cell_width = model_size
        cell_height = model_size // 2
    else:  # 2x2 grid
        total_cells = grid_size * grid_size
        cell_width = cell_height = model_size // grid_size

    # Initialize a blank grid
    combined_img = np.zeros((model_size, model_size, 3), dtype=np.float32)
    orig_images = []

    for i in range(total_cells):
        # Calculate grid cell position
        x_offset = (i % grid_size) * cell_width
        y_offset = (i // grid_size) * cell_height

        if i < len(images):
            # If there's an image to put in the cell
            img_path = image.get_path(images[i][0], images[i][1], "/tmp/recording/pic")

            # Read and resize image to fit in the grid cell
            img = None
            try: 
              img = cv2.imread(img_path)
            except Exception as e:
              try:
                 img = cv2.imread(os.path.join(images[i][1], images[i][0]))
              except Exception as err:
                print(err)
            
            orig_images.append(img)
            if img is None:
              # if input img is broken or empty
              resized_img = np.zeros((cell_height, cell_width, 3), dtype=np.int8)
            else:
                resized_img = cv2.resize(img, (cell_width, cell_height), interpolation=cv2.INTER_NEAREST)
                # Rotate the image if orientation is 3 (upside-down)
                if images[i][4] == 3:
                    resized_img = cv2.rotate(resized_img, cv2.ROTATE_180)
        else:
            # Use an empty (black) image for spots without images
            resized_img = np.zeros((cell_height, cell_width, 3), dtype=np.int8)

        # Place resized image or empty cell in the grid
        combined_img[y_offset:y_offset + cell_height, x_offset:x_offset + cell_width] = resized_img

    combined_img = combined_img.astype(np.float32) / 255.0
    # Ensure that the combined image has the batch dimension
    combined_img = combined_img[np.newaxis, ...]

    return combined_img, orig_images

def transform_box(box, model_size, grid_size, index):
    # Determine cell dimensions based on grid size
    if grid_size == 1:  # 1x2 grid
        cell_width = model_size
        cell_height = model_size // 2
        w_offset = 0
        h_offset = index * cell_height
    else:  # 2x2 grid
        cell_width = cell_height = model_size // 2
        w_offset = (index % 2) * cell_width
        h_offset = (index // 2) * cell_height

    # Calculate scale factors
    scale_w = width / cell_width
    scale_h = height / cell_height

    # Transform the box coordinates
    new_box = [
        (box[0] - w_offset) * scale_w,
        (box[1] - h_offset) * scale_h,
        (box[2] - w_offset) * scale_w,
        (box[3] - h_offset) * scale_h
    ]

    # Clipping the coordinates to make sure they are within image boundaries
    new_box[::2] = np.clip(new_box[::2], 0, width)
    new_box[1::2] = np.clip(new_box[1::2], 0, height)

    return np.floor(new_box).astype(int)


def determine_image_index(box, model_size, grid_size):
    # For a 1x2 grid, width is the model width and height is half of the model height
    if grid_size == 1:
        cell_width = model_size
        cell_height = model_size // 2
    # For a 2x2 grid, both width and height are half of the model size
    else:
        cell_width = cell_height = model_size // 2

    x_index = int(box[0] // cell_width)
    y_index = int(box[1] // cell_height)
    
    # For a 1x2 grid, the index is simply the y_index
    if grid_size == 1:
        return y_index
    # For a 2x2 grid, calculate the index based on both x and y indices
    else:
        return y_index * 2 + x_index  # Assuming grid_size is 2 for a 2x2 grid

def rotate_boxes(boxes):
    rotated_boxes = []
    for box in boxes:
        rotated_boxes.append(np.array([width - box[2], height - box[3], width - box[0], height - box[1]]))
    return rotated_boxes

def detect(images, model, input_details, output_details, conf_threshold, nms_threshold, sqlite, model_hash):
    metrics = {}
    #map images to set
    unprocessed_images = set(image[0] for image in images)

    try:
      # Read and preprocess the image
      start_read = time.perf_counter()
      grid_size = 2 if len(images) > 2 else 1
      print("grid", grid_size)
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
          if max_score >= conf_threshold:
              class_id = np.argmax(scores)  # Determine the class with the highest probability
              box = xywh2xyxy(prediction[:4], model_size, grid_size)  # Extract and convert bounding box coordinates
              predictions.append([class_id, max_score, *box])

      # Convert to numpy array
      predictions = np.array(predictions)

      boxes = []
      scores = []
      class_ids = []
      if len(predictions) > 0:
        # Perform Non-maximum suppression
        indices = cv2.dnn.NMSBoxes(predictions[:, 2:6].tolist(), predictions[:, 1].tolist(), conf_threshold, nms_threshold)

        # Extract the final predictions after NMS
        final_predictions = predictions[indices.flatten()]
        boxes = final_predictions[:, 2:6]
        scores = final_predictions[:, 1].tolist()
        class_ids = final_predictions[:, 0].astype(int).tolist()

      if len(scores) == 0:
          for i, image in enumerate(images):
            sqlite.set_frame_ml(image[0], model_hash, [], metrics)
          return set(), None

      total_images = 2 if grid_size == 1 else 4
      grouped_boxes = [[] for _ in range(total_images)]
      grouped_scores = [[] for _ in range(total_images)]
      grouped_classes = [[] for _ in range(total_images)]

      # Split boxes between initial images
      for box, score, class_id in zip(boxes, scores, class_ids):
          image_index = determine_image_index(box, model_size, grid_size)

          box = transform_box(box, model_size, grid_size, image_index)

          # filter out large boxes and boxes on the hood
          if (box[2] - box[0] > 0.8 * width and box[1] > 0.5 * height):
            continue

          # if box is pretty big (1/6 of frame or bigger), let's be extra-confident in prediction
          if ((box[2] - box[0]) * (box[3] - box[1]) > (image_size_px / 6) and score < conf_threshold + 0.2):
            continue

          grouped_boxes[image_index].append(box)
          grouped_scores[image_index].append(score)
          grouped_classes[image_index].append(class_id)

      # apply blur
      for i, image in enumerate(images):
        if len(grouped_boxes[i]) > 0:
          start = time.perf_counter()
          orig = orig_images[i]
          boxes_to_blur = rotate_boxes(grouped_boxes[i]) if images[i][4] == 3 else grouped_boxes[i]
          result, metrics = blur(orig, boxes_to_blur, metrics)
          metrics['blur_time'] = (time.perf_counter() - start) * 1000
          start = time.perf_counter()
          result = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
          pil_img = Image.fromarray(result)
          pil_img.save(os.path.join(image[1], image[0]), quality=80)
          metrics['write_time'] = (time.perf_counter() - start) * 1000
          detections = [(box.tolist(), score, class_id) for box, score, class_id in zip(grouped_boxes[i], grouped_scores[i], grouped_classes[i])]
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

def main():

  retry_counters = {}
  q = queue.Queue()
  sqlite = SQLite('/mnt/data/data-logger.v1.4.5.db')
  config = sqlite.get_privacy_config()
  print(config)

  def worker():
    single_model = interpreter.Interpreter(config["PrivacyModelPath"])
    single_model_hash = config["PrivacyModelHash"]
    single_model.allocate_tensors()
    single_input_details = single_model.get_input_details()
    single_output_details = single_model.get_output_details()

    grid_model = interpreter.Interpreter(config["PrivacyModelGridPath"])
    grid_model_hash = config["PrivacyModelGridHash"]
    grid_model.allocate_tensors()
    grid_input_details = grid_model.get_input_details()
    grid_output_details = grid_model.get_output_details()

    errors_counter = 0
    conf_threshold = config["PrivacyConfThreshold"]
    nms_threshold = config["PrivacyNmsThreshold"]

    while True:
      images = q.get()

      try:
        if len(images) > 0:
          for image in enumerate(images):
            image_name = image[0]
            if image_name not in retry_counters:
                retry_counters[image_name] = 0

          is_grid = len(images) > 2
          model = grid_model if is_grid else single_model
          model_hash = grid_model_hash if is_grid else single_model_hash
          input_details = grid_input_details if is_grid else single_input_details
          output_details = grid_output_details if is_grid else single_output_details
          conf = conf_threshold - 0.05 if is_grid else conf_threshold

          unprocessed_images, error = detect(images, model, input_details, output_details, conf, nms_threshold, sqlite, model_hash)
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
        try: 
          if "inference" in str(e).lower() or "interpreter" in str(e).lower:
            single_model = interpreter.Interpreter(config["PrivacyModelPath"])
            single_model_hash = config["PrivacyModelHash"]
            single_model.allocate_tensors()
            single_input_details = single_model.get_input_details()
            single_output_details = single_model.get_output_details()

            grid_model = interpreter.Interpreter(config["PrivacyModelGridPath"])
            grid_model_hash = config["PrivacyModelGridHash"]
            grid_model.allocate_tensors()
            grid_input_details = grid_model.get_input_details()
            grid_output_details = grid_model.get_output_details()
            time.sleep(2)
        except Exception as err:
          sqlite.set_service_status('failed')
        try:
          sqlite.log_error(e)
        except Exception as e:
          print(f"Error logging error: {e}")
      q.task_done()

  # init threads
  for i in range(config["PrivacyNumThreads"]):
    threading.Thread(target=worker, daemon=True).start()
    time.sleep(1)

  # init watcher
  try:
    print('Starting watcher')
    sqlite.set_service_status('healthy')
    prev_images_len = 0
    empty_loops = 0
    low_speed_threshold = config["LowSpeedThreshold"]

    while True:
      images, total = sqlite.get_frames_for_ml(48)
      print(total)
    
      if len(images) > 0:
        # Divide images into low-speed and high-speed groups
        print(images[0][2], images[0][2] <= low_speed_threshold)
        low_speed_images = [img for img in images if img[2] <= low_speed_threshold]
        high_speed_images = [img for img in images if img[2] > low_speed_threshold]

        # Group images for 1x2 grid (low-speed)
        for i in range(0, len(low_speed_images), 2):
          group = low_speed_images[i:i + 2]
          print("pushing to 1x2")
          q.put(group)
          time.sleep(0.1)

        # Group images for 2x2 grid (high-speed)
        for i in range(0, len(high_speed_images), 4):
          group = high_speed_images[i:i + 4]
          print("pushing to 2x2")
          q.put(group)
          time.sleep(0.1)

      q.join()

      if (prev_images_len == len(images) and prev_images_len > 0):
        empty_loops += 1
        if empty_loops > 10:
          empty_loops = 0
          sqlite.set_service_status('failed')
      else:
        empty_loops = 0
      prev_images_len = len(images)

      time.sleep(3 if len(images) == 0 else 1 if (len(retry_counters) > 0 or empty_loops > 0) else 0.2)

  except KeyboardInterrupt:
    print('Watcher stopped by user')
  except Exception as e:
    print(f"An error occurred: {e}")
    raise e

if __name__ == '__main__':
  main()
