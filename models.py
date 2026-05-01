from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class SensorReading(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    temp: float
    humidity: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    sensor_id: Optional[int] = Field(default=None)
