import argparse
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path


REMINDER_DAY = 5


def get_reporting_period(run_date):
    year = run_date.year
    month = run_date.month

    if month == 1:
        return (
            f"{year - 1}/{year}",
            "Q2",
            "October - December",
        )

    if month == 4:
        return (
            f"{year - 1}/{year}",
            "Q3",
            "January - March",
        )

    if month == 7:
        return (
            f"{year - 1}/{year}",
            "Q4",
            "April - June",
        )

    if month == 10:
        return (
            f"{year}/{year + 1}",
            "Q1",
            "July - September",
        )

    raise ValueError(
        "Quarterly reminders are scheduled "
        "for January, April, July and October."
    )


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Automatically determine the "
            "completed reporting quarter "
            "and send reminders."
        )
    )

    parser.add_argument(
        "--live",
        action="store_true",
        help=(
            "Send reminders to actual "
            "facility users."
        ),
    )

    parser.add_argument(
        "--test-email",
        default="",
        help=(
            "Send all reminders to a test "
            "email instead of facility users."
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
        "--as-of-date",
        default="",
        help=(
            "Test a particular date using "
            "YYYY-MM-DD."
        ),
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help=(
            "Allow a live manual run even "
            "when today is not the scheduled "
            "5th day."
        ),
    )

    args = parser.parse_args()

    if (
        args.live
        and args.test_email.strip()
    ):
        parser.error(
            "Use either --live "
            "or --test-email, not both."
        )

    if (
        not args.live
        and not args.test_email.strip()
    ):
        parser.error(
            "Provide --test-email "
            "or explicitly use --live."
        )

    if args.as_of_date:
        try:
            run_date = (
                datetime.strptime(
                    args.as_of_date,
                    "%Y-%m-%d",
                ).date()
            )

        except ValueError:
            parser.error(
                "--as-of-date must use "
                "YYYY-MM-DD."
            )

    else:
        run_date = date.today()

    try:
        (
            financial_year,
            quarter,
            quarter_months,
        ) = get_reporting_period(
            run_date
        )

    except ValueError as exc:
        parser.error(str(exc))

    # Scheduled live reminders should
    # normally run on the 5th only.
    #
    # Test mode remains available on
    # any simulated date.
    if (
        args.live
        and not args.force
        and run_date.day != REMINDER_DAY
    ):
        parser.error(
            "Live automatic reminders "
            "are scheduled for the 5th. "
            "Use --force only for an "
            "intentional manual run."
        )

    print()
    print("=" * 72)
    print(
        "AUTOMATIC QUARTERLY "
        "FIMS REMINDER"
    )
    print("=" * 72)

    print(
        "Run date:",
        run_date.strftime("%d %B %Y"),
    )

    print(
        "Financial year:",
        financial_year,
    )

    print(
        "Quarter being checked:",
        quarter,
    )

    print(
        "Reporting months:",
        quarter_months,
    )

    print(
        "Reminder schedule:",
        "5th day of the new quarter",
    )

    print("=" * 72)

    sender_script = (
        Path(__file__)
        .resolve()
        .with_name(
            "quarterly_reminder_send.py"
        )
    )

    command = [
        sys.executable,
        str(sender_script),
        "--financial-year",
        financial_year,
        "--quarter",
        quarter,
    ]

    if args.only_mfl.strip():
        command.extend(
            [
                "--only-mfl",
                args.only_mfl.strip(),
            ]
        )

    if args.live:
        command.append(
            "--live"
        )

    else:
        command.extend(
            [
                "--test-email",
                args.test_email.strip(),
            ]
        )

    subprocess.run(
        command,
        check=True,
    )


if __name__ == "__main__":
    main()
