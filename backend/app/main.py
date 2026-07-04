import os
import sys

# Ensure roaming user site-packages are accessible
user_site = os.path.expanduser(r"~\AppData\Roaming\Python\Python310\site-packages")
if os.path.exists(user_site) and user_site not in sys.path:
    sys.path.insert(0, user_site)

import cv2
import time
import random
from fastapi import FastAPI, Depends, File, UploadFile, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List

from app.database import init_db, get_db, WatchlistMember, Alert
from app.detector import VideoAnalyzer, DATASET_DIR, ALERTS_DIR
import app.schemas as schemas

# Initialize database
init_db()

app = FastAPI(title="NSG AI/ML Video Analytics API")

# Configure CORS for React frontend (default Vite port is 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static folders for images
app.mount("/static/watchlist", StaticFiles(directory=DATASET_DIR), name="watchlist")
app.mount("/static/alerts", StaticFiles(directory=ALERTS_DIR), name="alerts")

# Initialize Global Analyzer
analyzer = VideoAnalyzer()

# Simulated source names
SOURCES = ["drone-01", "bodycam-03", "robot-scout", "webcam"]

@app.get("/")
def read_root():
    return {"status": "NSG Video Analysis Engine Active"}

@app.get("/api/stats", response_model=schemas.SystemStats)
def get_stats(db: Session = Depends(get_db)):
    active_sources = len(SOURCES)
    watchlist_count = db.query(WatchlistMember).count()
    total_alerts = db.query(Alert).count()
    trained = os.path.exists(analyzer.recognizer_path)
    return {
        "active_sources": active_sources,
        "watchlist_count": watchlist_count,
        "total_alerts": total_alerts,
        "trained": trained
    }

@app.get("/api/watchlist", response_model=List[schemas.WatchlistMemberResponse])
def get_watchlist(db: Session = Depends(get_db)):
    return db.query(WatchlistMember).all()

