import pool from '../config/db.js'

export const getCategories = async (req, res) => {
    const userId = req.user.id
    if(!userId){
        return res.status(400).json({error:"unauthorized access"})
    }
    try {
        const { rows } = await pool.query(
        `SELECT 
            c.id,
            c.name,
            c.color,
            c.created_at,
            COUNT(t.id) as transaction_count
        FROM expense_categories c
        LEFT JOIN transactions t
            ON t.category_id = c.id
        WHERE c.user_id = $1
        GROUP BY 
            c.id,
            c.name,
            c.color,
            c.created_at
        ORDER BY c.name`,
        [userId]
        )
        res.json(rows)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

export const addCategory = async (req, res) => {
    const userId = req.user.id
    if(!userId){
        return res.status(400).json({error:"unauthorized access"})
    }
    const { name, color } = req.body

    if (!name) {
        return res.status(400).json({ error: 'name is required' })
    }

    try {
        const existingCategory = await pool.query(
        `SELECT id 
        FROM expense_categories 
        WHERE user_id = $1 
        AND LOWER(name) = LOWER($2)`,
        [userId, name]
        )
        if (existingCategory.rows.length > 0) {
        return res.status(400).json({ error: 'category with this name already exists' })
        }

        const { rows } = await pool.query(
        `INSERT INTO expense_categories (user_id, name, color)
        VALUES ($1, $2, $3) 
        RETURNING 
            id,
            name,
            color,
            created_at`,
        [userId, name, color || '#888888']
        )
        res.status(201).json(rows[0])
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

export const updateCategory = async (req, res) => {  
    const userId = req.user.id
    if(!userId){
        return res.status(400).json({error:"unauthorized access"})
    }
    const categoryId = req.params.id
    const { name, color } = req.body

    try {
        
        const existingCategory = await pool.query(
        `SELECT id 
        FROM expense_categories 
        WHERE id = $1 
        AND user_id = $2`,
        [categoryId, userId]
        )
        if (existingCategory.rows.length === 0) {
        return res.status(404).json({ error: 'Category not found' })
        }

        const { rows } = await pool.query(
        `UPDATE expense_categories
        SET 
            name = COALESCE($1, name),
            color = COALESCE($2, color)
        WHERE id = $3 
        AND user_id = $4
        RETURNING 
            id,
            name,
            color,
            created_at`,
        [name, color, categoryId, userId]
        )
        res.json(rows[0])
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

export const deleteCategory = async (req, res) => {
    if(!userId){
        return res.status(400).json({error:"unauthorized access"})
    }
    const userId = req.user.id
    const categoryId = req.params.id

    try {
        const existingCategory = await pool.query(
        `SELECT id 
        FROM expense_categories 
        WHERE id = $1 
        AND user_id = $2`,
        [categoryId, userId]
        )
        if (existingCategory.rows.length === 0) {
        return res.status(404).json({ error: 'Category not found' })
        }

        const transactionCount = await pool.query(
        `SELECT COUNT(id) 
        FROM transactions 
        WHERE category_id = $1`,
        [categoryId]
        )
        if (parseInt(transactionCount.rows[0].count) > 0) {
        return res.status(400).json({
            error: 'Cannot delete category that has transactions — reassign them first'
        })
        }

        await pool.query(
        `DELETE FROM expense_categories 
        WHERE id = $1 
        AND user_id = $2`,
        [categoryId, userId]
        )
        res.json({ message: 'Category deleted successfully' })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}