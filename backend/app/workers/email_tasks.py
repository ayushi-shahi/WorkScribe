"""
Email helper functions.

Plain async functions — no Celery, runs in-process via FastAPI BackgroundTasks.
"""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)

def _send_email_sync(to_email: str, subject: str, html: str) -> None:
    """Synchronous Gmail SMTP send — called from a thread via BackgroundTasks."""
    gmail_user = settings.GMAIL_USER
    gmail_password = settings.GMAIL_APP_PASSWORD
    
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"WorkScribe <{gmail_user}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(gmail_user, gmail_password)
        server.sendmail(gmail_user, to_email, msg.as_string())


def send_invitation_email(
    to_email: str,
    org_name: str,
    org_slug: str,
    inviter_name: str,
    role: str,
    invitation_token: str,
    frontend_url: str,
) -> None:
    """Send invitation email. Called via background_tasks.add_task()."""
    try:
        accept_url = f"{frontend_url}/invitations/{invitation_token}/accept"
        _send_email_sync(
            to_email=to_email,
            subject=f"You've been invited to join {org_name} on WorkScribe",
            html=f"""
                <h2>You've been invited to WorkScribe</h2>
                <p><strong>{inviter_name}</strong> has invited you to join
                <strong>{org_name}</strong> as a <strong>{role}</strong>.</p>
                <p>
                    <a href="{accept_url}"
                       style="background:#6366f1;color:#fff;padding:12px 24px;
                              border-radius:6px;text-decoration:none;display:inline-block;">
                        Accept Invitation
                    </a>
                </p>
                <p>This invitation expires in 48 hours.</p>
                <p>If you did not expect this invitation, you can safely ignore this email.</p>
            """,
        )
    except Exception as exc:
        logger.error("send_invitation_email failed for %s: %s", to_email, exc)


def send_password_reset_email(
    to_email: str,
    reset_token: str,
    frontend_url: str,
) -> None:
    """Send password reset email. Called via background_tasks.add_task()."""
    try:
        reset_url = f"{frontend_url}/reset-password?token={reset_token}"
        _send_email_sync(
            to_email=to_email,
            subject="Reset your WorkScribe password",
            html=f"""
                <h2>Reset your password</h2>
                <p>We received a request to reset your WorkScribe password.</p>
                <p>
                    <a href="{reset_url}"
                       style="background:#6366f1;color:#fff;padding:12px 24px;
                              border-radius:6px;text-decoration:none;display:inline-block;">
                        Reset Password
                    </a>
                </p>
                <p>This link expires in 1 hour.</p>
                <p>If you did not request a password reset, you can safely ignore this email.</p>
            """,
        )
    except Exception as exc:
        logger.error("send_password_reset_email failed for %s: %s", to_email, exc)