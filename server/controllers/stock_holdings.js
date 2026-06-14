import pool from "../config/db.js";

export const searchStocks = async (req, res) => {
    const { q } = req.query;

    if (!q || q.length < 2) {
        return res.status(400).json({
            error: "search query must be at least 2 characters",
        });
    }

    try {
        const countResult = await pool.query(`SELECT COUNT(*) FROM nse_stocks`);

        if (parseInt(countResult.rows[0].count) === 0) {
            return res.json({
                stocks: [],
                message:
                    "Stock database not loaded yet — please try again later",
            });
        }

        const { rows } = await pool.query(
            `SELECT 
         ticker,
         company_name,
         sector
       FROM nse_stocks
       WHERE LOWER(company_name) LIKE LOWER($1)
       OR LOWER(ticker) LIKE LOWER($2)
       ORDER BY company_name ASC
       LIMIT 20`,
            [`%${q}%`, `%${q}%`],
        );

        if (rows.length === 0) {
            return res.json({
                stocks: [],
                message:
                    "No stocks found — try searching by company name or ticker symbol",
            });
        }

        res.json({ stocks: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const getStockHoldings = async (req, res) => {
    const userId = req.user.id;
    const { portfolio_id } = req.query;

    let conditions = ["sh.user_id = $1"];
    let params = [userId];
    let i = 2;

    if (portfolio_id) {
        conditions.push(`sh.portfolio_id = $${i}`);
        params.push(portfolio_id);
        i++;
    }

    try {
        const { rows: holdings } = await pool.query(
            `SELECT 
            sh.id,
            sh.ticker,
            sh.company_name,
            sh.exchange,
            sh.quantity,
            sh.buy_price,
            sh.buy_date,
            sh.portfolio_id,
            p.name AS portfolio_name,
            -- invested amount
            ROUND(sh.quantity * sh.buy_price, 2) AS invested_amount,
            -- days held for tax calculation
            (CURRENT_DATE - sh.buy_date) AS days_held,
            -- tax type
            CASE 
            WHEN (CURRENT_DATE - sh.buy_date) > 365 THEN 'LTCG'
            ELSE 'STCG'
            END AS tax_type
        FROM stock_holdings AS sh
        LEFT JOIN portfolios AS p ON sh.portfolio_id = p.id
        WHERE ${conditions.join(" AND ")}
        ORDER BY sh.created_at DESC`,
            params,
        );

        if (holdings.length === 0) {
            return res.json([]);
        }

        const tickers = holdings.map((h) => h.ticker);
        const { rows: prices } = await pool.query(
            `SELECT 
            ticker,
            current_price,
            change_pct,
            last_updated
        FROM stock_prices
        WHERE ticker = ANY($1)`,
            [tickers],
        );

        const priceMap = {};
        prices.forEach((p) => {
            priceMap[p.ticker] = p;
        });

        const holdingsWithPrices = holdings.map((h) => {
            const priceData = priceMap[h.ticker];
            const currentPrice = priceData?.current_price || null;
            const investedAmount = parseFloat(h.invested_amount);

            const currentValue = currentPrice
                ? parseFloat(currentPrice) * parseFloat(h.quantity)
                : null;
            const pnl = currentValue ? currentValue - investedAmount : null;
            const pnlPct = pnl
                ? ((pnl / investedAmount) * 100).toFixed(2)
                : null;

            return {
                ...h,
                current_price: currentPrice,
                current_value: currentValue
                    ? parseFloat(currentValue.toFixed(2))
                    : null,
                pnl: pnl ? parseFloat(pnl.toFixed(2)) : null,
                pnl_pct: pnlPct ? parseFloat(pnlPct) : null,
                change_pct: priceData?.change_pct || null,
                prices_as_of: priceData?.last_updated || null,
            };
        });

        const totalInvested = holdingsWithPrices.reduce(
            (sum, h) => sum + parseFloat(h.invested_amount),
            0,
        );

        const totalCurrentValue = holdingsWithPrices
            .filter((h) => h.current_value !== null)
            .reduce((sum, h) => sum + h.current_value, 0);

        const totalPnl = totalCurrentValue - totalInvested;
        const totalPnlPct = ((totalPnl / totalInvested) * 100).toFixed(2);

        res.json({
            holdings: holdingsWithPrices,
            summary: {
                total_invested: parseFloat(totalInvested.toFixed(2)),
                total_current_value: parseFloat(totalCurrentValue.toFixed(2)),
                total_pnl: parseFloat(totalPnl.toFixed(2)),
                total_pnl_pct: parseFloat(totalPnlPct),
                prices_note:
                    "Prices updated after market close at 3:30 PM IST on trading days",
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const addStockHolding = async (req, res) => {
    const userId = req.user.id;
    const {
        ticker,
        company_name,
        exchange,
        quantity,
        buy_price,
        buy_date,
        portfolio_id,
    } = req.body;

    if (!ticker || !quantity || !buy_price || !buy_date) {
        return res.status(400).json({
            error: "ticker, quantity, buy_price and buy_date are required",
        });
    }
    if (quantity <= 0) {
        return res
            .status(400)
            .json({ error: "quantity must be greater than 0" });
    }
    if (buy_price <= 0) {
        return res
            .status(400)
            .json({ error: "buy_price must be greater than 0" });
    }

    try {
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

        let formattedTicker = ticker.toUpperCase();
        const { rows } = await pool.query(
            `INSERT INTO stock_holdings
            (portfolio_id, user_id, ticker, company_name, exchange, quantity, buy_price, buy_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
            [
                finalPortfolioId,
                userId,
                formattedTicker,
                company_name || null,
                exchange || "NSE",
                quantity,
                buy_price,
                buy_date,
            ],
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const updateStockHolding = async (req, res) => {
    const userId = req.user.id;
    const holdingId = req.params.id;

    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: "nothing is provided to update" });
    }

    const { quantity, buy_price, buy_date } = req.body;

    if (quantity !== undefined && quantity <= 0) {
        return res
            .status(400)
            .json({ error: "quantity must be greater than 0" });
    }
    if (buy_price !== undefined && buy_price <= 0) {
        return res
            .status(400)
            .json({ error: "buy_price must be greater than 0" });
    }

    try {
        const existing = await pool.query(
            `SELECT id FROM stock_holdings WHERE id = $1 AND user_id = $2`,
            [holdingId, userId],
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: "Holding not found" });
        }

        const { rows } = await pool.query(
            `UPDATE stock_holdings
       SET
         quantity  = COALESCE($1, quantity),
         buy_price = COALESCE($2, buy_price),
         buy_date  = COALESCE($3, buy_date)
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
            [quantity, buy_price, buy_date, holdingId, userId],
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const deleteStockHolding = async (req, res) => {
    const userId = req.user.id;
    const holdingId = req.params.id;

    try {
        const existing = await pool.query(
            `SELECT id FROM stock_holdings WHERE id = $1 AND user_id = $2`,
            [holdingId, userId],
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: "Holding not found" });
        }

        await pool.query(
            `DELETE FROM stock_holdings WHERE id = $1 AND user_id = $2`,
            [holdingId, userId],
        );
        res.json({ message: "Stock holding deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
