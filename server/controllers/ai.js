import pool from '../config/db.js'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

export const invalidateCache = async (userId) => {
    await pool.query(
        `DELETE FROM ai_advice
        WHERE user_id = $1`,
        [userId]
    )
}

const getCurrentMonthData = async (userId) => {
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    const lastDay = new Date(currentYear, currentMonth, 0).getDate()
    const fromDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
    const toDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${lastDay}`

    const recurringIncomeResult = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
        FROM income_sources
        WHERE user_id = $1
        AND is_active = true
        AND frequency = 'monthly'`,
        [userId]
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

    
    const expensesResult = await pool.query(
        `SELECT 
        COALESCE(c.name, 'Uncategorized') AS category,
        SUM(t.amount) AS total
        FROM transactions AS t
        LEFT JOIN expense_categories AS c
        ON t.category_id = c.id
        WHERE t.user_id = $1
        AND t.type = 'expense'
        AND t.date >= $2
        AND t.date <= $3
        GROUP BY c.name
        ORDER BY total DESC`,
        [userId, fromDate, toDate]
    )

    
    const totalIncome = parseFloat(recurringIncomeResult.rows[0].total)
                        + parseFloat(oneTimeIncomeResult.rows[0].total)

    const totalExpenses = expensesResult.rows
                            .reduce((sum, row) => sum + parseFloat(row.total), 0)

    const monthlySavings = totalIncome - totalExpenses

    const savingsRate = totalIncome > 0
                        ? ((monthlySavings / totalIncome) * 100).toFixed(1)
                        : 0

    const expenseBreakdown = expensesResult.rows.length > 0
        ? expensesResult.rows
            .map(r => `${r.category}: ₹${parseFloat(r.total).toLocaleString('en-IN')}`)
            .join('\n')
        : 'No expenses logged this month'

    return {
        fromDate,
        toDate,
        totalIncome,
        totalExpenses,
        monthlySavings,
        savingsRate: parseFloat(savingsRate),
        expenseBreakdown,
        expenseRows: expensesResult.rows
    }
}

const callGemini = async (prompt) => {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    return result.response.text()
}

