"""Процесс api: FastAPI, проверки живости и готовности."""

import asyncio
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

import structlog
import uvicorn
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import Field
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from starlette.types import ASGIApp

from app.docs import DESCRIPTION, TAGS, TITLE, docs_router
from apps.audit.router import router as audit_router
from apps.departments.router import router as departments_router
from apps.payments.router import router as payments_router
from apps.reminders.router import chats_router as group_chats_router
from apps.reminders.router import router as reminders_router
from apps.reminders.service import enqueue
from apps.reminders.telegram import BotUpdates, TelegramNotifier
from apps.users.aeza import AezaApi, AezaClient
from apps.users.dev_aeza import DevAeza
from apps.users.router import public_router as auth_router
from apps.users.router import router as users_router
from apps.users.service import MemberAuthenticator, sync_admins
from core.auth import Authenticator, current_principal
from core.clock import Clock, clock_from_settings
from core.config import (
    ConfigError,
    IdentitySettings,
    IntegrationSettings,
    ReminderSettings,
    Settings,
    load_identity_settings,
    load_integration_settings,
    load_reminder_settings,
    load_settings,
)
from core.db import create_engine, create_session_factory
from core.errors import error_response, install_error_handlers
from core.logging import RequestContextMiddleware, configure_logging
from core.schemas import ApiModel, error_responses

log = structlog.get_logger(__name__)

API_PREFIX = "/api/v1"
ADMIN_SYNC_MAX_DELAY_SECONDS = 30.0
READINESS_TIMEOUT_SECONDS = 2.0
ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def migrations_head() -> str | None:
    return ScriptDirectory.from_config(Config(str(ALEMBIC_INI))).get_current_head()


