from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title='FinSight Python Service')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5000'],
    allow_methods=['*'],
    allow_headers=['*']
)

@app.get('/')
async def root():
    return { 'message': 'FinSight Python service running ✅' }