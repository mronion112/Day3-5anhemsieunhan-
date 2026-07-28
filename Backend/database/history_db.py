from sqlalchemy import create_engine, Column, String, Text, Integer, Float, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings
import datetime

Base = declarative_base()

class InteractionLog(Base):
    __tablename__ = "interaction_logs"
    id = Column(String, primary_key=True, index=True)
    user_prompt = Column(Text)
    ai_response = Column(Text)
    retrieved_context = Column(Text)
    input_token = Column(Integer)
    output_token = Column(Integer)
    cost = Column(Float)
    time_in = Column(DateTime)
    time_out = Column(DateTime)

engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)