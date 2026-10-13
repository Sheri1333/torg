# TORG — Telegram-бот по торгам ETP.Adilet и Sauda

Помощник для работы с публичными лотами:

- [etp.adilet.gov.kz](https://etp.adilet.gov.kz) — арестантское имущество, оператор РПЧСИ
- [sauda.e-qazyna.kz](https://sauda.e-qazyna.kz) — торги e-Qazyna, приём заявок на понижение

## Бот

Telegram: токен `8993813194:AAGpvPlStt7anqS3ElcN1QI6O36L0tTDJmE`  
(уже прописан в `.env.example` и ставится на VPS скриптом `deploy/setup-vps.sh`)

## Быстрый старт (локально)

```bash
cp .env.example .env
npm install
npm run dev
```

Проверка API площадки без Telegram:

```bash
npm run probe
npm run probe -- 113333229
npm run probe:sauda
```

## Команды бота

| Команда | Что делает |
|---|---|
| `/start` | приветствие |
| `/help` | справка по площадке |
| `/search` | ETP.Adilet: сначала кнопки Астана / Павлодар / оба, затем лоты на понижение |
| `/search hyundai` | то же, с текстовым фильтром |
| `/sauda` | Sauda: те же города, приём заявок, только на понижение |
| `/sauda camry` | то же, с текстовым фильтром |
| `/searchdone Camry 2006` | состоявшиеся ETP, все регионы, на понижение, цена из выписки |
| `/lot 113333229` | карточка торга по id или URL |
| `/watch <id>` | в избранное |
| `/watching` | список избранного |
| `/unwatch <id>` | убрать из избранного |

Пример карточки:  
https://etp.adilet.gov.kz/trades/113333229/info?page=sales

## Как читаем площадки

ETP.Adilet — публичный JSON без авторизации:

- список: `GET /trades.json?page=sales&skip=0&limit=20&search={...}`
- карточка: `GET /trades/{id}/info?page=sales` с `Accept: application/json`

Sauda — HTML-список (JSON `/ru/list/json` закрыт):

- `GET /ru/list?searchStatus=ApplicationsAccept&auctionType=Auction_PriceDown17012021&p=1`
- текстовый фильтр: `textRu=...`
- регион площадка в GET игнорирует, бот отбирает Астану/Павлодар сам

Бот **не** подаёт заявки и **не** работает с ЭЦП — только мониторинг и удобный просмотр.

## VPS (как в PROB)

Сервер: `195.49.212.31`  
Каталог: `/var/www/torg`  
Сервис: `torg-bot` (systemd)

Первый раз на сервере:

```bash
sudo bash /var/www/torg/deploy/setup-vps.sh
```

Обновление:

```bash
bash /var/www/torg/deploy/deploy.sh
# или автоматически: push в main → GitHub Actions (secrets VPS_HOST / VPS_USER / VPS_SSH_KEY)
```

Логи:

```bash
sudo journalctl -u torg-bot -f
```

## Дальше

- алерты по избранному (смена статуса / цены / дедлайна)
- фильтры по цене и категории
- карточка лота Sauda (`/lot` по ссылке площадки)
