from pathlib import Path
import sys

from sqlalchemy import text


BACKEND_DIR = Path(__file__).resolve().parents[2]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(
        0,
        str(BACKEND_DIR),
    )


from database import engine


STATEMENTS = [
    """
    ALTER TABLE hpt_records
    ADD COLUMN IF NOT EXISTS
    is_archived BOOLEAN NOT NULL DEFAULT FALSE
    """,
    """
    ALTER TABLE hpt_records
    ADD COLUMN IF NOT EXISTS
    archived_at TIMESTAMP WITH TIME ZONE NULL
    """,
    """
    ALTER TABLE sha_reports
    ADD COLUMN IF NOT EXISTS
    is_archived BOOLEAN NOT NULL DEFAULT FALSE
    """,
    """
    ALTER TABLE sha_reports
    ADD COLUMN IF NOT EXISTS
    archived_at TIMESTAMP WITH TIME ZONE NULL
    """,
    """
    CREATE INDEX IF NOT EXISTS
    ix_hpt_records_is_archived
    ON hpt_records (is_archived)
    """,
    """
    CREATE INDEX IF NOT EXISTS
    ix_sha_reports_is_archived
    ON sha_reports (is_archived)
    """,
]


def main():
    print()
    print("=" * 70)
    print("ADDING SOFT-ARCHIVE DATABASE COLUMNS")
    print("=" * 70)

    print(
        "Database host:",
        engine.url.host,
    )

    print(
        "Database name:",
        engine.url.database,
    )

    print()

    with engine.begin() as connection:
        for statement in STATEMENTS:
            connection.execute(
                text(statement)
            )

    print(
        "Archive columns/indexes created successfully."
    )


if __name__ == "__main__":
    main()
