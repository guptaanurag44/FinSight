CREATE TABLE IF NOT EXISTS nse_stocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticker VARCHAR(20) UNIQUE NOT NULL,
    company_name VARCHAR(150) NOT NULL,
    sector VARCHAR(100),
    last_updated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nse_stocks_ticker 
  ON nse_stocks(ticker);
CREATE INDEX IF NOT EXISTS idx_nse_stocks_company_name 
  ON nse_stocks(company_name);