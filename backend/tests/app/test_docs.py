import httpx


async def test_swagger_page_uses_own_theme(offline_client: httpx.AsyncClient) -> None:
    page = await offline_client.get("/api/v1/docs")
    theme = await offline_client.get("/api/v1/docs/theme.css")

    assert page.status_code == 200
    assert "<title>Незабудка API</title>" in page.text
    assert "/api/v1/docs/theme.css?v=" in page.text
    assert '"persistAuthorization": true' in page.text
    assert theme.status_code == 200
    assert theme.headers["content-type"].startswith("text/css")
