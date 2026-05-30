import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
})

pool.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err.message)
  } else {
    console.log('Database connected ')
  }
})

export default pool