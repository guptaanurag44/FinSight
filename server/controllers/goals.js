import pool from '../config/db.js'
import { invalidateCache } from './ai.js'

export const getGoals = async (req, res) => {
    const userId = req.user.id
    try {
        const { rows } = await pool.query(
        `SELECT 
            id,
            title,
            target_amount,
            current_saved,
            target_date,
            status,
            created_at,
            (target_date - CURRENT_DATE) AS days_remaining,
            ROUND(
            (current_saved / NULLIF(target_amount, 0)) * 100
            , 1) AS percentage_completed
        FROM goals
        WHERE user_id = $1
        ORDER BY created_at DESC`,
        [userId]
        )
        res.json(rows)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

export const addGoal = async (req, res) => {
    const userId = req.user.id
    const { title, target_amount, target_date, current_saved } = req.body

    if (!title || !target_amount || !target_date) {
        return res.status(400).json({ 
        error: 'title, target_amount and target_date are required' 
        })
    }
    if (target_amount <= 0) {
        return res.status(400).json({ 
        error: 'target_amount must be greater than 0' 
        })
    }

    const today = new Date()
    const goalDate = new Date(target_date)
    if (goalDate <= today) {
        return res.status(400).json({ 
        error: 'target_date must be in the future' 
        })
    }

    try {
        const { rows } = await pool.query(
        `INSERT INTO goals 
            (user_id, title, target_amount, current_saved, target_date, status)
        VALUES ($1, $2, $3, $4, $5, 'active')
        RETURNING 
            id,
            title,
            target_amount,
            current_saved,
            target_date,
            status,
            created_at`,
        [userId, title, target_amount, current_saved || 0, target_date]
        )

        await invalidateCache(userId)
        res.status(201).json(rows[0])
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

export const updateGoal = async (req, res) => {
    const userId = req.user.id
    const goalId = req.params.id

    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: 'nothing is provided to update' })
    }

    const { title, target_amount, target_date, current_saved, status } = req.body

    if (status && !['active', 'abandoned'].includes(status)) {
        return res.status(400).json({
        error: 'status can only be set to active or abandoned manually'
        })
    }

    if (target_amount !== undefined && target_amount <= 0) {
        return res.status(400).json({
        error: 'target_amount must be greater than 0'
        })
    }

    if (current_saved !== undefined && current_saved < 0) {
        return res.status(400).json({
        error: 'current_saved cannot be negative'
        })
    }

    if (target_date) {
        const today = new Date()
        const goalDate = new Date(target_date)
        if (goalDate <= today) {
        return res.status(400).json({
            error: 'target_date must be in the future'
        })
        }
    }

    try {
        
        const existingGoal = await pool.query(
        `SELECT 
            id,
            target_amount,
            current_saved
        FROM goals
        WHERE id = $1 AND user_id = $2`,
        [goalId, userId]
        )
        if (existingGoal.rows.length === 0) {
        return res.status(404).json({ error: 'Goal not found' })
        }

        const finalTargetAmount = target_amount !== undefined ? Number(target_amount) : parseFloat(existingGoal.rows[0].target_amount)

        const finalCurrentSaved = current_saved !== undefined? Number(current_saved) : parseFloat(existingGoal.rows[0].current_saved)

        let finalStatus = status
        if (finalCurrentSaved >= finalTargetAmount) {
        finalStatus = 'achieved'
        }

        const { rows } = await pool.query(
        `UPDATE goals
        SET
            title = COALESCE($1, title),
            target_amount = COALESCE($2, target_amount),
            target_date = COALESCE($3, target_date),
            current_saved = COALESCE($4, current_saved),
            status = COALESCE($5, status)
        WHERE id = $6 AND user_id = $7
        RETURNING
            id,
            title,
            target_amount,
            current_saved,
            target_date,
            status,
            created_at,
            (target_date - CURRENT_DATE) AS days_remaining,
            ROUND(
            (target_date - CURRENT_DATE) / 30.0
            , 1) AS months_remaining,
            ROUND(
            (current_saved / target_amount) * 100
            , 1) AS percentage_completed`,
        [title, target_amount, target_date, current_saved, finalStatus, goalId, userId]
        )
        await invalidateCache(userId)
        res.json(rows[0])
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

export const deleteGoal = async (req, res) => {
    const userId = req.user.id
    const goalId = req.params.id

    try {
        const existingGoal = await pool.query(
        `SELECT id 
        FROM goals 
        WHERE id = $1 AND user_id = $2`,
        [goalId, userId]
        )
        if (existingGoal.rows.length === 0) {
        return res.status(404).json({ error: 'Goal not found' })
        }

        await pool.query(
        `DELETE FROM goals 
        WHERE id = $1 AND user_id = $2`,
        [goalId, userId]
        )
        await invalidateCache(userId)
        res.json({ message: 'Goal deleted successfully' })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

