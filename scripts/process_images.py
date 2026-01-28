import os
import shutil
from rembg import remove
from PIL import Image

assets_dir = '/Users/ikyoungtae/Documents/coding/ewh-consulting-calendar/src/assets'
backup_dir = os.path.join(assets_dir, 'original_leaves')

if not os.path.exists(backup_dir):
    os.makedirs(backup_dir)

for i in range(1, 8):
    filename = f'reaf-{i}.png'
    file_path = os.path.join(assets_dir, filename)
    
    if os.path.exists(file_path):
        # Backup
        backup_path = os.path.join(backup_dir, filename)
        if not os.path.exists(backup_path):
            shutil.copy2(file_path, backup_path)
            print(f"Backed up {filename}")
        
        # Process
        print(f"Processing {filename}...")
        try:
            input_image = Image.open(file_path)
            output_image = remove(input_image)
            output_image.save(file_path)
            print(f"Done {filename}")
        except Exception as e:
            print(f"Failed {filename}: {e}")
    else:
        print(f"File not found: {filename}")
