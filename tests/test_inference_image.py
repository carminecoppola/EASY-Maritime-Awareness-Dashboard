from __future__ import annotations

import unittest

import numpy as np

from inference_image import Detection, decode_yolo_output, letterbox, nms
from inference_worker import Detection as WorkerDetection
from inference_worker import nms as worker_nms


class InferenceImageTests(unittest.TestCase):
    def test_worker_preserves_detection_import(self) -> None:
        self.assertIs(WorkerDetection, Detection)
        self.assertIs(worker_nms, nms)

    def test_letterbox_preserves_aspect_ratio(self) -> None:
        image = np.zeros((50, 100, 3), dtype=np.uint8)
        padded, ratio, pad = letterbox(image, 200)
        self.assertEqual(padded.shape, (200, 200, 3))
        self.assertEqual(ratio, 2.0)
        self.assertEqual(pad, (0.0, 50.0))

    def test_nms_removes_overlapping_box(self) -> None:
        boxes = np.asarray([[10, 10, 30, 30], [11, 11, 31, 31]], dtype=np.float32)
        scores = np.asarray([0.9, 0.8], dtype=np.float32)
        self.assertEqual(nms(boxes, scores, 0.5), [0])

    def test_decode_keeps_highest_detection_for_a_class(self) -> None:
        output = np.zeros((1, 7, 8), dtype=np.float32)
        output[0, :, 0] = [50, 50, 20, 20, 0.9, 0.1, 0.1]
        output[0, :, 1] = [51, 51, 20, 20, 0.8, 0.1, 0.1]
        detections = decode_yolo_output(
            outputs=[output],
            conf_threshold=0.25,
            iou_threshold=0.5,
            class_names={0: "boat", 1: "ship", 2: "buoy"},
            allowed_class_names={"boat", "ship", "buoy"},
            ratio=1.0,
            pad=(0.0, 0.0),
            image_shape=(100, 100),
            input_size=100,
        )
        self.assertEqual(len(detections), 1)
        self.assertEqual(detections[0].class_name, "boat")
        self.assertAlmostEqual(detections[0].confidence, 0.9, places=5)


if __name__ == "__main__":
    unittest.main()
