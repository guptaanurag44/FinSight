import express from "express"
import authMiddleware from "../middlewares/auth_middleware.js"
import { getGoals,updateGoal,deleteGoal, addGoal} from "../controllers/goals.js"

const router=express.Router();

router.use(authMiddleware);

router.get('/',getGoals);
router.post('/',addGoal);
router.patch('/:id',updateGoal);
router.delete('/:id',deleteGoal)

export default router