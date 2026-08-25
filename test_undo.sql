SELECT id, content_type, content, is_deleted FROM messages WHERE is_deleted = true OR content_type = 'undo' LIMIT 5;
