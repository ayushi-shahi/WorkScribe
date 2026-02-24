"""
Celery application instance.

Configured with Redis broker and backend.
"""

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "workscribe",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.workers.email_tasks",
        "app.workers.notification_tasks",
    ],
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Timezone
    timezone="UTC",
    enable_utc=True,
    # Results
    result_expires=3600,
    # Retry policy
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Concurrency
    worker_prefetch_multiplier=1,
    # Routing
    task_default_queue="default",
    task_queues={
        "default": {},
        "email": {},
        "notifications": {},
    },
    task_routes={
        "app.workers.email_tasks.*": {"queue": "email"},
        "app.workers.notification_tasks.*": {"queue": "notifications"},
    },
)