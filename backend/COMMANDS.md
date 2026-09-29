# Rent-a-Mate Backend Commands

คู่มือคำสั่งสำหรับ backend โปรเจค Rent-a-Mate

## เริ่มต้นใช้งาน

เข้าโฟลเดอร์ backend:

```bash
cd /Users/jirath/work/rent-a-mate/backend
```

ติดตั้ง dependencies:

```bash
npm install
```

เริ่ม PostgreSQL ด้วย Docker:

```bash
docker compose up -d
```

ดูสถานะ container:

```bash
docker compose ps
```

หยุด PostgreSQL:

```bash
docker compose down
```

## รันแอป

Development mode:

```bash
npm run start:dev
```

Production mode:

```bash
npm run build
npm run start:prod
```

ใช้ port อื่น:

```bash
PORT=3001 npm run start:dev
```

## ตรวจโค้ด

Build ตรวจ TypeScript:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Unit tests:

```bash
npm test -- --run
```

Test แบบ watch:

```bash
npm run test:watch
```

ตรวจทั้งหมดก่อน commit:

```bash
npm run build && npm run lint && npm test -- --run
```

## Prisma Contract

หลังแก้ `src/prisma/contract.prisma` ให้ generate contract:

```bash
npm run contract:emit
```

หรือ:

```bash
npx prisma contract emit
```

ไฟล์ generated ที่เปลี่ยน:

```text
src/prisma/contract.json
src/prisma/contract.d.ts
```

## Database

ตรวจสถานะ database/contract:

```bash
npx prisma migration status
```

Push contract ปัจจุบันเข้า database local:

```bash
npx prisma db update
```

ใช้เมื่อเพิ่ม model หรือ field แล้ว database ยังไม่มี เช่น:

```text
relation "public.refresh_tokens" does not exist
```

เปิด Prisma Studio:

```bash
npx prisma studio
```

> `db update` สร้างหรือแก้ schema ใน database ตาม contract แต่ repo ปัจจุบันยังไม่มี migration files แบบ versioned

ล้าง database development ทั้งหมด:

```bash
npx prisma migrate reset
```

> ใช้เฉพาะ database local/test เพราะคำสั่งนี้ลบข้อมูลทั้งหมด

## ตรวจ Port

ดูว่า port 3000 ถูกใช้อยู่หรือไม่:

```bash
lsof -i :3000
```

หยุด process:

```bash
kill <PID>
```

หรือใช้ port อื่น:

```bash
PORT=3001 npm run start:dev
```

## Environment

ตัวอย่าง `.env`:

```env
DATABASE_URL=postgresql://saig:1234@localhost:5432/rent_a_mate
PORT=3000
JWT_ACCESS_SECRET=your-long-access-secret
JWT_REFRESH_SECRET=your-long-refresh-secret
OBSERVE_APP_KEY=
OBSERVE_APP_SECRET=
```

ห้าม commit secrets จริงลง git

## Temporal และ DateTime

ถ้า Prisma contract ใช้ `timestamptz-temporal` ต้องใช้ `Temporal.Instant`:

```ts
import { Temporal } from '@js-temporal/polyfill';

const now = Temporal.Now.instant();
```

ไม่ควรส่ง `Date` ตรง ๆ:

```ts
new Date()
```

ติดตั้ง polyfill หากจำเป็น:

```bash
npm install @js-temporal/polyfill
```

## Observe Telemetry

ถ้ามี credentials จริง ให้ใส่ใน `.env`:

```env
OBSERVE_APP_KEY=your-real-app-key
OBSERVE_APP_SECRET=your-real-app-secret
```

ถ้าไม่มี credentials ให้เว้นว่างไว้ ระบบจะไม่เปิด Observe:

```env
OBSERVE_APP_KEY=
OBSERVE_APP_SECRET=
```

ถ้าเจอ:

```text
Telemetry rejected (401)
```

ให้ตรวจ credentials แล้ว restart server

## Git

ดูสถานะ:

```bash
git status
```

ดู branch:

```bash
git branch
```

สร้าง branch:

```bash
git switch -c feature/auth
```

เพิ่มไฟล์:

```bash
git add <file>
```

เพิ่มทุกไฟล์:

```bash
git add .
```

ตรวจ staged diff:

```bash
git diff --cached
```

Commit:

```bash
git commit -m "feat(auth): add refresh token rotation"
```

Push branch:

```bash
git push -u origin feature/auth
```

## ลำดับทำงานหลังแก้ Schema

```text
แก้ contract.prisma
  ↓
npm run contract:emit
  ↓
npx prisma db update
  ↓
npm run build
  ↓
npm run lint
  ↓
npm test -- --run
  ↓
git status
  ↓
git diff --cached
  ↓
git commit
```

## ปัญหาที่พบบ่อย

### `ERR_MODULE_NOT_FOUND`

โปรเจคเป็น ESM ให้เติม `.js` ใน relative imports ของ runtime code:

```ts
import { AuthModule } from './auth/auth.module.js';
```

### `EADDRINUSE: address already in use :::3000`

มี process ใช้ port 3000 อยู่:

```bash
lsof -i :3000
kill <PID>
```

หรือเปลี่ยน port:

```bash
PORT=3001 npm run start:dev
```

### `relation does not exist`

Contract รู้จัก table แต่ database ยังไม่มี:

```bash
npx prisma migration status
npx prisma db update
```

### `Temporal unavailable`

Runtime ไม่มี `globalThis.Temporal`:

```bash
npm install @js-temporal/polyfill
```

ตรวจว่า polyfill ถูกโหลดก่อนสร้าง Prisma client

### `received: a Date`

Prisma temporal codec ต้องการ `Temporal.Instant` ไม่ใช่ `Date`:

```ts
Temporal.Now.instant()
```
