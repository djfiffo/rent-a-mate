# Rent a Mate: E2E Test Flow และ Feature Coverage

## 1. สถานะและขอบเขตเอกสาร

เอกสารนี้เป็นแผนทดสอบระบบตาม Overview, Functional Requirements, Non-Functional Requirements และ Technical/Feature Requirements ที่เจ้าของโปรเจกต์ให้มา เทียบกับ source code ปัจจุบัน ไม่ใช่รายงานว่าทุกเคสถูก implement หรือรันผ่านแล้ว

การทบทวนครอบคลุมไฟล์ของโปรเจกต์ใน Git: backend modules, controllers, services, guards, DTOs, types, unit tests, E2E/fixtures, เอกสาร, package/config, seed/reference data, Prisma contract/generated types และ migration snapshots โดยใช้ runtime code และ contract ปัจจุบันเป็นหลักเมื่อเอกสารเก่าหรือ comments ไม่ตรงกัน ไม่ใช้ dependencies, build output หรือค่า secrets จริงเป็นข้อกำหนดของระบบ

ปัจจุบัน executable E2E มีเพียง `test/app.e2e-spec.ts`: สร้าง AppModule แล้วตรวจ `GET /api/v1` ได้ `200 Hello World!` การเพิ่ม flow ในไฟล์นี้ไม่ได้เพิ่ม executable tests, เปลี่ยน application code, เปลี่ยน config หรือสร้าง commit

สถานะที่ใช้ในเอกสาร:

- **Planned**: มี implementation รองรับและต้องเพิ่ม E2E จริงก่อนสรุปผล
- **Risk**: เป็น invariant/negative case ที่ต้องตรวจจริง มีเหตุจาก code ว่าอาจล้มเหลว ไม่ให้เปลี่ยน assertion เพื่อยอมรับความผิดพลาด
- **Gap**: requirement ยังไม่มี implementation หรือมีพฤติกรรมต่างจากข้อกำหนด ต้องรายงานแยก ไม่ให้นับว่า Pass
- **Blocked**: รันไม่ได้เพราะ test environment/provider ยังไม่พร้อม ต้องระบุสาเหตุ
- ผลการรันจริงใช้ Pass/Fail/Blocked/Not Run และแนบหลักฐานเป็นราย case ID; ทุกเคสด้านล่างเริ่มจาก Planned เว้นแต่ระบุ Risk/Gap

## 2. Requirement Traceability

| Requirement | กลุ่มทดสอบ | ขอบเขตที่มีจริง / ช่องว่าง |
|---|---|---|
| สมัคร renter/mate, login/logout, JWT access/refresh | AUTH, SEC, JOURNEY | มี backend; register ไม่ออก token ต้อง login ต่อ |
| Profile, bio, interests, rate, location, availability | USER, MATE, AVAIL | มี weekly schedule; ยังไม่มี calendar exception รายวัน |
| Search/filter/pagination | LOOKUP, SEARCH, PERF | ค้น name/bio, location IDs, activities/interests, rate, rating, availableDate |
| Form validation และอายุ >18 | VALID, MATE, UI | backend ยอมรับอายุ 18-120; requirement >18 ต้องบันทึก Gap |
| Booking lifecycle | BOOK, JOURNEY | create/read/accept/decline/cancel/complete; ไม่มี DELETE booking หรือแก้วันเวลา |
| Secure messaging หลัง confirm | MSG, WS, NOTIFY | มี REST และ Socket.IO; ส่งได้เมื่อ confirmed/completed |
| Payment integration / free approach | PAY, HOOK | implementation ใช้ Stripe/THB; ทดสอบ test mode ไม่คิดเงินจริง; ไม่มี free/mock payment mode ในแอป |
| Rating/review หลัง session | REVIEW, SEARCH | มี create/update/delete และ aggregate rating |
| Admin, moderation, reports, analytics | ADMIN, REPORT, ANALYTICS | มี API; ไม่มี dashboard UI และไม่มี admin payment-list endpoint |
| RBAC, password hashing, SQLi/XSS/CSRF | AUTH, SEC, VALID, UI | JWT + ownership; password ใหม่เป็น scrypt และรองรับ legacy bcrypt |
| CRUD | USER, MATE, BOOK, REVIEW, MSG | full CRUD ไม่ครบทุก resource: messages ไม่มี edit/delete, booking ไม่มี delete/reschedule |
| Cloud upload | PHOTO | MinIO หรือ local data URL; ไม่มี Cloudinary integration |
| Response template | VALID | success envelope มีจริง; exceptions ใช้ Nest shape; root/webhook/204 เป็นข้อยกเว้น |
| API docs: Swagger/OpenAPI หรือ Postman | DOC | มี Markdown guides แต่ไม่พบ Swagger setup/OpenAPI/Postman collection |
| Modern UI, responsive, frontend validation | UI | ไม่พบ frontend package/source ใน repo นี้ |
| State management, animation | UI | optional และยังไม่มี frontend ให้ตรวจ |
| Modular architecture/scalability | JOURNEY, PERF | ทดสอบข้าม module และ data volume; architecture review ไม่ใช่ E2E assertion |
| Creativity / Mate Match | FUTURE | ไม่พบ matching algorithm; optional Gap |
| Completion / deployment | JOURNEY, DEPLOY | backend journeys วางแผนได้; full-stack/deployed checks รอสภาพแวดล้อม |

## 3. Test Environment และ Isolation

### 3.1 Harness ที่ต้องเตรียมเมื่อนำแผนไป implement

