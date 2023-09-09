#!/usr/bin/env python
# -*- coding: utf-8 -*-
import copy

import cv2
import numpy as np
import onnxruntime


class DAMOYOLO(object):
    def __init__(
        self,
        model_path,
        max_num=500,
        providers=[
            'CUDAExecutionProvider',
            'CPUExecutionProvider',
        ],
    ):

        # パラメータ
        self.max_num = max_num

        # モデル読み込み
        self.onnx_session = onnxruntime.InferenceSession(
            model_path,
            providers=providers,
        )

        self.input_detail = self.onnx_session.get_inputs()[0]
        self.input_name = self.input_detail.name

        # 各種設定
        self.input_shape = self.input_detail.shape[2:]

    def __call__(self, image, score_th=0.05, nms_th=0.8):
        temp_image = copy.deepcopy(image)
        image_height, image_width = image.shape[0], image.shape[1]

        # 前処理
        image, ratio = self._preprocess(temp_image, self.input_shape)

        # 推論実施
        results = self.onnx_session.run(
            None,
            {self.input_name: image[None, :, :, :]},
        )

        # 後処理
        scores = results[0]
        bboxes = results[1]
        bboxes, scores, class_ids = self._postprocess(
            scores,
            bboxes,
            score_th,
            nms_th,
        )

        decode_ratio = min(image_height / int(image_height * ratio),
                           image_width / int(image_width * ratio))
        if len(bboxes) > 0:
            bboxes = bboxes * decode_ratio

        return bboxes, scores, class_ids

    def _preprocess(self, image, input_size, swap=(2, 0, 1)):
        temp_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        if len(image.shape) == 3:
            padded_image = np.ones((input_size[0], input_size[1], 3),
                                   dtype=np.uint8)
        else:
            padded_image = np.ones(input_size, dtype=np.uint8)

        ratio = min(input_size[0] / temp_image.shape[0],
                    input_size[1] / temp_image.shape[1])
        resized_image = cv2.resize(
            temp_image,
            (int(temp_image.shape[1] * ratio), int(
                temp_image.shape[0] * ratio)),
            interpolation=cv2.INTER_LINEAR,
        )
        resized_image = resized_image.astype(np.uint8)

        padded_image[:int(temp_image.shape[0] *
                          ratio), :int(temp_image.shape[1] *
                                       ratio)] = resized_image
        padded_image = padded_image.transpose(swap)
        padded_image = np.ascontiguousarray(padded_image, dtype=np.float32)

        return padded_image, ratio

    def _postprocess(
        self,
        scores,
        bboxes,
        score_th,
        nms_th,
    ):
        batch_size = bboxes.shape[0]
        for i in range(batch_size):
            if not bboxes[i].shape[0]:
                continue
            bboxes, scores, class_ids = self._multiclass_nms(
                bboxes[i],
                scores[i],
                score_th,
                nms_th,
                self.max_num,
            )

        return bboxes, scores, class_ids

    def _multiclass_nms(
        self,
        bboxes,
        scores,
        score_th,
        nms_th,
        max_num=100,
        score_factors=None,
    ):
        num_classes = scores.shape[1]
        if bboxes.shape[1] > 4:
            # ToDo
            # bboxes = bboxes.view(scores.size(0), -1, 4)
            pass
        else:
            bboxes = np.broadcast_to(
                bboxes[:, None],
                (bboxes.shape[0], num_classes, 4),
            )
        valid_mask = scores > score_th
        bboxes = bboxes[valid_mask]

        if score_factors is not None:
            scores = scores * score_factors[:, None]
        scores = scores[valid_mask]

        np_labels = valid_mask.nonzero()[1]

        indices = cv2.dnn.NMSBoxes(
            bboxes.tolist(),
            scores.tolist(),
            score_th,
            nms_th,
        )

        if max_num > 0:
            indices = indices[:max_num]

        if len(indices) > 0:
            bboxes = bboxes[indices]
            scores = scores[indices]
            np_labels = np_labels[indices]
            return bboxes, scores, np_labels
        else:
            return np.array([]), np.array([]), np.array([])

    def draw(
        self,
        image,
        score_th,
        bboxes,
        scores,
        class_ids,
        coco_classes,
        thickness=3,
    ):
        debug_image = copy.deepcopy(image)

        for bbox, score, class_id in zip(bboxes, scores, class_ids):
            x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(
                bbox[3])

            if score_th > score:
                continue

            color = self._get_color(class_id)

            # バウンディングボックス
            debug_image = cv2.rectangle(
                debug_image,
                (x1, y1),
                (x2, y2),
                color,
                thickness=thickness,
            )

            # クラスID、スコア
            score = '%.2f' % score
            text = '%s:%s' % (str(coco_classes[int(class_id)]), score)
            debug_image = cv2.putText(
                debug_image,
                text,
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                color,
                thickness=thickness,
            )

        return debug_image

    def _get_color(self, index):
        temp_index = abs(int(index + 5)) * 3
        color = (
            (29 * temp_index) % 255,
            (17 * temp_index) % 255,
            (37 * temp_index) % 255,
        )
        return color


if __name__ == '__main__':
    cap = cv2.VideoCapture(0)

    # Load model
    model_path = 'damoyolo_tinynasL20_T_418.onnx'
    model = DAMOYOLO(
        model_path,
        providers=[
            'CPUExecutionProvider',
        ],
    )

    # Load COCO Classes List
    with open('coco_classes.txt', 'rt') as f:
        coco_classes = f.read().rstrip('\n').split('\n')

    while True:
        # Capture read
        ret, frame = cap.read()
        if not ret:
            break

        # Inference execution
        bboxes, scores, class_ids = model(frame)

        # Draw
        frame = model.draw(
            frame,
            0.5,
            bboxes,
            scores,
            class_ids,
            coco_classes,
        )

        key = cv2.waitKey(1)
        if key == 27:  # ESC
            break
        cv2.imshow('DAMO-YOLO', frame)

    cap.release()
    cv2.destroyAllWindows()
