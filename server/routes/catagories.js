import express from 'express'
import authMiddleware from '../middlewares/auth_middleware.js'
import {getCategories, updateCategory, deleteCategory,addCategory } from '../controllers/catagories.js'

const router = express.Router()
router.use(authMiddleware)

router.get('/', getCategories);

router.post('/', addCategory)

router.patch('/:id',updateCategory )

router.delete('/:id',deleteCategory)

export default router
