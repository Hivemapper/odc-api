from collections import deque
import os
from pathlib import Path

class JpegMemoryControl:
    def __init__(self, base_dir, max_size=400000000, max_files=10000):
        self.base_dir = base_dir
        self.max_size = max_size
        self.max_files = max_files
        self.file_queue = deque()
        self.current_size = 0

        self.prepare()

    def prepare(self):
        Path(self.base_dir).mkdir(parents=True, exist_ok=True)
        self._build_database()

    def add(self, file_path):
        self.file_queue.append(file_path)
        self.current_size += os.path.getsize(file_path)

        if self.current_size > self.max_size or len(self.file_queue) > self.max_files:
            self._cleanup()

    def contains(self, file_path):
        return file_path in self.file_queue

    def _cleanup(self):
        while self.file_queue and (self.current_size > self.max_size or len(self.file_queue) > self.max_files):
            old_file = self.file_queue.popleft()
            try:
                file_size = os.path.getsize(old_file)
                os.remove(old_file)
                self.current_size -= file_size
            except FileNotFoundError:
                pass  # File already deleted

    def _build_database(self):
        self.file_queue.clear()
        sorted_files = sorted((os.path.join(self.base_dir, f) for f in os.listdir(self.base_dir) if os.path.isfile(os.path.join(self.base_dir, f))), key=os.path.getmtime)
        for file in sorted_files:
            self.file_queue.append(file)
            self.current_size += os.path.getsize(file)
