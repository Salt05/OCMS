import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: 'postgresql://crmuser:zalocrm_secure_password@localhost:5433/zalocrm'
});

async function main() {
  await client.connect();
  const conv = await client.query(`
    SELECT c.id, ct.zalo_name, za.display_name
    FROM conversations c
    LEFT JOIN contacts ct ON c.contact_id = ct.id
    LEFT JOIN zalo_accounts za ON c.zalo_account_id = za.id
    WHERE c.id = '354bdf91-3a13-48f4-8861-e82337e582e6';
  `);
  console.log('Conversation:', conv.rows[0]);

  const msg = await client.query(`
    SELECT id, content_type, attachments
    FROM messages
    WHERE id = 'a7af047c-a4bd-4059-93be-8986e636598f';
  `);
  console.log('Attachments:', JSON.stringify(msg.rows[0]?.attachments, null, 2));
}

main().catch(console.error).finally(() => client.end());
