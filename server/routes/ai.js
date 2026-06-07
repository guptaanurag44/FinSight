import express from 'express'
import authMiddleware from '../middlewares/auth_middleware.js'
import { analyzeFinances,analyzeGoal } from '../controllers/ai.js'

const router = express.Router()
router.use(authMiddleware)



router.post('/analyze', analyzeFinances)
router.post('/goal/:id',analyzeGoal)

export default router