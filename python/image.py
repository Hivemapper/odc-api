import cv2
import numpy as np
from typing import Tuple

def load(image_path, width, height, tensor_type):
  dtype = None
  if tensor_type == 'float32':
    dtype = np.float32
  elif tensor_type == 'float16':
    dtype = np.float16
  img = cv2.imread(image_path)
  # resized_img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
  #keep original image for blurring
  resized_img = letterbox(img, (width, height))[0]
  # resized_img = cv2.resize(img, (width, height), cv2.INTER_NEAREST)
  resized_img = resized_img.transpose(2, 0, 1)
  tensor = resized_img[np.newaxis, :, :, :].astype(dtype)

  #returns tensor and reference on original image
  return tensor, img

def letterbox(img: np.ndarray, new_shape:Tuple[int, int], color:Tuple[int, int, int] = (114, 114, 114), auto:bool = False, scale_fill:bool = False, scaleup:bool = False, stride:int = 32):
  shape = img.shape[:2]  # current shape [height, width]
  if isinstance(new_shape, int):
    new_shape = (new_shape, new_shape)

  # Scale ratio (new / old)
  r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
  if not scaleup:  # only scale down, do not scale up (for better test mAP)
    r = min(r, 1.0)

  # Compute padding
  ratio = r, r  # width, height ratios
  new_unpad = int(round(shape[1] * r)), int(round(shape[0] * r))
  dw, dh = new_shape[1] - new_unpad[0], new_shape[0] - new_unpad[1]  # wh padding
  if auto:  # minimum rectangle
    dw, dh = np.mod(dw, stride), np.mod(dh, stride)  # wh padding
  elif scale_fill:  # stretch
    dw, dh = 0.0, 0.0
    new_unpad = (new_shape[1], new_shape[0])
    ratio = new_shape[1] / shape[1], new_shape[0] / shape[0]  # width, height ratios

  dw /= 2  # divide padding into 2 sides
  dh /= 2

  if shape[::-1] != new_unpad:  # resize
    img = cv2.resize(img, new_unpad, interpolation=cv2.INTER_LINEAR)
  top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
  left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
  img = cv2.copyMakeBorder(img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color)  # add border
  return img, ratio, (dw, dh)