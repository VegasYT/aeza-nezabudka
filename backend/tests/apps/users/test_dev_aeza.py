import pytest

from apps.users.aeza import InvalidCode, InvalidCredentials
from apps.users.dev_aeza import TOTP_CODE, DevAeza, account_id
from core.auth import Unauthenticated
from tests.apps.users.fakes import PASSWORD as AEZA_PASSWORD
from tests.apps.users.fakes import FakeAeza

PASSWORD = "dev-pass"
BUH = "buh@dev.local"


@pytest.fixture
def real() -> FakeAeza:
    fake = FakeAeza()
    fake.add("glavbuh@company.ru", api_key="aeza-key")
    return fake


@pytest.fixture
def aeza(real: FakeAeza) -> DevAeza:
    return DevAeza(PASSWORD, real)


async def test_login_without_2fa(aeza: DevAeza, real: FakeAeza) -> None:
    challenge = await aeza.login(BUH, PASSWORD)
    session = await aeza.use_challenge(challenge.challenge)

    assert challenge.requirements == ()
    account = await aeza.account(session=session)
    assert (account.id, account.email) == (account_id(BUH), BUH)
    assert real.calls == []


async def test_other_emails_go_to_aeza(aeza: DevAeza, real: FakeAeza) -> None:
    challenge = await aeza.login("glavbuh@company.ru", AEZA_PASSWORD)
    session = await aeza.use_challenge(challenge.challenge)
    account = await aeza.account(session=session)
    await aeza.logout(session)

    assert account.email == "glavbuh@company.ru"
    assert real.logouts == [session]
    assert (await aeza.account(api_key="aeza-key")).email == "glavbuh@company.ru"


async def test_dev_password_does_not_open_aeza_accounts(aeza: DevAeza) -> None:
    with pytest.raises(InvalidCredentials):
        await aeza.login("glavbuh@company.ru", PASSWORD)
    with pytest.raises(Unauthenticated):
        await aeza.account(api_key=f"dev:glavbuh@company.ru:{PASSWORD}")


async def test_wrong_password(aeza: DevAeza) -> None:
    with pytest.raises(InvalidCredentials):
        await aeza.login(BUH, "wrong")


async def test_2fa_needs_code(aeza: DevAeza) -> None:
    challenge = await aeza.login("buh+2fa@dev.local", PASSWORD)

    assert challenge.requirements == ("totp",)
    with pytest.raises(InvalidCode):
        await aeza.use_challenge(challenge.challenge)
    with pytest.raises(InvalidCode):
        await aeza.submit_totp(challenge.challenge, "111111")
    session = await aeza.submit_totp(challenge.challenge, TOTP_CODE)
    assert (await aeza.account(session=session)).email == "buh+2fa@dev.local"


async def test_api_key_names_account(aeza: DevAeza) -> None:
    account = await aeza.account(api_key=f"dev:erp@dev.local:{PASSWORD}")

    assert account.email == "erp@dev.local"


@pytest.mark.parametrize("api_key", ["dev:erp@dev.local", "dev:erp@dev.local:wrong", "dev:"])
async def test_api_key_needs_password(aeza: DevAeza, api_key: str) -> None:
    with pytest.raises(Unauthenticated):
        await aeza.account(api_key=api_key)


async def test_forged_challenge_rejected(aeza: DevAeza, real: FakeAeza) -> None:
    """challenge не собрать из email: подпись знает только сервер."""
    other = DevAeza("other-pass", real)
    forged = await other.login(BUH, "other-pass")

    for token in (f"dev-challenge:{BUH}", f"dev-challenge:{BUH}:00", forged.challenge):
        with pytest.raises(InvalidCode):
            await aeza.use_challenge(token)


@pytest.mark.parametrize("token", ["", "dev:", "aeza-session-1"])
async def test_foreign_tokens_rejected(aeza: DevAeza, token: str) -> None:
    with pytest.raises(Unauthenticated):
        await aeza.account(session=token)
    with pytest.raises(InvalidCode):
        await aeza.use_challenge(token)


def test_account_id_is_stable() -> None:
    assert account_id("a@b.ru") == account_id("a@b.ru") != account_id("c@b.ru")
