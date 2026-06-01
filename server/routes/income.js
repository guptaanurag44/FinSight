import express from 'express'
import authMiddleware from '../middlewares/auth_middleware.js'
import { getIncomeSources,addIncomeSources,updateIncomeSources,deleteIncomeSources } from '../controllers/income.js'

const router = express.Router()
router.use(authMiddleware)

router.get('/', getIncomeSources);

router.post('/', addIncomeSources)

router.patch('/:id',updateIncomeSources )

router.delete('/:id',deleteIncomeSources)

export default router