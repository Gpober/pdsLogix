-- SQL accelerators for CFO queries
-- Views for normalized data and helpful indexes

-- Income lines (positive revenue)
CREATE OR REPLACE VIEW v_income_lines AS
SELECT txn_date, amount, customer_id, customer_name, ro_id, service_code, site_id, technician_id
FROM journal_entry_lines
WHERE account_type = 'Income';

-- Labor cost lines (COGS labor)
CREATE OR REPLACE VIEW v_cogs_labor AS
SELECT txn_date, amount, customer_id, customer_name, ro_id, site_id, technician_id, account_name, class_name
FROM journal_entry_lines
WHERE account_type = 'COGS' AND (account_name ILIKE '%labor%' OR class_name ILIKE '%labor%');

-- Contractors (COGS contractors)
CREATE OR REPLACE VIEW v_cogs_contractors AS
SELECT txn_date, amount, customer_id, customer_name, ro_id, site_id, technician_id, account_name
FROM journal_entry_lines
WHERE account_type = 'COGS' AND (account_name ILIKE '%contract%');

-- Helpful indexes
CREATE INDEX IF NOT EXISTS jel_txn_date_idx ON journal_entry_lines (txn_date);
CREATE INDEX IF NOT EXISTS jel_account_type_idx ON journal_entry_lines (account_type);
CREATE INDEX IF NOT EXISTS jel_customer_idx ON journal_entry_lines (customer_id);
CREATE INDEX IF NOT EXISTS ar_asof_idx ON ar_aging (as_of_date);
CREATE INDEX IF NOT EXISTS ar_due_idx ON ar_aging (due_date);
