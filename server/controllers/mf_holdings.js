import pool from "../config/db.js";

export const searchFunds = async (req, res) => {
    const { q } = req.query;

    if (!q || q.length < 3) {
        return res.status(400).json({
            error: "search query must be at least 3 characters",
        });
    }

    try {
        const response = await fetch(
            `http://localhost:8000/mf/search?q=${encodeURIComponent(q)}`,
        );

        if (!response.ok) {
            throw new Error("Python service unavailable");
        }

        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(503).json({
            funds: [],
            message:
                "Search unavailable. Find your scheme code at: https://www.amfiindia.com/net-asset-value",
            error: err.message,
        });
    }
};

export const getMFHoldings = async (req, res) => {
    const userId = req.user.id;
    const { portfolio_id } = req.query;

    let conditions = ["mh.user_id = $1"];
    let params = [userId];
    let i = 2;

    if (portfolio_id) {
        conditions.push(`mh.portfolio_id = $${i}`);
        params.push(portfolio_id);
        i++;
    }

    try {
        const { rows } = await pool.query(
            `SELECT 
         mh.id,
         mh.fund_name,
         mh.scheme_code,
         mh.folio_number,
         mh.units,
         mh.nav_at_purchase,
         mh.purchase_date,
         mh.fund_type,
         mh.portfolio_id,
         p.name AS portfolio_name,
         (CURRENT_DATE - mh.purchase_date) AS days_held,
         CASE
           WHEN (CURRENT_DATE - mh.purchase_date) > 365 THEN 'LTCG'
           ELSE 'STCG'
         END AS tax_type,
         ROUND(mh.units * mh.nav_at_purchase, 2) AS invested_amount,
         COALESCE(mn.nav, mh.nav_at_purchase) AS current_nav,
         mn.nav_date AS nav_as_of,
         ROUND(
           mh.units * COALESCE(mn.nav, mh.nav_at_purchase)
         , 2) AS current_value,
         ROUND(
           (mh.units * COALESCE(mn.nav, mh.nav_at_purchase))
           - (mh.units * mh.nav_at_purchase)
         , 2) AS pnl,
         ROUND(
           (
             (COALESCE(mn.nav, mh.nav_at_purchase) - mh.nav_at_purchase)
             / NULLIF(mh.nav_at_purchase, 0)
           ) * 100
         , 2) AS pnl_pct
       FROM mf_holdings AS mh
       LEFT JOIN portfolios AS p 
         ON mh.portfolio_id = p.id
       LEFT JOIN mf_nav AS mn 
         ON mn.scheme_code = mh.scheme_code
       WHERE ${conditions.join(" AND ")}
       ORDER BY mh.created_at DESC`,
            params,
        );

        const totalInvested = rows.reduce(
            (sum, r) => sum + parseFloat(r.invested_amount),
            0,
        );

        const totalCurrentValue = rows.reduce(
            (sum, r) => sum + parseFloat(r.current_value),
            0,
        );

        const totalPnl = totalCurrentValue - totalInvested;

        const totalPnlPct =
            totalInvested > 0
                ? ((totalPnl / totalInvested) * 100).toFixed(2)
                : 0;

        const missingSchemeCode = rows
            .filter((r) => !r.scheme_code)
            .map((r) => r.fund_name);

        res.json({
            holdings: rows,
            summary: {
                total_invested: parseFloat(totalInvested.toFixed(2)),
                total_current_value: parseFloat(totalCurrentValue.toFixed(2)),
                total_pnl: parseFloat(totalPnl.toFixed(2)),
                total_pnl_pct: parseFloat(totalPnlPct),
                nav_note:
                    missingSchemeCode.length > 0
                        ? `Live NAV unavailable for: ${missingSchemeCode.join(", ")} — search and add scheme_code to enable`
                        : "NAV updated daily after market close via AMFI",
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const addMFHolding = async (req, res) => {
    const userId = req.user.id;
    const {
        scheme_code,
        folio_number,
        units,
        nav_at_purchase,
        purchase_date,
        fund_type,
        portfolio_id,
    } = req.body;

    if (!scheme_code || !units || !nav_at_purchase || !purchase_date) {
        return res.status(400).json({
            error: "scheme_code, units, nav_at_purchase and purchase_date are required",
        });
    }
    if (units <= 0) {
        return res.status(400).json({ error: "units must be greater than 0" });
    }
    if (nav_at_purchase <= 0) {
        return res
            .status(400)
            .json({ error: "nav_at_purchase must be greater than 0" });
    }

    try {
        let fund_name = null;

        try {
            const verifyResponse = await fetch(
                `http://localhost:8000/mf/verify/${scheme_code}`,
                { signal: AbortSignal.timeout(5000) },
            );

            if (!verifyResponse.ok) {
                return res.status(400).json({
                    error: `Invalid scheme_code ${scheme_code} — not found in AMFI. Use GET /api/mf/search?q=fundname to find correct scheme_code`,
                });
            }

            const fundData = await verifyResponse.json();
            fund_name = fundData.scheme_name;
        } catch (err) {
            if (err.name === "TimeoutError") {
                return res.status(503).json({
                    error: "Could not verify fund — AMFI service timed out. Please try again",
                });
            }
            return res.status(503).json({
                error: "Could not verify fund — service unavailable. Please try again later",
            });
        }

        let finalPortfolioId = portfolio_id;

        if (!portfolio_id) {
            const portfoliosResult = await pool.query(
                `SELECT id, name FROM portfolios WHERE user_id = $1`,
                [userId],
            );

            if (portfoliosResult.rows.length === 0) {
                const newPortfolio = await pool.query(
                    `INSERT INTO portfolios (user_id, name)
           VALUES ($1, 'My Portfolio')
           RETURNING id`,
                    [userId],
                );
                finalPortfolioId = newPortfolio.rows[0].id;
            } else if (portfoliosResult.rows.length === 1) {
                finalPortfolioId = portfoliosResult.rows[0].id;
            } else {
                return res.status(400).json({
                    error: "portfolio_id is required — you have multiple portfolios",
                    portfolios: portfoliosResult.rows,
                });
            }
        }
        if (portfolio_id) {
            const portfolioCheck = await pool.query(
                `SELECT id FROM portfolios WHERE id = $1 AND user_id = $2`,
                [portfolio_id, userId],
            );
            if (portfolioCheck.rows.length === 0) {
                return res.status(404).json({ error: "Portfolio not found" });
            }
        }
        const duplicateCheck = await pool.query(
            `SELECT id FROM mf_holdings
       WHERE user_id = $1
       AND scheme_code = $2
       AND portfolio_id = $3`,
            [userId, scheme_code, finalPortfolioId],
        );
        if (duplicateCheck.rows.length > 0) {
            return res.status(400).json({
                error: "This fund already exists in this portfolio — update existing holding instead",
            });
        }
        const { rows } = await pool.query(
            `INSERT INTO mf_holdings
         (portfolio_id, user_id, fund_name, scheme_code, folio_number,
          units, nav_at_purchase, purchase_date, fund_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
            [
                finalPortfolioId,
                userId,
                fund_name,
                scheme_code,
                folio_number || null,
                units,
                nav_at_purchase,
                purchase_date,
                fund_type || null,
            ],
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const updateMFHolding = async (req, res) => {
    const userId = req.user.id;
    const holdingId = req.params.id;

    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: "nothing is provided to update" });
    }

    const { folio_number, units, nav_at_purchase, purchase_date, fund_type } =
        req.body;

    if (units !== undefined && units <= 0) {
        return res.status(400).json({ error: "units must be greater than 0" });
    }
    if (nav_at_purchase !== undefined && nav_at_purchase <= 0) {
        return res
            .status(400)
            .json({ error: "nav_at_purchase must be greater than 0" });
    }

    try {
        const existing = await pool.query(
            `SELECT id FROM mf_holdings WHERE id = $1 AND user_id = $2`,
            [holdingId, userId],
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: "MF holding not found" });
        }

        const { rows } = await pool.query(
            `UPDATE mf_holdings
       SET
         folio_number    = COALESCE($1, folio_number),
         units           = COALESCE($2, units),
         nav_at_purchase = COALESCE($3, nav_at_purchase),
         purchase_date   = COALESCE($4, purchase_date),
         fund_type       = COALESCE($5, fund_type)
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
            [
                folio_number,
                units,
                nav_at_purchase,
                purchase_date,
                fund_type,
                holdingId,
                userId,
            ],
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const deleteMFHolding = async (req, res) => {
    const userId = req.user.id;
    const holdingId = req.params.id;

    try {
        const existing = await pool.query(
            `SELECT id FROM mf_holdings WHERE id = $1 AND user_id = $2`,
            [holdingId, userId],
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: "MF holding not found" });
        }

        await pool.query(
            `DELETE FROM mf_holdings WHERE id = $1 AND user_id = $2`,
            [holdingId, userId],
        );
        res.json({ message: "MF holding deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
