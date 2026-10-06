import argparse
import os

from database import SessionLocal
from email_service import send_email
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
        description="Send quarterly facility reporting reminders."
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

    parser.add_argument(
        "--test-email",
        default="",
        help=(
            "Send reminders only to this test email "
            "instead of facility users."
        ),
    )

    parser.add_argument(
        "--only-mfl",
        default="",
        help=(
            "Process only one MFL code. "
            "Recommended during testing."
        ),
    )

    parser.add_argument(
        "--live",
        action="store_true",
        help=(
            "Send reminders to actual facility "
            "account email addresses."
        ),
    )

    args = parser.parse_args()

    if args.live and args.test_email.strip():
        parser.error(
            "Use either --live or --test-email, not both."
        )

    if not args.live and not args.test_email.strip():
        parser.error(
            "For safety, provide --test-email or explicitly use --live."
        )

    if (
        args.only_mfl
        and args.only_mfl.strip() not in PILOT_FACILITIES
    ):
        parser.error(
            f"MFL {args.only_mfl.strip()} is not in PILOT_FACILITIES."
        )

    db = SessionLocal()

    try:
        print()
        print("=" * 80)

        if args.live:
            print("QUARTERLY REMINDER - LIVE MODE")
            print("EMAILS MAY BE SENT TO FACILITY USERS")
        else:
            print("QUARTERLY REMINDER - TEST MODE")
            print(
                "ALL REMINDERS WILL GO TO:",
                args.test_email.strip(),
            )

        print("=" * 80)
        print(
            f"Reporting period: "
            f"{args.financial_year} {args.quarter}"
        )

        if args.only_mfl:
            print(
                "MFL filter:",
                args.only_mfl.strip(),
            )

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
        emails_sent = 0
        emails_failed = 0
        emails_skipped = 0

        for mfl_code, facility_name in PILOT_FACILITIES.items():

            if (
                args.only_mfl
                and mfl_code != args.only_mfl.strip()
            ):
                continue

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
                first_name = user.first_name or ""
                last_name = user.last_name or ""

                account_name = (
                    f"{first_name} {last_name}"
                ).strip()

                if not account_name:
                    account_name = "Facility Team"

                print(
                    "  Account:",
                    account_name,
                )
                print(
                    "  Email:",
                    user.email,
                )

            else:
                account_name = "Facility Team"

                print(
                    "  Account: NO ACTIVE APPROVED "
                    "FACILITY ACCOUNT"
                )

                missing_accounts += 1

            print(
                "  Funding & HPT:",
                "UPDATED"
                if hpt_exists
                else "REMINDER NEEDED",
            )

            print(
                "  SHA Reporting:",
                "UPDATED"
                if sha_complete
                else "REMINDER NEEDED",
            )

            if not missing_sections:
                print(
                    "  Result: COMPLETE - NO REMINDER"
                )

                complete += 1
                continue

            reminders += 1

            print(
                "  Reminder:",
                ", ".join(missing_sections),
            )

            if args.live:

                if not user:
                    print(
                        "  Email: SKIPPED - "
                        "no active approved facility account"
                    )

                    emails_skipped += 1
                    continue

                recipient_email = (
                    user.email or ""
                ).strip()

                if not recipient_email:
                    print(
                        "  Email: SKIPPED - "
                        "facility account has no email"
                    )

                    emails_skipped += 1
                    continue

                raw_cc = os.getenv(
                    "REMINDER_CC_EMAILS",
                    "",
                ).replace(";", ",")

                cc_emails = [
                    email.strip()
                    for email in raw_cc.split(",")
                    if email.strip()
                ]

            else:
                recipient_email = (
                    args.test_email.strip()
                )

                # Never CC monitoring addresses
                # while testing.
                cc_emails = []

            missing_text = "\n".join(
                f"- {section}"
                for section in missing_sections
            )

            subject = (
                "Nakuru County FIMS Reporting Reminder - "
                f"{args.quarter} "
                f"{args.financial_year}"
            )

            message = f"""Dear {account_name},

This is a reminder that our records show outstanding reporting requirements for {args.quarter} {args.financial_year}.

Facility: {facility_name}
MFL Code: {mfl_code}

Outstanding submission(s):
{missing_text}

Please log in to the Nakuru County Financial Information Monitoring System (FIMS) and complete the outstanding submission(s).

If you have already completed the required submission after this reminder was generated, please disregard this message.

Regards,

Nakuru County Health Department
Financial Information Monitoring System (FIMS)
"""

            try:
                send_email(
                    recipient_email=recipient_email,
                    recipient_name=account_name,
                    subject=subject,
                    text_content=message,
                    cc_emails=cc_emails,
                )

                emails_sent += 1

                if args.live:
                    print(
                        "  Email: SENT to",
                        recipient_email,
                    )
                else:
                    print(
                        "  Test email: SENT to",
                        recipient_email,
                    )

            except Exception as exc:
                emails_failed += 1

                print(
                    "  Email: FAILED -",
                    str(exc),
                )

        print()
        print("=" * 80)
        print("SUMMARY")
        print("=" * 80)
        print("Facilities processed:", total)
        print("Fully updated:", complete)
        print("Need reminder:", reminders)
        print(
            "Missing facility accounts:",
            missing_accounts,
        )
        print("Emails sent:", emails_sent)
        print("Emails failed:", emails_failed)
        print("Emails skipped:", emails_skipped)
        print("=" * 80)

    finally:
        db.close()


if __name__ == "__main__":
    main()
