import pool from "../config/db.js";
export const getPortfolios = async (req, res) => {
    const userId = req.user.id;
    try {
        const { rows } = await pool.query(
            `SELECT 
            p.id,
            p.name,
            p.created_at,
            COUNT(DISTINCT sh.id) AS stock_count,
            COUNT(DISTINCT mh.id) AS mf_count
        FROM portfolios AS p
        LEFT JOIN stock_holdings AS sh ON sh.portfolio_id = p.id
        LEFT JOIN mf_holdings AS mh ON mh.portfolio_id = p.id
        WHERE p.user_id = $1
        GROUP BY p.id, p.name, p.created_at
        ORDER BY p.created_at ASC`,
            [userId],
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const createPortfolio = async (req, res) => {
    const userId = req.user.id;
    const { name } = req.body;

    if (!name) {
        return res
            .status(400)
            .json({ error: "name  of portfolio is required" });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO portfolios (user_id, name)
       VALUES ($1, $2)
       RETURNING id, name, created_at`,
            [userId, name],
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const updatePortfolio = async (req, res) => {
    const userId = req.user.id;
    const portfolioId = req.params.id;
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: " new name is required" });
    }

    try {
        const existing = await pool.query(
            `SELECT id FROM portfolios WHERE id = $1 AND user_id = $2`,
            [portfolioId, userId],
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: "Portfolio not found" });
        }

        const { rows } = await pool.query(
            `UPDATE portfolios
       SET name = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, name, created_at`,
            [name, portfolioId, userId],
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

export const deletePortfolio = async (req, res) => {
    const userId = req.user.id;
    const portfolioId = req.params.id;

    try {
        const existing = await pool.query(
            `SELECT id FROM portfolios WHERE id = $1 AND user_id = $2`,
            [portfolioId, userId],
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: "Portfolio not found" });
        }

        await pool.query(
            `DELETE FROM portfolios WHERE id = $1 AND user_id = $2`,
            [portfolioId, userId],
        );
        res.json({ message: "Portfolio deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
