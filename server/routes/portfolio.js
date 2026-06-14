import express from "express"
import authMiddleware from "../middlewares/auth_middleware.js"
import {getPortfolios,createPortfolio,updatePortfolio,deletePortfolio} from "../controllers/portfolio.js"

const router = express.Router();

router.use(authMiddleware);

router.get('/',getPortfolios)
router.post('/', createPortfolio)
router.patch('/:id',updatePortfolio)
router.delete('/:id',deletePortfolio)

export default router