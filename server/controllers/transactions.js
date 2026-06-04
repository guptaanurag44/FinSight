import pool from "../config/db.js";
import { GoogleGenerativeAI } from '@google/generative-ai'


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

export const getTransactions=async (req,res)=>{
    const userId=req.user.id;
    if(!userId){
        return res.status(400).json({error:"unauthorized access"});
    }
    const { month, year, type, category_id } = req.query;
    let params=[userId];
    let conditions=[`t.user_id =$1`]
    let i=2;

    if(month && year){
        conditions.push(`EXTRACT(MONTH FROM t.date) = $${i} AND EXTRACT(YEAR FROM t.date) = $${i + 1}`)
        params.push(month,year);
        i+=2;
    }
    if(type){
        conditions.push(`t.type = $${i} `);
        params.push(type)
        i++;
    }
    if (category_id === 'null') {
        conditions.push(`t.category_id IS NULL`)
    }
    else if(category_id){
        conditions.push(`category_id=$${i}`);
        params.push(category_id);
        i++;
    }
    try {
        const { rows } = await pool.query(
        `SELECT 
            t.id,
            t.type,
            t.amount,
            t.note,
            t.date,
            t.created_at,
            c.id AS category_id,
            c.name AS category_name,
            c.color AS category_color
        FROM transactions AS t
        LEFT JOIN expense_categories AS c 
            ON t.category_id = c.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY t.date DESC`,
        params
        )
        res.json(rows)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

export const getSummary = async (req, res) => {
    const userId = req.user.id
    const { month, year, from, to } = req.query
    let fromDate, toDate, period

    if (from && to) {
      
      fromDate = new Date(from)
      toDate = new Date(to)

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
      period = 'range'

    } else if (month && year) {
      
      fromDate = new Date(year, month - 1, 1)
      toDate = new Date(year, month, 0)
      period = 'monthly'

    } else if (year && !month) {
      
      fromDate = new Date(year, 0, 1)
      toDate = new Date(year, 11, 31)
      period = 'yearly'

    } else {
      
      const now = new Date()
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1)
      toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      period = 'monthly'
    }

    try {
      
      const recurringIncomeResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
        FROM income_sources
        WHERE user_id = $1 
        AND is_active = true 
        AND frequency = 'monthly'
        AND start_date <= $2`,
        [userId, toDate]
      )

      
      const oneTimeIncomeResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
        FROM transactions
        WHERE user_id = $1 
        AND type = 'income'
        AND date >= $2
        AND date <= $3`,
        [userId, fromDate, toDate]
      )

      
      const expensesByCategoryResult = await pool.query(
        `SELECT 
          COALESCE(c.name, 'Uncategorized') AS category,
          COALESCE(c.color, '#888888') AS color,
          SUM(t.amount) AS total
        FROM transactions AS t
        LEFT JOIN expense_categories AS c 
          ON t.category_id = c.id
        WHERE t.user_id = $1 
        AND t.type = 'expense'
        AND t.date >= $2
        AND t.date <= $3
        GROUP BY c.name, c.color
        ORDER BY total DESC`,
        [userId, fromDate, toDate]
      )

      
      
      const topExpenseCategory = expensesByCategoryResult.rows.length > 0
        ? expensesByCategoryResult.rows[0]
        : null

      
      const biggestTransactionResult = await pool.query(
        `SELECT 
          t.id,
          t.amount,
          t.type,
          t.note,
          t.date,
          c.name AS category_name
        FROM transactions AS t
        LEFT JOIN expense_categories AS c 
          ON t.category_id = c.id
        WHERE t.user_id = $1
        AND t.date >= $2
        AND t.date <= $3
        ORDER BY t.amount DESC
        LIMIT 1`,
        [userId, fromDate, toDate]
      )

      
      const incomeSourcesResult = await pool.query(
        `SELECT 
          label,
          amount,
          frequency
        FROM income_sources
        WHERE user_id = $1
        AND is_active = true
        AND start_date <= $2`,
        [userId, toDate]
      )

      const oneTimeIncomeBreakdownResult = await pool.query(
        `SELECT 
          COALESCE(note, 'One time income') AS label,
          amount,
          date
        FROM transactions
        WHERE user_id = $1
        AND type = 'income'
        AND date >= $2
        AND date <= $3
        ORDER BY amount DESC`,
        [userId, fromDate, toDate]
      )

      
      const totalIncome = parseFloat(recurringIncomeResult.rows[0].total)+ parseFloat(oneTimeIncomeResult.rows[0].total)

      const totalExpenses = expensesByCategoryResult.rows.reduce((sum, row) => sum + parseFloat(row.total), 0)

      const savings = totalIncome - totalExpenses

      const savingsRate = totalIncome > 0? ((savings / totalIncome) * 100).toFixed(1):0

      res.json({
        period,
        from: fromDate.toISOString().split('T')[0],
        to: toDate.toISOString().split('T')[0],
        total_income: totalIncome,
        total_expenses: totalExpenses,
        savings,
        savings_rate: parseFloat(savingsRate),
        top_expense_category: topExpenseCategory,
        biggest_transaction: biggestTransactionResult.rows[0] || null,
        expenses_by_category: expensesByCategoryResult.rows,
        income_breakdown: {
          recurring: incomeSourcesResult.rows,
          one_time: oneTimeIncomeBreakdownResult.rows
        }
      })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
}

export const addTransaction = async (req, res) => {
  const userId = req.user.id
  let { type, amount, category_id, note, date } = req.body
  let newCategoryCreated = null

  // validate required fields
  if (!type || !amount) {
    return res.status(400).json({ error: 'type and amount are required' })
  }
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: 'type must be income or expense' })
  }
  if (amount <= 0) {
    return res.status(400).json({ error: 'amount must be greater than 0' })
  }

  try {
    if (req.body.category_id) {
      const categoryCheck = await pool.query(
        `SELECT id 
         FROM expense_categories 
         WHERE id = $1 AND user_id = $2`,
        [req.body.category_id, userId]
      )
      if (categoryCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Category not found' })
      }
      category_id = req.body.category_id
    }

    // step 2 — if expense, no category provided but note exists → auto detect
    if (type === 'expense' && !category_id && note) {

      // fetch all this user's categories
      const categoriesResult = await pool.query(
        `SELECT id, name 
         FROM expense_categories 
         WHERE user_id = $1`,
        [userId]
      )

      const categoryNames = categoriesResult.rows.length > 0
        ? categoriesResult.rows.map(c => c.name).join(', ')
        : 'none'

      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
      const result = await model.generateContent(
        `You are an expense categorizer for an Indian user.
         Existing categories: ${categoryNames}
         
         Expense description: "${note}"
         
         Instructions:
         - If the expense fits an existing category reply with that exact category name
         - If no existing category fits suggest a short new category name (1-2 words max)
         - Reply with ONLY the category name, nothing else
         - Examples of good category names: Food, Rent, Transport, Utilities, Healthcare, Entertainment, Shopping`
      )
      const detectedName = result.response.text().trim()
      const matchedCategory = categoriesResult.rows.find(
        c => c.name.toLowerCase() === detectedName.toLowerCase()
      )

      if (matchedCategory) {
        // existing category matched — use it
        category_id = matchedCategory.id

      } else {
        const newCategory = await pool.query(
          `INSERT INTO expense_categories (user_id, name, color)
           VALUES ($1, $2, $3)
           RETURNING id, name`,
          [userId, detectedName, '#888888']
        )
        category_id = newCategory.rows[0].id
        newCategoryCreated = newCategory.rows[0]
      }
    }
    const { rows } = await pool.query(
      `INSERT INTO transactions (user_id, type, amount, category_id, note, date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING 
         id,
         type,
         amount,
         category_id,
         note,
         date,
         created_at`,
      [userId, type, amount, category_id || null, note || null, date || new Date()]
    )

    res.status(201).json({
      ...rows[0],
      auto_categorized: !req.body.category_id && !!category_id,
      new_category_created: newCategoryCreated
    })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export const updateTransaction = async (req, res) => {
    const userId = req.user.id
    const transactionId = req.params.id
    const { amount, category_id, note, date } = req.body
    if (amount === undefined && category_id === undefined && note === undefined && date === undefined) {
      return res.status(400).json({error:"nothing is provided to upate"})
    }

    try {
      const check = await pool.query(
        `SELECT id FROM transactions WHERE id = $1 AND user_id = $2`,
        [transactionId, userId]
      )
      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' })
      }

      const { rows } = await pool.query(
        `UPDATE transactions
        SET amount = COALESCE($1, amount),
            category_id = COALESCE($2, category_id),
            note = COALESCE($3, note),
            date = COALESCE($4, date)
        WHERE id = $5 AND user_id = $6
        RETURNING *`,
        [amount, category_id, note, date, transactionId, userId]
      )
      res.json(rows[0])
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
}

export const deleteTransaction = async (req, res) => {
    const userId = req.user.id
    const transactionId = req.params.id

    try {
      const check = await pool.query(
        `SELECT id FROM transactions WHERE id = $1 AND user_id = $2`,
        [transactionId, userId]
      )
      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' })
      }

      await pool.query(
        `DELETE FROM transactions WHERE id = $1 AND user_id = $2`,
        [transactionId, userId]
      )
      res.json({ message: 'Transaction deleted' })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
}
