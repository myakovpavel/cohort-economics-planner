# Cohort Economics Planner

Статическое веб-приложение для расчета экономики подписочного сервиса по месячным когортам и двум независимым воронкам.

## Что умеет

- считает отдельно две воронки: `19.89 offer` и `$1 -> $39`
- позволяет задавать по каждой воронке:
  - месячный входящий объем на январь-декабрь 2026
  - месячный рекламный бюджет
  - цену первого платежа и recurring-платежа
  - конверсию в trial
  - конверсию trial -> первая оплата
  - конверсии оплат со 2-го по 10-й месяц
  - статичную retention-конверсию после 10-го месяца
- показывает:
  - календарную выручку 2026
  - budget vs revenue vs profit
  - cohort lifetime revenue
  - сводку по двум воронкам

## Локальный запуск

Можно просто открыть файл [`index.html`](/Users/pavel/Documents/_codex/index.html) в браузере.

Если нужен локальный сервер:

```bash
cd /Users/pavel/Documents/_codex
python3 -m http.server 8080
```

После этого откройте `http://localhost:8080`.

## Публикация через GitHub + Cloudflare Pages

Этот проект не требует сборки. Для Cloudflare Pages нужно публиковать корень репозитория как статический сайт.

### 1. Создать git-репозиторий локально

```bash
cd /Users/pavel/Documents/_codex
git init
git add .
git commit -m "Initial commit"
```

Если git попросит имя и email:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

### 2. Создать пустой репозиторий в GitHub

Например: `cohort-economics-planner`

### 3. Привязать GitHub-репозиторий и запушить код

```bash
cd /Users/pavel/Documents/_codex
git branch -M main
git remote add origin git@github.com:YOUR_ACCOUNT/cohort-economics-planner.git
git push -u origin main
```

Если используешь HTTPS:

```bash
git remote add origin https://github.com/YOUR_ACCOUNT/cohort-economics-planner.git
git push -u origin main
```

### 4. Подключить Cloudflare Pages

В Cloudflare Pages:

- `Create application`
- `Pages`
- `Connect to Git`
- выбрать GitHub-репозиторий

Настройки сборки:

- `Framework preset`: `None`
- `Build command`: оставить пустым
- `Build output directory`: `.`

После деплоя Cloudflare выдаст публичный URL вида:

`https://cohort-economics-planner.pages.dev`

### 5. Обновления

Любой следующий деплой:

```bash
cd /Users/pavel/Documents/_codex
git add .
git commit -m "Update"
git push
```

Cloudflare Pages автоматически заберет изменения из GitHub и обновит сайт.
