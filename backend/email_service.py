import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email"


def send_email(
    recipient_email: str,
    subject: str,
    text_content: str,
    recipient_name: str = "",
    cc_emails: list[str] | None = None,
    html_content: str = "",
) -> None:
    api_key = os.getenv("BREVO_API_KEY", "").strip()
    sender_email = os.getenv("EMAIL_FROM", "").strip()
    sender_name = os.getenv(
        "EMAIL_FROM_NAME",
        "Nakuru County FIMS",
    ).strip()

    if not api_key:
        raise RuntimeError(
            "BREVO_API_KEY is not configured."
        )

    if not sender_email:
        raise RuntimeError(
            "EMAIL_FROM is not configured."
        )

    recipient_email = recipient_email.strip()

    if not recipient_email:
        raise ValueError(
            "Recipient email is required."
        )

    recipient = {
        "email": recipient_email,
    }

    if recipient_name.strip():
        recipient["name"] = recipient_name.strip()

    payload = {
        "sender": {
            "name": sender_name,
            "email": sender_email,
        },
        "to": [recipient],
        "subject": subject,
        "textContent": text_content,
    }

    if html_content.strip():
        payload["htmlContent"] = html_content

    valid_cc = [
        email.strip()
        for email in (cc_emails or [])
        if email and email.strip()
    ]

    if valid_cc:
        payload["cc"] = [
            {"email": email}
            for email in valid_cc
        ]

    data = json.dumps(payload).encode("utf-8")

    request = Request(
        BREVO_ENDPOINT,
        data=data,
        method="POST",
        headers={
            "accept": "application/json",
            "api-key": api_key,
            "content-type": "application/json",
        },
    )

    try:
        with urlopen(
            request,
            timeout=30,
        ) as response:
            if response.status not in (200, 201, 202):
                raise RuntimeError(
                    f"Unexpected Brevo response: "
                    f"{response.status}"
                )

    except HTTPError as exc:
        body = exc.read().decode(
            "utf-8",
            errors="replace",
        )

        raise RuntimeError(
            f"Brevo returned status "
            f"{exc.code}: {body}"
        ) from exc

    except URLError as exc:
        raise RuntimeError(
            f"Unable to connect to Brevo: "
            f"{exc.reason}"
        ) from exc
