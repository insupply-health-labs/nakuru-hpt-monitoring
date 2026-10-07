from datetime import datetime, timezone
from pathlib import Path
import sys


BACKEND_DIR = Path(__file__).resolve().parents[2]

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(
        0,
        str(BACKEND_DIR),
    )


from database import SessionLocal, engine
from models import (
    HPTRecord,
    SHAReport,
    SupportingDocument,
)


CONFIRMATION = "ARCHIVE PILOT DATA"


def main():
    db = SessionLocal()

    try:
        active_hpt = (
            db.query(HPTRecord)
            .filter(
                HPTRecord.is_archived.is_(False)
            )
            .count()
        )

        archived_hpt = (
            db.query(HPTRecord)
            .filter(
                HPTRecord.is_archived.is_(True)
            )
            .count()
        )

        active_sha = (
            db.query(SHAReport)
            .filter(
                SHAReport.is_archived.is_(False)
            )
            .count()
        )

        archived_sha = (
            db.query(SHAReport)
            .filter(
                SHAReport.is_archived.is_(True)
            )
            .count()
        )

        documents = (
            db.query(SupportingDocument)
            .count()
        )

        print()
        print("=" * 72)
        print("NAKURU FIMS PILOT DATA SOFT ARCHIVE")
        print("=" * 72)

        print(
            "Database host:",
            engine.url.host,
        )

        print(
            "Database name:",
            engine.url.database,
        )

        print()
        print("CURRENT ACTIVE DATA")
        print("-" * 72)
        print(
            "Active HPT records:",
            active_hpt,
        )
        print(
            "Active SHA records:",
            active_sha,
        )

        print()
        print("ALREADY ARCHIVED")
        print("-" * 72)
        print(
            "Archived HPT records:",
            archived_hpt,
        )
        print(
            "Archived SHA records:",
            archived_sha,
        )

        print()
        print("SUPPORTING DOCUMENTS")
        print("-" * 72)
        print(
            "Documents retained:",
            documents,
        )

        print()
        print(
            "This operation WILL NOT permanently "
            "delete records."
        )

        print()
        print("It WILL NOT delete:")
        print("  - User accounts")
        print("  - Facility master data")
        print("  - Supporting documents")
        print("  - Database tables")

        print()
        print(
            "All CURRENTLY ACTIVE HPT and SHA records "
            "will be marked as archived."
        )

        if (
            active_hpt == 0
            and active_sha == 0
        ):
            print()
            print(
                "There are no active records to archive."
            )
            return

        print()
        confirmation = input(
            f"Type {CONFIRMATION} to continue: "
        ).strip()

        if confirmation != CONFIRMATION:
            print()
            print(
                "Archive cancelled. No data was changed."
            )
            return

        archived_at = datetime.now(
            timezone.utc
        )

        hpt_updated = (
            db.query(HPTRecord)
            .filter(
                HPTRecord.is_archived.is_(False)
            )
            .update(
                {
                    HPTRecord.is_archived: True,
                    HPTRecord.archived_at: archived_at,
                },
                synchronize_session=False,
            )
        )

        sha_updated = (
            db.query(SHAReport)
            .filter(
                SHAReport.is_archived.is_(False)
            )
            .update(
                {
                    SHAReport.is_archived: True,
                    SHAReport.archived_at: archived_at,
                },
                synchronize_session=False,
            )
        )

        db.commit()

        remaining_hpt = (
            db.query(HPTRecord)
            .filter(
                HPTRecord.is_archived.is_(False)
            )
            .count()
        )

        remaining_sha = (
            db.query(SHAReport)
            .filter(
                SHAReport.is_archived.is_(False)
            )
            .count()
        )

        total_archived_hpt = (
            db.query(HPTRecord)
            .filter(
                HPTRecord.is_archived.is_(True)
            )
            .count()
        )

        total_archived_sha = (
            db.query(SHAReport)
            .filter(
                SHAReport.is_archived.is_(True)
            )
            .count()
        )

        print()
        print("=" * 72)
        print("SOFT ARCHIVE COMPLETED")
        print("=" * 72)

        print(
            "HPT records archived now:",
            hpt_updated,
        )

        print(
            "SHA records archived now:",
            sha_updated,
        )

        print()
        print(
            "Active HPT records remaining:",
            remaining_hpt,
        )

        print(
            "Active SHA records remaining:",
            remaining_sha,
        )

        print()
        print(
            "Total archived HPT records:",
            total_archived_hpt,
        )

        print(
            "Total archived SHA records:",
            total_archived_sha,
        )

        print()
        print(
            "Supporting documents remain untouched."
        )

        print("=" * 72)

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    main()