@app.post("/api/watchlist/enroll", response_model=schemas.WatchlistMemberResponse)
async def enroll_watchlist_member(
    name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Check if name already exists
    existing = db.query(WatchlistMember).filter(WatchlistMember.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Name already enrolled in watchlist.")

    # Assign a new unique label_id (incremental)
    last_member = db.query(WatchlistMember).order_by(WatchlistMember.label_id.desc()).first()
    label_id = (last_member.label_id + 1) if last_member else 1

    # Save uploaded file
    file_extension = os.path.splitext(file.filename)[1]
    filename = f"subject_{label_id}{file_extension}"
    filepath = os.path.join(DATASET_DIR, filename)

    try:
        with open(filepath, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save image: {e}")

    # Add to DB
    new_member = WatchlistMember(
        name=name,
        photo_path=filepath,
        label_id=label_id
    )
    db.add(new_member)
    db.commit()
    db.refresh(new_member)

    # Retrain face recognition model in background
    analyzer.train_face_model(db)

    return new_member

@app.delete("/api/watchlist/{member_id}")
def delete_watchlist_member(member_id: int, db: Session = Depends(get_db)):
    member = db.query(WatchlistMember).filter(WatchlistMember.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # Delete file from disk
    if os.path.exists(member.photo_path):
        try:
            os.remove(member.photo_path)
        except Exception as e:
            print(f"Error removing photo file: {e}")

    # Delete from DB
    db.delete(member)
    db.commit()

    # Retrain/update face model
    analyzer.train_face_model(db)

    return {"detail": "Member deleted successfully"}

@app.post("/api/watchlist/train")
def train_watchlist(db: Session = Depends(get_db)):
    success, message = analyzer.train_face_model(db)
    if not success:
        raise HTTPException(status_code=500, detail=message)
    return {"detail": message}

@app.get("/api/alerts", response_model=List[schemas.AlertResponse])
def get_alerts(limit: int = 50, db: Session = Depends(get_db)):
    return db.query(Alert).order_by(Alert.timestamp.desc()).limit(limit).all()

@app.post("/api/simulate_alert")
def simulate_alert(
    source: str = Form(...),
    type: str = Form(...),
    message: str = Form(...),
    confidence: float = Form(...),
    db: Session = Depends(get_db)
):
    """
    Creates a simulated threat alert for demo purposes.
    Generates a dummy red tactical screen capture.
    """
    # Create mock frame (solid dark red)
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    # Draw simple targeting and warning overlays
    cv2.rectangle(dummy_frame, (50, 50), (590, 430), (0, 0, 150), -1) # Dark red background
    cv2.putText(dummy_frame, "TACTICAL SIMULATION", (150, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    cv2.putText(dummy_frame, f"ALERT: {type.upper()}", (100, 220), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
    cv2.putText(dummy_frame, message, (100, 260), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    
    analyzer.trigger_alert(db, source, type, message, confidence, dummy_frame)
    return {"status": "Alert simulated successfully"}


def generate_video_stream(source: str):
    """
    Yields video frames with HUD overlay.
    Attempts to read from physical camera for 'webcam'.
    Otherwise, generates advanced realistic mock canvas (drones/bodycams/legacy streams).
    """
    db = next(get_db())
    cap = None
    
    if source == "webcam":
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("Webcam not available, fallback to simulator.")
            cap = None

    # Constants for simulator
    sim_width, sim_height = 640, 480
    bg_color = (15, 15, 15) # Near black
    shapes = []
    
    # Generate random shapes simulating movement
    for _ in range(3):
        shapes.append({
            "x": random.randint(100, 500),
            "y": random.randint(100, 380),
            "vx": random.choice([-3, -2, 2, 3]),
            "vy": random.choice([-3, -2, 2, 3]),
            "size": random.randint(20, 40),
            "color": (255, 255, 255), # White silhouettes
            "type": random.choice(["person", "susp_box", "neutral"])
        })

    frame_count = 0
    
    while True:
        frame_count += 1
        
        if cap is not None:
            ret, frame = cap.read()
            if not ret:
                # Loop video or break
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
        else:
            # Generate simulator frame
            frame = np.zeros((sim_height, sim_width, 3), dtype=np.uint8)
            frame[:] = bg_color
            
            # Draw grids/radar sweep
            for i in range(0, sim_width, 80):
                cv2.line(frame, (i, 0), (i, sim_height), (30, 30, 30), 1)
            for j in range(0, sim_height, 80):
                cv2.line(frame, (0, j), (sim_width, j), (30, 30, 30), 1)
            
            # Dynamic movement simulation
            for s in shapes:
                s["x"] += s["vx"]
                s["y"] += s["vy"]
                
                # Bounce on boundaries
                if s["x"] < 50 or s["x"] > sim_width - 50:
                    s["vx"] *= -1
                if s["y"] < 50 or s["y"] > sim_height - 50:
                    s["vy"] *= -1
                
                # Draw simulated target based on type
                x, y, sz = s["x"], s["y"], s["size"]
                if s["type"] == "person":
                    # Draw a stick figure or silhouette
                    cv2.circle(frame, (x, y - sz), sz // 2, (255, 255, 255), -1) # Head
                    cv2.line(frame, (x, y - sz // 2), (x, y + sz), (255, 255, 255), 3) # Body
                    cv2.line(frame, (x - sz, y), (x + sz, y), (255, 255, 255), 2) # Arms
                    cv2.line(frame, (x, y + sz), (x - sz // 2, y + sz * 2), (255, 255, 255), 2) # Legs
                    cv2.line(frame, (x, y + sz), (x + sz // 2, y + sz * 2), (255, 255, 255), 2)
                    
                    # Randomly hold a knife/suspicious item for demo trigger every 150 frames
                    if frame_count % 200 > 160:
                        # Draw weapon dot
                        cv2.circle(frame, (x + sz, y), 8, (0, 0, 255), -1)
                        cv2.line(frame, (x + sz, y), (x + sz + 15, y - 10), (0, 0, 255), 3)
                        # Write fake text so detector detects it
                        cv2.putText(frame, "object: knife", (x + sz + 5, y - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)
                
                elif s["type"] == "susp_box":
                    # Unattended package
                    cv2.rectangle(frame, (x - sz, y - sz), (x + sz, y + sz), (0, 0, 255), -1) # Red warning package
                    cv2.putText(frame, "object: backpack", (x - sz, y - sz - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)
                
                else:
                    # Neutral background motion
                    cv2.circle(frame, (x, y), sz, (100, 100, 100), 1)

            # Draw a simulated face to trigger face cascade occasionally
            if frame_count % 150 > 90:
                face_x, face_y = 320, 240
                # Draw standard facial oval
                cv2.ellipse(frame, (face_x, face_y), (35, 45), 0, 0, 360, (255, 255, 255), -1)
                # eyes/nose/mouth details
                cv2.circle(frame, (face_x - 12, face_y - 10), 4, (0, 0, 0), -1)
                cv2.circle(frame, (face_x + 12, face_y - 10), 4, (0, 0, 0), -1)
                cv2.ellipse(frame, (face_x, face_y + 15), (12, 6), 0, 0, 180, (0, 0, 0), 2)
        
        # Analyze frame using ML backend (YOLO & Face LBPH)
        try:
            processed = analyzer.process_frame(frame, source, db)
        except Exception as e:
            print(f"Error processing frame: {e}")
            processed = frame

        # Encode frame as JPEG
        ret, jpeg = cv2.imencode('.jpg', processed)
        if not ret:
            continue
            
        frame_bytes = jpeg.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        
        # Limit framerate (e.g. ~15-20 FPS)
        time.sleep(0.06)

    if cap is not None:
        cap.release()

@app.get("/api/video_feed")
def get_video_feed(source: str = "webcam"):
    """
    Streams the video feed using MJPEG protocol.
    """
    if source not in SOURCES:
        source = "webcam"
    return StreamingResponse(
        generate_video_stream(source),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )
