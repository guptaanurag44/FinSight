import express from "express";
import cors from "cors"
import authRoutes from "./routes/auth.js"
import incomeRoutes from "./routes/income.js"
import catagoryRoutes from "./routes/catagories.js"
import transactionRoutes from "./routes/transactions.js"
import goalRoutes from "./routes/goals.js"

const app=express();
const PORT= process.env.PORT || 5000
app.use(cors());
app.use(express.json());

app.get('/',(req,res)=>{
    res.json({message: "FinSight server running"});
})

app.use('/api/auth',authRoutes)
app.use('/api/income',incomeRoutes)
app.use('/api/catagories',catagoryRoutes)
app.use('/api/transactions',transactionRoutes)
app.use('/api/goals',goalRoutes)

app.listen(PORT,()=>{
    console.log(`server is running on port ${PORT}`);
})
