"""
Диалоговый агент: генерирует ответ менеджера с учётом ВСЕЙ истории
переписки с конкретным лидом (а не только последнего сообщения), профиля
из базы знаний о самом лиде (то, что собрал скаут в группах) и базы
знаний о продукте (файлы 00-08 -> knowledge_base.py, поиск по смыслу).

Плюс отдельная функция analyze_group_message — "мозг" скаута: одним
вызовом ИИ решает, стоит ли обновлять профиль по сообщению из группы.
"""

import json

from openai import OpenAI

import knowledge_base
from config import AppConfig


def build_system_prompt(persona: str, cfg: AppConfig) -> str:
    return f"""{persona}

Правила:
- Ты продолжаешь уже идущий диалог с продавцом (селлером) в личных сообщениях Telegram.
- Отвечай только на русском, коротко (обычно 1-4 предложения), как в обычной переписке, а не в виде письма.
- Если продавец описывает проблему — сначала уточни детали, если их не хватает для решения,
  и только потом предлагай конкретный следующий шаг (звонок, документ, доступ и т.д.).
- Не повторяй то, что уже обсуждали в этом диалоге.
- Не подписывайся именем в каждом сообщении — это личный чат, а не письмо.
- Никогда не упоминай, что ты ИИ, бот, автоматизация или языковая модель.
- {cfg.kb_uncertainty_rule}"""


def _profile_context_block(profile: dict | None) -> str:
    """Превращает профиль лида (из profile_store) в текстовый блок для промпта."""
    if not profile:
        return ""
    parts = []
    if profile.get("problem"):
        parts.append(f"Проблема/запрос: {profile['problem']}")
    if profile.get("niche_info"):
        parts.append(f"О бизнесе/нише: {profile['niche_info']}")
    if profile.get("budget_time"):
        parts.append(f"Бюджет/сроки: {profile['budget_time']}")
    if not parts:
        return ""
    return "Известно об этом человеке из наших групп (используй, но не пересказывай дословно):\n" + "\n".join(parts)


def _kb_context_block(query: str, cfg: AppConfig) -> str:
    """Ищет релевантные куски базы знаний о продукте под конкретный запрос."""
    if not query:
        return ""
    try:
        return knowledge_base.retrieve(query, cfg.kb_dir, cfg.kb_cache_path, cfg.openai_key,
                                        top_k=cfg.kb_top_k, base_url=cfg.openai_base_url)
    except Exception as e:
        print(f"[База знаний] Поиск не удался, отвечаем без неё: {e}")
        return ""


def generate_reply(persona: str, history: list[dict], incoming_text: str, cfg: AppConfig,
                    profile: dict | None = None) -> str:
    """
    history — список {"role": "lead"|"manager", "content": str}, из storage.get_history().
    profile — запись из profile_store.get_profile(): долгосрочный контекст о лиде.
    Плюс автоматически подмешивается релевантный кусок базы знаний о продукте
    под текст входящего сообщения (тарифы, модули, возражения, FAQ и т.д.).
    """
    client = OpenAI(api_key=cfg.openai_key, base_url=cfg.openai_base_url)

    system_prompt = build_system_prompt(persona, cfg)

    lead_ctx = _profile_context_block(profile)
    if lead_ctx:
        system_prompt += "\n\n" + lead_ctx

    kb_ctx = _kb_context_block(incoming_text, cfg)
    if kb_ctx:
        system_prompt += "\n\n" + kb_ctx

    messages = [{"role": "system", "content": system_prompt}]
    for turn in history:
        role = "user" if turn["role"] == "lead" else "assistant"
        messages.append({"role": role, "content": turn["content"]})
    messages.append({"role": "user", "content": incoming_text})

    resp = client.chat.completions.create(
        model=cfg.chat_model,
        messages=messages,
        temperature=0.6,
    )
    return resp.choices[0].message.content.strip()


def generate_opening_message(persona: str, profile: dict, cfg: AppConfig) -> str:
    """Первое сообщение для проактивной рассылки — на основе профиля лида + базы знаний о продукте."""
    client = OpenAI(api_key=cfg.openai_key, base_url=cfg.openai_base_url)

    lead_ctx = _profile_context_block(profile) or "Информации о конкретной проблеме пока нет."
    query_for_kb = profile.get("problem") or profile.get("niche_info") or ""
    kb_ctx = _kb_context_block(query_for_kb, cfg)

    system_prompt = build_system_prompt(persona, cfg)
    if kb_ctx:
        system_prompt += "\n\n" + kb_ctx

    prompt = f"""{lead_ctx}

Напиши первое сообщение в личку от менеджера — коротко (2-4 предложения),
по-деловому, без канцелярита, без представления по шаблону "Здравствуйте, меня зовут...".
Покажи, что понял именно его ситуацию (по тому, что он писал в группе), и задай один уточняющий вопрос."""

    resp = client.chat.completions.create(
        model=cfg.chat_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
    )
    return resp.choices[0].message.content.strip()


def analyze_group_message(text: str, existing_profile: dict | None, cfg: AppConfig) -> dict:
    """
    Единственный вызов ИИ на сообщение из группы (дёшево по API):
    - решает, несёт ли сообщение полезную информацию о проблеме/бизнесе/бюджете продавца;
    - если да, возвращает ОБНОВЛЁННЫЕ (не перезаписанные "с нуля", а дополненные с учётом
      уже известного) значения полей профиля.

    Возвращает dict:
      {"is_relevant": bool, "problem": str|None, "niche_info": str|None, "budget_time": str|None}
    Поля со значением None — оставить как было в профиле (не менять).
    """
    client = OpenAI(api_key=cfg.openai_key, base_url=cfg.openai_base_url)

    known_problem = (existing_profile or {}).get("problem") or "неизвестно"
    known_niche = (existing_profile or {}).get("niche_info") or "неизвестно"
    known_budget = (existing_profile or {}).get("budget_time") or "неизвестно"

    prompt = f"""Ты анализируешь сообщение продавца (селлера) в рабочей группе Telegram,
чтобы поддерживать его профиль в базе знаний команды продаж.

Уже известно об этом человеке:
- Проблема/запрос: {known_problem}
- Бизнес/ниша: {known_niche}
- Бюджет/сроки: {known_budget}

Новое сообщение от него в группе:
\"\"\"{text}\"\"\"

Определи:
1. is_relevant — несёт ли сообщение полезную информацию о его проблеме, бизнесе/нише,
   объёмах, площадках, на которых он продаёт, или бюджете/сроках. Флуд, приветствия,
   реакции, вопросы не по делу — is_relevant = false.
2. Если is_relevant = true — дай ОБНОВЛЁННЫЕ значения полей: дополни уже известное новой
   информацией (не теряя её), кратко (до ~200 символов на поле). Если по какому-то полю
   ничего нового нет — верни null для этого поля (не копируй старое значение).

Ответь СТРОГО в формате JSON, без пояснений:
{{"is_relevant": true/false, "problem": "..." or null, "niche_info": "..." or null, "budget_time": "..." or null}}"""

    resp = client.chat.completions.create(
        model=cfg.chat_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    try:
        data = json.loads(resp.choices[0].message.content)
    except (json.JSONDecodeError, TypeError):
        return {"is_relevant": False, "problem": None, "niche_info": None, "budget_time": None}

    return {
        "is_relevant": bool(data.get("is_relevant")),
        "problem": data.get("problem") or None,
        "niche_info": data.get("niche_info") or None,
        "budget_time": data.get("budget_time") or None,
    }
