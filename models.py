from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class Sensor(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str


class SensorReading(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    temp: float
    humidity: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    sensor_id: Optional[int] = Field(default=None, foreign_key="sensor.id")


class HourlyReading(SQLModel, table=True):
    __tablename__ = "hourly_data"
    timestamp: datetime = Field(default_factory=datetime.utcnow, primary_key=True)
    temp_avg: float
    temp_min: float
    temp_max: float
    humidity_avg: float
    humidity_min: float
    humidity_max: float


class DailyReading(SQLModel, table=True):
    __tablename__ = "daily_data"

    timestamp: datetime = Field(default_factory=datetime.utcnow, primary_key=True)
    temp_avg: float
    temp_min: float
    temp_max: float
    humidity_avg: float
    humidity_min: float
    humidity_max: float
