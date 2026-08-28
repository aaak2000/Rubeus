# יומן עברי — Smart Hebrew Calendar

מערכת חכמה לניהול **יומן עברי עצמאי** — יומן שבליבתו הלוח העברי (ולא רק שכבה מעל
לוח לועזי), עם **סנכרון דו-כיווני** ליומנים הנפוצים: Google Calendar,
Microsoft/Outlook, Apple/CalDAV, וקבצי ICS.

> פרויקט זה עצמאי לחלוטין ואינו קשור לקוד Rubeus שבשורש המאגר; הוא ממוקם תחת
> `hebrew-calendar/` בלבד.

## יכולות

- **לוח עברי מלא** — המרת תאריכים לועזי ↔ עברי (כולל שנים מעוברות, גימטריה),
  חגים ומועדים, פרשת השבוע, ראשי חודשים, וספירת העומר.
- **זמנים הלכתיים** — נץ, שקיעה, כניסת/צאת שבת, מולד — לפי מיקום גאוגרפי.
- **אירועים חוזרים עבריים** — יארצייט / יום הולדת / יום נישואין לפי התאריך
  העברי, עם חישוב המופע הבא (כללי אדר/אדר ב' בשנה מעוברת ול' חסר).
- **סנכרון** — יבוא/יצוא ICS, ו-Google / Microsoft / CalDAV דרך מתאמים אחידים.

## מבנה (monorepo, pnpm workspaces)

| חבילה | תיאור |
|-------|-------|
| `packages/core` | ליבת הלוח העברי (עוטפת [`@hebcal/core`](https://github.com/hebcal/hebcal-es6)) — ללא תלות ב-UI/רשת. |
| `packages/api`  | Backend: NestJS + Prisma + PostgreSQL. |
| `packages/sync` | מנוע סנכרון ומתאמים (ICS / Google / Microsoft / CalDAV). |
| `packages/web`  | Frontend: React + Vite (PWA, RTL עברית). |

TypeScript מקצה לקצה מאפשר בהמשך הוספת `packages/mobile` (React Native/Expo)
שמשתף את `packages/core`.

## התחלה מהירה (פיתוח)

```bash
cd hebrew-calendar
cp .env.example .env            # מלאו מפתחות OAuth לפי הצורך
pnpm install

# בסיס נתונים
docker compose up -d db
pnpm --filter @hcal/api prisma:migrate

# הרצה
pnpm dev:api                    # http://localhost:3001  (Swagger ב-/docs)
pnpm dev:web                    # http://localhost:5173
```

## בדיקות

```bash
pnpm --filter @hcal/core test   # בדיקות ליבת הלוח העברי
pnpm -r test                    # כל החבילות
```

## הערת אבטחה

מפתחות OAuth וטוקנים אינם נשמרים במאגר. טוקני ספקים מוצפנים ב-DB באמצעות
`TOKEN_ENCRYPTION_KEY`. אין למסור סודות אמיתיים ב-`.env.example`.
