import os
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Setup database path in project folder
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "nsg_analytics.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class WatchlistMember(Base):
    __tablename__ = "watchlist"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    photo_path = Column(String, nullable=False)
    label_id = Column(Integer, unique=True, index=True, nullable=False) # Numerical label for LBPH training
    created_at = Column(DateTime, default=datetime.utcnow)

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    source = Column(String, nullable=False) # e.g. "Drone-01", "Bodycam-03", "Webcam"
    type = Column(String, nullable=False)   # "WEAPON_DETECTED", "WATCHLIST_MATCH", "SUSPICIOUS_LOITERING"
    message = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    frame_path = Column(String, nullable=True) # Path to saved frame image

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
