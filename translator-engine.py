import sys
import io
import json
import os

import ctranslate2
from transformers import MarianTokenizer

# =========================================================
# UTF-8 FIX
# =========================================================
sys.stdin = io.TextIOWrapper(
    sys.stdin.buffer,
    encoding="utf-8"
)

sys.stdout = io.TextIOWrapper(
    sys.stdout.buffer,
    encoding="utf-8",
    write_through=True
)

sys.stderr = io.TextIOWrapper(
    sys.stderr.buffer,
    encoding="utf-8",
    write_through=True
)

# =========================================================
# PATHS (ИСПРАВЛЕНО И НАСТРОЕНО)
# =========================================================
current_dir = os.path.dirname(os.path.abspath(__file__))

# Вариант 1: Если скрипт запущен в собранном виде (из папки app.asar)
if "app.asar" in current_dir:
    # Отрезаем кусок пути с 'app.asar' и получаем чистую папку resources
    base_resources_dir = current_dir.split("app.asar")[0]
    model_path = os.path.join(base_resources_dir, "python-env", "opus_en_ru_ct2")
else:
    # Вариант 2: Если мы запускаем у себя через npm start (обычная папка проекта)
    model_path = os.path.join(current_dir, "python-env", "opus_en_ru_ct2")

# Для отладки выведем в консоль Electron, какой путь в итоге выбрал Питон
print(f"[Engine Debug]: Итоговый путь к модели: {model_path}", file=sys.stderr)
sys.stderr.flush()

# =========================================================
# INIT
# =========================================================
try:

    # =====================================================
    # TOKENIZER
    # =====================================================
    tokenizer = MarianTokenizer.from_pretrained(
        model_path
    )

    # =====================================================
    # TRANSLATOR
    # =====================================================
    translator = ctranslate2.Translator(
        model_path,
        device="cpu",
        inter_threads=1,
        intra_threads=4
    )

    print(
        "[Engine]: Marian EN->RU loaded",
        file=sys.stderr
    )

    sys.stderr.flush()

except Exception as e:

    print(
        f"[Engine Fatal Error]: {str(e)}",
        file=sys.stderr
    )

    sys.stderr.flush()

    sys.exit(1)

# =========================================================
# MAIN LOOP (МИКРО-БАТЧИНГ)
# =========================================================
for line in sys.stdin:
    try:
        line_str = line.strip()
        if not line_str:
            continue

        data = json.loads(line_str)
        
        # Проверяем маркер завершения
        if data.get("type") == "signal" and data.get("text") == "__END_OF_BATCH__":
            print(json.dumps({"status": "completed"}, ensure_ascii=False))
            sys.stdout.flush()
            break

        if data.get("type") == "batch":
            items = data.get("items", [])
            
            tokens_batch = []
            valid_items = []

            # 1. Быстрая фильтрация и токенизация всей пачки
            for item_data in items:
                text = item_data.get("text", "").strip()
                text_id = item_data.get("id", 0)

                # Если нет латиницы — отдаем обратно мгновенно
                if not text or not any(c.isalpha() and c.isascii() for c in text):
                    print(json.dumps({"status": "chunk", "id": text_id, "translated": text}, ensure_ascii=False))
                    continue

                encoded_ids = tokenizer.encode(text, truncation=True, max_length=512)
                tokens = tokenizer.convert_ids_to_tokens(encoded_ids)
                
                tokens_batch.append(tokens)
                valid_items.append(text_id) # Запоминаем ID строки

            # Если в этой пачке было что переводить
            if tokens_batch:
                # ТВОИ НАСТРОЙКИ КАЧЕСТВА СОХРАНЕНЫ В ТОЧНОСТИ
                results = translator.translate_batch(
                    tokens_batch,
                    beam_size=4,
                    repetition_penalty=1.1,
                    no_repeat_ngram_size=2,
                    max_decoding_length=100
                )

                # 2. Декодируем результаты пачки и отправляем в Electron
                for idx, r in enumerate(results):
                    output_tokens = r.hypotheses[0]
                    output_ids = tokenizer.convert_tokens_to_ids(output_tokens)
                    translated_text = tokenizer.decode(output_ids, skip_special_tokens=True).strip()

                    print(json.dumps({
                        "status": "chunk",
                        "id": valid_items[idx],
                        "translated": translated_text
                    }, ensure_ascii=False))
            
            # Выталкиваем всю готовую пачку в Electron за один раз
            sys.stdout.flush()

    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}, ensure_ascii=False))
        sys.stdout.flush()
        print(f"[Runtime Error]: {str(e)}", file=sys.stderr)
        sys.stderr.flush()