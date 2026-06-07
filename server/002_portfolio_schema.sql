CREATE TABLE IF NOT EXISTS portfolios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL DEFAULT 'My Portfolio',
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_holdings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    portfolio_id UUID NOT NULL,
    user_id UUID NOT NULL,
    ticker VARCHAR(20) NOT NULL,
    company_name VARCHAR(100),
    exchange VARCHAR(10) DEFAULT 'NSE',
    quantity DECIMAL(12,4) NOT NULL,
    buy_price DECIMAL(12,2) NOT NULL,
    buy_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mf_holdings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    portfolio_id UUID NOT NULL,
    user_id UUID NOT NULL,
    fund_name VARCHAR(150) NOT NULL,
    folio_number VARCHAR(50),
    units DECIMAL(12,4) NOT NULL,
    nav_at_purchase DECIMAL(12,4) NOT NULL,
    purchase_date DATE NOT NULL,
    fund_type VARCHAR(30) CHECK (
        fund_type IN (
        'large_cap',
        'mid_cap', 
        'small_cap',
        'flexi_cap',
        'debt',
        'hybrid',
        'index',
        'elss',
        'liquid'
        )
    ),
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_prices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ticker VARCHAR(20) UNIQUE NOT NULL,
    current_price DECIMAL(12,2),
    open_price DECIMAL(12,2),
    high_price DECIMAL(12,2),
    low_price DECIMAL(12,2),
    volume BIGINT,
    change_amount DECIMAL(12,2),
    change_pct DECIMAL(8,2),
    week_52_high DECIMAL(12,2),
    week_52_low DECIMAL(12,2),
    market_cap BIGINT,
    last_updated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolios_user_id 
  ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_portfolio_id 
  ON stock_holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_user_id 
  ON stock_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_ticker 
  ON stock_holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_mf_holdings_portfolio_id 
  ON mf_holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_mf_holdings_user_id 
  ON mf_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_prices_ticker 
  ON stock_prices(ticker);