export const analyzeFinances = async (req, res) => {
    const userId = req.user.id

    try {
        const cachedAdvice = await pool.query(
        `SELECT 
            response,
            generated_at
        FROM ai_advice
        WHERE user_id = $1
        AND advice_type = 'expense_analysis'
        AND generated_at > NOW() - INTERVAL '3 hours'
        ORDER BY generated_at DESC
        LIMIT 1`,
        [userId]
        )
        if (cachedAdvice.rows.length > 0) {
        return res.json({
            advice: cachedAdvice.rows[0].response,
            cached: true,
            generated_at: cachedAdvice.rows[0].generated_at
        })
        }

        const {
        totalIncome,
        totalExpenses,
        monthlySavings,
        savingsRate,
        expenseBreakdown
        } = await getCurrentMonthData(userId)

        const goalsText = goalsResult.rows.length > 0
        ? goalsResult.rows.map(g => {
            const remaining = parseFloat(g.target_amount) - parseFloat(g.current_saved)
            const monthsNeeded = monthlySavings > 0
                ? Math.ceil(remaining / monthlySavings)
                : null
            return `- "${g.title}": ` +
                    `target ₹${parseFloat(g.target_amount).toLocaleString('en-IN')}, ` +
                    `saved ₹${parseFloat(g.current_saved).toLocaleString('en-IN')}, ` +
                    `${g.months_remaining} months available, ` +
                    `${monthsNeeded
                    ? `needs ${monthsNeeded} months at current rate`
                    : 'not saving enough to reach this goal'}`
            }).join('\n')
        : 'No active goals set'

        const prompt =
    `You are a personal finance advisor for an Indian user.

    CURRENT MONTH (${now.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}):
    - Income:   ₹${totalIncome.toLocaleString('en-IN')}
    - Expenses: ₹${totalExpenses.toLocaleString('en-IN')}
    - Savings:  ₹${monthlySavings.toLocaleString('en-IN')}
    - Savings rate: ${savingsRate}%

    EXPENSES BY CATEGORY:
    ${expenseBreakdown}

    ACTIVE GOALS:
    ${goalsText}

    Write a financial analysis in exactly 3 sections:

    1. OVERALL ASSESSMENT
    One paragraph — is their savings rate healthy? what is their biggest financial risk right now?

    2. TOP 3 SUGGESTIONS
    Exactly 3 bullet points. Each must mention a specific category name and rupee amount.
    Example: "Reduce Food from ₹9,000 to ₹7,000 — this frees up ₹2,000/month"

    3. GOAL PROGRESS
    For each active goal:
    - On track or behind?
    - Exact monthly amount needed to hit deadline
    - If behind: which category to cut and by how much

    Use Indian financial terms where relevant (SIP, FD, PPF, emergency fund).
    Never give generic advice — always reference their actual numbers.`

        let advice
        try {
        advice = await callGemini(prompt)
        } catch (geminiError) {
        const oldAdvice = await pool.query(
            `SELECT response, generated_at
            FROM ai_advice
            WHERE user_id = $1
            AND advice_type = 'expense_analysis'
            ORDER BY generated_at DESC
            LIMIT 1`,
            [userId]
        )
        if (oldAdvice.rows.length > 0) {
            return res.json({
            advice: oldAdvice.rows[0].response,
            cached: true,
            stale: true,
            generated_at: oldAdvice.rows[0].generated_at,
            warning: 'AI service unavailable — showing last saved analysis'
            })
        }
        return res.status(503).json({
            error: 'AI service currently unavailable — please try again later',
            summary: { totalIncome, totalExpenses, monthlySavings, savingsRate }
        })
        }
        await pool.query(
        `INSERT INTO ai_advice (user_id, advice_type, prompt_snapshot, response)
        VALUES ($1, $2, $3, $4)`,
        [userId, 'expense_analysis', prompt, advice]
        )

        res.json({
        advice,
        cached: false,
        generated_at: new Date(),
        summary: {
            total_income: totalIncome,
            total_expenses: totalExpenses,
            monthly_savings: monthlySavings,
            savings_rate: parseFloat(savingsRate),
            goals: goalsResult.rows
        }
        })

    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

export const analyzeGoal = async (req, res) => {
    const userId = req.user.id
    const goalId = req.params.id

    try {
        const cachedAdvice = await pool.query(
        `SELECT 
            response,
            generated_at
        FROM ai_advice
        WHERE user_id = $1
        AND advice_type = $2
        AND generated_at > NOW() - INTERVAL '3 hours'
        ORDER BY generated_at DESC
        LIMIT 1`,
        [userId, `goal_analysis_${goalId}`]
        )
        if (cachedAdvice.rows.length > 0) {
        return res.json({
            advice: cachedAdvice.rows[0].response,
            cached: true,
            generated_at: cachedAdvice.rows[0].generated_at
        })
        }

        const goalResult = await pool.query(
        `SELECT 
            id,
            title,
            target_amount,
            current_saved,
            target_date,
            (target_date - CURRENT_DATE) AS days_remaining,
            ROUND(
            (target_date - CURRENT_DATE) / 30.0
            , 1) AS months_remaining,
            ROUND(
            (current_saved / NULLIF(target_amount, 0)) * 100
            , 1) AS percentage_completed
        FROM goals
        WHERE id = $1
        AND user_id = $2
        AND status = 'active'`,
        [goalId, userId]
        )
        if (goalResult.rows.length === 0) {
        return res.status(404).json({ error: 'Active goal not found' })
        }
        const goal = goalResult.rows[0]

        const {
        totalIncome,
        totalExpenses,
        monthlySavings,
        expenseBreakdown
        } = await getCurrentMonthData(userId)
        const remaining = parseFloat(goal.target_amount)- parseFloat(goal.current_saved)

        const requiredMonthlySavings = parseFloat(goal.months_remaining) > 0
        ? Math.ceil(remaining / parseFloat(goal.months_remaining))
        : null

        const isOnTrack = monthlySavings >= (requiredMonthlySavings || 0)

        
        const prompt =
    `You are a personal finance advisor for an Indian user.
    They want specific advice on how to achieve one financial goal.

    GOAL DETAILS:
    - Title: "${goal.title}"
    - Target amount: ₹${parseFloat(goal.target_amount).toLocaleString('en-IN')}
    - Already saved: ₹${parseFloat(goal.current_saved).toLocaleString('en-IN')}
    - Still needed: ₹${remaining.toLocaleString('en-IN')}
    - Deadline: ${new Date(goal.target_date).toLocaleDateString('en-IN')}
    - Months remaining: ${goal.months_remaining}
    - Progress: ${goal.percentage_completed}% completed
    - Required monthly savings: ₹${requiredMonthlySavings?.toLocaleString('en-IN') ?? 'N/A'}

    CURRENT FINANCES:
    - Monthly income: ₹${totalIncome.toLocaleString('en-IN')}
    - Monthly expenses: ₹${totalExpenses.toLocaleString('en-IN')}
    - Current monthly savings: ₹${monthlySavings.toLocaleString('en-IN')}
    - Status: ${isOnTrack ? 'ON TRACK ✅' : 'BEHIND TARGET ❌'}

    EXPENSE BREAKDOWN THIS MONTH:
    ${expenseBreakdown}

    Give a focused goal achievement plan in exactly 3 sections:

    1. CURRENT STATUS
    Is the user on track or behind? By how much?
    How long will it actually take at their current savings rate?

    2. EXACT MONTHLY PLAN
    How much to save per month to hit the deadline.
    Which specific expense categories to cut and by exactly how much.
    Example: "Cut Entertainment from ₹2,000 to ₹500 and Food from ₹9,000 to ₹7,000 — this gives you the ₹3,500 extra needed monthly"

    3. SMART STRATEGY
    Best way to save this specific amount in Indian context.
    Should they use SIP, FD, savings account, or RD for this goal?
    Which option gives best returns for their timeline?

    Be specific, practical, and reference their actual numbers throughout.`

        let advice
        try {
        advice = await callGemini(prompt)
        } catch (geminiError) {
        return res.status(503).json({
            error: 'AI service currently unavailable — please try again later'
        })
        }
        await pool.query(
        `INSERT INTO ai_advice (user_id, advice_type, prompt_snapshot, response)
        VALUES ($1, $2, $3, $4)`,
        [userId, `goal_analysis_${goalId}`, prompt, advice]
        )

        res.json({
        advice,
        cached: false,
        generated_at: new Date(),
        goal_summary: {
            title: goal.title,
            target_amount: parseFloat(goal.target_amount),
            current_saved: parseFloat(goal.current_saved),
            remaining,
            months_remaining: parseFloat(goal.months_remaining),
            required_monthly_savings: requiredMonthlySavings,
            current_monthly_savings: monthlySavings,
            is_on_track: isOnTrack,
            percentage_completed: parseFloat(goal.percentage_completed)
        }
        })

    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}