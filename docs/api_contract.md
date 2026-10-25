# 🔐 HTTP REST API Contract — Mèo Đa Vũ Trụ Online (V2.0)

Base URL: `http://localhost:3000/api`

---

## 1. Đăng Ký Tài Khoản
- **Endpoint**: `POST /api/auth/register`
- **Request Body**:
```json
{
  "username": "catwarrior",
  "password": "secretpassword123",
  "email": "cat@universe.io" // tùy chọn
}
```
- **Response `201 Created`**:
```json
{
  "user": {
    "id": "671...",
    "username": "catwarrior",
    "email": "cat@universe.io",
    "createdAt": "2026-10-25T..."
  },
  "token": "eyJhbGciOiJIUzI1NiIsIn..."
}
```
- **Lỗi `400 Bad Request`**: `{ "error": "Tên đăng nhập đã tồn tại" }` hoặc `{ "error": "Mật khẩu phải có ít nhất 6 ký tự" }`.

---

## 2. Đăng Nhập Tài Khoản
- **Endpoint**: `POST /api/auth/login`
- **Request Body**:
```json
{
  "username": "catwarrior",
  "password": "secretpassword123"
}
```
- **Response `200 OK`**:
```json
{
  "user": {
    "id": "671...",
    "username": "catwarrior",
    "email": "cat@universe.io",
    "createdAt": "2026-10-25T..."
  },
  "token": "eyJhbGciOiJIUzI1NiIsIn..."
}
```
- **Lỗi `401 Unauthorized`**: `{ "error": "Tài khoản hoặc mật khẩu không chính xác" }`.

---

## 3. Lấy Thông Tin Tài Khoản Hiện Tại
- **Endpoint**: `GET /api/auth/me`
- **Headers**: `Authorization: Bearer <token>`
- **Response `200 OK`**:
```json
{
  "id": "671...",
  "username": "catwarrior",
  "email": "cat@universe.io",
  "createdAt": "2026-10-25T..."
}
```
- **Lỗi `401/403`**: `{ "error": "Yêu cầu token xác thực hợp lệ" }`.
