import 'dotenv/config';
import {z} from 'zod';
export const envSchema=z.object({DATABASE_URL:z.string().url(),JWT_SECRET:z.string().min(32),PORT:z.coerce.number().int().min(1).max(65535).default(3000),CORS_ORIGIN:z.string().url().default('http://localhost:5173'),WHATSAPP_VERIFY_TOKEN:z.string().default(''),WHATSAPP_APP_SECRET:z.string().default(''),WHATSAPP_PHONE_NUMBER_ID:z.string().default(''),WHATSAPP_ACCESS_TOKEN:z.string().default('')});
export const env=envSchema.parse(process.env);
