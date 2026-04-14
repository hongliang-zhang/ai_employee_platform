from flask import Flask, request, jsonify
from gateway_client import GatewayClient

SYSTEM_PROMPT = "You are a helpful assistant."

app = Flask(__name__)

@app.get("/health")
def health():
    return jsonify({"ok": True})

@app.post("/chat")
def chat():
    data = request.get_json()
    if not data or "message" not in data:
        return jsonify({"error": "missing message"}), 400

    gw = GatewayClient()

    # Load history (user message already written by dispatcher)
    history_resp = gw.load_messages()
    last_id = history_resp["last_message_id"]

    # Build messages for LLM: system + full history
    llm_messages = [{"role": "system", "content": [{"type": "text", "text": SYSTEM_PROMPT}]}]
    for msg in history_resp["messages"]:
        llm_messages.append({"role": msg["role"], "content": msg["content"]})

    # Call LLM
    llm_resp = gw.invoke_llm(llm_messages)
    assistant_msg = llm_resp["message"]
    reply_text = assistant_msg["content"][0]["text"] if assistant_msg["content"] else ""

    # Persist assistant message
    gw.append_messages(
        expected_last_message_id=last_id,
        messages=[{"role": "assistant", "content": assistant_msg["content"], "source": "sandbox"}],
    )

    return jsonify({"reply": reply_text})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
