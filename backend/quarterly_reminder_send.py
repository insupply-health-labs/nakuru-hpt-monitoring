import argparse
import os
from html import escape

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
SUPPORT_PHONE_LINK = "+254711505343"


def normalize_mfl(value):
    text = str(value or "").strip()

    if text.endswith(".0"):
        text = text[:-2]

    return text


def get_cc_emails():
    raw_cc = os.getenv(
        "REMINDER_CC_EMAILS",
        "",
    ).replace(";", ",")

    return [
        email.strip()
        for email in raw_cc.split(",")
        if email.strip()
    ]


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Send quarterly facility reporting reminders."
        )
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
            "Process only one MFL code."
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
            "For safety, provide --test-email "
            "or explicitly use --live."
        )

    if (
        args.only_mfl
        and args.only_mfl.strip()
        not in PILOT_FACILITIES
    ):
        parser.error(
            f"MFL {args.only_mfl.strip()} "
            "is not a pilot facility."
        )

    if not FIMS_APP_URL:
        raise RuntimeError(
            "FIMS_APP_URL or FRONTEND_URL "
            "is not configured."
        )

    db = SessionLocal()

    try:
        print()
        print("=" * 80)

        if args.live:
            print(
                "QUARTERLY REMINDER - LIVE MODE"
            )
        else:
            print(
                "QUARTERLY REMINDER - TEST MODE"
            )
            print(
                "ALL REMINDERS WILL GO TO:",
                args.test_email.strip(),
            )

        print("=" * 80)

        print(
            "Reporting period:",
            args.financial_year,
            args.quarter,
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
            normalize_mfl(
                user.facility_mfl_code
            ): user
            for user in users
            if normalize_mfl(
                user.facility_mfl_code
            )
        }

        total = 0
        complete = 0
        reminders = 0
        missing_accounts = 0
        emails_sent = 0
        emails_failed = 0
        emails_skipped = 0

        for (
            mfl_code,
            facility_name,
        ) in PILOT_FACILITIES.items():

            if (
                args.only_mfl
                and mfl_code
                != args.only_mfl.strip()
            ):
                continue

            total += 1

            user = user_by_mfl.get(
                mfl_code
            )

            hpt_exists = (
                db.query(HPTRecord)
                .filter(
                    HPTRecord.mfl_code
                    == mfl_code,
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
                    SHAReport.mfl_code
                    == mfl_code,
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
                .issubset(
                    sha_types_found
                )
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
            print(
                f"{facility_name} "
                f"({mfl_code})"
            )

            if user:
                first_name = (
                    user.first_name or ""
                )

                last_name = (
                    user.last_name or ""
                )

                account_name = (
                    f"{first_name} "
                    f"{last_name}"
                ).strip()

                if not account_name:
                    account_name = (
                        "Facility Team"
                    )

                print(
                    "  Account:",
                    account_name,
                )

                print(
                    "  Email:",
                    user.email,
                )

            else:
                account_name = (
                    "Facility Team"
                )

                print(
                    "  Account: NO ACTIVE "
                    "APPROVED FACILITY ACCOUNT"
                )

                missing_accounts += 1

            print(
                "  Funding & HPT:",
                (
                    "UPDATED"
                    if hpt_exists
                    else "REMINDER NEEDED"
                ),
            )

            print(
                "  SHA Reporting:",
                (
                    "UPDATED"
                    if sha_complete
                    else "REMINDER NEEDED"
                ),
            )

            if not missing_sections:
                print(
                    "  Result: COMPLETE - "
                    "NO REMINDER"
                )

                complete += 1
                continue

            reminders += 1

            print(
                "  Reminder:",
                ", ".join(
                    missing_sections
                ),
            )

            if args.live:
                if not user:
                    print(
                        "  Email: SKIPPED - "
                        "no active approved "
                        "facility account"
                    )

                    emails_skipped += 1
                    continue

                recipient_email = (
                    user.email or ""
                ).strip()

                if not recipient_email:
                    print(
                        "  Email: SKIPPED - "
                        "facility account "
                        "has no email"
                    )

                    emails_skipped += 1
                    continue

                cc_emails = (
                    get_cc_emails()
                )

            else:
                recipient_email = (
                    args.test_email.strip()
                )

                # Test messages never CC
                # monitoring recipients.
                cc_emails = []

            missing_text = "\n".join(
                f"- {section}"
                for section
                in missing_sections
            )

            subject = (
                "Action Required: "
                "Nakuru County FIMS "
                f"{args.quarter} "
                f"{args.financial_year} "
                "Reporting Reminder"
            )

            update_url = FIMS_APP_URL

            message = f"""Dear {account_name},

Our records indicate that your facility has outstanding reporting requirements for {args.quarter} {args.financial_year}.

Facility: {facility_name}
MFL Code: {mfl_code}

Outstanding submission(s):
{missing_text}

Please use the link below to access FIMS and complete the outstanding submission(s):

{update_url}

If you experience any challenges while updating your information, please contact {SUPPORT_NAME} on {SUPPORT_PHONE}.

If you have already completed the outstanding submission after this reminder was generated, please disregard this message.

Regards,

Nakuru County Health Department
Financial Information Monitoring System (FIMS)
"""

            safe_name = escape(
                account_name
            )

            safe_facility = escape(
                facility_name
            )

            safe_mfl = escape(
                mfl_code
            )

            safe_period = escape(
                f"{args.quarter} "
                f"{args.financial_year}"
            )

            safe_url = escape(
                update_url,
                quote=True,
            )

            missing_html = "".join(
                (
                    "<li style=\""
                    "margin-bottom:8px;"
                    "\">"
                    f"{escape(section)}"
                    "</li>"
                )
                for section
                in missing_sections
            )

            html_message = f"""
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport"
      content="width=device-width,
      initial-scale=1.0">
</head>

<body style="
    margin:0;
    padding:0;
    background:#f2f5f4;
    font-family:
        Arial,
        Helvetica,
        sans-serif;
    color:#27332f;
">

<table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    border="0"
    style="
        background:#f2f5f4;
        padding:32px 12px;
    "
>
<tr>
<td align="center">

<table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    border="0"
    style="
        max-width:640px;
        background:#ffffff;
        border-radius:12px;
        overflow:hidden;
        box-shadow:
            0 4px 18px
            rgba(0,0,0,0.08);
    "
>

<tr>
<td style="
    background:#176b52;
    padding:30px 32px;
    color:#ffffff;
">

    <div style="
        font-size:12px;
        text-transform:uppercase;
        letter-spacing:1.1px;
        opacity:0.9;
    ">
        Nakuru County
        Health Department
    </div>

    <div style="
        font-size:25px;
        font-weight:bold;
        margin-top:7px;
        line-height:1.3;
    ">
        FIMS Reporting Reminder
    </div>

    <div style="
        display:inline-block;
        background:
            rgba(255,255,255,0.16);
        padding:7px 14px;
        border-radius:20px;
        margin-top:15px;
        font-size:14px;
    ">
        {safe_period}
    </div>

</td>
</tr>

<tr>
<td style="
    padding:32px;
">

    <p style="
        margin-top:0;
        font-size:16px;
    ">
        Dear
        <strong>{safe_name}</strong>,
    </p>

    <p style="
        font-size:15px;
        color:#52605b;
        line-height:1.7;
    ">
        Our records indicate that
        your facility has outstanding
        reporting requirements for
        <strong>{safe_period}</strong>.
        Kindly complete the required
        updates in FIMS.
    </p>

    <table
        role="presentation"
        width="100%"
        cellspacing="0"
        cellpadding="0"
        border="0"
        style="
            background:#f6faf8;
            border:
                1px solid #dce8e3;
            border-radius:8px;
            margin:24px 0;
        "
    >
        <tr>
        <td style="
            padding:18px 20px;
        ">

            <div style="
                font-size:11px;
                color:#71807a;
                text-transform:
                    uppercase;
                letter-spacing:0.8px;
            ">
                Facility
            </div>

            <div style="
                margin-top:5px;
                font-size:18px;
                font-weight:bold;
                color:#27332f;
            ">
                {safe_facility}
            </div>

            <div style="
                margin-top:7px;
                color:#5b6964;
                font-size:14px;
            ">
                MFL Code:
                <strong>
                    {safe_mfl}
                </strong>
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
        border-left:
            4px solid #d9a12d;
        padding:16px 18px;
        border-radius:5px;
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
        margin:32px 0 22px;
    ">

        <a
            href="{safe_url}"
            style="
                display:inline-block;
                background:#176b52;
                color:#ffffff;
                text-decoration:none;
                padding:14px 30px;
                border-radius:7px;
                font-size:16px;
                font-weight:bold;
            "
        >
            Update Reporting Now
        </a>

    </div>

    <p style="
        text-align:center;
        font-size:12px;
        line-height:1.6;
        color:#7b8682;
    ">
        If the button does not open,
        copy and paste this link into
        your browser:
        <br>

        <a
            href="{safe_url}"
            style="
                color:#176b52;
                word-break:break-all;
            "
        >
            {safe_url}
        </a>
    </p>

    <table
        role="presentation"
        width="100%"
        cellspacing="0"
        cellpadding="0"
        border="0"
        style="
            background:#edf7f3;
            border-radius:8px;
            margin-top:28px;
        "
    >
        <tr>
        <td style="
            padding:18px 20px;
        ">

            <div style="
                color:#176b52;
                font-weight:bold;
                font-size:14px;
                margin-bottom:6px;
            ">
                Need assistance?
            </div>

            <div style="
                color:#485550;
                font-size:14px;
                line-height:1.6;
            ">
                If you experience any
                challenges while updating
                your information, please
                contact
                <strong>
                    {SUPPORT_NAME}
                </strong>
                on

                <a
                    href="tel:{SUPPORT_PHONE_LINK}"
                    style="
                        color:#176b52;
                        text-decoration:none;
                        font-weight:bold;
                    "
                >
                    {SUPPORT_PHONE}
                </a>.
            </div>

        </td>
        </tr>
    </table>

    <p style="
        margin-top:27px;
        color:#727e79;
        font-size:13px;
        line-height:1.6;
    ">
        If you have already completed
        the outstanding submission
        after this reminder was
        generated, please disregard
        this message.
    </p>

</td>
</tr>

<tr>
<td style="
    background:#f5f7f6;
    border-top:
        1px solid #e0e8e5;
    padding:22px;
    text-align:center;
">

    <div style="
        color:#41504b;
        font-size:13px;
        font-weight:bold;
    ">
        Nakuru County
        Health Department
    </div>

    <div style="
        color:#7b8682;
        font-size:12px;
        margin-top:5px;
    ">
        Financial Information
        Monitoring System (FIMS)
    </div>

    <div style="
        color:#9ba39f;
        font-size:11px;
        margin-top:11px;
    ">
        This is an automated
        reporting reminder.
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
                    recipient_email=(
                        recipient_email
                    ),
                    recipient_name=(
                        account_name
                    ),
                    subject=subject,
                    text_content=message,
                    cc_emails=cc_emails,
                    html_content=(
                        html_message
                    ),
                )

                emails_sent += 1

                if args.live:
                    print(
                        "  Email: SENT to",
                        recipient_email,
                    )
                else:
                    print(
                        "  Test email: "
                        "SENT to",
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
        print(
            "Facilities processed:",
            total,
        )
        print(
            "Fully updated:",
            complete,
        )
        print(
            "Need reminder:",
            reminders,
        )
        print(
            "Missing facility accounts:",
            missing_accounts,
        )
        print(
            "Emails sent:",
            emails_sent,
        )
        print(
            "Emails failed:",
            emails_failed,
        )
        print(
            "Emails skipped:",
            emails_skipped,
        )
        print("=" * 80)

    finally:
        db.close()


if __name__ == "__main__":
    main()
