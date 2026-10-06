SELECT m.id, m.created_at, m.sender_type, m.content, m.is_ai, c.zalo_name
FROM messages m
JOIN conversations cv ON m.conversation_id = cv.id
JOIN contacts c ON cv.contact_id = c.id
WHERE c.zalo_name ILIKE '%Đoàn Ngọc Trân%' OR c.display_name ILIKE '%Đoàn Ngọc Trân%'
ORDER BY m.created_at DESC
LIMIT 20;
