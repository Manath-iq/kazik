# Приветствие БОТ-БАНДИТ · 06.11.2026

Исходник: `widgets/welcome.html`. Настоящий self-contained **Widget profile 1**, не React, WebApp или iframe-замена сообщения. Generic fonts; заголовок рисуется оригинальной 5×7 кириллицей в inline SVG. CSS keyframes, reduced-motion, offscreen pause; один таймер только после нажатия. Нет внешних файлов/запросов. Точная формулировка приветствия сохранена.

## Статус отправки

Проверены официальный `core.telegram.org/bots/api` и Widget Sandbox v0.1.1. Публичный API нашего авторизованного `@kaziktesttg_bot`: POST `sendWidget` с пустым телом (без адресата, без отправки сообщения) вернул **HTTP 404 `{ok:false,description:"Not Found"}`** 06.11.2026. Документация общего Bot API метода не содержит. Наличие layer 233 / test Bot API 10.4 не подтверждает стабильную отправку.

**Поэтому production `/start` использует только `sendMessage` + inline `web_app`.** HTML как файл пользователям не отправляется и не называется Message Widget. Экспериментальный режим — официальный локальный sandbox, полностью отделённый от рабочего webhook. После публичного появления метода нужно повторно проверить его схему и поддержку клиентов, а не просто включить непроверенный env-флаг.

`getMe.has_main_web_app=false`: прямой `?startapp=play` сейчас нельзя обещать. Виджет через настоящий click и `TelegramWidget.openTelegramLink` открывает проверенную ссылку `https://t.me/kaziktesttg_bot?start=play`, затем inline «🎮 Начать игру» запускает Mini App. Для однокнопочного deep link сначала настроить **Main Mini App** в BotFather, затем проверить `getMe` и заменить ссылку на `?startapp=play`. Это не настройка меню `setChatMenuButton` — меню уже работает.

## Официальная проверка и preview

```
npm run widget:setup
npm run widget:validate
npm run widget:preview
```

Node >=22. Репозиторий закреплён на v0.1.1 / `e9654cab644145521e754004de220aa4ed0f3ad1`, pnpm 12.10.1 устанавливает только из его frozen lock. Зависимости/репозиторий остаются в игнорируемой `.local/`, не меняют npm workspaces проекта. Валидатор запускает официальный QuickJS harness/allowlists, проверяет размеры raw/gzip, обе темы, настоящий tap, блокировку synthetic click, отсутствие SDK и диагностик. Результат: `widgets/validation.json`.

Preview — **официальный WidgetHost**, не обычный HTML-browser mock: `http://127.0.0.1:5180/?file=showcase/bot-bandit-welcome.html&theme=dark`. Внутри сообщения ни сетевого доступа, ни WebApp SDK нет; сеть самого доверенного локального host нужна для его WASM/bundle. Сам виджет можно открыть как HTML для статической оценки, но это не проверка Telegram runtime.

Источники: [runtime](https://github.com/TelegramMessenger/widget-sandbox/blob/v0.1.1/docs/widget-runtime-profile.md), [SDK](https://github.com/TelegramMessenger/widget-sandbox/blob/v0.1.1/docs/sdk-v1.md), [profile](https://github.com/TelegramMessenger/widget-sandbox/blob/v0.1.1/docs/profile-v1.md), [payload](https://github.com/TelegramMessenger/widget-sandbox/blob/v0.1.1/docs/tgw-format.md).

## Custom Emoji rocket

`getStickerSet(RestrictedEmoji)` нашёл animated TGS 🚀 `5445284980978621387`; `getFile` успешно скачал 55 268 байт в приватную `.local/restricted-rocket.tgs`. В наборе нет лицензии на распространение игровой графики; TGS также нельзя напрямую рисовать через canvas drawImage. В релизе сохранён **наш оригинальный пиксельный PNG**, без внешних ссылок/библиотеки Lottie на каждом кадре. Файл доступен локально для последующей конвертации после подтверждения прав; это не заявляется внедрённой анимацией чужого emoji.
