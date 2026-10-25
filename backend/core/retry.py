"""Пауза перед повтором доставки: общая для напоминаний и интеграционных событий."""

MAX_RETRY_DELAY_SECONDS = 3600


def retry_delay(attempts: int) -> float:
    """60 секунд после первой неудачи, затем вдвое больше, не больше часа."""
    return float(min(60 * 2 ** (attempts - 1), MAX_RETRY_DELAY_SECONDS))
