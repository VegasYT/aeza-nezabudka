"""Оформление документации API: вступление, разделы и Swagger в палитре веб-панели."""

import hashlib
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, HTMLResponse

TITLE = "Незабудка API"

DESCRIPTION = """
Напоминания о регулярных платежах компании: аренда, подписки, серверы.
Платёж порождает ежемесячные **периоды**, у каждого свой срок и своя отметка оплаты.

### Вход
1. `POST /auth/login` - email и пароль аккаунта Aéza.
2. `POST /auth/use-challenge` или, если в `requirements` есть `totp`, `POST /auth/tfa/totp`.
3. Полученный `session` - в **Authorize**, схема `bearer`.
   Другие системы передают `X-API-KEY` аккаунта Aéza.

Войти могут только участники белого списка. Роли: `admin` - всё; `user` - просмотр и отметка оплаты;
`integration` - платежи и оплаты по `X-API-KEY`, без входа в панель.

### Формат
- JSON в camelCase. Списки - `{items, total}`, параметры `limit` (до 100) и `offset`.
- Суммы - целые копейки или центы (`amountMinor`), итоги по каждой валюте отдельно.
- Даты - `ГГГГ-ММ-ДД` в часовом поясе системы, серверное сегодня - `GET /settings`.
- `POST /recurring-payments` принимает `Idempotency-Key`: повтор не создаёт второй платёж.

### Ошибки
`{statusCode, message, error, timestamp, path, payload, requestId}`,
где `error` - код для программы.
400 `bad_request` - в `payload` список `{field, message}`; 401 `not_auth`; 403 `forbidden`;
404 `not_found`; 409 - конфликт с кодом в `error`; 429 - много неудачных входов.
"""

TAGS = [
    {"name": "Вход", "description": "Вход аккаунтом Aéza, текущий участник и выход."},
    {"name": "Регулярные платежи", "description": "Что и когда платить: сумма, валюта, срок."},
    {
        "name": "Периоды оплаты",
        "description": "Конкретные сроки платежей: отметка и отмена оплаты, просрочка.",
    },
    {"name": "Итоги", "description": "Суммы по валютам, бюджет по месяцам и плановые периоды."},
    {"name": "Отделы", "description": "Необязательная группировка платежей."},
    {"name": "Пользователи", "description": "Белый список аккаунтов Aéza и роли."},
    {
        "name": "Уведомления",
        "description": "Личный Telegram пользователя и групповые чаты для напоминаний.",
    },
    {"name": "Журнал действий", "description": "Кто и что менял в системе."},
    {"name": "Система", "description": "Настройки, нужные панели."},
    {"name": "События", "description": "Поток изменений для панели в реальном времени (SSE)."},
]

SWAGGER_PARAMETERS = {
    "persistAuthorization": True,
    "tryItOutEnabled": True,
    "displayRequestDuration": True,
    "docExpansion": "list",
    "defaultModelsExpandDepth": -1,
    "filter": True,
    "syntaxHighlight": {"theme": "obsidian"},
}

_THEME = Path(__file__).with_name("swagger-theme.css")
# версия в адресе: после правки темы браузер не возьмёт старый файл из кеша
_THEME_VERSION = hashlib.sha256(_THEME.read_bytes()).hexdigest()[:10]
_FONTS = (
    "https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5/index.css",
    "https://cdn.jsdelivr.net/npm/@fontsource-variable/exo-2@5/index.css",
)


def docs_router(app: FastAPI, prefix: str) -> APIRouter:
    """Swagger на `<prefix>/docs` со своей темой; стандартная страница FastAPI отключена."""
    router = APIRouter(include_in_schema=False)
    theme_url = f"{prefix}/docs/theme.css"

    @router.get(f"{prefix}/docs")
    async def swagger() -> HTMLResponse:
        page = get_swagger_ui_html(
            openapi_url=app.openapi_url or f"{prefix}/openapi.json",
            title=TITLE,
            # иконка панели: тот же домен отдаёт её из frontend
            swagger_favicon_url="/favicon.svg",
            swagger_ui_parameters=SWAGGER_PARAMETERS,
        )
        styles = (*_FONTS, f"{theme_url}?v={_THEME_VERSION}")
        links = "".join(f'<link rel="stylesheet" href="{url}">' for url in styles)
        html = (
            bytes(page.body)
            .decode()
            .replace("</head>", f'<meta name="color-scheme" content="dark">{links}</head>', 1)
        )
        return HTMLResponse(html)

    @router.get(theme_url)
    async def theme() -> FileResponse:
        return FileResponse(_THEME, media_type="text/css")

    return router
