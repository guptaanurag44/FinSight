import express from "express"
import authMiddleware from "../middlewares/auth_middleware.js"
import {getMFHoldings,addMFHolding,updateMFHolding,deleteMFHolding, searchFunds} from "../controllers/mf_holdings.js"

const router = express.Router();

router.use(authMiddleware);

router.get('/search',searchFunds)
router.get('/',getMFHoldings)
router.post('/', addMFHolding)
router.patch('/:id',updateMFHolding)
router.delete('/:id',deleteMFHolding)

export default router