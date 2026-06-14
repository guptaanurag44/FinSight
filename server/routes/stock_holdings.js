import express from "express"
import authMiddleware from "../middlewares/auth_middleware.js"
import {getStockHoldings,addStockHolding,updateStockHolding,deleteStockHolding, searchStocks} from "../controllers/stock_holdings.js"

const router = express.Router();

router.use(authMiddleware);

router.get('/search',searchStocks)
router.get('/',getStockHoldings)
router.post('/', addStockHolding)
router.patch('/:id',updateStockHolding)
router.delete('/:id',deleteStockHolding)

export default router