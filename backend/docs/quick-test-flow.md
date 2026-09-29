# Quick Test Flow (README)

Flow ทดสอบคร่าวๆ แบบสั้น: register → login → booking → message (REST) → chat (Socket.IO)

รันตามลำดับ 1-12 ห้ามข้าม เพราะ step หลังใช้ค่าจาก step ก่อน

## Prerequisite

- รัน `npm run seed` ก่อน 1 ครั้ง (สร้างแค่ Province/District/Activity/Interest เท่านั้น ไม่สร้าง user)
- ต้องรู้ `activityId` และ `provinceId`/`districtId` จริงในเครื่อง (เปิด prisma studio หรือ query DB ดู) — ตัวอย่างด้านล่างสมมติ `activityId=2`
- server รันอยู่ที่ `http://localhost:3000`

## REST Flow (step 1-9)

| # | Case | Method | Endpoint | Body | Expected |
|---|------|--------|----------|------|----------|
| 1 | สมัคร renter | POST | `/auth/register` | `{"name":"Test Renter","email":"quicktest.renter@test.com","password":"password123","role":"renter"}` | 201 |
| 2 | สมัคร mate | POST | `/auth/register` | `{"name":"Test Mate","email":"quicktest.mate@test.com","password":"password123","role":"mate"}` | 201 |
| 3 | login renter → เก็บ `renterToken` | POST | `/auth/login` | `{"email":"quicktest.renter@test.com","password":"password123"}` | 200, save `data.accessToken` |
| 4 | login mate → เก็บ `mateToken` | POST | `/auth/login` | `{"email":"quicktest.mate@test.com","password":"password123"}` | 200, save `data.accessToken` |
| 5 | mate สร้างโปรไฟล์ (Bearer `mateToken`) | POST | `/mates` | `{"age":25,"bio":"รับจ้างเดินเล่นเป็นเพื่อน","hourlyRate":300,"provinceId":10,"districtId":1011,"activityIds":[2]}` | 201, save `data.mate.id` → `mateId` |
| 6 | mate เปิดเวลาว่าง วันจันทร์ 09:00-18:00 (Bearer `mateToken`) | POST | `/mates/me/availability` | `{"dayOfWeek":1,"startTime":"09:00","endTime":"18:00"}` | 201 |
| 7 | renter จองคิว (Bearer `renterToken`, เลือกวันจันทร์ในอนาคต) | POST | `/bookings` | `{"mateId":"{{mateId}}","activityId":2,"date":"2026-09-21","startTime":"10:00","endTime":"11:00"}` | 201, save `data.id` → `bookingId` |
| 8 | mate ยืนยันรับงาน (Bearer `mateToken`) | PATCH | `/bookings/{{bookingId}}/accept` | - | 200, status = `confirmed` |
| 9 | renter ส่งข้อความทัก mate ผ่าน REST (Bearer `renterToken`) | POST | `/messages` | `{"bookingId":"{{bookingId}}","content":"สวัสดีครับ ถึงหน้าบ้านกี่โมงดีครับ"}` | 201 |

> booking ต้องเป็นสถานะ `confirmed`/`completed` เท่านั้นถึงจะส่งข้อความได้ (ตาม RBAC ของ messages)

## Chat Flow ผ่าน Socket.IO (step 10-12)

ขอ single-use ticket ใหม่สำหรับ renter และ mate จาก `POST /auth/socket-ticket` พร้อม
Bearer access token ของแต่ละคน แล้วเปิด Postman **New → Socket.IO Request** 2 tab
เชื่อมไปที่ `http://localhost:3000` namespace `/chat` โดยใส่ ticket ใน `auth.ticket`:

```json
{ "ticket": "{{mateSocketTicket}}" }
```

Ticket หมดอายุเร็วและใช้ได้เพียงครั้งเดียว จึงต้องสร้างใหม่ก่อนเชื่อมต่อแต่ละครั้ง
และห้ามใส่ ticket ใน query string.

| # | Case | ฝั่งไหน | Event | Payload | Expected |
|----|------|---------|-------|---------|----------|
| 10 | mate join ห้อง booking | mate tab | `join_booking` | `{"bookingId":{{bookingId}}}` | ack `{ok:true}` |
| 11 | mate ตอบกลับผ่าน socket | mate tab | `send_message` | `{"bookingId":{{bookingId}},"content":"อีก 10 นาทีถึงครับ"}` | ack `{ok:true, data:{...}}`; renter tab (ถ้า join ห้องไว้ด้วย) จะได้รับ broadcast event `new_message` |
| 12 | renter อ่านข้อความ mark read | renter tab | `mark_read` | `{"bookingId":{{bookingId}}}` | ack `{ok:true}`; ยืนยันด้วย `GET /messages?bookingId={{bookingId}}` (REST) ว่า `readAt` ของข้อความ mate ไม่เป็น `null` แล้ว |

## หมายเหตุ

- ห้ามส่งข้อความเดียวกันซ้ำทั้ง REST (`POST /messages`) และ Socket.IO (`send_message`) — เลือกทางใดทางหนึ่งต่อการส่ง 1 ครั้ง ไม่งั้นข้อความจะถูกบันทึกซ้ำ (ดูรายละเอียดที่ [chat-client-guide.md](./chat-client-guide.md))
- ถ้าไม่ join ห้อง (`join_booking`) ก่อน จะไม่ได้รับ broadcast `new_message` ของฝั่งตรงข้าม
