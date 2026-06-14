import yfinance as yf
from fastapi import APIRouter, HTTPException
from config.db import get_connection

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("/verify/{ticker}")
def verify_ticker(ticker: str):
    ticker = ticker.upper().strip()
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            "SELECT ticker, company_name FROM nse_stocks WHERE ticker = %s",
            (ticker,)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row:
            raise HTTPException(
                status_code=404,
                detail=f"Ticker '{ticker}' not found in NSE data"
            )

        row = dict(row)
        return {"success": True, "ticker": row["ticker"], "company_name": row["company_name"]}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/{ticker}")
def get_stock_price(ticker: str):
    ticker = ticker.upper().strip()
    yf_symbol = f"{ticker}.NS"

    try:
        stock = yf.Ticker(yf_symbol)
        price = stock.fast_info.last_price

        if price is None:
            raise HTTPException(
                status_code=404,
                detail=f"Could not fetch price for '{ticker}'. Check if ticker is valid."
            )

        return {
            "success": True,
            "ticker": ticker,
            "price": round(float(price), 2),
            "currency": "INR"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/{ticker}/history")
def get_stock_history(ticker: str, period: str = "1mo", interval: str = "1d"):
    ticker = ticker.upper().strip()
    yf_symbol = f"{ticker}.NS"

    try:
        stock = yf.Ticker(yf_symbol)
        hist = stock.history(period=period, interval=interval)

        if hist.empty:
            raise HTTPException(
                status_code=404,
                detail=f"No history found for '{ticker}'"
            )

        history = []
        for date, row in hist.iterrows():
            history.append({
                "date": str(date)[:10],
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"])
            })

        return {
            "success": True,
            "ticker": ticker,
            "period": period,
            "interval": interval,
            "history": history
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))