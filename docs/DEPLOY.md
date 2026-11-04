# Развёртывание без платного плана

## Тестовый запуск с телефона

Для теста добавлен отдельный `apps/api/wrangler.test.jsonc`: Worker `street-legends-test` и собственная D1 `street-legends-test`. Entry тот же безопасный `src/index.ts`, DEV-вход не выкладывается.

Frontend: https://street-legends-test.todominate-ai.workers.dev

Бот: https://t.me/kaziktesttg_bot?start=play — нажать «Начать», затем «Играть» в сообщении или меню. Внешний браузер без Telegram не выдаёт сессию. Main Mini App не включён в BotFather, поэтому не обещать работу голой `?startapp`-ссылки; запуск через `web_app`-кнопку работает независимо от Main Mini App.

По прямому решению пользователя тестовый Bot Token не перевыпускается. Он хранится в игнорируемом `.local/telegram-secrets.json` (0600) только для передачи в Workers secrets; в исходниках/сборке токена нет. Не использовать этот токен для будущего публичного/боевого бота.

Повторная публикация теста после проверок из корня:

```bash
npm run check
npm run build:test
npm run db:migrate:test -w @street/api
npm run deploy:test -w @street/api
```

Секреты передаются только через `--secrets-file ../../.local/telegram-secrets.json` из `apps/api`; без файла повторный deploy сохраняет существующие Workers secrets. `tools/deploy/telegram.mjs` настраивает официальный Bot API, не выводя токен. Не запускать `configure` для другого бота/URL без отдельной авторизации.

Ниже — инструкция для отдельного будущего production-запуска. Её нулевой D1 ID не связан с тестовой базой.

## Вариант A — Worker + Static Assets (рекомендуется)

1. Убедиться в Cloudflare Dashboard, что Workers — **Free**, не включать Paid.
2. Войти через проектный Wrangler:

```bash
npx wrangler login
npx wrangler whoami
```

3. Создать бесплатную D1 (из `apps/api`):

```bash
npx wrangler d1 create street-legends
```

4. Заменить нулевой `database_id` в **production** `apps/api/wrangler.jsonc` на выданный ID. Local-конфиг оставлять локальным. Перед командами ниже находиться в `apps/api`:

```bash
npx wrangler d1 migrations apply street-legends --remote
```

Это изменит удалённую БД, не локальную. Не применять к чужой/существующей базе без проверки.

5. В `wrangler.jsonc` задать `APP_URL` (финальный HTTPS адрес), `BOT_USERNAME` без @. Для одного домена `ALLOWED_ORIGIN` можно оставить пустым — используется origin API. Внести секреты через интерактивный ввод:

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```

Использовать **перевыпущенный** токен. WEBHOOK_SECRET — случайная строка 32+ символа из A–Z/a–z/0–9/_/-. Не передавать значения аргументами shell и не вставлять их в чат. Команды секретов могут создавать версии Worker, это не просто локальная настройка.

6. Из корня:

```bash
npm run check
```

Затем из `apps/api`:

```bash
npx wrangler deploy
```

Не использовать `wrangler.local.jsonc`. Worker должен отдавать SPA, а `/api/*` — JSON. Проверить, что `/api/auth/dev` не даёт сессию.

7. BotFather: `/mybots` → выбрать бота → Main Mini App / Menu Button → HTTPS URL приложения. Название кнопки «Играть». Настроить команды start/play/top/gang/help.

8. Зарегистрировать webhook через официальный Telegram Bot API `setWebhook`:
- `url`: `https://<домен>/api/telegram/webhook`;
- `secret_token`: то же значение WEBHOOK_SECRET;
- `allowed_updates`: `["message"]`.

Не вставлять токен в открытые URL браузера/историю. Настройку можно сделать из доверенного локального скрипта, который читает секреты из окружения и не печатает их. Здесь регистрация не запускалась.

9. Проверить `/start` и запуск именно внутри Telegram. Браузерный production-вход без Telegram намеренно запрещён. Проверить iOS/Android, safe areas, скрытие/возобновление и реальные задержки ракетки.

## Вариант B — GitHub Pages frontend + Worker API

Возможен, если публичный репозиторий и доступность Pages позволяют бесплатное размещение. Worker/D1 всё равно нужны: Pages не хранит баланс и не исполняет backend.

```bash
VITE_API_URL=https://<api-worker>.workers.dev PAGES_BASE=/kazik/ npm run build -w @street/web
```

Публиковать содержимое `apps/web/dist`, не исходную папку. Для собственного домена `PAGES_BASE=/`. Навигация использует hash; deep links не требуют серверного роутера Pages. В API `ALLOWED_ORIGIN=https://manath-iq.github.io` (без `/kazik`), `APP_URL=https://manath-iq.github.io/kazik/`.

Сессия передаётся Bearer-заголовком и хранится только в памяти: cross-site cookie не нужны. Разрешён только точный frontend origin, не `*`. Не добавлять Bot Token в GitHub Pages или публичные Actions variables.

CI `.github/workflows/check.yml` проверяет проект; он **не публикует** Worker/Pages и не требует секретов. Публикацию нужно включить отдельно после проверки staging.

## Лимиты и обслуживание

Источники:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/

Проверено 04.11.2026: 100k Worker-запросов и 100k записей строк D1 в день. Один 5-минутный забег — около 30 checkpoints; каждый checkpoint включает rate-limit счётчик, запись прогресса и запись события плюс индексы. Оценка аудитории должна учитывать реальные `rows_written`, остальные разделы и злоупотребления.

Cron раз в 15 минут: ограниченная пачка истёкших казино-раундов и очистка служебных данных. Истёкший раунд также финализируется при открытии истории/новой игре; cron не обязан сработать ровно в момент краша.

Для публичного проекта нужны политика хранения/удаления персональных данных и миграции/резервные копии. На этой стадии пользовательские игровые истории не удаляются автоматически. Для долгого бесплатного размещения нужно ввести архивирование/checkpoint-retention после определения срока расследования рекордов. Не удалять ledger, не нарушив аудит экономики.
