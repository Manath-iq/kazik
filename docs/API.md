# API

JSON: `{data: ...}` либо `{error:{message,details?}}`. Русские ошибки. Приватные запросы: `Authorization: Bearer <session>`. Сессия живёт 2 часа и не сохраняется в localStorage.

## Вход и профиль
- POST `/api/auth/telegram` `{initData}` → `{token,expiresAt}`; подпись и auth_date до часа.
- POST `/api/auth/dev` `{}` — **только отдельный local entry**, host loopback, production его не содержит.
- GET `/api/me` — профиль/баланс/рекорды/банда/работа/собственность/serverNow.
- GET `/api/wallet/ledger` — последние 50 проводок владельца.
- GET `/api/leaderboard/players`, `/api/leaderboard/gangs` — до 50 строк.

## Вылазки
- POST `/api/runs/start` `{}` → `{id,seed,startedAt}`.
- POST `/api/runs/:id/progress` `{seq,seconds,kills,money,level,distance}`; целые seq/seconds/kills/money/level, накопительный distance. Первый seq=1, затем +1. Повтор того же seq принимается только с идентичным payload. Около 10 сек между checkpoint в клиенте. Сервер не доверяет полям без sanity checks.
- POST `/api/runs/:id/finish` `{}` — выплата по последнему принятому checkpoint, однократно. Перед finish клиент отправляет финальный снимок.
- GET `/api/runs/history` — последние 30 завершённых.

## Казино
- GET `/api/casino/games`, `/api/casino/history`.
- POST `/api/casino/roulette/spin` `{key:uuid,stake,choice}`. choice red/black/zero или число 0–36.
- POST `/api/casino/crash/start` `{key:uuid,stake}`.
- GET `/api/casino/crash/:id` — без секретной точки активного раунда.
- POST `/api/casino/crash/:id/cashout` `{}` — коэффициент рассчитывает сервер.
- POST `/api/casino/blackjack/start` `{key:uuid,stake}`.
- POST `/api/casino/blackjack/:id/hit`, `/stand` `{version}`. Повтор старой версии активной руки — 409.

`key` — idempotency key создания, одновременно ID раунда. Повтор с другой игрой/ставкой/выбором — 409. Чужой key не раскрывает результат. Колода и скрытая карта не выдаются.

## Банды
- POST `/api/gangs` `{name,tag}`.
- GET `/api/gangs/:id`, `/api/gangs/leaderboard`.
- POST `/api/gangs/:id/invite` `{}` → `{token,url}`.
- POST `/api/gangs/join` `{token}` — только явное действие, deep link сам не вступает.
- POST `/api/gangs/leave` `{}`.
- POST `/api/gangs/:id/kick` `{userId}` — только лидер.

## Город
- GET `/api/city/catalog`.
- POST `/api/jobs/start` `{jobType}`; `/api/jobs/claim` `{id}`.
- POST `/api/businesses/buy`, `/api/assets/buy` `{itemId}`.
- POST `/api/businesses/claim` `{itemId}`.

## Бот и служебное
- POST `/api/telegram/webhook` — официальный Telegram update + `X-Telegram-Bot-Api-Secret-Token`; команды start/play/top/gang/help. Update ID дедуплицируется до отправки: при сетевом сбое отдельный ответ бота может потеряться, но не запускает денежные операции.
- GET `/api/health` — без авторизации.

POST действия с авторизацией — до 90/минуту/игрок. Ограничение тела 20KB. До публичного запуска дополнительно ограничить pre-auth/IP-abuse на уровне Cloudflare: встроенный app rate-limit не защищает свободный `/auth/telegram` от исчерпания бесплатной квоты валидными повторными логинами.
# Поддержка за Telegram Stars (после MVP)

- `GET /api/support`: флаг доступности, суммы, текущие условия, контакт, своя история (20) и последний незавершённый счёт.
- `POST /api/support/invoices`: `{key: UUID, stars: 25|100|250, termsAccepted: true, termsVersion}`. Цена/валюта только серверные. Повтор ключа возвращает тот же заказ. Возвращает ID, статус, invoiceUrl и срок; не списывает игровые деньги.
- `GET /api/support/orders/:id`: только собственный заказ; подтверждение читается с сервера, не из callback Telegram.
- `POST /api/support/refunds`: `{chargeId}`. Полный возврат исходному плательщику. HTTP 202 означает неопределённый/pending исход, не завершённый возврат. Повтор запроса ограничен 30 сек.
- Webhook дополнительно принимает `pre_checkout_query`, `message.successful_payment`, `message.refunded_payment`, только с secret header. Нет клиентского endpoint «зачесть оплату».

Детали экономики/условий: `STARS.md`. Для цифровой поддержки используется XTR; игровая валюта, ставки и награды с ней не связаны.
# Денежные единицы с 05.11.2026

Все существующие денежные API-поля (`balance`, `stake`, `payout`, `earned`, `money`, `delta`, цены/доходы) остаются в целых учётных единицах. В интерфейсе 1 единица = 1000 игровых долларов; перевод централизован в `packages/shared/src/currency.ts`. Это сохраняет старые сессии и append-only историю без разрушительного пересчёта БД. Stars/XTR, XP и остальные показатели не масштабируются. Принятая сервером добыча выдаётся полностью, без скрытого лимита $/сек.
