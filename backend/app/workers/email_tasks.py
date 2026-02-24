"""
Email background tasks.

Invitation emails, password reset emails.
"""

from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.email_tasks.send_invitation_email", bind=True, max_retries=3)
def send_invitation_email(
    self,  # type: ignore[no-untyped-def]
    to_email: str,
    org_name: str,
    org_slug: str,
    inviter_name: str,
    role: str,
    invitation_token: str,
    frontend_url: str,
) -> dict[str, str]:
    """
    Send an invitation email via Resend.

    Args:
        to_email: Recipient email address.
        org_name: Organization display name.
        org_slug: Organization slug.
        inviter_name: Display name of the person who sent the invite.
        role: Role being assigned (admin/member).
        invitation_token: Secure token for the invitation link.
        frontend_url: Frontend base URL for constructing the accept link.

    Returns:
        Dict with status and message_id.
    """
    try:
        import resend

        from app.core.config import settings

        resend.api_key = settings.RESEND_API_KEY

        accept_url = f"{frontend_url}/invitations/{invitation_token}/accept"

        params: resend.Emails.SendParams = {
            "from": settings.EMAIL_FROM,
            "to": [to_email],
            "subject": f"You've been invited to join {org_name} on WorkScribe",
            "html": f"""
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
        }

        response = resend.Emails.send(params)
        return {"status": "sent", "message_id": response["id"]}

    except Exception as exc:
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))


@celery_app.task(name="app.workers.email_tasks.send_password_reset_email", bind=True, max_retries=3)
def send_password_reset_email(
    self,  # type: ignore[no-untyped-def]
    to_email: str,
    reset_token: str,
    frontend_url: str,
) -> dict[str, str]:
    """
    Send a password reset email via Resend.

    Args:
        to_email: Recipient email address.
        reset_token: Secure reset token.
        frontend_url: Frontend base URL for constructing the reset link.

    Returns:
        Dict with status and message_id.
    """
    try:
        import resend

        from app.core.config import settings

        resend.api_key = settings.RESEND_API_KEY

        reset_url = f"{frontend_url}/reset-password?token={reset_token}"

        params: resend.Emails.SendParams = {
            "from": settings.EMAIL_FROM,
            "to": [to_email],
            "subject": "Reset your WorkScribe password",
            "html": f"""
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
        }

        response = resend.Emails.send(params)
        return {"status": "sent", "message_id": response["id"]}

    except Exception as exc:
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))