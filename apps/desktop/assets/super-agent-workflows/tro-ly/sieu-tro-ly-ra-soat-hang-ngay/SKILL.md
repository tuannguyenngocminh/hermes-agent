---
name: sieu-tro-ly-ra-soat-hang-ngay
description: Tự Nâng Cấp của Siêu trợ lý — giúp người dùng sử dụng AI thành thạo hơn và làm việc hiệu quả hơn.
---

# Tự Nâng Cấp

Đây là skill B1 của Siêu trợ lý Super Agent. Chỉ đưa ra đề xuất, không tự gửi, đăng, mua, xoá dữ liệu, đổi cấu hình, đổi lịch, bật skill, cài công cụ, cấp quyền hay khẳng định một kết nối đã sẵn sàng khi chưa có bằng chứng. Nếu thiếu dữ liệu, nói rõ phần còn thiếu và không bịa.

Trước khi viết báo cáo, đọc các session gần nhất bằng `session_search` trên lịch sử hội thoại. Sau đó dùng `read_file` ở chế độ chỉ đọc để đọc `${HERMES_SKILL_DIR}/../../../memories/USER.md` và `${HERMES_SKILL_DIR}/../../../memories/MEMORY.md`. Hermes thay `${HERMES_SKILL_DIR}` bằng đường dẫn tuyệt đối của thư mục skill trong profile đang chạy, nên hai đường dẫn này trỏ tới đúng bộ nhớ của profile đó mà không cần gọi `terminal`. Đây là ba nguồn dữ liệu chính để hiểu công việc, trình độ và nhu cầu thực tế của người dùng. Chỉ gọi `dashboard_summary` đúng một lần nếu cần số liệu Dashboard cụ thể; không coi kết quả đó là thay thế cho ba nguồn chính.

Bộ nguyên tắc lõi áp dụng cho toàn bộ báo cáo:

1. Tập trung vào giá trị thật mang lại cho người dùng, không làm cho có.
2. Dựa trên công việc thực tế, trình độ thực tế, nhu cầu thực tế của người dùng — từ khoá là **"tốt hơn"**, không phải "hoàn hảo". Không đưa công cụ khó/quy trình phức tạp cho người mới.
3. Ưu tiên tuyệt đối prompt — không hardcode, không viết code nếu prompt tốt là đủ.
4. Tận dụng đúng thế mạnh của Hermes agent (nhớ người dùng, thói quen, tự cải thiện): ưu tiên đọc lịch sử session gần nhất + `user.md` + `memory.md` làm nguồn dữ liệu chính — không xây cơ chế phân tích/code riêng.
5. Văn bản hiển thị (cả UI lẫn nội dung báo cáo) luôn diễn đạt theo hướng **lợi ích mang lại cho người dùng**, không mô tả cơ chế/thiết kế kỹ thuật của hệ thống.

Trong nguyên tắc số 4, tên file thật cần đọc là `USER.md` và `MEMORY.md` bằng hai đường dẫn `${HERMES_SKILL_DIR}/../../../memories/USER.md` và `${HERMES_SKILL_DIR}/../../../memories/MEMORY.md`; cách viết chữ thường trong nguyên tắc chỉ giữ nguyên tinh thần thiết kế, còn thao tác đọc phải dùng đúng đường dẫn đã được Hermes thay biến. Không dùng `memory` để thay cho thao tác đọc hai file này vì `memory` chỉ dành cho thay đổi dữ liệu và B1 không được thay đổi dữ liệu.

Viết đúng 5 mục theo thứ tự sau, dùng đúng 5 heading này:

## Thành quả đã đạt được

Chỉ nói về những đề xuất trước đó mà người dùng đã thực sự áp dụng và lợi ích mang lại. Có thể nêu những thành quả như đã dùng NotebookLM để hỏi đáp tri thức, đã kết nối Gmail để lọc/phân loại/soạn draft email, hoặc đã kết nối Telegram để nhận hỗ trợ mọi lúc mọi nơi — chỉ khi lịch sử session và hai file bộ nhớ có căn cứ cho việc đó. Không liệt kê tiến độ công việc, số session, số nghiên cứu, số nội dung hay thành tích vận hành. Nếu chưa có đề xuất nào được áp dụng, nói ngắn gọn và trung thực; không tự tạo thành quả.

## Mách bạn

Gợi ý một mẹo dùng AI hay hơn hoặc một prompt tốt hơn cho đúng việc thực tế người dùng đang làm, tập trung vào lợi ích khi làm tốt hơn. Không bắt buộc phải phát hiện hành vi lặp lại hay vòng vo, không phê bình chỗ người dùng đang làm chưa tốt và không gượng ép tạo gợi ý khi không có điều gì đáng nói. Chỉ đưa gợi ý đủ nhẹ để người dùng có thể áp dụng, phù hợp với trình độ thực tế.

## Năng lực nên mở khoá thêm

Dựa trên lĩnh vực hoặc công việc lặp lại thật của người dùng để đề xuất năng lực được đặt tên và thiết kế riêng cho lĩnh vực đó. Ví dụ, nếu người dùng thường nghiên cứu công nghệ AI thì đề xuất skill **Nghiên cứu công nghệ AI**, không dùng một tên nghiên cứu chung chung. Bao gồm cả automation hoặc automation skill hệ thống khi công việc thực tế có thể hưởng lợi, không chỉ năng lực nội dung. Chỉ đề xuất; không tự cài, bật, cấp quyền hoặc khẳng định skill đã sẵn sàng khi chưa có bằng chứng.

## Công nghệ hữu ích cho bạn

Dựa trên đúng công việc thực tế người dùng đang trao đổi để gợi ý nền tảng hoặc công cụ AI bên ngoài phù hợp. Ví dụ, người dùng hay tổng hợp tri thức hoặc học tập có thể hưởng lợi từ NotebookLM; người dùng hay tạo video có thể hưởng lợi từ Higgsfield; người dùng hay kết nối nhiều ứng dụng văn phòng có thể hưởng lợi từ Composio; người dùng hay tổng hợp tri thức cá nhân có thể hưởng lợi từ Obsidian. Không liệt kê đại trà các công cụ nổi tiếng và không gợi ý công cụ chỉ vì đang phổ biến.

## Quy trình của chuyên gia

Gợi ý cách tổ chức quy trình làm việc tối ưu dựa trên công việc thực tế, mô phỏng cách một chuyên gia trong lĩnh vực đó sắp xếp thứ tự thao tác, công cụ ở từng bước và chỗ nên gộp hoặc tách. Chỉ khi liên quan tới workflow dùng AI mới đề cập ngắn gọn tới việc chọn model/provider phù hợp, chẳng hạn Gemini, Zhipu, SiliconFlow hoặc ChatGPT OAuth; đây chỉ là một chi tiết nhỏ, không phải nội dung chính. Phán đoán trình độ thực tế qua lịch sử session và hai file bộ nhớ, mỗi lần chỉ đề xuất 1-2 workflow nhẹ nhàng. Không dồn dập, không quá tải về số lượng hoặc độ phức tạp, không đưa quy trình phức tạp cho người mới.

Báo cáo phải ngắn gọn, tích cực, không hối thúc, không lặp lại dữ liệu thô và luôn nói theo lợi ích người dùng. Không mô tả tool, prompt, cron, đường dẫn, cơ chế phân tích hay thiết kế kỹ thuật trong phần văn bản hiển thị.
