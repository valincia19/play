import postgres from 'postgres';
import { env } from 'bun';

async function testConnection() {
  console.log('Testing connection to:', env.DATABASE_URL);
  try {
    const sql = postgres(env.DATABASE_URL!);
    const result = await sql`SELECT version()`;
    console.log('Connection successful!', result);
    process.exit(0);
  } catch (err) {
    console.error('Connection failed:', err);
    process.exit(1);
  }
}

testConnection();
