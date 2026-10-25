"""Схемы безопасности контракта: своя сессия и ключ аккаунта Aéza (ADR-014)."""

from fastapi.security import APIKeyHeader, HTTPBearer

API_KEY_HEADER = "X-API-KEY"

# auto_error выключен: на отсутствие обоих заголовков отвечает current_principal в общем формате.
bearer_scheme = HTTPBearer(
    scheme_name="bearer",
    description="`session` из `POST /auth/use-challenge` или `tfa/totp`, без слова Bearer.",
    auto_error=False,
)
api_key_scheme = APIKeyHeader(
    name=API_KEY_HEADER,
    scheme_name=API_KEY_HEADER,
    description='Ключ аккаунта Aéza из кабинета ("API ключи") для других систем.',
    auto_error=False,
)
