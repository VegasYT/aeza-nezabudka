## ADDED Requirements

### Requirement: Откуда выполнен вход

Запись `auth.login` SHALL хранить в `details` IP клиента (`ip`) и User-Agent браузера (`userAgent`), обрезанный до 300 символов.

#### Scenario: Вход из браузера

- **WHEN** участник входит с адреса 10.0.0.7 из браузера с User-Agent `Mozilla/5.0 ...`
- **THEN** в журнале у записи `auth.login` `details` - `{"ip": "10.0.0.7", "userAgent": "Mozilla/5.0 ..."}`
