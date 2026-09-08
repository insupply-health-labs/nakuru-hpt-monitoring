from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
import os
import secrets
from urllib import request as urllib_request
from urllib import error as urllib_error
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from database import get_db
from models import PasswordResetToken, User
from security import create_access_token, get_current_user, require_roles


router = APIRouter(prefix="/auth", tags=["Authentication"])

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


class RegisterRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    role: str  # facility, county, admin
    facility_mfl_code: Optional[str] = None
    facility_name: Optional[str] = None
    subcounty_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str



def send_password_reset_email(
    recipient_email: str,
    reset_url: str,
    recipient_name: str,
) -> None:
    api_key = os.getenv(
        "BREVO_API_KEY",
        "",
    ).strip()

    sender_email = os.getenv(
        "EMAIL_FROM",
        "",
    ).strip()

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

    payload = {
        "sender": {
            "name": sender_name,
            "email": sender_email,
        },
        "to": [
            {
                "email": recipient_email,
            }
        ],
        "subject": (
            "Reset your Nakuru County FIMS password"
        ),
        "textContent": f"""
Hello {recipient_name},

We received a request to reset the password for your Nakuru County Financial Information Monitoring System (FIMS) account.

Use the link below to create a new password:

{reset_url}

This password reset link expires in 30 minutes and can only be used once.

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

For your security, do not share this password reset link with anyone.

Regards,

Nakuru County Health Department
Financial Information Monitoring System (FIMS)
""",
    }

    data = json.dumps(payload).encode("utf-8")

    req = urllib_request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=data,
        headers={
            "accept": "application/json",
            "api-key": api_key,
            "content-type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(
            req,
            timeout=15,
        ) as response:
            if response.status not in (200, 201, 202):
                raise RuntimeError(
                    f"Brevo returned status {response.status}"
                )

    except urllib_error.HTTPError as error:
        body = error.read().decode(
            "utf-8",
            errors="replace",
        )

        raise RuntimeError(
            f"Brevo error {error.code}: {body}"
        ) from error

    except urllib_error.URLError as error:
        raise RuntimeError(
            f"Unable to connect to Brevo: {error}"
        ) from error


def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str):
    return pwd_context.verify(plain_password, hashed_password)


def normalize_mfl_code(value) -> str:
    text = str(value or "").strip()

    if text.lower() in {"", "none", "nan"}:
        return ""

    if text.endswith(".0"):
        text = text[:-2]

    return text


@router.post("/register")
def register_user(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing_user = (
        db.query(User)
        .filter(User.email == payload.email.lower())
        .first()
    )

    if existing_user:
        return {
            "success": False,
            "message": "User already exists",
        }

    # Prevent more than one account per facility.
    normalized_mfl = normalize_mfl_code(
        payload.facility_mfl_code
    )

    if payload.role == "facility":
        if not normalized_mfl:
            return {
                "success": False,
                "message": (
                    "A valid facility MFL code is required."
                ),
            }

        facility_users = (
            db.query(User)
            .filter(User.role == "facility")
            .all()
        )

        existing_facility_user = next(
            (
                user
                for user in facility_users
                if normalize_mfl_code(
                    user.facility_mfl_code
                )
                == normalized_mfl
            ),
            None,
        )

        if existing_facility_user:
            return {
                "success": False,
                "message": (
                    "This facility already has a "
                    "registered account. Please contact "
                    "the system administrator."
                ),
            }

    approved = payload.role == "facility"

    new_user = User(
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=payload.role,
        facility_mfl_code=(
            normalized_mfl
            if payload.role == "facility"
            else None
        ),
        facility_name=payload.facility_name,
        subcounty_name=payload.subcounty_name,
        is_active=True,
        is_approved=approved,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "success": True,
        "message": "Account created successfully",
        "user": {
            "user_id": new_user.user_id,
            "first_name": new_user.first_name,
            "last_name": new_user.last_name,
            "email": new_user.email,
            "role": new_user.role,
            "facility_mfl_code": new_user.facility_mfl_code,
            "facility_name": new_user.facility_name,
            "subcounty_name": new_user.subcounty_name,
            "is_active": new_user.is_active,
        },
    }

@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    generic_response = {
        "success": True,
        "message": (
            "If an account exists for that email, "
            "a password reset link has been sent."
        ),
    }

    email = payload.email.lower().strip()

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if not user or not user.is_active:
        return generic_response

    now = datetime.now(timezone.utc)

    # Invalidate any previous unused reset tokens.
    (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id
            == user.user_id,
            PasswordResetToken.used_at.is_(None),
        )
        .update(
            {"used_at": now},
            synchronize_session=False,
        )
    )

    raw_token = secrets.token_urlsafe(32)

    token_hash = hashlib.sha256(
        raw_token.encode("utf-8")
    ).hexdigest()

    try:
        expiry_minutes = int(
            os.getenv(
                "PASSWORD_RESET_EXPIRY_MINUTES",
                "30",
            )
        )
    except ValueError:
        expiry_minutes = 30

    reset_token = PasswordResetToken(
        user_id=user.user_id,
        token_hash=token_hash,
        expires_at=(
            now
            + timedelta(
                minutes=expiry_minutes
            )
        ),
    )

    db.add(reset_token)
    db.commit()

    frontend_url = os.getenv(
        "FRONTEND_URL",
        "http://localhost:5174",
    ).rstrip("/")

    reset_url = (
        f"{frontend_url}"
        f"/reset-password"
        f"?token={raw_token}"
    )

    email_sent = False
    email_error = ""

    try:
        send_password_reset_email(
            user.email,
            reset_url,
            user.first_name,
        )
        email_sent = True

    except Exception as error:
        logger.exception(
            "Password reset email failed "
            "for user_id=%s",
            user.user_id,
        )

        email_error = str(error)

    debug_enabled = (
        os.getenv(
            "PASSWORD_RESET_DEBUG",
            "false",
        )
        .strip()
        .lower()
        in {
            "1",
            "true",
            "yes",
            "on",
        }
    )

    if debug_enabled:
        return {
            **generic_response,
            "reset_url": reset_url,
            "email_sent": email_sent,
            "email_error": email_error,
        }

    return generic_response


