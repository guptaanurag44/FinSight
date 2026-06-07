import pool from './config/db.js'
import {fileURLToPath} from 'url'
import fs from 'fs'
import path from 'path'

const __dirname= path.dirname(fileURLToPath(import.meta.url))

const runMigration=async () => {
  try {
    console.log('Running migrations...')
    const migrationFiles=['001_schema.sql','002_portfolio_schema.sql']
    
    for(let file=0;file<migrationFiles.length;file++){
      const sql=fs.readFileSync(path.join(__dirname,migrationFiles[file]),'utf-8')
      await pool.query(sql)
      console.log(`${migrationFiles[file]}table created successfully`)
    }
    console.log('All migrations completed')
    process.exit(0)

    

  } catch (err) {
    console.error('Migration failed:', err.message)
    process.exit(1)
  }
}

runMigration()

