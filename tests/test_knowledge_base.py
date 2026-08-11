"""
Тесты knowledge_base.py — RAG-поиск по markdown-базе знаний.
openai.OpenAI (embeddings.create) замокан, реальных сетевых вызовов нет.
"""

from types import SimpleNamespace

import pytest

import knowledge_base


@pytest.fixture(autouse=True)
def _reset_memory_cache():
    """_memory_cache — процесс-глобальный dict kb_dir -> index; чистим между тестами."""
    knowledge_base._memory_cache.clear()
    yield
    knowledge_base._memory_cache.clear()


def _fake_embed_texts(dim_seed_map):
    """
    Возвращает fake-версию _embed_texts, которая детерминированно
    строит эмбеддинги из хэша текста (не важна сама математика — важно,
    что одинаковый текст даёт одинаковый вектор, а разные тексты — разные).
    """
    calls = []

    def _embed(texts, openai_key, base_url=None):
        calls.append(list(texts))
        result = []
        for t in texts:
            seed = sum(ord(c) for c in t) % 97
            result.append([float(seed), float(len(t) % 13), 1.0])
        return result

    return _embed, calls


def test_retrieve_empty_query_returns_empty_string(tmp_path):
    assert knowledge_base.retrieve("", str(tmp_path), str(tmp_path / "cache.json"), "key") == ""
    assert knowledge_base.retrieve("   ", str(tmp_path), str(tmp_path / "cache.json"), "key") == ""


def test_retrieve_nonexistent_kb_dir_returns_empty_string(tmp_path):
    missing_dir = str(tmp_path / "does-not-exist")
    result = knowledge_base.retrieve("вопрос", missing_dir, str(tmp_path / "cache.json"), "key")
    assert result == ""


def test_retrieve_empty_kb_dir_no_md_files_returns_empty(tmp_path, monkeypatch):
    kb_dir = tmp_path / "kb"
    kb_dir.mkdir()
    (kb_dir / "readme.txt").write_text("not markdown", encoding="utf-8")

    result = knowledge_base.retrieve("вопрос", str(kb_dir), str(tmp_path / "cache.json"), "key")
    assert result == ""


def test_split_into_chunks_by_headers():
    md_text = (
        "# Тарифы\n"
        "Подписка стоит 5000 руб/мес.\n\n"
        "## Скидки\n"
        "При оплате за год скидка 20%.\n\n"
        "# FAQ\n"
        "Частые вопросы клиентов.\n"
    )
    chunks = knowledge_base._split_into_chunks(md_text, source="00-tariffs.md")
    headings = [c["heading"] for c in chunks]
    assert "Тарифы" in headings
    assert "Скидки" in headings
    assert "FAQ" in headings
    for c in chunks:
        assert c["source"] == "00-tariffs.md"
    tariffs_chunk = next(c for c in chunks if c["heading"] == "Тарифы")
    assert "5000 руб/мес" in tariffs_chunk["text"]


def test_split_into_chunks_text_before_first_heading_uses_source_as_heading():
    md_text = "Вводный текст без заголовка.\n\n# Дальше\nОстальное.\n"
    chunks = knowledge_base._split_into_chunks(md_text, source="01-intro.md")
    assert chunks[0]["heading"] == "01-intro.md"
    assert "Вводный текст" in chunks[0]["text"]


def test_split_into_chunks_long_section_splits_by_paragraphs():
    # Много отдельных абзацев (разделены пустой строкой), каждый заметно
    # короче MAX_CHUNK_CHARS сам по себе — секция режется МЕЖДУ абзацами,
    # накапливая буфер, пока он не превысит MAX_CHUNK_CHARS.
    paragraph = "Абзац с деталями продукта и его использованием в бизнесе."  # ~59 символов
    paragraphs = [paragraph] * 40  # суммарно много больше MAX_CHUNK_CHARS (1200)
    md_text = "# Большой раздел\n\n" + "\n\n".join(paragraphs) + "\n"

    chunks = knowledge_base._split_into_chunks(md_text, source="big.md")

    assert len(chunks) > 1
    assert all(len(c["text"]) <= knowledge_base.MAX_CHUNK_CHARS for c in chunks)
    assert chunks[0]["heading"] == "Большой раздел (ч.1)"
    assert chunks[1]["heading"] == "Большой раздел (ч.2)"


