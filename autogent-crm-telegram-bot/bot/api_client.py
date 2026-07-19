from typing import Any, Optional

import httpx

from . import config


class ApiError(Exception):
    def __init__(self, status: int, payload: dict[str, Any]):
        self.status = status
        self.payload = payload
        super().__init__(f"API error {status}: {payload}")

    @property
    def code(self) -> str:
        return str(self.payload.get("error", "unknown"))


class BotApiClient:
    """Тонкий HTTP-клиент к app/api/bot/* — бот не содержит бизнес-логики,
    вся правда о задачах/правах/дедлайнах живёт на стороне Next.js."""

    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=config.BACKEND_URL,
            headers={"X-Bot-Secret": config.BOT_INTERNAL_SECRET},
            timeout=15.0,
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def _request(self, method: str, path: str, **kwargs) -> dict[str, Any]:
        resp = await self._client.request(method, path, **kwargs)
        data = resp.json() if resp.content else {}
        if resp.status_code >= 400:
            raise ApiError(resp.status_code, data)
        return data

    async def link(self, token: str, chat_id: int, username: Optional[str]) -> dict[str, Any]:
        return await self._request(
            "POST", "/api/bot/link", json={"token": token, "chatId": chat_id, "username": username}
        )

    async def unlink(self, chat_id: int) -> dict[str, Any]:
        return await self._request("POST", "/api/bot/unlink", json={"chatId": chat_id})

    async def whoami(self, chat_id: int) -> dict[str, Any]:
        return await self._request("GET", "/api/bot/whoami", params={"chatId": chat_id})

    async def list_tasks(
        self, chat_id: int, status: str, page: int = 1, assignee_id: Optional[str] = None
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"chatId": chat_id, "status": status, "page": page}
        if assignee_id:
            params["assigneeId"] = assignee_id
        return await self._request("GET", "/api/bot/tasks", params=params)

    async def create_task(self, chat_id: int, **fields: Any) -> dict[str, Any]:
        return await self._request("POST", "/api/bot/tasks", json={"chatId": chat_id, **fields})

    async def complete_task(self, chat_id: int, task_id: str) -> dict[str, Any]:
        return await self._request("PATCH", f"/api/bot/tasks/{task_id}/complete", json={"chatId": chat_id})

    async def archive_task(self, chat_id: int, task_id: str) -> dict[str, Any]:
        return await self._request("PATCH", f"/api/bot/tasks/{task_id}/archive", json={"chatId": chat_id})

    async def list_employees(self, chat_id: int) -> dict[str, Any]:
        return await self._request("GET", "/api/bot/employees", params={"chatId": chat_id})

    async def employee_report(self, chat_id: int, employee_id: str) -> dict[str, Any]:
        return await self._request(
            "GET", f"/api/bot/employees/{employee_id}/report", params={"chatId": chat_id}
        )

    async def list_projects(self, chat_id: int) -> dict[str, Any]:
        return await self._request("GET", "/api/bot/projects", params={"chatId": chat_id})

    async def list_users(self, chat_id: int) -> dict[str, Any]:
        return await self._request("GET", "/api/bot/users", params={"chatId": chat_id})

    async def create_calendar_event(self, chat_id: int, **fields: Any) -> dict[str, Any]:
        return await self._request("POST", "/api/bot/calendar", json={"chatId": chat_id, **fields})

    async def list_lead_stages(self, chat_id: int) -> dict[str, Any]:
        return await self._request("GET", "/api/bot/lead-stages", params={"chatId": chat_id})

    async def list_leads(self, chat_id: int, stage: str, page: int = 1) -> dict[str, Any]:
        return await self._request("GET", "/api/bot/leads", params={"chatId": chat_id, "stage": stage, "page": page})

    async def get_lead(self, chat_id: int, lead_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/api/bot/leads/{lead_id}", params={"chatId": chat_id})

    async def create_lead(self, chat_id: int, **fields: Any) -> dict[str, Any]:
        return await self._request("POST", "/api/bot/leads", json={"chatId": chat_id, **fields})

    async def move_lead(self, chat_id: int, lead_id: str, direction: str) -> dict[str, Any]:
        return await self._request(
            "PATCH", f"/api/bot/leads/{lead_id}/move", json={"chatId": chat_id, "direction": direction}
        )

    async def update_lead(self, chat_id: int, lead_id: str, **fields: Any) -> dict[str, Any]:
        return await self._request("PATCH", f"/api/bot/leads/{lead_id}", json={"chatId": chat_id, **fields})

    async def set_lead_lost(self, chat_id: int, lead_id: str, lost: bool, lost_reason: Optional[str] = None) -> dict[str, Any]:
        return await self._request(
            "PATCH",
            f"/api/bot/leads/{lead_id}/lost",
            json={"chatId": chat_id, "lost": lost, "lostReason": lost_reason},
        )


api = BotApiClient()
