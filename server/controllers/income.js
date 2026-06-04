import pool from "../config/db.js"

export const getIncomeSources=async (req, res) => {
    const userId=req.user.id;
    if(!userId){
        return res.status(400).json({error:"unauthorized access"})
    }
    try {
        const { rows } = await pool.query(
        `SELECT * FROM income_sources 
        WHERE user_id = $1 AND is_active = true 
        ORDER BY created_at DESC`,
        [userId]
        )
        res.json(rows)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}


export const getIncomeByRange = async (req, res) => {
    const userId = req.user.id
    const { from, to } = req.query

    if (!from || !to) {
        return res.status(400).json({ 
        error: 'from and to dates are required' 
        })
    }

    const fromDate = new Date(from)
    const toDate = new Date(to)

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({ 
        error: 'invalid date format — use YYYY-MM-DD' 
        })
    }

    if (fromDate > toDate) {
        return res.status(400).json({ 
        error: 'from date cannot be after to date' 
        })
    }

    try {
       
        const incomeSourcesResult = await pool.query(
        `SELECT 
            id,
            label AS title,
            amount,
            frequency,
            start_date,
            'recurring' AS income_type
        FROM income_sources
        WHERE user_id = $1 
        AND is_active = true
        AND start_date <= $2`,
        [userId, toDate]
        )

        
        const incomeTransactionsResult = await pool.query(
        `SELECT 
            t.id,
            COALESCE(t.note, 'One time income') AS title,
            t.amount,
            t.date,
            'one_time' AS income_type
        FROM transactions AS t
        WHERE t.user_id = $1 
        AND t.type = 'income'
        AND t.date >= $2
        AND t.date <= $3`,
        [userId, fromDate, toDate]
        )

        const recurringWithTotal = incomeSourcesResult.rows.map(source => {
            const start = new Date(
                Math.max(new Date(source.start_date), fromDate)
            )
            const monthsInRange = 
                (toDate.getFullYear() - start.getFullYear()) * 12 +
                (toDate.getMonth() - start.getMonth()) + 1

            return {
                ...source,
                months_in_range: monthsInRange,
                total_for_range: parseFloat(source.amount) * monthsInRange
            }
        })

        const allIncome = [
        ...recurringWithTotal,
        ...incomeTransactionsResult.rows
        ]

        const total = [
        ...recurringWithTotal.map(s => s.total_for_range),
        ...incomeTransactionsResult.rows.map(t => parseFloat(t.amount))
        ].reduce((sum, amount) => sum + amount, 0)

        res.json({
        from,
        to,
        total,
        income: allIncome
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

export const addIncomeSources=async (req,res)=>{
    const userId=req.user.id;
    const { label, amount, frequency, start_date } = req.body;
    if(!userId){
        return res.status(401).json({error:"unauthorized access"});
    }
    if(!label || !frequency || amount==null){
        return res.status(400).json({error:'frequency, amount and label is required'});
    }
    if(frequency!='monthly' && frequency!='weekly' && frequency!='one-time'){
        return res.status(400).json({error:'frequency must be monthly, weekly or one-time'});
    }
    try{
        const {rows}= await pool.query(
            `INSERT INTO income_sources (user_id, label, amount, frequency, start_date) VALUES ($1,$2, $3,$4, $5) RETURNING *`,
            [userId, label, amount, frequency, start_date || new Date()]
        )
        res.status(201).json(rows[0])
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

export const updateIncomeSources=async (req, res) => {
    const userId=req.user.id
    const incomeSourceId=req.params.id
    if(!userId){
        return res.status(401).json({error:'unauthorized access'});
    }
    if(!incomeSourceId){
        return res.status(404).json({error:'Income source not found'});
    }
    const { label, amount, frequency, is_active } = req.body;
    if(frequency && frequency!='monthly' && frequency!='weekly' && frequency!='one-time'){
        return res.status(400).json({error:'frequency must be monthly, weekly or one-time'});
    }
    try {
        const check = await pool.query(
        `SELECT id FROM income_sources WHERE id = $1 AND user_id = $2`,
        [incomeSourceId, userId]
        )
        if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Income source not found' })
        }

        const { rows } = await pool.query(
        `UPDATE income_sources 
        SET label = COALESCE($1, label),
            amount = COALESCE($2, amount),
            frequency = COALESCE($3, frequency),
            is_active = COALESCE($4, is_active)
        WHERE id = $5 AND user_id = $6 
        RETURNING *`,
        [label, amount, frequency, is_active, incomeSourceId, userId]
        )
        res.json(rows[0])
    } catch (err) {
        res.status(500).json({ error: err.message })
  }
}

export const deleteIncomeSources= async (req, res) => {
    const userId=req.user.id
    const incomeSourceId=req.params.id
    if(!userId){
        return res.status(401).json({error:'unauthorized access'});
    }
    if(!incomeSourceId){
        return res.status(404).json({error:'Income source not found'});
    }
    try {
        const check = await pool.query(
        `SELECT id FROM income_sources WHERE id = $1 AND user_id = $2`,
        [incomeSourceId, userId]
        )
        if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Income source not found' })
        }

        await pool.query(
        `UPDATE income_sources SET is_active = false 
        WHERE id = $1 AND user_id = $2`,
        [incomeSourceId, userId]
        )
        res.json({ message: 'Income source deactivated' })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}