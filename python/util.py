import hashlib
import os

def get_hash(file_path):
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:  # Open the file in binary mode
        for chunk in iter(lambda: f.read(4096), b""):  # Read the file in chunks
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def get_model_path(sqlite):
    model_dir = '/data/models'
    default_dir = '/opt/object-detection'
    default_name = 'model.blob'
    
    name = sqlite.get_model_name()
    if name and os.path.exists(os.path.join(model_dir, name)):
        return os.path.join(model_dir, name)
    elif name and os.path.exists(os.path.join(default_dir, name)):
        return os.path.join(default_dir, name)
    else:
        return os.path.join(default_dir, default_name)