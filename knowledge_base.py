"""
База знаний менеджера: .md-файлы (о продукте, тарифы, FAQ, возражения,
глоссарий, оргструктура) -> чанки по заголовкам -> эмбеддинги -> поиск
самых релевантных кусков под конкретное сообщение лида.

Загруженные вами файлы (00-08) — это и есть содержимое папки kb_dir.
Индекс считается один раз и кэшируется на диск (kb_index.json); при
следующем запуске, если файлы не менялись (проверяется по mtime/размеру),
эмбеддинги не пересчитываются — экономит деньги и время старта.
"""

import os
import re
import json
import math
import hashlib

from openai import OpenAI

EMBED_MODEL = "text-embedding-3-small"
MAX_CHUNK_CHARS = 1200

_memory_cache: dict[str, dict] = {}  # kb_dir -> {"signature": str, "chunks": [...]}


def _dir_signature(kb_dir: str) -> str:
    if not os.path.isdir(kb_dir):
        return ""
    parts = []
    for fname in sorted(os.listdir(kb_dir)):
        if fname.endswith(".md"):
            p = os.path.join(kb_dir, fname)
            st = os.stat(p)
            parts.append(f"{fname}:{st.st_mtime_ns}:{st.st_size}")
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def _split_into_chunks(md_text: str, source: str) -> list[dict]:
    """Режет markdown по заголовкам (#, ##, ###); длинные секции — дополнительно по абзацам."""
    lines = md_text.splitlines()
    raw_chunks = []
    current_heading = source
    current_lines: list[str] = []

    def flush():
        text = "\n".join(current_lines).strip()
        if text:
            raw_chunks.append({"source": source, "heading": current_heading, "text": text})

    for line in lines:
        if re.match(r"^#{1,3}\s+", line):
            flush()
            current_heading = re.sub(r"^#{1,3}\s+", "", line).strip()
            current_lines = []
        else:
            current_lines.append(line)
    flush()

    final: list[dict] = []
    for c in raw_chunks:
        if len(c["text"]) <= MAX_CHUNK_CHARS:
            final.append(c)
            continue
        # длинную секцию режем по пустым строкам (абзацам), собирая куски по ~MAX_CHUNK_CHARS
        paragraphs = c["text"].split("\n\n")
        buf, part = "", 1
        for p in paragraphs:
            if buf and len(buf) + len(p) > MAX_CHUNK_CHARS:
                final.append({"source": c["source"], "heading": f"{c['heading']} (ч.{part})", "text": buf.strip()})
                part += 1
                buf = p
            else:
                buf = f"{buf}\n\n{p}" if buf else p
        if buf.strip():
            heading = f"{c['heading']} (ч.{part})" if part > 1 else c["heading"]
            final.append({"source": c["source"], "heading": heading, "text": buf.strip()})
    return final


def _load_all_documents(kb_dir: str) -> list[dict]:
    chunks = []
    if not os.path.isdir(kb_dir):
        return chunks
    for fname in sorted(os.listdir(kb_dir)):
        if fname.endswith(".md"):
            path = os.path.join(kb_dir, fname)
            with open(path, encoding="utf-8") as f:
                text = f.read()
            chunks.extend(_split_into_chunks(text, fname))
    return chunks


def _embed_texts(texts: list[str], openai_key: str, base_url: str | None = None) -> list[list[float]]:
    if not texts:
        return []
    client = OpenAI(api_key=openai_key, base_url=base_url)
    resp = client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [d.embedding for d in resp.data]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _load_or_build_index(kb_dir: str, cache_path: str, openai_key: str, base_url: str | None = None) -> list[dict]:
    signature = _dir_signature(kb_dir)
    if not signature:
        return []

    cached = _memory_cache.get(kb_dir)
    if cached and cached["signature"] == signature:
        return cached["chunks"]

    if os.path.exists(cache_path):
        try:
            with open(cache_path, encoding="utf-8") as f:
                on_disk = json.load(f)
            if on_disk.get("signature") == signature:
                _memory_cache[kb_dir] = on_disk
                return on_disk["chunks"]
        except (json.JSONDecodeError, OSError):
            pass

    print(f"[База знаний] Файлы изменились или индекс не найден — считаю эмбеддинги для '{kb_dir}'...")
    chunks = _load_all_documents(kb_dir)
    texts = [f"{c['source']} — {c['heading']}\n{c['text']}" for c in chunks]
    embeddings = _embed_texts(texts, openai_key, base_url)
    for c, e in zip(chunks, embeddings):
        c["embedding"] = e

    payload = {"signature": signature, "chunks": chunks}
    try:
        os.makedirs(os.path.dirname(cache_path) or ".", exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
    except OSError as e:
        print(f"[База знаний] Не удалось сохранить кэш индекса: {e}")

    _memory_cache[kb_dir] = payload
    print(f"[База знаний] Готово: {len(chunks)} чанков из {kb_dir}.")
    return chunks


def retrieve(query: str, kb_dir: str, cache_path: str, openai_key: str, top_k: int = 4,
             base_url: str | None = None) -> str:
    """
    Возвращает отформатированный текстовый блок с top_k самыми релевантными
    кусками базы знаний под запрос query. Пустая строка, если kb_dir не
    задан/не существует или в нём нет .md файлов.
    """
    if not kb_dir or not query or not query.strip():
        return ""

    chunks = _load_or_build_index(kb_dir, cache_path, openai_key, base_url)
    if not chunks:
        return ""

    query_embedding = _embed_texts([query], openai_key, base_url)[0]
    scored = [
        (c, _cosine(query_embedding, c["embedding"]))
        for c in chunks if c.get("embedding")
    ]
    scored.sort(key=lambda x: x[1], reverse=True)
    top = [c for c, score in scored[:top_k] if score > 0.15]  # отсекаем совсем нерелевантное

    if not top:
        return ""

    blocks = [f"### {c['source']} — {c['heading']}\n{c['text']}" for c in top]
    return "Справочная информация из базы знаний компании (используй как факты, но не копируй дословно):\n\n" + \
        "\n\n".join(blocks)
