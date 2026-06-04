import express from "express"
import authMiddleware from "../middlewares/auth_middleware.js"
import {addTransaction,getTransactions,getSummary,updateTransaction,deleteTransaction} from "../controllers/transactions.js"

const router = express.Router();

router.use(authMiddleware);

router.get('/summary',getSummary)
router.get('/',getTransactions)
router.post('/', addTransaction)
router.patch('/:id',updateTransaction)
router.delete('/:id',deleteTransaction)



export default router