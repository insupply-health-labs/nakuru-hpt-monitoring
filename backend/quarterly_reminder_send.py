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

FIMS_APP_URL = (
    os.getenv("FIMS_APP_URL")
    or os.getenv("FRONTEND_URL")
    or ""
).strip().rstrip("/")

SUPPORT_NAME = "Dr Victoria"
SUPPORT_PHONE = "0711505343"


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

            if not FIMS_APP_URL:
                raise RuntimeError(
                    "FIMS_APP_URL or FRONTEND_URL is not configured."
                )

            update_url = FIMS_APP_URL

            message = f"""Dear {account_name},

Our records indicate that your facility has outstanding reporting requirements for {args.quarter} {args.financial_year}.

Facility: {facility_name}
MFL Code: {mfl_code}

Outstanding submission(s):
{missing_text}

Please use the link below to log in and complete the outstanding submission(s):

{update_url}

If you experience any challenges while updating the information, please contact {SUPPORT_NAME} on {SUPPORT_PHONE}.

If you have already completed the required submission after this reminder was generated, please disregard this message.

Regards,

Nakuru County Health Department
Financial Information Monitoring System (FIMS)
"""

            missing_html = "".join(
                f"<li style=\"margin-bottom: 6px;\">{section}</li>"
                for section in missing_sections
            )

            html_message = f"""
<!DOCTYPE html>
<html>
<body style="
    margin:0;
    padding:0;
    background:#f2f5f4;
    font-family:Arial,Helvetica,sans-serif;
    color:#27332f;
">

<table width="100%" cellpadding="0" cellspacing="0"
       style="background:#f2f5f4;padding:30px 12px;">
<tr>
<td align="center">

<table width="100%" cellpadding="0" cellspacing="0"
       style="
           max-width:640px;
           background:#ffffff;
           border-radius:12px;
           overflow:hidden;
           box-shadow:0 4px 18px rgba(0,0,0,0.08);
       ">

<tr>
<td style="
    background:#176b52;
    padding:30px 32px;
    color:#ffffff;
">
    <div style="
        font-size:13px;
        letter-spacing:1px;
        text-transform:uppercase;
        opacity:0.9;
    ">
        Nakuru County Health Department
    </div>

    <div style="
        font-size:25px;
        font-weight:bold;
        margin-top:7px;
    ">
        FIMS Reporting Reminder
    </div>

    <div style="
        display:inline-block;
        margin-top:14px;
        padding:7px 14px;
        border-radius:20px;
        background:rgba(255,255,255,0.16);
        font-size:14px;
    ">
        {args.quarter} &bull; {args.financial_year}
    </div>
</td>
</tr>

<tr>
<td style="padding:32px;">

    <p style="
        font-size:16px;
        margin-top:0;
    ">
        Dear <strong>{account_name}</strong>,
    </p>

    <p style="
        font-size:15px;
        line-height:1.7;
        color:#52605b;
    ">
        Our records indicate that your facility has outstanding
        reporting requirements. Kindly update the required
        information in FIMS.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="
               background:#f6faf8;
               border:1px solid #dce8e3;
               border-radius:8px;
               margin:24px 0;
           ">
        <tr>
        <td style="padding:18px 20px;">
            <div style="
                font-size:12px;
                text-transform:uppercase;
                color:#71807a;
                letter-spacing:0.7px;
            ">
                Facility
            </div>

            <div style="
                font-size:18px;
                font-weight:bold;
                margin-top:5px;
            ">
                {facility_name}
            </div>

            <div style="
                font-size:14px;
                color:#5b6964;
                margin-top:7px;
            ">
                MFL Code:
                <strong>{mfl_code}</strong>
            </div>
        </td>
        </tr>
    </table>

    <div style="
        font-size:15px;
        font-weight:bold;
        margin-bottom:10px;
    ">
        Outstanding submission(s)
    </div>

    <div style="
        background:#fff8e7;
        border-left:4px solid #d9a12d;
        padding:16px 18px;
        border-radius:4px;
    ">
        <ul style="
            margin:0;
            padding-left:20px;
            color:#5b4b24;
            line-height:1.7;
        ">
            {missing_html}
        </ul>
    </div>

    <div style="
        text-align:center;
        margin:32px 0 24px;
    ">
        <a href="{update_url}"
           style="
               display:inline-block;
               background:#176b52;
               color:#ffffff;
               text-decoration:none;
               padding:14px 28px;
               border-radius:7px;
               font-size:16px;
               font-weight:bold;
           ">
            Update Reporting Now
        </a>
    </div>

    <p style="
        text-align:center;
        font-size:12px;
        color:#7b8682;
        line-height:1.5;
    ">
        If the button does not open, copy this link into your browser:
        <br>
        <a href="{update_url}"
           style="
               color:#176b52;
               word-break:break-all;
           ">
            {update_url}
        </a>
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="
               background:#edf7f3;
               border-radius:8px;
               margin-top:28px;
           ">
        <tr>
        <td style="padding:18px 20px;">
            <div style="
                color:#176b52;
                font-weight:bold;
                font-size:14px;
                margin-bottom:6px;
            ">
                Need assistance?
            </div>

            <div style="
                font-size:14px;
                line-height:1.6;
                color:#485550;
            ">
                If you experience any challenges while updating
                your information, please contact
                <strong>{SUPPORT_NAME}</strong> on
                <a href="tel:+254711505343"
                   style="
                       color:#176b52;
                       text-decoration:none;
                       font-weight:bold;
                   ">
                    {SUPPORT_PHONE}
                </a>.
            </div>
        </td>
        </tr>
    </table>

    <p style="
        font-size:13px;
        line-height:1.6;
        color:#727e79;
        margin-top:26px;
    ">
        If you have already completed the outstanding submission
        after this reminder was generated, please disregard this
        message.
    </p>

</td>
</tr>

<tr>
<td style="
    background:#f5f7f6;
    border-top:1px solid #e0e8e5;
    text-align:center;
    padding:22px;
">
    <div style="
        font-size:13px;
        font-weight:bold;
        color:#41504b;
    ">
        Nakuru County Health Department
    </div>

    <div style="
        font-size:12px;
        color:#7b8682;
        margin-top:5px;
    ">
        Financial Information Monitoring System (FIMS)
    </div>

    <div style="
        font-size:11px;
        color:#9ba39f;
        margin-top:10px;
    ">
        This is an automated reporting reminder.
    </div>
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
"""

            try:
                send_email(
                    recipient_email=recipient_email,
                    recipient_name=account_name,
                    subject=subject,
                    text_content=message,
                    cc_emails=cc_emails,
                    html_content=html_message,
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