def create_app(
    settings: Settings,
    engine: AsyncEngine | None = None,
    clock: Clock | None = None,
    *,
    identity: IdentitySettings | None = None,
    authenticator: Authenticator | None = None,
    aeza: AezaApi | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
    reminders: ReminderSettings | None = None,
    telegram_bot: BotUpdates | None = None,
    integrations: IntegrationSettings | None = None,
) -> FastAPI:
    """Собирает приложение; зависимости передают тесты, иначе они создаются по настройкам."""
    owns_engine = engine is None
    db_engine = engine or create_engine(settings)
    # Без настроек (тесты, выгрузка контракта) адрес Aéza - по умолчанию, администраторов нет.
    identity_settings = identity or IdentitySettings.model_construct(
        aeza_api_url=IdentitySettings.model_fields["aeza_api_url"].default,
        admin_emails="",
        session_ttl_hours=IdentitySettings.model_fields["session_ttl_hours"].default,
    )
    owned_aeza = None if aeza is not None else AezaClient(identity_settings.aeza_api_url)
    aeza_api: AezaApi = aeza or owned_aeza  # type: ignore[assignment]
    if settings.dev_login_password is not None:
        log.warning("dev_login_enabled")
        aeza_api = DevAeza(settings.dev_login_password.get_secret_value(), aeza_api)
    factory = session_factory or create_session_factory(db_engine)
    app_clock = clock or clock_from_settings(settings)
    # Без настроек (тесты, выгрузка контракта) общий чат выключен, окружение не читается.
    reminder_settings = reminders or ReminderSettings.model_construct()
    owned_bot = (
        None if telegram_bot is not None else TelegramNotifier.from_settings(reminder_settings)
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        retry = None
        if identity is not None:
            try:
                await sync_admins(factory, identity.admin_email_list)
            except Exception:
                # База ещё не готова: api всё равно поднимается, синхронизация повторится.
                log.warning("admin_sync_failed", exc_info=True)
                retry = asyncio.create_task(_sync_admins_until_done(factory, identity))
        yield
        if retry is not None:
            retry.cancel()
        if owned_aeza is not None:
            await owned_aeza.close()
        if owned_bot is not None:
            await owned_bot.close()
        if owns_engine:
            await db_engine.dispose()

    app = FastAPI(
        title=TITLE,
        version="0.1.0",
        description=DESCRIPTION,
        openapi_tags=TAGS,
        # Swagger со своей темой отдаёт docs_router
        docs_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
        # Имя операции в контракте - имя функции: из него генераторы клиента строят методы.
        generate_unique_id_function=lambda route: route.name,
    )
    app.state.settings = settings
    app.state.engine = db_engine
    app.state.session_factory = factory
    app.state.clock = app_clock
    app.state.reminder_settings = reminder_settings
    app.state.telegram_bot = telegram_bot or owned_bot
    # Доставки создаются в транзакции изменения, поэтому api знает включённые адаптеры.
    app.state.event_targets = integrations.targets if integrations else ()
    app.state.after_payment_change = lambda session, today, payment_ids, created: enqueue(
        session, today, reminder_settings, payment_ids, created=created
    )
    app.state.aeza = aeza_api
    app.state.session_ttl_hours = identity_settings.session_ttl_hours
    app.state.authenticator = authenticator or MemberAuthenticator(factory, app_clock, aeza_api)
    install_error_handlers(app)
    app.include_router(_health_router(db_engine, migrations_head()))
    app.include_router(_api_router())
    app.include_router(docs_router(app, API_PREFIX))
    return app


def _api_router() -> APIRouter:
    """Все операции `/api/v1`: каждая требует действующий токен (схема OAuth2 в контракте)."""
    router = APIRouter(prefix=API_PREFIX)
    router.include_router(auth_router)
    protected = APIRouter(dependencies=[Depends(current_principal)])
    for module_router in (
        users_router,
        payments_router,
        departments_router,
        reminders_router,
        group_chats_router,
        audit_router,
        _settings_router(),
    ):
        protected.include_router(module_router)
    router.include_router(protected)
    return router


async def _sync_admins_until_done(
    factory: async_sessionmaker[AsyncSession], identity: IdentitySettings
) -> None:
    """Повторяет синхронизацию администраторов, пока база не станет доступна."""
    delay = 1.0
    while True:
        await asyncio.sleep(delay)
        try:
            await sync_admins(factory, identity.admin_email_list)
        except Exception:
            log.warning("admin_sync_failed", retry_in_seconds=delay, exc_info=True)
            delay = min(delay * 2, ADMIN_SYNC_MAX_DELAY_SECONDS)
        else:
            return


def _health_router(engine: AsyncEngine, head: str | None) -> APIRouter:
    router = APIRouter(include_in_schema=False)

    @router.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @router.get("/metrics")
    async def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    @router.get("/readyz", response_model=None)
    async def readyz(request: Request) -> dict[str, str] | JSONResponse:
        try:
            async with asyncio.timeout(READINESS_TIMEOUT_SECONDS), engine.connect() as connection:
                result = await connection.execute(text("select version_num from alembic_version"))
                version = result.scalar_one_or_none()
        except ProgrammingError:
            return _not_ready(request, "migrations_pending", "Миграции базы данных не применены")
        except (SQLAlchemyError, OSError, TimeoutError):
            return _not_ready(request, "database_unavailable", "База данных недоступна")
        if version != head:
            return _not_ready(request, "migrations_pending", "Миграции базы данных не применены")
        return {"status": "ready"}

    return router


class SystemSettings(ApiModel):
    today: date = Field(description="Сегодня в часовом поясе системы: от него считаются сроки")
    timezone: str = Field(examples=["Europe/Moscow"])
    reminder_days_before: int = Field(
        description="За сколько дней до срока приходит напоминание", examples=[3]
    )


def _settings_router() -> APIRouter:
    router = APIRouter(tags=["Система"])

    @router.get(
        "/settings",
        summary="Настройки системы",
        description="Серверное сегодня и окно напоминаний: по ним панель считает сроки. "
        "Доступно всем ролям.",
        responses=error_responses(401),
    )
    async def get_settings(request: Request) -> SystemSettings:
        state = request.app.state
        return SystemSettings(
            today=state.clock.today(),
            timezone=state.settings.tz,
            reminder_days_before=state.reminder_settings.reminder_days_before,
        )

    return router


def _not_ready(request: Request, code: str, message: str) -> JSONResponse:
    return error_response(request, 503, code, message)


def create_asgi_app(
    settings: Settings,
    engine: AsyncEngine | None = None,
    clock: Clock | None = None,
    *,
    identity: IdentitySettings | None = None,
    authenticator: Authenticator | None = None,
    aeza: AezaApi | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
    reminders: ReminderSettings | None = None,
    telegram_bot: BotUpdates | None = None,
    integrations: IntegrationSettings | None = None,
) -> ASGIApp:
    """Приложение с идентификатором запроса снаружи: он попадает и в ответы 500."""
    return RequestContextMiddleware(
        create_app(
            settings,
            engine,
            clock,
            identity=identity,
            authenticator=authenticator,
            aeza=aeza,
            session_factory=session_factory,
            reminders=reminders,
            telegram_bot=telegram_bot,
            integrations=integrations,
        )
    )


def _settings_or_exit() -> tuple[Settings, IdentitySettings, ReminderSettings, IntegrationSettings]:
    try:
        return (
            load_settings(),
            load_identity_settings(),
            load_reminder_settings(),
            load_integration_settings(),
        )
    except ConfigError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from None


def app_from_env() -> ASGIApp:
    """Фабрика для `uvicorn --factory --reload` при разработке."""
    settings, identity, reminders, integrations = _settings_or_exit()
    configure_logging("api", settings.log_level)
    return create_asgi_app(
        settings, identity=identity, reminders=reminders, integrations=integrations
    )


def main() -> None:
    settings, identity, reminders, integrations = _settings_or_exit()
    configure_logging("api", settings.log_level)
    uvicorn.run(
        create_asgi_app(
            settings, identity=identity, reminders=reminders, integrations=integrations
        ),
        host=settings.http_host,
        port=settings.http_port,
        log_config=None,
        access_log=False,
    )


if __name__ == "__main__":
    main()
