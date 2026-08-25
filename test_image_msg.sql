SELECT id, content_type, content, sent_at FROM messages ORDER BY sent_at DESC LIMIT 5;
SELECT id, content_type, content, sent_at FROM messages WHERE content ILIKE '%hình ảnh kèm tin nhắn%' LIMIT 5;
