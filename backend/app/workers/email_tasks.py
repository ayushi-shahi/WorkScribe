"""
Email helper functions.

Plain functions — no Celery, runs in-process via FastAPI BackgroundTasks.
Uses Brevo HTTP API (port 443) — works on Render free tier.
"""

from __future__ import annotations

import logging
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

BREVO_URL = "https://api.brevo.com/v3/smtp/email"
SENDER = {"name": "WorkScribe", "email": "noreply@workscribe.app"}


def _send(to_email: str, subject: str, html: str) -> None:
    """Send email via Brevo HTTP API."""
    try:
        r = httpx.post(
            BREVO_URL,
            headers={
                "api-key": settings.BREVO_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "sender": SENDER,
                "to": [{"email": to_email}],
                "subject": subject,
                "htmlContent": html,
            },
            timeout=10,
        )
        r.raise_for_status()
        logger.info("Email sent to %s via Brevo", to_email)
    except Exception as exc:
        logger.error("send email failed for %s: %s", to_email, exc)


def send_invitation_email(
    to_email: str,
    org_name: str,
    org_slug: str,
    inviter_name: str,
    role: str,
    invitation_token: str,
    frontend_url: str,
) -> None:
    accept_url = f"{frontend_url}/invitations/{invitation_token}/accept"
    _send(
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


def send_password_reset_email(
    to_email: str,
    reset_token: str,
    frontend_url: str,
) -> None:
    reset_url = f"{frontend_url}/reset-password?token={reset_token}"
    _send(
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