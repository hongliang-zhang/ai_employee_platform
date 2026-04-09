import os
import requests
from typing import Optional

class GatewayClient:
    def __init__(self):
        self.base_url = os.environ["GATEWAY_URL"].rstrip("/")
        self.token = os.environ["SESSION_TOKEN"]
        self.session_id = os.environ["SESSION_ID"]

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    def load_messages(self, after_message_id: Optional[str] = None) -> dict:
        payload = {}
        if after_message_id:
            payload["after_message_id"] = after_message_id
        resp = requests.post(f"{self.base_url}/gateway/messages/load", json=payload, headers=self._headers())
        resp.raise_for_status()
        return resp.json()

    def append_messages(self, expected_last_message_id: Optional[str], messages: list) -> dict:
        resp = requests.post(
            f"{self.base_url}/gateway/messages/append",
            json={"expected_last_message_id": expected_last_message_id, "messages": messages},
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()

    def invoke_llm(self, messages: list, model: str = "glm-5.1") -> dict:
        resp = requests.post(
            f"{self.base_url}/gateway/llm",
            json={"model": model, "messages": messages},
            headers=self._headers(),
        )
        resp.raise_for_status()
        return resp.json()
