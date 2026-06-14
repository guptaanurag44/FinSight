import requests
from fastapi import APIRouter, HTTPException
from config.db import get_connection

router = APIRouter(prefix="/mf", tags=["mutual-funds"])

AMFI_NAV_URL = "https://www.amfiindia.com/spages/NAVAll.txt"


def fetch_amfi_data() -> list[dict]:
    response = requests.get(AMFI_NAV_URL, timeout=30)
    response.raise_for_status()

    lines = response.text.splitlines()

    delimiter = "|"
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("Open") and not stripped.startswith("Close"):
            if ";" in stripped:
                delimiter = ";"
            break

    funds = []
    for line in lines:
        parts = line.strip().split(delimiter)
        if len(parts) != 6:
            continue
        scheme_code, isin1, isin2, scheme_name, nav, nav_date = parts
        if not scheme_code.strip().isdigit():
            continue
        try:
            nav_value = float(nav.strip())
        except ValueError:
            nav_value = None

        funds.append({
            "scheme_code": scheme_code.strip(),
            "scheme_name": scheme_name.strip(),
            "nav": nav_value,
            "nav_date": nav_date.strip()
        })

    return funds


@router.get("/search")
def search_mf(q: str):
    if not q or len(q) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters")

    try:
        funds = fetch_amfi_data()
        query = q.lower().strip()

        matches = [
            f for f in funds
            if query in f["scheme_name"].lower()
        ]

        return {
            "success": True,
            "query": q,
            "results": matches[:20]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

@router.get("/verify/{scheme_code}")
def verify_scheme(scheme_code: str):
    scheme_code = scheme_code.strip()
    try:
        funds = fetch_amfi_data()

        match = next((f for f in funds if f["scheme_code"] == scheme_code), None)

        if not match:
            raise HTTPException(
                status_code=404,
                detail=f"Scheme code '{scheme_code}' not found in AMFI data"
            )

        return {"success": True, **match}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/update-nav")
def update_nav():
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT DISTINCT scheme_code FROM mf_holdings")
        rows = [dict(r) for r in cur.fetchall()]

        if not rows:
            cur.close()
            conn.close()
            return {"success": True, "message": "No MF holdings found, nothing to update"}

        held_codes = {row["scheme_code"] for row in rows}

        all_funds = fetch_amfi_data()
        relevant = [f for f in all_funds if f["scheme_code"] in held_codes]

        upsert_sql = """
            INSERT INTO mf_nav (scheme_code, nav, nav_date)
            VALUES (%s, %s, %s)
            ON CONFLICT (scheme_code) DO UPDATE
                SET nav      = EXCLUDED.nav,
                    nav_date = EXCLUDED.nav_date
        """

        updated = 0
        for fund in relevant:
            if fund["nav"] is not None:
                cur.execute(upsert_sql, (
                    fund["scheme_code"],
                    fund["nav"],
                    fund["nav_date"]
                ))
                updated += 1

        conn.commit()
        cur.close()
        conn.close()

        return {
            "success": True,
            "message": f"Updated NAV for {updated} of {len(held_codes)} held funds"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))