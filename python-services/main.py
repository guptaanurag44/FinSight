from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.stocks import router as stocks_router
from routes.mf import router as mf_router
from config.db import get_connection

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        conn.close()
        print("Database Connected")
    except Exception as e:
        print(f"❌ DB connection failed: {e}")
    yield

app = FastAPI(title="FinSight Python Service", version="1.0.0", lifespan=lifespan)

# CORS — only Node backend (port 5000) should talk to this service.
# Never expose port 8000 to the public/frontend directly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers — prefix is already defined inside each router
app.include_router(stocks_router)
app.include_router(mf_router)


@app.get("/")
def health_check():
    return {"status": "FinSight Python service is running", "port": 8000}