def test_load_or_build_index_caches_embeddings_across_calls(tmp_path, monkeypatch):
    """
    Ключевая проверка кэша: если файлы базы знаний не менялись, повторный
    вызов _load_or_build_index с тем же kb_dir не должен снова считать
    эмбеддинги через _embed_texts.
    """
    kb_dir = tmp_path / "kb"
    kb_dir.mkdir()
    (kb_dir / "00-product.md").write_text("# Продукт\nОписание продукта.\n", encoding="utf-8")
    cache_path = str(tmp_path / "kb_index.json")

    fake_embed, calls = _fake_embed_texts({})
    monkeypatch.setattr(knowledge_base, "_embed_texts", fake_embed)

    chunks1 = knowledge_base._load_or_build_index(str(kb_dir), cache_path, "key")
    chunks2 = knowledge_base._load_or_build_index(str(kb_dir), cache_path, "key")

    assert len(calls) == 1  # эмбеддинги посчитаны только один раз
    assert chunks1 == chunks2
    assert len(chunks1) == 1


def test_load_or_build_index_reuses_disk_cache_after_memory_cache_cleared(tmp_path, monkeypatch):
    kb_dir = tmp_path / "kb"
    kb_dir.mkdir()
    (kb_dir / "00-product.md").write_text("# Продукт\nОписание продукта.\n", encoding="utf-8")
    cache_path = str(tmp_path / "kb_index.json")

    fake_embed, calls = _fake_embed_texts({})
    monkeypatch.setattr(knowledge_base, "_embed_texts", fake_embed)

    knowledge_base._load_or_build_index(str(kb_dir), cache_path, "key")
    knowledge_base._memory_cache.clear()  # имитируем перезапуск процесса
    knowledge_base._load_or_build_index(str(kb_dir), cache_path, "key")

    assert len(calls) == 1  # второй раз индекс читается с диска, не пересчитывается


def test_load_or_build_index_recomputes_when_file_changes(tmp_path, monkeypatch):
    kb_dir = tmp_path / "kb"
    kb_dir.mkdir()
    md_file = kb_dir / "00-product.md"
    md_file.write_text("# Продукт\nВерсия 1.\n", encoding="utf-8")
    cache_path = str(tmp_path / "kb_index.json")

    fake_embed, calls = _fake_embed_texts({})
    monkeypatch.setattr(knowledge_base, "_embed_texts", fake_embed)

    knowledge_base._load_or_build_index(str(kb_dir), cache_path, "key")
    md_file.write_text("# Продукт\nВерсия 2, сильно другая.\n", encoding="utf-8")
    knowledge_base._load_or_build_index(str(kb_dir), cache_path, "key")

    assert len(calls) == 2  # файл изменился -> пересчёт


def test_retrieve_returns_formatted_block_with_relevant_chunk(tmp_path, monkeypatch):
    kb_dir = tmp_path / "kb"
    kb_dir.mkdir()
    (kb_dir / "00-product.md").write_text(
        "# Тарифы\nПодписка 5000 руб/мес или 50000 руб/год.\n", encoding="utf-8"
    )
    cache_path = str(tmp_path / "kb_index.json")

    def fake_embed(texts, openai_key, base_url=None):
        # запрос и чанк про тарифы должны быть похожи (высокий cosine) —
        # оба вектора совпадают, а нерелевантный вариант не участвует здесь.
        return [[1.0, 0.0, 0.0] for _ in texts]

    monkeypatch.setattr(knowledge_base, "_embed_texts", fake_embed)

    result = knowledge_base.retrieve("сколько стоит подписка", str(kb_dir), cache_path, "key")
    assert "Тарифы" in result
    assert "5000 руб/мес" in result
    assert result.startswith("Справочная информация из базы знаний компании")


def test_retrieve_filters_out_low_relevance_chunks(tmp_path, monkeypatch):
    kb_dir = tmp_path / "kb"
    kb_dir.mkdir()
    (kb_dir / "00-product.md").write_text("# Раздел\nНекий текст.\n", encoding="utf-8")
    cache_path = str(tmp_path / "kb_index.json")

    call_count = {"n": 0}

    def fake_embed(texts, openai_key, base_url=None):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return [[1.0, 0.0, 0.0] for _ in texts]  # эмбеддинг чанка при построении индекса
        return [[0.0, 1.0, 0.0] for _ in texts]  # эмбеддинг запроса — ортогонален (cosine=0)

    monkeypatch.setattr(knowledge_base, "_embed_texts", fake_embed)

    result = knowledge_base.retrieve("нерелевантный вопрос", str(kb_dir), cache_path, "key")
    assert result == ""


def test_cosine_similarity_basic():
    assert knowledge_base._cosine([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert knowledge_base._cosine([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)
    assert knowledge_base._cosine([0.0, 0.0], [1.0, 0.0]) == 0.0
