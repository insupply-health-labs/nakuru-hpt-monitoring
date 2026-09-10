import argparse

from database import SessionLocal
from models import HPTRecord, SHAReport, User


PILOT_FACILITIES = {
    "15685": "Sumeek Dispensary",
    "28739": "Kabati Dispensary (YMCA)",
    "14207": "Annex Hospital (Nakuru)",
    "21600": "Seguton Dispensary",
    "14291": "Chebaraa Dispensary",
    "15280": "Naivasha Sub County Referral Hospital",
    "15509": "Sachangwan Health Centre",
    "14510": "Gilgil Sub County Hospital",
    "15008": "Lanet Health Centre",
    "15156": "Mau Narok Health Centre",
    "15776": "Wei Health Centre",
}

SHA_REPORT_TYPES = {
    "SHA Claims",
    "SHA Reimbursements",
    "SHA Rejections",
}


def normalize_mfl(value):
    text = str(value or "").strip()

    if text.endswith(".0"):
        text = text[:-2]

    return text


def main():
    parser = argparse.ArgumentParser(
        description="Dry run quarterly facility reminders."
    )

    parser.add_argument(
        "--financial-year",
        required=True,
        help='Example: "2026/2027"',
    )

    parser.add_argument(
        "--quarter",
        required=True,
        choices=["Q1", "Q2", "Q3", "Q4"],
    )

    args = parser.parse_args()

    db = SessionLocal()

    try:
        print()
        print("=" * 80)
        print("QUARTERLY REMINDER DRY RUN")
        print("=" * 80)
        print(
            f"Reporting period: "
            f"{args.financial_year} {args.quarter}"
        )
        print("NO EMAILS WILL BE SENT")
        print("=" * 80)

        users = (
            db.query(User)
            .filter(
                User.role == "facility",
                User.is_active.is_(True),
                User.is_approved.is_(True),
            )
            .all()
        )

        user_by_mfl = {
            normalize_mfl(user.facility_mfl_code): user
            for user in users
            if normalize_mfl(user.facility_mfl_code)
        }

        total = 0
        complete = 0
        reminders = 0
        missing_accounts = 0

        for mfl_code, facility_name in PILOT_FACILITIES.items():
            total += 1

            user = user_by_mfl.get(mfl_code)

            hpt_exists = (
                db.query(HPTRecord)
                .filter(
                    HPTRecord.mfl_code == mfl_code,
                    HPTRecord.financial_year
                    == args.financial_year,
                    HPTRecord.reporting_quarter
                    == args.quarter,
                )
                .first()
                is not None
            )

            sha_rows = (
                db.query(SHAReport)
                .filter(
                    SHAReport.mfl_code == mfl_code,
                    SHAReport.financial_year
                    == args.financial_year,
                    SHAReport.reporting_quarter
                    == args.quarter,
                )
                .all()
            )

            sha_types_found = {
                row.report_type
                for row in sha_rows
            }

            sha_complete = (
                SHA_REPORT_TYPES
                .issubset(sha_types_found)
            )

            missing_sections = []

            if not hpt_exists:
                missing_sections.append(
                    "Funding & HPT Information"
                )

            if not sha_complete:
                missing_sections.append(
                    "SHA Reporting"
                )

            print()
            print(f"{facility_name} ({mfl_code})")

            if user:
                print(
                    "  Account:",
                    f"{user.first_name} {user.last_name}",
                )
                print("  Email:", user.email)
            else:
                print(
                    "  Account: NO ACTIVE APPROVED "
                    "FACILITY ACCOUNT"
                )
                missing_accounts += 1

            print(
                "  Funding & HPT:",
                "UPDATED" if hpt_exists else "REMINDER NEEDED",
            )

            print(
                "  SHA Reporting:",
                "UPDATED"
                if sha_complete
                else "REMINDER NEEDED",
            )

            if not missing_sections:
                print("  Result: COMPLETE - NO REMINDER")
                complete += 1
            else:
                print(
                    "  Reminder:",
                    ", ".join(missing_sections),
                )
                reminders += 1

        print()
        print("=" * 80)
        print("SUMMARY")
        print("=" * 80)
        print("Pilot facilities:", total)
        print("Fully updated:", complete)
        print("Would need reminder:", reminders)
        print("Missing facility accounts:", missing_accounts)
        print("=" * 80)

    finally:
        db.close()


if __name__ == "__main__":
    main()
