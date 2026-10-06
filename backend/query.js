import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: 'postgresql://crmuser:zalocrm_secure_password@localhost:5433/zalocrm'
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT m.id, m.created_at, m.sender_type, m.content, m.conversation_id
    FROM messages m
    WHERE m.content ILIKE '%chó 2 tháng tuổi%'
    ORDER BY m.created_at DESC
    LIMIT 20;
  `);

  console.log(`Found ${res.rows.length} messages containing the keyword`);
  res.rows.forEach(row => {
    console.log(`[${row.created_at.toISOString()}] ${row.sender_type}: ${row.content}`);
  });
}

main().catch(console.error).finally(() => client.end());
