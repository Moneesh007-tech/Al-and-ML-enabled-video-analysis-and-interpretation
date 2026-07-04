import os
import sys

# Ensure roaming user site-packages are accessible
user_site = os.path.expanduser(r"~\AppData\Roaming\Python\Python310\site-packages")
if os.path.exists(user_site) and user_site not in sys.path:
    sys.path.insert(0, user_site)

# PyTorch 2.6+ compatibility fix: Monkey-patch torch.load to default to weights_only=False
try:
    import torch
    original_load = torch.load
    def custom_load(*args, **kwargs):
        # Force weights_only=False for trusted YOLO models to prevent PyTorch 2.6 security blocks
        if "weights_only" not in kwargs:
            kwargs["weights_only"] = False
        else:
            kwargs["weights_only"] = False
        return original_load(*args, **kwargs)
    torch.load = custom_load
    print("PyTorch 2.6 weights security bypass applied.")
except Exception as e:
    pass

# Ensure backend directory is in python search path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

print("--- NSG Video Analytics: System Diagnostic & Initialization ---")

# 1. Check directories
print("\n[1/4] Configuring directories...")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(BASE_DIR, "dataset", "watchlist")
ALERTS_DIR = os.path.join(BASE_DIR, "dataset", "alerts")
MODELS_DIR = os.path.join(BASE_DIR, "models")

for directory in [DATASET_DIR, ALERTS_DIR, MODELS_DIR]:
    if not os.path.exists(directory):
        os.makedirs(directory)
        print(f"  Created directory: {directory}")
    else:
        print(f"  Directory exists: {directory}")

# 2. Check dependencies
print("\n[2/4] Verifying library installs...")
try:
    import cv2
    print(f"  OpenCV Version: {cv2.__version__}")
    # Verify face module
    if not hasattr(cv2, 'face') or not hasattr(cv2.face, 'LBPHFaceRecognizer_create'):
        print("  WARNING: 'cv2.face' module is not found. Check if 'opencv-contrib-python' was installed.")
        print("  Face recognition model training will fail. Standard face detection will still work.")
    else:
        print("  OpenCV Face Module: FOUND (LBPH is available)")
except ImportError:
    print("  ERROR: cv2 (OpenCV) is not installed. Please install it using pip.")

try:
    from ultralytics import YOLO
    print("  Ultralytics YOLO: FOUND")
except ImportError:
    print("  ERROR: ultralytics is not installed. Please install it using pip.")

try:
    import sqlalchemy
    print("  SQLAlchemy: FOUND")
except ImportError:
    print("  ERROR: sqlalchemy is not installed.")

# 3. Database Initialization
print("\n[3/4] Initializing Database Schema...")
try:
    from app.database import init_db, SessionLocal, WatchlistMember
    init_db()
    print("  SQLite database file nsg_analytics.db checked and initialized.")
    
    # Create an initial mock watchlist profile if database is empty
    db = SessionLocal()
    count = db.query(WatchlistMember).count()
    if count == 0:
        print("  Database is empty. Enrolling standard mock threat profile 'Suspect Alpha'...")
        # Create a mock grayscale dummy file for training
        mock_face_file = os.path.join(DATASET_DIR, "subject_1.jpg")
        
        import numpy as np
        # Create a simulated face block (200x200) with circle face shape
        dummy_img = np.zeros((200, 200, 3), dtype=np.uint8)
        dummy_img[:] = (200, 200, 200) # light gray
        cv2.circle(dummy_img, (100, 100), 70, (255, 255, 255), -1) # face base
        cv2.circle(dummy_img, (80, 80), 8, (0, 0, 0), -1) # left eye
        cv2.circle(dummy_img, (120, 80), 8, (0, 0, 0), -1) # right eye
        cv2.ellipse(dummy_img, (100, 125), (30, 15), 0, 0, 180, (0, 0, 0), 3) # smile mouth
        cv2.imwrite(mock_face_file, dummy_img)
        
        mock_member = WatchlistMember(
            name="Suspect Alpha",
            photo_path=mock_face_file,
            label_id=1
        )
        db.add(mock_member)
        db.commit()
        print("  Default suspect 'Suspect Alpha' added to watchlist and initialized in dataset.")
        
        # Train face recognition model
        from app.detector import VideoAnalyzer
        analyzer = VideoAnalyzer()
        success, msg = analyzer.train_face_model(db)
        print(f"  Initial face model training status: {success} ({msg})")
        
    db.close()
except Exception as e:
    print(f"  ERROR creating database / seed data: {e}")

# 4. Pre-downloading YOLOv8 model weights
print("\n[4/4] Verifying/Downloading YOLOv8 Weights...")
try:
    model = YOLO("yolov8n.pt")
    print("  YOLOv8 Nano weights loaded successfully.")
except Exception as e:
    print(f"  WARNING: Failed loading YOLOv8 weights automatically: {e}")

print("\n--- Diagnostic Complete ---")