@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    raw_token = payload.token.strip()
    new_password = payload.new_password

    if not raw_token:
        raise HTTPException(
            status_code=400,
            detail="Reset token is required.",
        )

    if len(new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least "
                "8 characters long."
            ),
        )

    token_hash = hashlib.sha256(
        raw_token.encode("utf-8")
    ).hexdigest()

    reset_token = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token_hash
            == token_hash,
            PasswordResetToken.used_at.is_(None),
        )
        .first()
    )

    if not reset_token:
        raise HTTPException(
            status_code=400,
            detail=(
                "This password reset link is "
                "invalid or has already been used."
            ),
        )

    now = datetime.now(timezone.utc)

    expires_at = reset_token.expires_at

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(
            tzinfo=timezone.utc
        )

    if expires_at <= now:
        reset_token.used_at = now
        db.commit()

        raise HTTPException(
            status_code=400,
            detail=(
                "This password reset link has expired. "
                "Please request a new one."
            ),
        )

    user = (
        db.query(User)
        .filter(
            User.user_id
            == reset_token.user_id
        )
        .first()
    )

    if not user or not user.is_active:
        raise HTTPException(
            status_code=400,
            detail=(
                "This password reset link "
                "is no longer valid."
            ),
        )

    user.password_hash = hash_password(
        new_password
    )

    # Invalidate every outstanding reset token
    # belonging to this user.
    (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id
            == user.user_id,
            PasswordResetToken.used_at.is_(None),
        )
        .update(
            {"used_at": now},
            synchronize_session=False,
        )
    )

    db.commit()

    return {
        "success": True,
        "message": (
            "Password reset successfully. "
            "You can now sign in with your new password."
        ),
    }


@router.post("/login")
def login_user(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.email == payload.email.lower())
        .first()
    )

    if (
        not user
        or not verify_password(
            payload.password,
            user.password_hash,
        )
    ):
        return {
            "success": False,
            "message": "Invalid email or password",
        }

    if not user.is_active:
        return {
            "success": False,
            "message": "Account is inactive",
        }

    if not user.is_approved:
        return {
            "success": False,
            "message": (
                "Account is pending approval by admin"
            ),
        }

    access_token = create_access_token(
        user.user_id
    )

    return {
        "success": True,
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "user_id": user.user_id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "role": user.role,
            "facility_mfl_code": (
                user.facility_mfl_code
            ),
            "facility_name": user.facility_name,
            "subcounty_name": (
                user.subcounty_name
            ),
            "is_active": user.is_active,
        },
    }


@router.get("/me")
def get_my_account(
    current_user: User = Depends(
        get_current_user
    ),
):
    return {
        "user_id": current_user.user_id,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "email": current_user.email,
        "role": current_user.role,
        "facility_mfl_code": (
            current_user.facility_mfl_code
        ),
        "facility_name": (
            current_user.facility_name
        ),
        "subcounty_name": (
            current_user.subcounty_name
        ),
        "is_active": current_user.is_active,
    }


@router.get("/users")
def get_users(
    current_user: User = Depends(
        require_roles("admin")
    ),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(User.created_at.desc()).all()

    return [
        {
            "user_id": user.user_id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "role": user.role,
            "facility_mfl_code": user.facility_mfl_code,
            "facility_name": user.facility_name,
            "subcounty_name": user.subcounty_name,
            "is_active": user.is_active,
            "is_approved": user.is_approved,
            "created_at": user.created_at,
        }
        for user in users
    ]
@router.put("/users/{user_id}/approve")
def approve_user(
    user_id: int,
    current_user: User = Depends(
        require_roles("admin")
    ),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        return {"success": False, "message": "User not found"}

    user.is_approved = True
    db.commit()

    return {"success": True, "message": "User approved successfully"}


@router.put("/users/{user_id}/deactivate")
def deactivate_user(
    user_id: int,
    current_user: User = Depends(
        require_roles("admin")
    ),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        return {"success": False, "message": "User not found"}

    user.is_active = False
    db.commit()

    return {"success": True, "message": "User deactivated successfully"}


@router.put("/users/{user_id}/activate")
def activate_user(
    user_id: int,
    current_user: User = Depends(
        require_roles("admin")
    ),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        return {"success": False, "message": "User not found"}

    user.is_active = True
    db.commit()

    return {"success": True, "message": "User activated successfully"}
@router.delete("/users/{user_id}/delete")
def delete_user(
    user_id: int,
    current_user: User = Depends(
        require_roles("admin")
    ),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        return {"success": False, "message": "User not found"}

    db.delete(user)
    db.commit()

    return {"success": True, "message": "User deleted successfully"}