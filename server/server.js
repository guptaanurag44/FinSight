import express from "express";
import cors from "cors"
import authRoutes from "./routes/auth.js"

const app=express();
const PORT= process.env.PORT || 5000
app.use(cors());
app.use(express.json());

app.get('/',(req,res)=>{
    res.json({message: "FinSight server running"});
})

app.use('/api/auth',authRoutes)

app.listen(PORT,()=>{
    console.log(`server is running on port ${PORT}`);
})
