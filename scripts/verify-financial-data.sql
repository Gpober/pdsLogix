-- Verify the journal_entry_lines table structure and data
SELECT 
    COUNT(*) as total_records,
    MIN(date) as earliest_date,
    MAX(date) as latest_date
FROM journal_entry_lines;

-- Check unique account types
SELECT 
    account_type,
    COUNT(*) as count,
    SUM(CAST(amount AS DECIMAL)) as total_amount
FROM journal_entry_lines 
WHERE account_type IS NOT NULL
GROUP BY account_type
ORDER BY count DESC;

-- Check unique detail types
SELECT 
    detail_type,
    COUNT(*) as count
FROM journal_entry_lines 
WHERE detail_type IS NOT NULL
GROUP BY detail_type
ORDER BY count DESC;

-- Sample of actual data
SELECT 
    account,
    account_type,
    detail_type,
    amount,
    date,
    class
FROM journal_entry_lines 
ORDER BY date DESC 
LIMIT 20;

-- Check for revenue/income accounts
SELECT DISTINCT 
    account,
    account_type,
    detail_type,
    COUNT(*) as transaction_count,
    SUM(CAST(amount AS DECIMAL)) as total_amount
FROM journal_entry_lines 
WHERE LOWER(account_type) LIKE '%income%' 
   OR LOWER(account_type) LIKE '%revenue%'
   OR LOWER(account_type) LIKE '%rev%'
GROUP BY account, account_type, detail_type
ORDER BY total_amount DESC;

-- Check for expense accounts
SELECT DISTINCT 
    account,
    account_type,
    detail_type,
    COUNT(*) as transaction_count,
    SUM(CAST(amount AS DECIMAL)) as total_amount
FROM journal_entry_lines 
WHERE LOWER(account_type) LIKE '%expense%'
   OR LOWER(account_type) LIKE '%cost%'
GROUP BY account, account_type, detail_type
ORDER BY total_amount DESC;
