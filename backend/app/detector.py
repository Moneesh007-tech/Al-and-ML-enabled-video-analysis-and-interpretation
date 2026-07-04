import os
import cv2
import numpy as np
import time
from datetime import datetime

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

from ultralytics import YOLO
from sqlalchemy.orm import Session
from app.database import Alert, WatchlistMember

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "models")
DATASET_DIR = os.path.join(BASE_DIR, "dataset", "watchlist")
ALERTS_DIR = os.path.join(BASE_DIR, "dataset", "alerts")

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(DATASET_DIR, exist_ok=True)
os.makedirs(ALERTS_DIR, exist_ok=True)

class VideoAnalyzer:
    def __init__(self):
        # Load YOLOv8 model (auto-downloads yolov8n.pt on first run)
        try:
            self.yolo_model = YOLO("yolov8n.pt")
            print("YOLOv8 AI Model loaded successfully.")
        except Exception as e:
            print(f"Error loading YOLOv8: {e}. YOLOv8 will be disabled.")
            self.yolo_model = None

        # Load OpenCV Face Detector (Haar Cascade)
        cascade_path = os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml')
        self.face_cascade = cv2.CascadeClassifier(cascade_path)

        # Load Face Recognizer (LBPH module)
        self.face_recognizer = None
        self.recognizer_path = os.path.join(MODELS_DIR, "face_recognizer.yml")
        self.load_face_model()

        # Loitering tracking
        self.tracked_persons = []
        self.next_person_id = 0

        # Last alerts tracker to avoid flooding database (cooldown in seconds)
        self.last_alert_time = {}

    def load_face_model(self):
        try:
            self.face_recognizer = cv2.face.LBPHFaceRecognizer_create()
            if os.path.exists(self.recognizer_path):
                self.face_recognizer.read(self.recognizer_path)
                print("Face recognizer model loaded successfully.")
            else:
                print("No face recognizer model found. Face recognition will be disabled until trained.")
        except Exception as e:
            print(f"Error initializing Face Recognizer: {e}")
            self.face_recognizer = None

    def train_face_model(self, db: Session):
        if not self.face_recognizer:
            try:
                self.face_recognizer = cv2.face.LBPHFaceRecognizer_create()
            except Exception as e:
                return False, f"Could not create face recognizer: {e}"

        members = db.query(WatchlistMember).all()
        if not members:
            return False, "No watchlist members enrolled in database."

        faces = []
        labels = []

        for member in members:
            img_path = member.photo_path
            if not os.path.exists(img_path):
                continue
            
            img = cv2.imread(img_path)
            if img is None:
                continue
            
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            # Detect face in the enrolled photo
            rects = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
            if len(rects) > 0:
                x, y, w, h = rects[0]
                face_crop = cv2.resize(gray[y:y+h, x:x+w], (200, 200))
                faces.append(face_crop)
                labels.append(member.label_id)
            else:
                # Fallback: resize the entire image if cascade failed to detect
                face_crop = cv2.resize(gray, (200, 200))
                faces.append(face_crop)
                labels.append(member.label_id)

        if not faces:
            return False, "Failed to extract faces from enrolled images."

        try:
            self.face_recognizer.train(faces, np.array(labels))
            self.face_recognizer.write(self.recognizer_path)
            return True, "Model trained successfully with {} face(s).".format(len(faces))
        except Exception as e:
            return False, f"Error training model: {e}"

    def trigger_alert(self, db: Session, source: str, alert_type: str, message: str, confidence: float, frame: np.ndarray):
        # Prevent spamming duplicate alerts (10s cooldown per alert type)
        cooldown_key = f"{source}_{alert_type}_{message}"
        now = time.time()
        if cooldown_key in self.last_alert_time:
            if now - self.last_alert_time[cooldown_key] < 10:
                return

        self.last_alert_time[cooldown_key] = now

        # Save frame to disk
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{alert_type}_{timestamp_str}.jpg"
        filepath = os.path.join(ALERTS_DIR, filename)
        cv2.imwrite(filepath, frame)

        # Log alert to DB
        db_alert = Alert(
            source=source,
            type=alert_type,
            message=message,
            confidence=confidence,
            frame_path=filepath
        )
        db.add(db_alert)
        db.commit()
        print(f"[ALERT] {alert_type} on {source}: {message} ({confidence:.2f}%)")

    def process_frame(self, frame: np.ndarray, source: str, db: Session) -> np.ndarray:
        """
        Analyzes a single frame:
        1. Runs YOLOv8 for objects (knife/weapons/backpacks).
        2. Detects and recognizes faces against watchlist.
        3. Monitors loitering behaviors.
        4. Overlays high-tech tactical HUD in Red & White.
        """
        overlay = frame.copy()
        h, w, c = frame.shape

        # --- TACTICAL HUD DESIGN (Red & White Theme) ---
        # Grid/scan line effects
        cv2.line(overlay, (20, 20), (50, 20), (0, 0, 255), 2)  # Top Left Bracket
        cv2.line(overlay, (20, 20), (20, 50), (0, 0, 255), 2)
        cv2.line(overlay, (w - 20, 20), (w - 50, 20), (0, 0, 255), 2)  # Top Right Bracket
        cv2.line(overlay, (w - 20, 20), (w - 20, 50), (0, 0, 255), 2)
        cv2.line(overlay, (20, h - 20), (50, h - 20), (0, 0, 255), 2)  # Bottom Left Bracket
        cv2.line(overlay, (20, h - 20), (20, h - 50), (0, 0, 255), 2)
        cv2.line(overlay, (w - 20, h - 20), (w - 50, h - 20), (0, 0, 255), 2)  # Bottom Right Bracket
        cv2.line(overlay, (w - 20, h - 20), (w - 20, h - 50), (0, 0, 255), 2)

        # HUD Status bar (Top)
        cv2.rectangle(overlay, (0, 0), (w, 35), (200, 200, 200), -1) # Light gray background
        cv2.rectangle(overlay, (0, 0), (w, 35), (0, 0, 255), 1)     # Red border
        hud_text = f"NSG TACTICAL FEED | SRC: {source.upper()} | SECURE LINK | {datetime.now().strftime('%H:%M:%S')}"
        cv2.putText(overlay, hud_text, (20, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
        
        # Center targeting crosshair
        center_x, center_y = w // 2, h // 2
        cv2.drawMarker(overlay, (center_x, center_y), (0, 0, 255), cv2.MARKER_CROSS, 20, 1)

        # --- 1. YOLOv8 OBJECT DETECTION ---
        detected_persons = []
        if self.yolo_model:
            results = self.yolo_model(frame, verbose=False)[0]
            boxes = results.boxes
            for box in boxes:
                cls_id = int(box.cls[0])
                cls_name = self.yolo_model.names[cls_id]
                conf = float(box.conf[0])
                xyxy = box.xyxy[0].cpu().numpy().astype(int)
                x1, y1, x2, y2 = xyxy

                is_weapon = cls_name in ["knife", "scissors"]
                is_suspicious_object = cls_name in ["backpack", "suitcase", "cell phone"]

                if cls_name == "person":
                    detected_persons.append((x1, y1, x2, y2))
                    cv2.rectangle(overlay, (x1, y1), (x2, y2), (255, 255, 255), 1)
                    cv2.rectangle(overlay, (x1-1, y1-1), (x2+1, y2+1), (0, 0, 255), 1)
                    cv2.putText(overlay, f"TARGET_PERSON {conf:.2f}", (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)
                
                elif is_weapon:
                    cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 0, 255), 3)
                    cv2.putText(overlay, f"!! WEAPON DETECTED: {cls_name.upper()} !!", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                    self.trigger_alert(db, source, "WEAPON_DETECTED", f"Detected threat object: {cls_name}", conf * 100, frame)

                elif is_suspicious_object:
                    label = "UNATTENDED BAGGAGE" if cls_name in ["backpack", "suitcase"] else "POTENTIAL REMOTE DETONATOR"
                    cv2.rectangle(overlay, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    cv2.putText(overlay, f"SUSP_OBJ: {label}", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1)
                    self.trigger_alert(db, source, "SUSPICIOUS_OBJECT", f"Flagged object: {label}", conf * 100, frame)

        # --- 2. FACIAL RECOGNITION ---
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces_detected = self.face_cascade.detectMultiScale(gray, 1.2, 5)

        for (fx, fy, fw, fh) in faces_detected:
            cv2.rectangle(overlay, (fx, fy), (fx + fw, fy + fh), (255, 255, 255), 1)
            
            recognized_name = "UNKNOWN"
            match_confidence = 0.0
            
            if self.face_recognizer and os.path.exists(self.recognizer_path):
                try:
                    face_crop = cv2.resize(gray[fy:fy+fh, fx:fx+fw], (200, 200))
                    label_id, distance = self.face_recognizer.predict(face_crop)
                    
                    if distance < 95:
                        match_confidence = max(0.0, 100.0 - distance)
                        member = db.query(WatchlistMember).filter(WatchlistMember.label_id == label_id).first()
                        if member:
                            recognized_name = member.name
                            self.trigger_alert(
                                db, 
                                source, 
                                "WATCHLIST_MATCH", 
                                f"Watchlist subject identified: {recognized_name}", 
                                match_confidence, 
                                frame
                            )
                except Exception as e:
                    print(f"Error predicting face: {e}")

            if recognized_name != "UNKNOWN":
                cv2.rectangle(overlay, (fx, fy), (fx+fw, fy+fh), (0, 0, 255), 2)
                cv2.rectangle(overlay, (fx-2, fy-2), (fx+fw+2, fy+fh+2), (255, 255, 255), 1)
                cv2.putText(overlay, f"MATCH: {recognized_name} ({match_confidence:.1f}%)", (fx, fy - 10), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
            else:
                cv2.putText(overlay, "FACE_ACQUIRED", (fx, fy - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

        # --- 3. SUSPICIOUS LOITERING DETECTION ---
        current_time = time.time()
        new_tracked_persons = []
        
        for (px1, py1, px2, py2) in detected_persons:
            cx, cy = (px1 + px2) // 2, (py1 + py2) // 2
            matched = False
            
            for tracked in self.tracked_persons:
                tx1, ty1, tx2, ty2 = tracked["bbox"]
                tcx, tcy = (tx1 + tx2) // 2, (ty1 + ty2) // 2
                
                dist = np.sqrt((cx - tcx)**2 + (cy - tcy)**2)
                if dist < 50:
                    tracked["bbox"] = (px1, py1, px2, py2)
                    tracked["last_seen"] = current_time
                    duration = current_time - tracked["first_seen"]
                    
                    if duration > 15.0:
                        cv2.rectangle(overlay, (px1, py1), (px2, py2), (0, 0, 255), 2)
                        cv2.putText(overlay, f"ALERT: LOITERING ({int(duration)}s)", (px1, py2 + 15), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1)
                        self.trigger_alert(
                            db, 
                            source, 
                            "SUSPICIOUS_LOITERING", 
                            f"Subject loitering in surveillance zone for {int(duration)} seconds", 
                            85.0, 
                            frame
                        )
                    new_tracked_persons.append(tracked)
                    matched = True
                    break
            
            if not matched:
                new_tracked = {
                    "id": self.next_person_id,
                    "first_seen": current_time,
                    "last_seen": current_time,
                    "bbox": (px1, py1, px2, py2)
                }
                self.next_person_id += 1
                new_tracked_persons.append(new_tracked)

        self.tracked_persons = [p for p in new_tracked_persons if current_time - p["last_seen"] < 2.0]

        cv2.addWeighted(overlay, 0.85, frame, 0.15, 0, frame)
        return frame
