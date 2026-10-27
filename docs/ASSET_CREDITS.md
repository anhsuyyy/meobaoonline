# Asset Credits

## Asset gốc của dự án

- Atlas hiện chỉ là mẫu pipeline/procedural placeholder, không phải art cuối.

## Asset bên thứ ba

- Bộ asset runtime Ngọc Rồng Online được trích từ `SRC NRO NEW 01.rar` do người dùng cung cấp; archive giữ local tại `client/nro-source-archive/`, còn build chỉ đóng gói subset do `client/scripts/prepareNroRuntimeAssets.mjs` tham chiếu. Quyền phân phối ngoài phạm vi dự án chưa được xác minh.
- Font **Nunito Variable** dùng cho UI và chữ Phaser: package `@fontsource-variable/nunito@5.3.0`, tự host trong build Vite để không phụ thuộc CDN; nguồn Fontsource/Nunito, license SIL Open Font License 1.1. Package có subset `latin-ext`/`vietnamese` và hỗ trợ weights 200–1000.
