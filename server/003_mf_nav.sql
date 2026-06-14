CREATE TABLE IF NOT EXISTS mf_nav (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    scheme_code VARCHAR(20) UNIQUE NOT NULL,
    fund_name VARCHAR(200) NOT NULL,
    nav DECIMAL(12,4) NOT NULL,
    nav_date DATE NOT NULL,
    last_updated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mf_nav_scheme_code 
  ON mf_nav(scheme_code);
CREATE INDEX IF NOT EXISTS idx_mf_nav_fund_name 
  ON mf_nav(fund_name);