import pool from './config/db.js'
import {fileURLToPath} from 'url'
import fs from 'fs'
import path from 'path'

const __dirname= path.dirname(fileURLToPath(import.meta.url))

const runMigration=async () => {
  try {
    console.log('Running migrations...')
    
    const sql = fs.readFileSync(
      path.join(__dirname, 'schema.sql'), 
      'utf8'
    )
    
    await pool.query(sql)
    console.log('All tables created successfully')
    process.exit(0)
  } catch (err) {
    console.error('Migration failed:', err.message)
    process.exit(1)
  }
}

runMigration()