1. ตั้ง env ของ test ก่อน import AppModule/db เพราะบางค่าอ่านตอนโหลด module: `NODE_ENV=test`, DATABASE_URL ของฐานข้อมูลทดสอบ, JWT_ACCESS_SECRET/JWT_REFRESH_SECRET คนละค่า, API_PREFIX, CORS_ORIGIN และ provider config ตาม suite
2. ใช้ PostgreSQL จริงที่ตรงกับ contract ปัจจุบันสำหรับ backend E2E; ไม่ mock guards, AuthService, MessagesService หรือ ORM ของ suite ที่อ้างว่าเป็น E2E
3. ยืนยันชื่อ database/host เป็น target ทดสอบก่อน seed/cleanup ทุกครั้ง; `docker-compose.yml` ปัจจุบันใช้ฐานข้อมูล development ไม่ได้แยก test ให้
4. `test/setup.ts` ยังไม่ได้ถูกผูกใน `vitest.config.e2e.ts` และใช้ `DATABASE_URL ??=`; ห้ามถือว่าการมีไฟล์นี้ป้องกันการใช้ฐานข้อมูล development อยู่แล้ว
5. สร้างแอปด้วย `bodyParser: false`; ลง `express.raw({ type: 'application/json' })` ที่ webhook ก่อน `express.json()`; ตั้ง global prefix และ CORS เหมือน `src/main.ts`
6. ใช้ ValidationPipe เหมือน runtime: `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, `enableImplicitConversion: false`
7. HTTP ใช้ Supertest ผ่าน HTTP server; Socket.IO ใช้ server ที่ listen บนพอร์ตว่างและ client จริง namespace `/chat` ไม่ใช่ `/api/v1/chat`; จัด listener ก่อน connect/emit
8. ปิด sockets/listeners/server/DB resources หลัง suite รวมกรณี assertion ล้มเหลว; มี deadline สำหรับ ACK/event/absence checks และปิด reconnect ใน rejection tests
9. อย่าใช้ shared `global.bookingId` ข้าม test files; ทุก case/suite สร้าง state ของตัวเอง หรือรวม journey ที่พึ่งลำดับไว้ใน case เดียว
10. ไม่ใช้ transaction ของ test ครอบ HTTP แล้วหวัง rollback ทั้งแอป เพราะ request อาจใช้คนละ connection/transaction; ใช้ database แยก worker หรือรัน sequential กับ isolated fixtures
11. เก็บ token ใน test context ไม่พิมพ์ลง logs/report; ใช้ test credentials เท่านั้น และไม่เปิด Observe ด้วย credentials จริงใน test
12. Assertions ต้องตรวจ response ผ่าน transport จริงและอ่าน DB หลัง request เป็นหลักฐานเสริม ไม่เรียก service แทน request

### 3.2 Provider Suites

| Suite | Dependencies / วิธีตรวจ | ขอบเขตผลที่อ้างได้ |
|---|---|---|
| Backend E2E | AppModule + PostgreSQL + HTTP/Socket.IO จริง; storage local เมื่อไม่ได้ตั้ง MinIO ใน test | business flow และ local upload; ยังไม่ยืนยัน cloud หรือ Stripe network |
| Payment integration | PostgreSQL จริง; จำลองเฉพาะ Stripe outbound transport ใน test harness; signature verification ใช้ SDK จริงกับ test signing secret | deterministic failure, retry, reordered webhook; ต้องระบุ provider ถูกจำลอง |
| Stripe sandbox E2E | Stripe test account + PaymentIntent จริง + signed webhook ที่สัมพันธ์กับ intent นั้น | charge/failure/refund test mode ผ่าน provider จริง; credentials/network ขาดให้ Blocked |
| MinIO E2E | bucket ทดสอบเฉพาะ + object จริง + URL ที่ client เข้าถึงได้ | upload/download/delete, bytes, MIME, object ownership |
| Browser/deployment | frontend URL + isolated backend/providers | UI, accessibility, responsive, browser security; ปัจจุบัน Gap |

การจำลอง provider เป็นแผนของ test harness ไม่ใช่การเพิ่มโหมดจำลองลง application การขาด provider ไม่ใช่เหตุผลให้ข้ามแล้วรายงานว่าทุก feature ผ่าน

### 3.3 Fixtures และ Cleanup

- Actors: renter R1/R2, mate M1/M2, mate ที่ยังไม่มี profile, admin A1/A2, banned user, inactive user, inactive mate profile, unverified/verified mate และ legacy bcrypt user
- สมัคร renter/mate ผ่าน API สำหรับ journey; admin/สถานะที่ไม่มี public setter สร้างผ่าน test fixture เท่านั้น
- ใช้ชื่อ/email ที่มี run ID; เก็บ userId กับ mateId แยกกัน ห้ามถือว่าเลขเท่ากัน
- Reference data: อย่างน้อย 2 จังหวัดกับ district ที่สัมพันธ์กัน, 2 activities, 2 interests; seed จริงมี 77 จังหวัดและ 928 districts แต่ runtime IDs ของ activities/interests ต้องอ่านจาก lookup ไม่ hard-code
- M1 มี availability 09:00-18:00 ทุกวัน, M2 10:00-17:00; มี profile rate/rating ต่างกัน, unrated mate, empty gallery, full gallery และข้อมูลมากกว่า 1 page
- Booking fixtures ครบ pending/confirmed/completed/cancelled; Payment ครบ no-row/pending/paid/failed/refunding/refunded; Report ครบ open/reviewed/dismissed/actioned
- ใช้เวลาของ Asia/Bangkok และ `Temporal.Instant` ตาม Prisma codec; วันที่อนาคตคำนวณจากวันปัจจุบัน ห้ามคัดลอกวันที่คงที่จากเอกสารเก่า
- เคส boundary ใช้เวลาคงที่ที่ควบคุมได้อย่างเฉพาะเจาะจง; สำหรับ completion เตรียม booking ที่ endTime ผ่านแล้วพร้อม date/startTime ที่สอดคล้องกัน ห้ามแกล้งให้ POST จองอดีตผ่าน
- ขยับเวลาแล้วต้องคำนึงถึง JWT expiry; อย่า freeze timers ทั้งระบบจน Socket.IO/provider deadlines ไม่ทำงาน
- Cleanup ต้องลบเฉพาะข้อมูลและ object ของ test run ใน isolated environment โดยลบ child ก่อน parent; ไม่ลบ production/development หรือ lookup ส่วนกลาง
- ลำดับ DB: StripeWebhookEvent ของ run; RefreshToken, Payment, Review, Report, Notification, Message; Booking; MatePhoto/MateAvailability/MateActivity/MateInterest; Mate; User
- ลบ MinIO objects ที่สร้างโดย run ก่อนลบ metadata; ปิด client ก่อน cleanup กันมี message มาถึงหลังลบ fixture
- `fixtures/test-setup.ts` เดิมล้างข้อมูลทุก user ที่ id > 0, ยังไม่ล้าง StripeWebhookEvent/object และยังไม่มี fixture ครบทุก feature; ต้องจัด isolation ก่อนนำไปใช้ แผนนี้ไม่ได้แก้ helper นั้น

## 4. Transport Contract และ Endpoint Inventory

REST ทุก path ด้านล่างต่อจาก `/api/v1` หรือ API_PREFIX ที่ตั้งไว้ ใช้ `B` แทน bookingId, `M` แทน mateId และ `ID` เป็น resource ID จริง

Inventory จาก controller decorators มี 59 HTTP routes และ 5 Socket.IO events แผนนี้มี 272 case IDs ในตารางและ 8 complete journeys โดยจำนวนนี้รวม Risk และเคสอนาคตที่เป็น Gap จึงไม่ใช่จำนวน executable tests หรือจำนวน tests ที่ผ่านแล้ว

Success ทั่วไปเป็น `{ status: 'success', message, data }`; Nest exception ตรวจ `statusCode`, `message` (อาจเป็น array) และ error เมื่อมี ไม่ใช้ `body.data.message` เป็นมาตรฐาน Root ตอบ plain text, webhook ตอบ `{ received: true }`, availability DELETE ตอบ 204 ไม่มี body

POST ที่ไม่มี `@HttpCode` ใช้ 201 ตาม controller ปัจจุบัน รวม login/refresh/logout; GET/PATCH/PUT/DELETE ทั่วไปเป็น 200 ยกเว้นที่ระบุ ห้ามใช้ 200 จาก guide เก่าเป็น assertion ของ auth POST

| Surface | Endpoints / Events | กลุ่ม |
|---|---|---|
| Root | GET / | ENV |
| Auth | POST /auth/register, /auth/login, /auth/refresh, /auth/logout; GET /auth/me | AUTH |
| User | GET/PATCH /users/me; PATCH /users/me/email, /users/me/password | USER |
| Lookups | GET /activities, /interests, /provinces, /provinces/:provinceId/districts | LOOKUP |
| Discovery | GET /mates, /mates/:mateId, /mates/:mateId/availability, /mates/:mateId/reviews | SEARCH, AVAIL, REVIEW |
| Own mate profile | POST /mates; GET/PATCH/DELETE /mates/me | MATE |
| Gallery | POST /mates/me/photos; DELETE /mates/me/photos/:photoId | PHOTO |
| Own availability | GET/POST/PUT /mates/me/availability; PATCH/DELETE /mates/me/availability/:availabilityId | AVAIL |
| Bookings | GET/POST /bookings; GET /bookings/:bookingId; PATCH /bookings/:bookingId/accept, /decline, /cancel, /complete | BOOK |
| Booking payment | GET/POST /bookings/:bookingId/payment; POST /bookings/:bookingId/payment/refund | PAY |
| Payment history/webhook | GET /payments; POST /webhooks/stripe | PAY, HOOK |
| Reviews | POST /bookings/:bookingId/review; PATCH/DELETE /reviews/:reviewId | REVIEW |
| Messages | GET/POST /bookings/:bookingId/messages | MSG |
| Notifications | GET /notifications; PATCH /notifications/:notificationId/read, /notifications/read-all | NOTIFY |
| Reports | POST /reports; GET /admin/reports; PATCH /admin/reports/:reportId | REPORT |
| Admin users | GET /admin/users; PATCH /admin/users/:userId/ban, /unban, /activate, /verify | ADMIN |
| Admin bookings/analytics | GET /admin/bookings, /admin/analytics | ADMIN, ANALYTICS |
| Socket.IO /chat | join_booking, leave_booking, send_message, typing, mark_read | WS |

### 4.1 Role/Ownership Matrix

| Action | Guest | Renter | Mate | Admin |
|---|---|---|---|---|
| Public lookup/search/detail/reviews/availability | อนุญาต | อนุญาต | อนุญาต | อนุญาต |
| /auth/me และ /users/me | 401 | own | own | own |
| /mates/me และ profile/photo/availability writes | 401 | 403 | own profile | 403 |
| Create booking / payment / review | 401 | own ตาม state | 403 | 403 |
| Accept/decline | 401 | 403 | owner เท่านั้น | 403 |
| Booking detail | 401 | participant | participant | ทุก booking |
| Cancel | 401 | participant | participant | ทุก booking แต่ต้องผ่าน state/time rules |
| Complete | 401 | 403 | owner | อนุญาต แต่ต้องผ่าน state/time rules |
| Messages และ booking payment GET | 401 | participant | participant | ไม่มี bypass; nonparticipant 404 |
| Review PATCH | 401 | author | nonowner 404 | nonowner 404 |
| Review DELETE | 401 | author; คนอื่น 403 | nonowner 403 | อนุญาต |
| Notifications | 401 | own | own | own |
| Reports create | 401 | ตามความสัมพันธ์ target | ตามความสัมพันธ์ target | ตามความสัมพันธ์ target |
| /admin/* และ payment/refund | 401 | 403 | 403 | อนุญาต |

AUTH endpoints register/login/refresh/logout มีข้อกำหนดเฉพาะและไม่ต้องมี access token; Stripe webhook ใช้ signature แทน JWT. HTTP protected routes ตรวจ banned/inactive ผ่าน JwtStrategy ก่อนเข้า role/ownership; Socket.IO ใช้ authentication ตอน connect

## 5. ENV: Startup และ Contract

| ID | Scenario | Expected |
|---|---|---|
| ENV-01 | Boot AppModule กับ test config ครบ; GET root | 200 และ Hello World!; ไม่มี unresolved dependency |
| ENV-02 | JWT_ACCESS_SECRET หาย, ว่าง, whitespace ใน process แยก | fail startup ด้วย config error; ไม่มี development secret fallback |
| ENV-03 | Config access/refresh secret ครบ; login และต่อ WS ด้วย token ที่ออกจริง | HTTP/WS ใช้ access secret เดียวกัน; refresh secret ใช้เฉพาะ refresh |
| ENV-04 | STRIPE_SECRET_KEY หาย | fail ตอนสร้าง StripeProvider; webhook secret หายต้อง fail เมื่อใช้งาน webhook ไม่ใช่อ้างว่าตรวจตอน constructor |
| ENV-05 | MinIO ไม่ตั้งใน test; ตั้งครบ; ตั้งบางส่วน/port/SSL/public URL ผิด | local provider / MinIO ตาม config; invalid config fail ชัดเจน; production ไม่มี MinIO ต้อง fail |
| ENV-06 | API_PREFIX ที่ไม่ใช่ default และ webhook under prefix นั้น | routes ถูก prefix; raw body ถูกต้อง; Socket.IO namespace ยัง /chat |
| ENV-07 | CORS allowed/disallowed origin, OPTIONS ที่มี Authorization/Content-Type | allowed origin ได้ headers ที่ตรง config; disallowed ไม่ได้ permission; ไม่ถือว่า CORS ป้องกัน non-browser API calls |
| ENV-08 | เชื่อมฐานข้อมูลจริงและ query models ที่ suite ใช้ | schema, generated contract, defaults, unique/FK constraints และ Temporal serialization ใช้งานได้; root pass อย่างเดียวพิสูจน์ไม่ได้ |

## 6. AUTH: Registration, JWT และ Sessions

| ID | Scenario | Expected |
|---|---|---|
| AUTH-01 | สมัคร renter และ mate ด้วยข้อมูล valid | 201; data.user มี id/name/email/role; ไม่มี password/hash/token; DB role ถูกต้อง |
| AUTH-02 | email ต่าง case แต่เป็น email เดียวกัน | normalized lowercase; สมัครซ้ำ 409 และไม่มี user เพิ่ม |
| AUTH-03 | role=admin/unknown, name สั้นกว่า 2, password สั้นกว่า 8, email ผิด, missing fields | 400; ไม่มี account ถูกสร้าง |
| AUTH-04 | ส่ง role elevation fields เช่น isBanned/isVerified หรือ userId | 400 จาก unknown fields; ไม่มี mass assignment |
| AUTH-05 | password เดียวกันสอง accounts | DB เก็บ scrypt hash คนละ salt ไม่ใช่ plaintext; response/log ไม่เผย hash |
| AUTH-06 | Login accounts ทั้ง renter/mate/admin และ legacy bcrypt fixture | 201; accessToken/refreshToken ใช้งานจริงได้; legacy password verify ได้ |
| AUTH-07 | Login ผิด password / email ไม่มี | 401 Invalid email or password; ไม่ออก session; input ผิด DTO เป็น 400 |
| AUTH-08 | Login banned/inactive account | 403; ไม่มี refresh row ใหม่ |
| AUTH-09 | GET /auth/me ด้วย access valid, missing, invalid signature, expired, refresh แทน access | valid 200; token ที่ไม่ผ่าน authentication 401; response user ถูกคน |
| AUTH-10 | access token valid แต่ user ถูกลบ/ban/deactivate ใน DB | user หาย 401; banned/inactive 403; ไม่พึ่ง role/status เก่าใน JWT |
| AUTH-11 | Refresh valid โดยไม่มี Authorization | 201; ออก token pair ใหม่; jti เปลี่ยน; token เก่า revoked และ replacedByJti ชี้ตัวใหม่ |
| AUTH-12 | ตรวจ RefreshToken row หลัง login/rotation | SHA-256 ของ raw refresh token ตรง tokenHash; เก็บ jti, userId, expiresAt; ไม่เก็บ raw token |
| AUTH-13 | นำ refresh เก่าหลัง rotate กลับมาใช้ | 401; token ใหม่ยัง refresh ได้ตามปกติ |
| AUTH-14 | Refresh expired/wrong signature/wrong type/ไม่มี jti/ไม่มี stored row/hash หรือ userId ไม่ตรง/DB expiresAt หมด | JWT-shaped invalid credential เป็น 401; ไม่มี token pair ที่ใช้งานต่อได้ |
| AUTH-15 | Refresh ของ banned/inactive user ที่ row ยังไม่ revoked | 403; ถ้า row ถูก revoke แล้วเป็น 401 ก่อน user check |
| AUTH-16 | Logout valid refresh โดยไม่มี access token | 201 success, Logged out, data=null; revoke row ตาม jti |
| AUTH-17 | Logout มี expired access header แต่ refresh valid | 201; ไม่ถูก access guard ขวาง; refresh row revoked |
| AUTH-18 | Refresh หลัง logout | 401; access/refresh pair ใหม่ไม่ถูกออก |
| AUTH-19 | Logout ซ้ำด้วย refresh เดิม / JWT-shaped signature invalid / expired / wrong type / jti ไม่มี row | 201 idempotent; ไม่ crash และไม่ revoke session อื่น |
| AUTH-20 | Logout/refresh body ไม่มี token, empty, number, text ที่ไม่ใช่ JWT | 400 จาก RefreshTokenDto; แยกจาก AUTH-19 ที่ผ่านรูปแบบ JWT แล้ว |
| AUTH-21 | มีสอง sessions; logout session A | A refresh ไม่ได้; B ยัง refresh ได้; ไม่ logout ทุกอุปกรณ์โดยไม่ตั้งใจ |
| AUTH-22 | หลัง logout นำ access token ที่ยังไม่หมดอายุไป /auth/me | ยังใช้ได้ถ้า user active; ปัจจุบันไม่มี access-token denylist |
| AUTH-23 | ส่ง refresh เดียวกันพร้อมกันสอง request | Risk: ต้องมีเพียงหนึ่ง successful rotation; อีกรายการ 401 และไม่มี orphan active refresh rows |
| AUTH-24 | สมัคร normalized email เดียวกันพร้อมกัน | คนหนึ่ง 201 อีกคน 409; มี user เดียว ไม่ใช่ 500; ตรวจ ORM error mapping จริง |

JWT wrong-type case ควรมีทั้ง refresh token ปกติ และ JWT ที่ลงนามด้วย access test secret แต่ payload.type='refresh' เพื่อยืนยัน type check แยกจาก signature failure

## 7. USER: Account Settings

| ID | Scenario | Expected |
|---|---|---|
| USER-01 | GET /users/me ของแต่ละ role | 200 safe fields และเป็น user ของ token; ไม่มี password/hash |
| USER-02 | PATCH name valid รวมภาษาไทยและ surrounding whitespace | 200; name trim; GET ซ้ำเห็นค่าที่บันทึก |
| USER-03 | name ว่าง/whitespace/>80/non-string/missing; ส่ง email/role/userId ผ่าน profile PATCH | 400; DB ไม่เปลี่ยน |
| USER-04 | เปลี่ยน email ด้วย currentPassword ถูก | 200; normalize; login ด้วย email ใหม่สำเร็จและ email เก่าไม่สำเร็จ |
| USER-05 | email เดิมของตนเอง, email คนอื่น, รูปแบบผิด, currentPassword ผิด | same email สำเร็จ; conflict 409; validation/current password ผิด 400 |
| USER-06 | เปลี่ยน password valid | 200; hash ใหม่; password เก่า login 401; ใหม่ login ได้ |
| USER-07 | wrong currentPassword/newPassword สั้นกว่า 8 หรือเกิน 128 | 400; password และ session ไม่เปลี่ยน |
| USER-08 | เปลี่ยน password เมื่อมี active refresh อย่างน้อย 3 sessions | Risk: ต้อง revoke ทุก session; refresh ทุกตัว 401; account อื่นไม่กระทบ |
| USER-09 | ฝัง id/role/isActive/isVerified ในทุก PATCH | 400; เปลี่ยนได้เฉพาะ own allowed fields |

## 8. LOOKUP, MATE และ PHOTO

### 8.1 Lookup และ Profile

| ID | Scenario | Expected |
|---|---|---|
| LOOKUP-01 | Guest GET activities/interests/provinces | 200 data.items เป็น id/name เรียงตาม name; ตรง reference rows |
| LOOKUP-02 | GET districts ของจังหวัดที่มี/ไม่มี | มี: เฉพาะ district ของจังหวัด; province ไม่มี 404; ID parse ไม่ได้ 400 |
| MATE-01 | Mate ไม่มี profile GET /mates/me | 404; route me ต้องไม่ถูก :mateId จับ |
| MATE-02 | POST profile ครบ age,bio,hourlyRate,provinceId,districtId,activityIds,interestIds | 201; one profile/user; lookup relations ถูก; GET own/public เห็นค่าที่เหมาะสม |
| MATE-03 | POST ซ้ำ | 409; ไม่มี profile/relation ซ้ำ; concurrent create เป็น Risk ต้องไม่ 500 |
| MATE-04 | อายุ 17/18/120/121, fractional age; rate 0/0.01/negative/>2 decimals | 18-120 integer และ rate>=0.01 สูงสุด 2 decimals valid; อื่น 400; อายุ 18 เป็น requirement Gap |
| MATE-05 | missing activityIds/interestIds, duplicated/negative IDs, bio whitespace/>2000 | 400; arrays ว่างยอมรับตาม DTO ปัจจุบัน |
| MATE-06 | lookup ไม่มี / district ไม่อยู่จังหวัดนั้น | 422 INVALID_LOOKUP_REFERENCE; ไม่ทิ้ง profile หรือ links บางส่วน |
| MATE-07 | PATCH เฉพาะ bio/rate/age และ replace activityIds/interestIds | 200; ฟิลด์อื่นคงเดิม; ส่ง [] ล้าง relation ชุดนั้น; public filters เปลี่ยนตาม |
| MATE-08 | PATCH เปลี่ยน province อย่างเดียวกับ district เดิมที่ไม่สัมพันธ์ / body {} | 422 lookup mismatch / 400 empty update; DB คงเดิม |
| MATE-09 | DELETE /mates/me และเรียกซ้ำ | 200 soft-deactivate, timestamp; profile/reviews/bookings/photos ยังอยู่; User ไม่ได้ถูก deactivate ไปด้วย |
| MATE-10 | หลัง profile inactive: own GET, PATCH, upload, availability write, public GET | own GET ได้; PATCH/upload/availability write 422; public detail/reviews/availability 404; search ไม่แสดง |
| MATE-11 | Admin activate mate ที่ deactivate ไว้ | profile กลับ active; public visible เมื่อ owning User active และไม่ banned; ไม่สร้าง profile ซ้ำ |
| MATE-12 | Profile responses ทุก create/read/update/deactivate | Risk: assert ไม่มี nested user.password/hash/secret; TypeScript type ไม่ได้กรอง runtime JSON |
| MATE-13 | Account banned/inactive, mate profile active | HTTP protected 403; public search ซ่อนและ detail/reviews/availability 404 |

### 8.2 Gallery และ Object Storage

| ID | Scenario | Expected |
|---|---|---|
| PHOTO-01 | Multipart field photo ด้วย JPEG/PNG/GIF/WebP ที่มี bytes จริง | 201; DB photo ของ own mate, URL, owned storageKey, sortOrder; public gallery แสดง |
| PHOTO-02 | ไม่มี file และส่ง url แบบ http/https/relative/data:image ที่ DTO รองรับ | 201; storageKey=null; อย่าอ้างว่า backend อัปโหลด URL นี้ขึ้น cloud |
| PHOTO-03 | missing ทั้ง file/url, URL ผิด, SVG/executable, spoof MIME/magic bytes | reject 400; ไม่เพิ่ม DB row/object; non-image ที่ถูก fileFilter ตัดออกและไม่มี URL ต้อง 400 |
| PHOTO-04 | ขนาดเท่ากับ 5 MiB / เกิน 5 MiB ผ่าน multipart | ที่ boundary valid เมื่อชนิดถูก; เกินได้ 413 จาก upload interceptor; อย่าใช้ service-level 400 เป็น HTTP expectation |
| PHOTO-05 | เพิ่ม 6 รูป; เพิ่มรูปที่ 7 | 6 รูปเรียง sortOrder; รูปที่ 7 เป็น 409; ไม่มี object เกิน |
| PHOTO-06 | ลบรูปกลางแล้วเพิ่มใหม่ | 200 data=null; ใช้ช่อง sortOrder ว่างแรก; search cover/public gallery สอดคล้อง |
| PHOTO-07 | Delete photo คนอื่น/ไม่มี/ID ไม่เป็น integer | 404/404/400; object ของผู้อื่นไม่หาย |
| PHOTO-08 | ส่ง storageKey/mateId/sortOrder ใน request | 400 unknown fields; key สร้างฝั่ง server |
| PHOTO-09 | MinIO จริง: upload แล้ว GET URL จากมุม client | bytes/MIME ตรง; ลบแล้ว object หาย; URL ไม่ชี้ hostname ที่ client เข้าไม่ได้; bucket ACL เป็นส่วนที่ต้องตรวจ |
| PHOTO-10 | Provider store fail / DB photo insert fail หลัง upload | ไม่ทิ้ง metadata ปลอม; กรณี DB fail ต้องพยายามลบ uploaded object; บันทึกถ้า compensation fail |
| PHOTO-11 | Provider delete fail | DB metadata ยังอยู่เพื่อ retry; retry สำเร็จจึงลบ record |
| PHOTO-12 | Legacy/corrupt key อยู่นอก namespace mate | ลบ record ได้ตาม ownership แต่ห้ามลบ object นอก namespace |
| PHOTO-13 | Concurrent upload ตอนมี 5 รูป | Risk: ไม่เกิน 6, sortOrder ไม่ซ้ำ, orphan object ถูกชดเชย; conflict ต้องไม่กลายเป็น silent overwrite |

## 9. AVAIL และ SEARCH

### 9.1 Weekly Schedule / Public Open Slots

| ID | Scenario | Expected |
|---|---|---|
| AVAIL-01 | POST/GET own schedule หลายวันหลายช่วง | 201/200; dayOfWeek 1-7, MON-SUN และ numeric string แปลงตาม DTO; GET เรียง day/time |
| AVAIL-02 | วัน 0/8, time format ผิด, start>=end, ข้ามคืน | 400; ไม่สร้าง slot |
| AVAIL-03 | สร้างช่วงซ้ำ/คร่อม/อยู่ภายใน/ทับบางส่วนวันเดียวกัน | 409; วันต่างกันและช่วงติดกันพอดีอนุญาต |
| AVAIL-04 | PATCH เวลา/วันบาง field | 200; validate รวมกับค่าเดิม, ไม่ถือว่า overlap กับตัวเอง; {} เป็น 400 |
| AVAIL-05 | PATCH/DELETE slot คนอื่นหรือไม่พบ | 404; own DELETE 204 ไม่มี body; ลบซ้ำ 404 |
| AVAIL-06 | PUT ด้วย slots; ทดสอบ availability และ windows aliases | 200 data.slots; replace ทั้งชุดใน transaction; ส่ง [] ล้างได้; {} 400 |
| AVAIL-07 | PUT nested invalid/overlap และส่งหลาย aliases | invalid DTO 400, overlap 409 และข้อมูลเดิมคงอยู่; หลาย aliases ใช้ slots > availability > windows ตาม code ปัจจุบัน |
| AVAIL-08 | GET /mates/M/availability?date=วันอนาคต | 200 data.date/openSlots[{start,end}] |
| AVAIL-09 | date missing/format/calendar invalid/past; mate hidden/missing | date invalid 400, past 422; hidden/missing mate 404 |
| AVAIL-10 | Weekly 09:00-18:00 มี pending/confirmed 10:00-11:30 | openSlots 09:00-10:00 และ 11:30-18:00; จองเต็มแล้ว [] |
| AVAIL-11 | Blocking intervals หลายช่วง/ติดกัน/คร่อม weekly window; cancelled/completed | subtract/clip ถูก, ไม่คืนช่วงติดลบ; cancelled/completed ไม่ block |
| AVAIL-12 | Bangkok midnight, วันอาทิตย์=7, ไม่มี schedule วันนั้น | local date/day ถูก; [] เมื่อไม่มี window |
| AVAIL-13 | เปลี่ยน schedule หลังมี booking | existing booking ไม่ถูกลบ/เปลี่ยนเอง; slot calculation ถูก; requirement เรื่องป้องกัน schedule ทับ booking ยังไม่ได้กำหนด |
| AVAIL-14 | Concurrent create/replace/update ช่วงทับกัน | Risk: ไม่มี schedule overlap หรือ lost update ที่เงียบ; ตรวจ final rows ไม่ใช่ HTTP status อย่างเดียว |

### 9.2 Discovery, Filters และ Pagination

| ID | Scenario | Expected |
|---|---|---|
| SEARCH-01 | Guest GET /mates | 200 data.items/meta; default page=1,limit=20,sort=-createdAt; ไม่ต้อง JWT |
| SEARCH-02 | q ตรง name/bio ภาษาไทย/อังกฤษ/ต่าง case/trim | match name หรือ bio; ไม่ match คืน items=[] |
| SEARCH-03 | provinceId, districtId เดี่ยว/คู่ | filter ถูก; province/district คู่ไม่สัมพันธ์ 422; lookup ที่ไม่มีแบบเดี่ยวอาจเป็น empty result ตาม implementation |
| SEARCH-04 | activityId/interestId หนึ่งค่าและ repeated query keys หลายค่า | ต้อง match ทุก ID ภายในแต่ละชุด (AND) และ AND กับ filter อื่น; invalid lookup 422 |
| SEARCH-05 | minRate/maxRate boundary, minRating=0/5/fraction | inclusive; ไม่มี review เป็น avgRating=null/reviewCount=0, รวมเมื่อ minRating=0 |
| SEARCH-06 | availableDate มีเวลาบางส่วน/เต็ม/ไม่มี schedule/booking วันอื่น | return เฉพาะมี open window วันนั้น; pending/confirmed block; cancelled/completed ไม่ block |
| SEARCH-07 | availableDate เหลือเวลา <60 นาที | ปัจจุบันยัง return mate เพราะมี gap; จอง <60 นาทีถูก reject; บันทึก semantics ไม่อ้างว่า search รับรองว่าจองได้ |
| SEARCH-08 | sort rating/-rating/rate/-rate/createdAt/-createdAt | ทิศทางถูก; tie-break id ascending; null rating ก่อนตัวเลขเมื่อ ascending และหลังเมื่อ descending |
| SEARCH-09 | page หลายหน้า/หน้าสุดท้าย/เกินหน้า/limit=1/100 | total นับหลัง filters; totalPages=ceil(total/limit); หน้าเกินเป็น []; ไม่ซ้ำ/หายสำหรับชุดข้อมูลคงที่ |
| SEARCH-10 | q ว่าง/>100, ID ลบ/ทศนิยม, rate ผิด/>2 decimals/min>max, minRating นอก 0-5, invalid sort/page/limit>100 | 400; past availableDate 422; calendar-invalid แยก DTO/service และบันทึก status จริง |
| SEARCH-11 | Mate inactive/User banned/User inactive/unverified | hidden สามกลุ่มแรก; unverified แต่ active ไม่ถูกซ่อนเพียงเพราะยังไม่ verified |
| SEARCH-12 | GET public detail และ reviews ของ visible mate | เฉพาะ public fields; photo sort, relations, avgRating/count ตรง DB; password/email/internal key ไม่รั่ว |
| SEARCH-13 | Cover photo หลังเพิ่ม/ลบ gallery | ใช้รูป sortOrder ต่ำสุด; ไม่มีรูปใช้ profileImageUrl หรือ null ตามข้อมูล |
| SEARCH-14 | Bangkok + interest/activity + วันสุดสัปดาห์ + rating + rate + pagination | ผลตรง intersection ทุกเงื่อนไข; ไม่สมมติว่ามี drinking ใน seed ต้องสร้าง fixture lookup ที่ต้องการ |
| SEARCH-15 | Update profile/review/ban แล้ว search ซ้ำ | ผลและ aggregate เปลี่ยนตาม committed data; เห็นผลโดยไม่ restart |

## 10. BOOK: Booking Lifecycle

| ID | Scenario | Expected |
|---|---|---|
| BOOK-01 | R1 จอง M1 วันอนาคต 10:00-11:30 rate=500 | 201 data{id,status:pending,totalPrice}; ราคา 750.00; row date เป็น Bangkok midnight; แจ้ง M1 ครั้งเดียว |
| BOOK-02 | Duration 60/90/480 นาที กับ rate ทศนิยม | valid 201; amount คำนวณจาก rate ตอนจองและ round 2 decimals |
| BOOK-03 | 30/59/61/481 นาที, start>=end, past/start=now | duration ผิด 422, time ordering 400, not future 422; ไม่สร้าง booking/notification |
| BOOK-04 | Calendar invalid/time ผิด format/ID invalid/missing/unknown fields | 400; totalPrice/renterId/status ที่ client ส่งถูก reject |
| BOOK-05 | Mate/activity ไม่มี; activity ไม่อยู่ profile | 404/404/422; inactive mate profile 422; owner banned/inactive 404 |
| BOOK-06 | Mate/Admin POST booking ของตนเองหรือผู้อื่น | 403 จาก role guard; อย่าคาดหวัง service self-booking 400 ใน normal mate HTTP flow |
| BOOK-07 | Fixture renter ที่ยังผูก mate row จาก role-change แล้วจองตนเอง | 400 self-booking; เป็น defensive service path ผ่าน HTTP ด้วย role ที่ผ่าน guard |
| BOOK-08 | นอก weekly availability/คร่อมช่องว่างสอง windows | 422; ช่วงที่อยู่ใน single window ทั้งหมดจึงผ่าน |
| BOOK-09 | Exact/partial/contained overlap pending หรือ confirmed | 409; ช่วงติดกันพอดีอนุญาต 201 |
| BOOK-10 | ช่วงเดียวกันต่าง mate/ต่างวัน/booking เดิม cancelled หรือ completed | ไม่ block จาก overlap filter; ใช้ fixture เวลา valid สำหรับแต่ละ case |
| BOOK-11 | GET /bookings ของ R1/M1/R2/admin | เฉพาะ renterId ของผู้เรียกหรือ mate ของผู้เรียก; admin ไม่ได้ list ทั้งระบบที่ route นี้ |
| BOOK-12 | Status filter/pagination และ detail | default 1/20, latest-created first; names/activity/review ถูก; invalid query 400 |
| BOOK-13 | Detail participant/admin/nonparticipant/missing | 200/200/404/404; malformed ID 400 |
| BOOK-14 | Owner mate accept pending / accept confirmed ซ้ำ | 200 confirmed; แจ้ง renter ครั้งเดียว; ซ้ำไม่เพิ่ม notification |
| BOOK-15 | Owner mate decline pending / decline cancelled ซ้ำ | 200 cancelled; booking_declined ครั้งเดียว; slot กลับว่าง |
| BOOK-16 | Accept cancelled/completed; decline confirmed/completed | 422 INVALID_BOOKING_TRANSITION; owner ผิด 403; ID ไม่มี 404 |
| BOOK-17 | Renter/admin accept/decline | 403 แม้เป็น admin/participant |
| BOOK-18 | Cancel future pending/confirmed โดย renter/mate/admin | 200 cancelled; renter cancel แจ้ง mate, mate cancel แจ้ง renter, admin แจ้งทั้งคู่ |
| BOOK-19 | Cancel ซ้ำ / completed / now>=start / outsider | ซ้ำ 200 ไม่แจ้งซ้ำ; completed/time ผิด 422; outsider 403 |
| BOOK-20 | Complete confirmed หลัง end โดย owner mate/admin | 200 completed; แจ้ง renterครั้งเดียว; complete ซ้ำ 200 |
| BOOK-21 | Complete pending/cancelled/now<=end/renter/other mate | state/time 422; forbidden actor 403; admin ไม่ bypass เวลา |
| BOOK-22 | เปลี่ยน mate rate หลังสร้าง booking | booking.totalPrice เดิมไม่เปลี่ยน; payment ใช้ราคาที่ booking เก็บ |
| BOOK-23 | Notification insert fail ใน booking transaction | rollback booking creation/state change; ไม่ทิ้ง notification หรือ state ครึ่งเดียว (controlled integration fault) |
| BOOK-24 | Concurrent same-slot booking / accept แข่ง cancel หรือ decline | Risk: same-slot ต้องได้หนึ่ง 201 อีก 409 และมี booking เดียว; state race ต้องไม่สูญเสีย transition/แจ้งซ้ำ; code ยังมี check-then-write |
| BOOK-25 | Cancel paid booking และ cancel unpaid | paid เริ่ม refund ตาม PAY; unpaid ไม่มี Stripe refund; DB/notification สอดคล้อง |

## 11. PAY และ HOOK: Stripe Payments

### 11.1 Payment / Refund API

| ID | Scenario | Expected |
|---|---|---|
| PAY-01 | Renter-owner POST payment ของ confirmed booking | 201 pending + clientSecret; Payment row เดียว, providerReference เป็น intent; ยังไม่ paid |
| PAY-02 | Verify outbound intent | currency=thb; amount=booking.totalPrice*100 เป็น satang; metadata.bookingId; idempotency key booking-B-payment |
| PAY-03 | POST ซ้ำเมื่อ pending และมี intent | retrieve intent เดิม; ไม่สร้าง charge/row เพิ่ม |
| PAY-04 | POST ซ้ำหลัง paid | 201 paid, clientSecret=null; ไม่ charge ซ้ำ |
| PAY-05 | POST เมื่อ booking pending/completed/cancelled | 422 PAYMENT_NOT_ALLOWED |
| PAY-06 | Other renter / mate / admin / missing booking | other renter 404; mate/admin 403; booking หาย 404 |
| PAY-07 | Confirmed booking ที่ payment refunding/refunded | 409 PAYMENT_ALREADY_EXISTS |
| PAY-08 | Payment failed แล้ว retry | กลับ pending ตาม API; Risk: ตรวจ provider intent/idempotency behavior จริงว่า retry ชำระได้และไม่ double charge |
| PAY-09 | GET status ก่อนมี Payment row | 200 virtual pending, providerReference/timestamps=null; ไม่สร้าง row และไม่เรียก Stripe |
| PAY-10 | GET status โดย participants/nonparticipant/admin ไม่เกี่ยวข้อง | participants 200; อื่น 404; ไม่มี admin bypass |
| PAY-11 | GET /payments R1/M1/R2/admin | own bookings เท่านั้น รวม no-payment projection; latest booking first; page/meta ถูก; invalid pagination 400 |
| PAY-12 | Admin POST refund ของ paid payment มี reference | 201 refunding; idempotency key booking-B-refund; ยังไม่ refunded |
| PAY-13 | Admin refund unpaid/failed/refunding/refunded / missing booking | 422 REFUND_NOT_ALLOWED / 404; REST refund ซ้ำไม่ได้รับ success แม้ internal refund เป็น no-op |
| PAY-14 | Renter/mate refund endpoint | 403; DB/provider ไม่เปลี่ยน |
| PAY-15 | Cancel future paid booking | booking cancelled + Payment refunding; booking_cancelled ส่งถูกคน; payment_refunded ต้องรอ webhook |
| PAY-16 | Cancel ที่ไม่มี payment/pending/failed/refunding/refunded | ไม่มี refund ใหม่; cancel ซ้ำไม่เพิ่ม side effect |
| PAY-17 | Stripe intent/refund API fail | ไม่รายงาน payment สำเร็จ; ตรวจ rollback state และ notification; retry ด้วย key เดิมไม่ทำซ้ำ |
| PAY-18 | Provider ทำสำเร็จแต่ DB commit fail / concurrent pay | Risk: reconcile external effect กับ DB, มี intent/payment เดียวที่ใช้งานได้; transaction DB ไม่ rollback Stripe |
| PAY-19 | Stripe sandbox successful payment และ card failure | confirm intent ของ booking จริง; รับ webhook; API/DB/notification ตรง paid หรือ failed ตามเหตุการณ์ |
| PAY-20 | Cancel ระหว่าง intent pending แล้ว success webhook มาทีหลัง | Risk: ห้ามเงินค้างกับ cancelled booking โดยไม่มี reconciliation; code ปัจจุบัน refund เฉพาะ paid ตอน cancel |

### 11.2 Signed Webhooks

| ID | Scenario | Expected |
|---|---|---|
| HOOK-01 | POST signed raw JSON payment_intent.succeeded ของ known intent | 200 {received:true}; Payment paid/paidAt; notification payment_paid ให้ renter |
| HOOK-02 | payment_intent.payment_failed | failed/failedAt; payment_failed ให้ renter |
| HOOK-03 | charge.refunded โดย payment_intent เป็น string / expanded object | refunded/refundedAt; payment_refunded ให้ renter |
| HOOK-04 | ไม่มี signature / invalid signature / เปลี่ยน bytes หลัง sign / timestamp หมด tolerance | 400; payment/notification/event-dedupe ไม่เปลี่ยน |
| HOOK-05 | Same event.id ส่งซ้ำแบบ sequential | 200; effect/notification/event row ครั้งเดียว |
| HOOK-06 | New event.id แต่ target state เดิม | 200; same-state notification ไม่เพิ่ม |
| HOOK-07 | Event type ไม่รองรับ, intent ไม่พบ, charge ไม่มี payment_intent | 200; ไม่มี phantom Payment/notification; บันทึก event ตาม code |
| HOOK-08 | Valid signature โดยไม่มี JWT / ส่ง JWT แต่ signature ผิด | valid signature สำเร็จ; JWT ไม่ใช้แทน signature |
| HOOK-09 | Same event.id ส่งพร้อมกัน | Risk: มี dedupe row/effect/notification เดียว; ไม่มี unique-conflict 500 ที่ทำให้ retry ไม่จบ |
| HOOK-10 | DB failure ก่อน/หลัง update และก่อน recordWebhookEvent | Risk: retry ต้อง recover; ไม่ทำ payment/notification ซ้ำหรือเสีย event เงียบ |
| HOOK-11 | failed หลัง paid; succeeded หลัง refunded; duplicate delivery ต่าง id ที่ย้อน state | Risk: financial terminal state ต้องไม่ย้อนผิด; ปัจจุบัน handlers กันเฉพาะ same state ไม่ได้ enforce transition matrix |
| HOOK-12 | Unknown reference มาก่อน Payment row แล้ว provider retry | Risk: ตรวจ event ถูก record ก่อนรู้จัก payment แล้ว retry ถูกข้ามหรือไม่; ต้องรายงาน reconciliation gap |

ใช้ Stripe SDK สร้าง test signature สำหรับ raw payload ของ integration suite ได้ ไม่จำเป็นต้องพึ่ง network ทุกเคส แต่ sandbox E2E ต้องใช้ intent/event ของบัญชี test จริง การยิง random webhook ไม่ผูก booking ไม่พิสูจน์ payment journey

## 12. REVIEW: Rating และ Reviews

| ID | Scenario | Expected |
|---|---|---|
| REVIEW-01 | Renter-owner POST review ของ completed booking | 201; renterId/mateId มาจาก booking; comment omitted เป็น null |
| REVIEW-02 | rating 1/5 และ comment 1000 chars | valid; 0/6/fraction/non-number/>1000 เป็น 400 |
| REVIEW-03 | Booking pending/confirmed/cancelled | 422 BOOKING_NOT_COMPLETED |
| REVIEW-04 | Other renter / mate/admin / missing booking | 404 / 403 / 404 |
| REVIEW-05 | Review booking เดิมซ้ำ/พร้อมกัน | 409 REVIEW_ALREADY_EXISTS; มี review เดียว; unique error ไม่เป็น 500 |
| REVIEW-06 | PATCH own rating/comment อย่างเดียวหรือทั้งคู่ | 200; update ถูก; {} 422 NO_REVIEW_FIELDS_PROVIDED |
| REVIEW-07 | PATCH nonowner รวม admin / missing review | 404; data เดิมไม่เปลี่ยน |
| REVIEW-08 | DELETE author/admin | 200 data=null; row หาย; booking detail.review กลับ null |
| REVIEW-09 | DELETE nonowner mate/renter / missing/repeated delete | 403 / 404 |
| REVIEW-10 | Public /mates/M/reviews หลายหน้า | latest first, renter id/name, averageRating/reviewCount ของทั้งชุดไม่ใช่เฉพาะ page |
| REVIEW-11 | ไม่มี review / หลัง create-update-delete | null average และ 0 count เมื่อว่าง; ค่าเฉลี่ยปัด 1 decimal; public detail/search/filter/sort และ booking detail เปลี่ยนตรงกัน |
| REVIEW-12 | Hidden mate / invalid page/limit / client ฝัง renterId/mateId/bookingId | public 404 / validation 400 / mass-assignment 400 |
| REVIEW-13 | ลบ review แล้วสร้างใหม่สำหรับ completed booking เดิม | อนุญาตตาม current one-row-per-booking rule; ไม่สมมติว่ามี tombstone |

## 13. MSG และ WS: Secure Booking Chat

### 13.1 REST Messages

| ID | Scenario | Expected |
|---|---|---|
| MSG-01 | GET /bookings/B/messages ทั้งสอง participants | 200 oldest-created first; page/meta ถูก; empty เป็น [] |
| MSG-02 | GET history ของ pending/confirmed/completed/cancelled | participants อ่านได้ทุก state ตาม current code; ไม่ mark read อัตโนมัติ |
| MSG-03 | POST โดย renter/mate เมื่อ confirmed/completed | 201; senderId จาก token; persisted row เดียว; readAt=null; แจ้งอีกฝ่าย message_received |
| MSG-04 | POST pending/cancelled | 422 MESSAGE_NOT_ALLOWED; ไม่มี row/notification |
| MSG-05 | GET/POST nonparticipant รวม unrelated admin / missing booking | 404; ไม่เผยว่า booking มีอยู่หรือไม่ |
| MSG-06 | content trim, ภาษาไทย, 1/2000 chars | valid; whitespace-only/empty/>2000/non-string 400 |
| MSG-07 | ส่ง senderId/bookingId/role/readAt ใน REST body | 400; identity กับ booking มาจาก token/path |
| MSG-08 | Bad ID/query/invalid access/expired access | malformed input 400 เมื่อผ่าน auth; unauthenticated 401 |
| MSG-09 | Notification write fail | rollback message; ไม่มี row ที่แจ้งผู้ส่งว่าสำเร็จแต่ transaction ไม่ครบ |
| MSG-10 | POST สองครั้งข้อความเดียวกัน / POST หลัง socket ACK timeout | Risk: ปัจจุบันไม่มี idempotency key; สร้างซ้ำได้; test/report ต้องไม่อ้าง exactly-once delivery |

### 13.2 Socket.IO Authentication และ Events

Authentication rejection ใช้ server event `error {message}` แล้ว disconnect; client อาจเห็น connect ชั่วครู่ก่อน handleConnection เสร็จ จึงไม่ใช้ connect event อย่างเดียวตัดสินว่า authenticate ผ่าน
Business error ที่ handler catch จะเป็น ACK `{ok:false,error}`; DTO validation เกิดก่อน handler และอาจเป็น Nest exception event จึงต้องจับ event จริงพร้อม deadline ไม่เหมารวมว่า error ทุกชนิดเป็น ACK

| ID | Scenario | Expected |
|---|---|---|
| WS-01 | connect ด้วย handshake.auth.token access ที่ออกจาก login | authenticated; join ของ participant ได้ ACK ok |
| WS-02 | query.token อย่างเดียว; missing auth; auth token empty/null/array/object | error + disconnect; ไม่มี authorized action |
| WS-03 | auth invalid + query valid / auth valid + query invalid | แบบแรก reject แบบหลังผ่าน; query ไม่ถูกใช้ fallback |
| WS-04 | Wrong signature, malformed, expired access, refresh token | reject; ทดสอบ wrong type ที่ sign ด้วย access secret แยกด้วย |
| WS-05 | Token ของ user หาย/banned/inactive และ token role เก่า | reject สามกรณีแรก; role จริงอ่านจาก DB ตอนเชื่อมต่อ |
| WS-06 | R1/M1 join_booking {bookingId:B} | ACK ok; join booking:B; repeat join ไม่เพิ่ม broadcast ซ้ำ |
| WS-07 | Outsider/unrelated admin join/send/typing/mark_read และ booking ไม่มี | ACK error; ไม่เข้า room, ไม่เขียน/อ่าน, ไม่ broadcast |
| WS-08 | send_message จาก participant confirmed/completed | ACK ok data; new_message ไปทุก socket ใน room รวม sender ที่ join แล้ว; REST GET พบ message ID เดียวกัน |
| WS-09 | pending/cancelled send_message | ACK error MESSAGE_NOT_ALLOWED; DB/notification/broadcast ไม่เพิ่ม |
| WS-10 | ส่งโดย participant ที่ยังไม่ join room | authorization ตาม booking ยังผ่าน; DB เขียนได้; ผู้ส่งไม่ได้ room broadcast แต่ได้ ACK ตาม code |
| WS-11 | typing true/false | broadcast bookingId/userId/isTyping เฉพาะคนอื่นใน room; sender ไม่ได้ echo; ไม่บันทึก DB/notification |
| WS-12 | mark_read เมื่อมี unread ของอีกฝ่ายหลายข้อความ | update ทุกข้อความอีกฝ่ายที่ unread; own messages ไม่เปลี่ยน; ACK updatedCount และ room messages_read ตรง |
| WS-13 | mark_read ซ้ำ/ไม่มี unread | updatedCount=0; readAt เดิมไม่เปลี่ยน; notification.isRead เป็นคนละระบบ |
| WS-14 | leave_booking และ leave ห้องที่ไม่ได้อยู่ | ACK ok, no-op ได้; หลัง leave ไม่ได้รับ room broadcast; กลับ join ได้ |
| WS-15 | สอง bookings/สาม clients/multi-device | ไม่มี cross-room leak; room เดียวได้รับถูกจำนวน; senderId ปลอมใช้ไม่ได้ |
| WS-16 | bookingId missing/string/fraction/negative, content invalid, isTyping ไม่เป็น boolean, extra identity fields | validation reject ก่อน business effect; ตรวจ exception/ACK จริง ไม่ปล่อย test ค้าง |
| WS-17 | Disconnect/reconnect | disconnect ออกจาก rooms; reconnect ต้อง auth ใหม่และ join ใหม่; REST history/readAt ยังอยู่ |
| WS-18 | Token หมดอายุ/ถูก ban/inactive หลัง connected แล้ว | Risk/characterization: code authenticate ครั้งเดียวตอน connect; event หลังจากนั้นอาจยังผ่าน; reconnect ต้อง reject |
| WS-19 | pending/cancelled join, typing, mark_read | participant check ยังอนุญาต; send เท่านั้นที่ gate state; รักษาความต่างนี้ใน assertion |
| WS-20 | ส่ง REST ขณะมี sockets join | persistence/notification เกิด; ปัจจุบัน REST controller ไม่ emit new_message เอง; ไม่คาดหวัง push ที่ไม่มี |
| WS-21 | malformed leave_booking payload | Risk: ไม่มี DTO pipe บน handler นี้; ตรวจว่าไม่ crash process/ไม่กระทบ room อื่น; record actual behavior |

## 14. NOTIFY: Notifications

| ID | Scenario | Expected |
|---|---|---|
| NOTIFY-01 | GET notifications ทุก role | 200 data.notifications เฉพาะ own, newest first; ไม่มี pagination ใน route นี้ |
| NOTIFY-02 | unreadOnly true/false/omitted | true เฉพาะ isRead=false; false/omitted ได้ทั้งหมด |
| NOTIFY-03 | PATCH own notification/read; ทำซ้ำ | 200 data.notification.isRead=true; ซ้ำไม่มีผลเพิ่ม |
| NOTIFY-04 | PATCH notification คนอื่น / ไม่มี | 403 / 404; ไม่ใช่ 404 ทั้งสองกรณี |
| NOTIFY-05 | PATCH read-all มีหลาย unread | data.updated เท่าจำนวนที่เปลี่ยน; account อื่นคงเดิม; ทำซ้ำได้ 0 |
| NOTIFY-06 | Booking lifecycle notifications | booking_requested -> mate; confirmed/declined/completed -> renter; cancelled -> participants ยกเว้น actor |
| NOTIFY-07 | Payment/webhook notifications | paid/failed/refunded -> renter หลัง webhook; pending/refunding ยังไม่ใช่ final notification |
| NOTIFY-08 | Message จาก REST และ WS | message_received เฉพาะอีกฝ่าย; ไม่ส่งกลับผู้ส่ง; bookingId ถูก |
| NOTIFY-09 | Sequential idempotent action/replayed webhook | ไม่สร้าง notification ซ้ำ; rejected mutations ไม่สร้าง notification |
| NOTIFY-10 | Read notification เทียบกับ mark_read chat | notification.isRead กับ message.readAt ไม่เปลี่ยนแทนกัน |
| NOTIFY-11 | unreadOnly=invalid text | characterization: DTO แปลงเป็น false ปัจจุบัน; stricter invalid-input policy เป็น Gap ไม่ตั้ง 400 โดยเดา |

## 15. ADMIN, REPORT และ ANALYTICS

### 15.1 Admin Management

| ID | Scenario | Expected |
|---|---|---|
| ADMIN-01 | ทุก /admin route และ refund ด้วย guest/renter/mate/admin | guest 401, nonadmin 403, admin ผ่านไป business rules |
| ADMIN-02 | GET users q/role/isBanned/isActive/isVerified และ pagination | q match name/email case-insensitive; filters AND; latest-created first; safe fields ไม่มี password |
| ADMIN-03 | Query invalid role/page/limit/q และ boolean strings | invalid enum/pagination/q 400; boolean true/false ถูก; arbitrary text ปัจจุบันแปลง false ต้องบันทึก Gap ถ้าต้องการ strict validation |
| ADMIN-04 | Ban user มี active refresh >=3 ตัว | 200; DB flags/reason/timestamp; Risk: ทุก refresh ต้อง revoked; old access HTTP 403, login 403, reconnect WS reject |
| ADMIN-05 | Ban ตนเอง / user ไม่มี / reason ว่างหรือ>1000 | 403 / 404 / 400; ไม่มี mutation |
| ADMIN-06 | Unban user | flag/reason/timestamp ล้าง; login ใหม่ได้; revoked refresh เดิมไม่กลับ active |
| ADMIN-07 | Activate inactive renter/mate | User active; ถ้า mate มี profile ให้ profile active ด้วย; ไม่เปลี่ยน isBanned โดยอัตโนมัติ |
| ADMIN-08 | Verify mate / renterหรือadmin / user ไม่มี | 200 isVerified=true / 422 / 404; ไม่ยกระดับ role |
| ADMIN-09 | Repeat ban/unban/activate/verify | state ไม่เสีย, ไม่มี duplicate user/profile; timestamp ใช้พฤติกรรมปัจจุบัน ไม่สมมติ immutable |
| ADMIN-10 | GET admin/bookings ทุก status/mateId/renterId/date/dateFrom/dateTo/page/limit | ข้ามทุก user ได้; filters AND; dateTo inclusive Bangkok day; names/amount/status ตรง DB |
| ADMIN-11 | date ผิด calendar/format, range reversed/combined filters, ID ไม่พบ | invalid calendar/format 400; reversed range ปัจจุบันไม่มี explicit reject ต้องบันทึก actual result; ไม่ 500 |
| ADMIN-12 | Admin cancel/complete/refund/review-delete ใน moderation journey | ใช้ existing endpoints และ state rules; ไม่สมมติว่ามี generic admin update/delete endpoint |

### 15.2 Reports

| ID | Scenario | Expected |
|---|---|---|
| REPORT-01 | POST targetType=user/mate | 201 report open; reporterId มาจาก token; reason trim; target ต้องมี |
| REPORT-02 | Report own user/profile | 400; ไม่มี report |
| REPORT-03 | Report booking โดย renter/mate participant | 201; outsider 403; target ไม่มี 404 |
| REPORT-04 | Report review โดย author หรือ mate เจ้าของ profile | 201; unrelated user 403 |
| REPORT-05 | Report message โดย booking participant | 201; unrelated 403; target ไม่มี 404; Message model มีจริงใน current contract |
| REPORT-06 | targetType ผิด/ID<=0/noninteger/reason blank/>1000/extra fields | 400; ไม่รับ reporterId/status/resolvedById จาก client |
| REPORT-07 | GET admin/reports status และ pagination | เฉพาะ admin; latest first; reporter summary ถูก; ไม่มีข้อมูลลับ |
| REPORT-08 | PATCH report เป็น reviewed/dismissed/actioned พร้อม note | 200; resolvedById เป็น admin, resolvedAt และ trimmed note; GET เห็น state |
| REPORT-09 | status=open/unknown หรือ note>1000 / report ไม่มี | 400 / 404; ไม่เปลี่ยน target |
| REPORT-10 | Resolve ซ้ำ/เปลี่ยน status resolved | characterization: code ยอมให้ update ซ้ำและเปลี่ยน resolvedAt; ไม่สมมติว่า transition ถูกปิด |
| REPORT-11 | Mark actioned แล้วตรวจ target user/review/message | ปัจจุบันไม่ได้ ban/delete อัตโนมัติ; moderation ต้องเรียก endpoint แยก |
| REPORT-12 | Notification report_resolved | Gap: enum มีแต่ resolveReport ยังไม่สร้าง notification; ไม่อ้างว่ามี flow นี้แล้ว |

### 15.3 Analytics

| ID | Scenario | Expected |
|---|---|---|
| ANALYTICS-01 | GET ไม่มี from/to | 200 ช่วง 30 วันรวมวันนี้ ตาม Asia/Bangkok; daily ครบทุกวัน |
| ANALYTICS-02 | ระบุช่วง 1 วัน/365 วัน/366 วัน/from>to/calendar invalid | 1/365 valid; 366/from>to/invalid 400 |
| ANALYTICS-03 | Seed bookings ทุก status ข้ามขอบช่วงเวลา | bookingCounts นับ createdAt ในช่วง [from midnight, to+1 midnight) และแยก status ถูก |
| ANALYTICS-04 | Payments paid/pending/failed/refunding/refunded และ paidAt ขอบช่วง | paidRevenue รวมเฉพาะ status=paid และ paidAt ในช่วง; ไม่ใช่ sum booking price ทั้งหมด |
| ANALYTICS-05 | Users active/inactive สร้างใน/นอกช่วง | newActiveUsers ตาม isActive และ createdAt; ไม่ใช่ active sessions หรือ daily active users |
| ANALYTICS-06 | Daily gaps, Bangkok midnight, decimal amounts | วันไม่มีข้อมูลเป็น 0; sum daily ตรง totals; monetary rounding ถูก; ไม่มี NaN |
| ANALYTICS-07 | Refund payment แล้วอ่าน analytics ซ้ำ | current-status revenue ไม่รวม payment ที่ refunding/refunded แล้ว แม้เคย paid; ไม่อ้างว่าเป็น immutable accounting ledger |
| ANALYTICS-08 | DB จริงใช้ aggregation/raw SQL paths | ผลเท่ากับ fixture oracle; unit mocks ของ fallback paths ไม่ใช้แทนผลนี้ |

## 16. VALID, SEC และ PERF: Cross-Cutting

ใช้ validation/security matrix กับ **ทุก protected route และทุก mutation** ใน inventory โดยเตรียม valid resource/state ก่อนทดสอบ error ที่ต้องการ หลีกเลี่ยง false positive จาก guard ที่ reject ก่อนถึง validation

| ID | Scenario | Expected / Evidence |
|---|---|---|
| VALID-01 | Missing/invalid/null/array/object/unknown fields ทุก DTO | ตรวจ HTTP result และไม่มี unintended DB mutation; null บน optional fieldsต้องตรวจเฉพาะจริง ไม่เหมารวมว่าถูก reject |
| VALID-02 | Path/query coercion และ pagination ทุก endpoint ที่รองรับ | ตาม @Type/@Transform และ ParseIntPipe; invalid ไม่ 500; page default/bounds/meta ครบ |
| VALID-03 | Response contract ทุก endpoint | success/exception/root/webhook/204 ตามข้อ 4; nested structures และ empty/null ถูก |
| VALID-04 | Decimal/Temporal serialized ผ่าน HTTP จริง | valid JSON, ISO timestamp และเงินไม่มี precision loss; public mate rate เป็น number, booking/payment อาจเป็น decimal representation จาก ORM |
| SEC-01 | Missing/malformed/expired/wrong-signature/wrong-type token ทุก protected route | 401; signed access test token type=refresh ต้องไม่ผ่าน; ห้าม bypass guard เพื่อทดสอบ |
| SEC-02 | DB role เปลี่ยนหลัง token ออก | HTTP authorization ใช้ role ปัจจุบัน; forged payload/client identity ไม่ยกระดับสิทธิ์ |
| SEC-03 | Banned/inactive accounts ใช้ old access กับ routes ที่ไม่มี @Roles | 403 จาก JwtStrategy; RolesGuard ทำ role check ไม่ใช่ ban lookup |
| SEC-04 | IDOR ข้าม renter/mate/admin บนทุก resource ID | 403/404 ตาม ownership matrix; ไม่มี response/side effect/broadcast รั่วไปคนไม่เกี่ยวข้อง |
| SEC-05 | SQL-like payload ใน q/name/bio/reason/message และ numeric params | ไม่ bypass filters/auth, ไม่ทำ destructive SQL, schema/data อื่นคงอยู่; string ที่ยอมรับเก็บเป็นข้อมูล |
| SEC-06 | XSS payload ใน profile/review/message/report | API ไม่ execute; privacy/input rules ยังทำงาน; browser rendering ต้อง escape ใน UI suite ที่ยัง Gap |
| SEC-07 | Cross-origin mutation ไม่มี Bearer / มี cookie อย่างเดียว | protected 401; CORS ตาม ENV-07; ไม่อ้างว่ามี CSRF token mechanism เพราะปัจจุบันใช้ Authorization bearer |
| SEC-08 | Password/hash/refresh token/storage credentials ใน API/errors/logs | ไม่รั่ว; negative assertions รวม nested own mate profile และ admin lists |
| SEC-09 | Refresh revoke จาก logout/password change/ban | ตรวจทุก session ที่ต้อง revoke; exact jti/hash semantics; ไม่ทำให้ session คนอื่นเสีย |
| SEC-10 | Wrong signing algorithm/unsigned JWT/missing or invalid subject | Risk: authentication ต้อง reject ไม่ 500; ตรวจ verifier จริงและบันทึก payload-validation gaps |
| PERF-01 | Search และ public profile กับข้อมูล 100/1,000/10,000 mates, reviews/photos/booking slots | วัด end-to-end latency หลัง warmup; requirement <2s; รายงาน p50/p95/max และจำนวน request ที่เกิน 2s |
| PERF-02 | Combined filters, late pagination, public availability ภายใต้ concurrent reads | ผลถูกกับ stable dataset; ไม่ timeout/500; บันทึก fixture size/concurrency/CPU/DB/network เพื่อเทียบซ้ำได้ |
| PERF-03 | Proposed baseline 100 reads ต่อ scenario ที่ concurrency 1 และ 10 | เป็น test workload ที่เสนอ ไม่ใช่ SLA ที่เจ้าของกำหนดเพิ่ม; อย่าเฉลี่ยกลบ slow requests |
| PERF-04 | History/admin lists/analytics และ multi-client chat | ไม่รั่ว resource/connection; latency/throughput เป็นข้อมูลวัด ไม่ตั้ง SLA ที่ไม่มี requirement |
| PERF-05 | Race/retry suites | ตรวจ rows/notifications/objects/provider effects หลัง concurrent requests; flaky failure ถือ Risk ที่ต้องสืบ ไม่ retry จนเขียวแล้วปิด |

## 17. JOURNEY: Complete User Flows

ทุก journey เป็น case อิสระ ใช้ fixtures เฉพาะและตรวจ persistence หลังแต่ละ transition ไม่พึ่งลำดับของ test files

### JOURNEY-01: สมัครจนจบ session และ review

1. Register R1/M1 -> login -> GET account profiles
2. M1 สร้าง profile + interests/activities/location/rate -> upload photo -> ตั้ง weekly availability
3. R1 อ่าน lookups -> search ด้วย location/interest/activity/availableDate -> เปิด public profile/reviews/open slots
4. R1 จอง 90 นาที -> ตรวจราคา/slot ถูก block -> M1 ได้ booking_requested
5. M1 accept -> R1 เห็น confirmed และ booking_confirmed
6. R1 เริ่ม payment -> pending -> confirm ผ่าน Stripe sandbox -> signed webhook -> paid และ payment_paid
7. R1/M1 connect ด้วย auth.token -> join -> send/typing/mark_read -> REST history และ notification ถูก
8. ใช้ controlled test time/booking time fixture หลัง session -> M1 complete -> R1 ได้ booking_completed
9. R1 review -> public rating/search/booking detail แสดง -> edit review -> aggregates เปลี่ยน -> delete แล้ว aggregates กลับถูก
10. อ่าน notification/read-all -> logout R1 -> refresh เดิม 401; M1 session ยังใช้ได้

### JOURNEY-02: Decline และ Slot Release

R1 จอง -> M1 decline -> cancelled/booking_declined -> open slot กลับ -> R2 จองช่องเดิมได้ -> R1 send/pay/review booking เดิมถูก state rules reject

### JOURNEY-03: Cancel Paid Booking และ Refund

Confirmed booking -> paid ผ่าน webhook -> renter หรือ mate cancel ก่อน start -> cancelled + refunding -> charge.refunded -> refunded/notification -> refund/cancel ซ้ำไม่ทำ provider effect เพิ่ม -> analytics revenue สะท้อนสถานะปัจจุบัน; ทำ variant admin cancel และตรวจผู้รับทั้งสองคน

### JOURNEY-04: Payment Failure และ Retry

Confirmed -> payment pending -> failed webhook -> failed notification -> retry -> confirm -> paid; มี payment row เดียวและ provider effect ตรงยอด -> จบ booking/review ได้ตาม state

### JOURNEY-05: Session Rotation และ Account Security

Login หลายอุปกรณ์ -> rotate A -> refresh A เก่า 401 -> logout A ใหม่ -> B ยังใช้ได้ -> เปลี่ยน password -> ทุก refresh เดิม 401 -> login password ใหม่ -> admin ban -> HTTP/WS reconnect reject -> unban -> login ใหม่ได้แต่ revoked token ไม่คืนชีพ

### JOURNEY-06: Report และ Moderation

ผู้เกี่ยวข้อง report booking/review/message -> admin list/filter -> reviewed/actioned + note -> admin ban user/delete review/refund ผ่าน endpoint ที่มี -> public visibility/rating/payment/analytics เปลี่ยน -> report ยังอ้าง targetId เดิมได้ -> ไม่มี implicit moderation หรือ notification ที่ code ไม่ได้สร้าง

### JOURNEY-07: Profile Deactivation และ Reappearance

M1 มี photos/reviews/bookings -> DELETE /mates/me -> search/public hidden แต่ own account ยัง login ได้ -> ห้ามจองใหม่ -> admin activate -> กลับค้นพบพร้อม historical data; historical booking read ไม่สูญหาย

### JOURNEY-08: Chat Disconnect และ REST Recovery

ทั้งคู่ join/send -> ตัด client connection -> ส่งข้อความอีกฝ่าย -> reconnect/auth/join ใหม่ -> GET history เติมข้อความที่พลาดด้วย ID -> mark_read; ACK timeout ต้องตรวจ history ก่อนสรุปว่าจะ resend เพราะไม่มี server dedup

## 18. Gaps และ Risks ที่ต้องเปิดเผยในผลทดสอบ

รายการนี้มาจาก code/requirements review ยังไม่ใช่ผล runtime ของ E2E ใหม่

| ID | หลักฐาน | ผลต่อแผนทดสอบ |
|---|---|---|
| GAP-01 | ไม่พบ frontend source/package | UI/responsive/accessibility/client validation/state/animation และ full-stack completion ยังตรวจไม่ได้ |
| GAP-02 | ไม่พบ Swagger/OpenAPI/Postman collection | DOC suite ยัง Gap; Markdown guides ไม่เท่ากับ API documentation requirement นี้ |
| GAP-03 | DTO age @Min(18) แต่ requirement age >18 | เก็บ current behavior 18 valid พร้อม requirement gap ไม่เปลี่ยน expected ให้กลบความต่าง |
| GAP-04 | Booking ไม่มี DELETE/reschedule; messages ไม่มี PATCH/DELETE | CRUD requirement ยังไม่ครบ; ไม่สร้างชื่อ endpoint ปลอมใน test plan |
| GAP-05 | Calendar มีเฉพาะ recurring weekly windows | Specific-date overrides/calendar UI ยังไม่มี; availableDate เป็น filter รายวันไม่ใช่ setter |
| GAP-06 | Report resolution ไม่สร้าง notification; enum report_resolved มี | NOTIFY/REPORT ไม่อ้างว่า notification นี้ทำงานแล้ว |
| RISK-01 | BookingsService.create อ่าน overlap ก่อน create; ไม่มี exclusion/locking ใน contract | BOOK-24 ต้องตรวจ concurrency จริง; การผ่าน sequential tests ไม่พิสูจน์ double-booking protection |
| RISK-02 | UsersService.changePassword และ AdminService.banUser ใช้ RefreshToken.where(...).update | ORM ใน repo ระบุ update เปลี่ยนหนึ่ง row; ต้องตรวจหลาย sessions ด้วย USER-08/ADMIN-04 |
| RISK-03 | MatesService.getProfileByMate ใส่ user record ลง response โดยตรง | MATE-12/SEC-08 ตรวจ nested password/hash จริง; type annotation ไม่ใช่ serializer |
| RISK-04 | Webhook check/process/record ไม่อยู่ transaction เดียวกัน และ handlers กันเฉพาะ same state | HOOK-09 ถึง HOOK-12 ตรวจ duplicate, race, reordered event และ replay |
| RISK-05 | PaymentsService.pay/refund เรียก provider ภายใน DB transaction | External effect rollback ตาม DB ไม่ได้; ต้องวัด recovery/retry/reconciliation |
| RISK-06 | WsJwtGuard ตรวจตอน connect ครั้งเดียว | WS-18 ไม่รับรอง ban/expiry บน connection เดิม; แยกจาก reconnect reject |
| RISK-07 | MessagesService.create ไม่มี client message ID/dedup | ACK timeout + REST resend อาจซ้ำ; MSG-10/JOURNEY-08 |
| RISK-08 | Optional DTO fields รับ null และ boolean transforms แปลง invalid text เป็น false | VALID-01 และ filter tests ตรวจข้อมูลผิดโดยไม่สมมติ strictness ที่ไม่มี |
| RISK-09 | Availability/profile/gallery ใช้ check-then-write หลายจุด | race tests ตรวจ unique violations, partial writes, orphan objects และ max gallery size |
| GAP-07 | Payment ใช้ Stripe; ไม่มี free-payment bypass | ใช้ sandbox เพื่อทดสอบไม่คิดเงินจริง; ความหมาย free approach เชิงธุรกิจยังไม่ได้ implement เพิ่ม |
| GAP-08 | ไม่พบ deployed URL/CI workflow/Mate Match | DEPLOY/FUTURE ยัง pending ตาม optional requirements |

ข้อคลาดเคลื่อนในเอกสารเดิมที่ต้องหลีกเลี่ยงเมื่อนำแผนไปใช้:

- `docs/chat-client-guide.md` ยังกล่าวถึง query token fallback แต่ guard ปัจจุบันรับเฉพาะ auth.token
- `docs/quick-test-flow.md` ใช้ /messages แบบ flat, auth status 200 และ profile ตัวอย่างไม่มี interestIds ซึ่งไม่ตรง current routes/DTO
- `docs/payment-stripe-guide.md` มีตัวอย่าง cancel เป็น POST แต่ controller ใช้ PATCH; refund REST ซ้ำเป็น 422 ตาม service
- `test/README.md` เสนอชื่อ `bookings.e2e.spec.ts` แต่ E2E config match `*.e2e-spec.ts`
- ตัวอย่าง old flow ที่ใช้ global IDs, fixed dates, role=mate จองแล้วคาด 400, notification คนอื่นคาด 404 และ cleanup หลังทุก case ทั้งที่พึ่ง state เดิม ไม่ใช้เป็น template อีก
- เปลี่ยนเฉพาะเอกสารนี้; รายการข้างต้นไม่ได้หมายความว่าไฟล์อื่นถูกแก้ตามแล้ว

## 19. UI, DOC, DEPLOY และ FUTURE: Acceptance เมื่อพร้อม

| ID | Flow ที่ต้องตรวจ | Preconditions / Expected |
|---|---|---|
| UI-01 | Register/login/profile validation | มี frontend; error field ชัด, age policy ตรง requirement ที่ตกลง, duplicate-submit ไม่สร้างซ้ำ |
| UI-02 | Search/filter/page -> profile -> booking -> payment -> chat -> complete -> review | ใช้ backend/providers จริงใน test; navigation/state/loading/empty/error ทำงานตลอด journey |
| UI-03 | Mobile 360x800, tablet 768x1024, desktop 1440x900 | ไม่มี overflow/overlap, controls อ่านและกดได้, image/file upload, chat keyboard และ payment form ใช้งานได้ |
| UI-04 | Keyboard/focus/form labels/error feedback | ใช้งาน core journey ได้ด้วย keyboard; focus ไม่หายหลัง modal/navigation |
| UI-05 | Browser refresh/back/multi-tab/session expired/logout | state ถูก, clear sensitive state เมื่อ logout; refresh retry ไม่วนไม่รู้จบ; optional state library ไม่ใช่ตัววัดความสำเร็จ |
| UI-06 | XSS strings, untrusted image URL, CSRF/cross-origin, token exposure | browser ไม่ execute user content; ไม่ใส่ JWT ใน URL; ตรวจ auth/token handling ตาม client ที่ implement จริง |
| UI-07 | Animations / reduced motion | optional; ไม่ขวาง interaction และเคารพ user preference เมื่อมี |
| DOC-01 | Swagger/OpenAPI หรือ Postman collection | ทุก endpoint/role/DTO/response/error/refresh flow ตรง inventory; auth และ multipart/raw webhook documented; ไม่มี secret จริง |
| DEPLOY-01 | Deployed smoke + isolated journey | HTTPS, configured CORS/prefix, public image access, WS reconnect, webhook delivery และ provider connectivity |
| DEPLOY-02 | Release/restart | persisted sessions/bookings/notifications อยู่, sockets reconnect; ระบุ version และ deployment URL ใน report |
| FUTURE-01 | Mate Match | เริ่มตรวจเมื่อมี specification/implementation; relevance และ permission/visibility ถูก ไม่แนะนำ hidden mates |

## 20. Implementation Order และเกณฑ์จบงานทดสอบ

ชื่อไฟล์ด้านล่างเป็นข้อเสนอสำหรับงาน implementation ภายหลัง ยังไม่ได้สร้างในงานเอกสารนี้ และต้องลงท้าย `.e2e-spec.ts` เพื่อให้ถูกเลือกโดย E2E config

| ลำดับ | Proposed file | Case groups |
|---|---|---|
| 1 | app.e2e-spec.ts, auth.e2e-spec.ts, users.e2e-spec.ts | ENV, AUTH, USER, VALID/SEC พื้นฐาน |
| 2 | mates.e2e-spec.ts, availability.e2e-spec.ts, discovery.e2e-spec.ts, photos.e2e-spec.ts | LOOKUP, MATE, AVAIL, SEARCH, PHOTO |
| 3 | bookings.e2e-spec.ts, reviews.e2e-spec.ts | BOOK, REVIEW |
| 4 | payments.e2e-spec.ts, stripe-webhook.e2e-spec.ts | PAY, HOOK |
| 5 | messages.e2e-spec.ts, chat.e2e-spec.ts, notifications.e2e-spec.ts | MSG, WS, NOTIFY |
| 6 | admin.e2e-spec.ts, reports.e2e-spec.ts, analytics.e2e-spec.ts | ADMIN, REPORT, ANALYTICS |
| 7 | journeys.e2e-spec.ts, security.e2e-spec.ts, concurrency.e2e-spec.ts | JOURNEY, cross-route SEC/VALID, Risk cases |
| 8 | performance.e2e-spec.ts และ browser suite เมื่อมี frontend | PERF, UI/DOC/DEPLOY ตามความพร้อม |

คำสั่งอ้างอิงเมื่อ implement และเตรียม environment แล้ว (รันจาก backend):

```sh
npm run test:e2e
npm run test:e2e -- --reporter=verbose
npm run test:e2e -- test/auth.e2e-spec.ts
npm run test:e2e -- test/chat.e2e-spec.ts
npm run test:e2e -- --no-file-parallelism
```

ขณะนี้คำสั่ง E2E ยังมีแค่ root smoke test ให้รัน ไม่ใช้ `npm run test` ซึ่งเลือก `*.spec.ts` มาอ้างว่าได้รัน `*.e2e-spec.ts` แล้ว และไม่ถือว่า build ผ่านแปลว่า test files ถูก typecheck เพราะ tsconfig.build.json exclude tests

เกณฑ์ยืนยัน coverage เมื่อทำ executable tests จริง:

1. ทุก endpoint/event ใน inventory มี positive case และ auth/role/ownership/validation/state case ที่เกี่ยวข้อง
2. ทุก requirement มี case ID หรือ Gap/Blocked พร้อมเหตุผล; optional feature ที่ implement แล้วต้องทดสอบด้วย
3. AUTH logout/refresh, JWT secret fail-fast และ WS auth-only regression ผ่าน transport จริง
4. Positive mutations ตรวจ response, DB persistence, notifications และ provider/broadcast ที่เกี่ยวข้อง; rejected mutations ไม่มี side effect
5. Risk cases มีผลจริงทั้ง sequential/concurrent/retry พร้อมหลักฐาน ไม่แปลง failure เป็น skip หรือยอมรับ status ใดก็ได้
6. Provider-mocked, sandbox, MinIO, performance และ browser results แยกกัน; missing credentials/frontend ไม่ถูกนับ Pass
7. Run เดี่ยว, run ซ้ำ และ full suite ให้ผลสม่ำเสมอ ไม่มี shared-state dependency หรือ resource leak
8. รายงาน case ID, actor, request/event ที่ปกปิด credentials, expected/actual, DB/provider evidence, duration, environment, commit under test และสถานะ
9. API endpoint coverage / requirement coverage / code coverage เป็นคนละตัวเลข; ห้ามอ้าง 100% system coverage จาก root smoke หรือ unit coverage เพียงอย่างเดียว
10. การแก้ application/เพิ่ม executable tests/config เพื่อปิด Gap เป็นงานถัดไป; เอกสารนี้ไม่อนุญาตให้เปลี่ยนไฟล์อื่นโดยอัตโนมัติ
