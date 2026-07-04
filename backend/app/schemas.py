from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class WatchlistMemberBase(BaseModel):
    name: str

class WatchlistMemberCreate(WatchlistMemberBase):
    pass

class WatchlistMemberResponse(WatchlistMemberBase):
    id: int
    photo_path: str
    label_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class AlertResponse(BaseModel):
    id: int
    timestamp: datetime
    source: str
    type: str
    message: str
    confidence: float
    frame_path: Optional[str] = None

    class Config:
        from_attributes = True

class SystemStats(BaseModel):
    active_sources: int
    watchlist_count: int
    total_alerts: int
    trained: bool
