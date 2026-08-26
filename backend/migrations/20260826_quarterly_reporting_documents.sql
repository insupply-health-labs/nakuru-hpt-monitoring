ALTER TABLE hpt_records
ADD COLUMN IF NOT EXISTS financial_year VARCHAR(20);

ALTER TABLE hpt_records
ADD COLUMN IF NOT EXISTS reporting_quarter VARCHAR(2);

CREATE TABLE IF NOT EXISTS hpt_record_documents (
    id SERIAL PRIMARY KEY,
    record_id INTEGER NOT NULL
        REFERENCES hpt_records(record_id)
        ON DELETE CASCADE,
    document_id INTEGER NOT NULL
        REFERENCES supporting_documents(id)
        ON DELETE CASCADE,
    UNIQUE(record_id, document_id)
);
