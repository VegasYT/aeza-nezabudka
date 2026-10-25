"""Метрики Prometheus (ADR-009). В метках нет идентификаторов, логинов и текстов ошибок."""

from prometheus_client import Counter, Gauge, Histogram

HTTP_REQUESTS = Counter("http_requests_total", "HTTP-запросы API", ["method", "route", "status"])
HTTP_DURATION = Histogram(
    "http_request_duration_seconds", "Длительность HTTP-запросов API", ["method", "route"]
)
JOB_RUNS = Counter("worker_job_runs_total", "Запуски задач worker", ["job", "result"])
JOB_LAST_SUCCESS = Gauge(
    "worker_job_last_success_timestamp_seconds",
    "Время последнего успешного запуска задачи worker",
    ["job"],
)
PERIODS_CREATED = Counter("payment_periods_created_total", "Досозданные периоды оплаты")
OUTBOX_PENDING = Gauge("outbox_pending", "Ожидающие записи очереди отправки", ["queue"])
OUTBOX_OLDEST_AGE = Gauge(
    "outbox_oldest_pending_age_seconds", "Возраст старейшей ожидающей записи очереди", ["queue"]
)
NOTIFICATIONS = Counter(
    "notifications_total", "Результаты отправки напоминаний", ["recipient", "result"]
)
INTEGRATION_DELIVERIES = Counter(
    "integration_deliveries_total",
    "Результаты доставки интеграционных событий",
    ["target", "result"],
)
DEPENDENCY_ERRORS = Counter(
    "dependency_errors_total", "Ошибки внешних зависимостей", ["dependency"]
)
LOGIN_FAILURES = Counter("login_failures_total", "Неудачные входы", ["reason"])
# Срез данных на тик планировщика: метки - состояние и валюта, без идентификаторов.
PAYMENTS_ACTIVE = Gauge("payments_active", "Действующие регулярные платежи")
OPEN_OCCURRENCES = Gauge(
    "payment_occurrences_open",
    "Неоплаченные периоды: просроченные (overdue) и со сроком в окне напоминаний (due_soon)",
    ["state", "currency"],
)
OPEN_AMOUNT = Gauge(
    "payment_occurrences_open_amount",
    "Сумма неоплаченных периодов в основных единицах валюты",
    ["state", "currency"],
)
LIVE_CLIENTS = Gauge("live_clients", "Открытые потоки событий панели (SSE)")
TELEGRAM_ACTIONS = Counter(
    "telegram_actions_total", "Нажатия кнопок под напоминаниями", ["action", "result"]
)
