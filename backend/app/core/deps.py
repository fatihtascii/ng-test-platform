from app.db.database import SessionLocal

def get_db():
    """FastAPI dependency injection için DB session üretici."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
