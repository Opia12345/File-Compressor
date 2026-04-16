import axios from "axios";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

/**
 * CONFIGURATION
 * Ensure these are set in your .env file or directly below
 */

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://wgjxacinfgzynbgjwzxy.supabase.co";
const SERVICE_ROLE_KEY =
  process.env.SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sbmRwaGlob3NmbXlodmpteGhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE1OTQwNywiZXhwIjoyMDkwNzM1NDA3fQ.vCY6Uh4k6LsXjYnt-et8IEnC6hTkPysXgdVtxID2pUw";
const DB_CONNECTION_STRING =
  process.env.DB_CONNECTION_STRING ||
  "postgresql://postgres.wgjxacinfgzynbgjwzxy:@Robaaltd21@aws-1-eu-west-1.pooler.supabase.com:6543/postgres";

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUTPUT_DIR = path.join(process.cwd(), `supabase_backup_${TIMESTAMP}`);
const STORAGE_DIR = path.join(OUTPUT_DIR, "storage");

// Supabase Storage API client
const storageClient = axios.create({
  baseURL: `${SUPABASE_URL}/storage/v1`,
  headers: {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  },
});

async function runBackup() {
  try {
    console.log("🔍 Checking environment...");
    if (!fs.existsSync(OUTPUT_DIR))
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    if (!fs.existsSync(STORAGE_DIR))
      fs.mkdirSync(STORAGE_DIR, { recursive: true });

    // 1. DATABASE BACKUP
    console.log("\n📦 Dumping database...");
    const dbDumpFile = path.join(OUTPUT_DIR, "database.sql");

    // We use pg_dump via child_process
    execSync(
      `pg_dump --no-acl --no-owner --format=plain --file="${dbDumpFile}" "${DB_CONNECTION_STRING}"`,
    );
    console.log(`  ✅ Database saved → ${dbDumpFile}`);

    // 2. STORAGE BACKUP
    console.log("\n🪣  Listing Storage buckets...");
    const { data: buckets } = await storageClient.get("/bucket");

    if (!buckets || buckets.length === 0) {
      console.log("  ℹ️  No buckets found.");
    } else {
      for (const bucket of buckets) {
        console.log(`\n  🗂️  Bucket: ${bucket.name}`);
        const bucketPath = path.join(STORAGE_DIR, bucket.name);
        if (!fs.existsSync(bucketPath))
          fs.mkdirSync(bucketPath, { recursive: true });

        await downloadBucketObjects(bucket.name, bucketPath);
      }
    }

    console.log(`\n✅ Backup complete! Found in: ${OUTPUT_DIR}`);
  } catch (error: any) {
    console.error("\n❌ Backup failed:", error.message);
    process.exit(1);
  }
}

async function downloadBucketObjects(bucketName: string, localPath: string) {
  let offset = 0;
  const limit = 100;
  let totalFiles = 0;

  while (true) {
    const { data: objects } = await storageClient.post(
      `/object/list/${bucketName}`,
      {
        prefix: "",
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      },
    );

    if (!objects || objects.length === 0) break;

    for (const obj of objects) {
      // If metadata is null, it's a folder/placeholder
      if (!obj.metadata) continue;

      const fileLocalPath = path.join(localPath, obj.name);
      const dir = path.dirname(fileLocalPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // Download file content
      const response = await storageClient.get(
        `/object/${bucketName}/${obj.name}`,
        {
          responseType: "arraybuffer",
        },
      );

      fs.writeFileSync(fileLocalPath, Buffer.from(response.data));
      console.log(`    ⬇️  ${obj.name}`);
      totalFiles++;
    }

    if (objects.length < limit) break;
    offset += limit;
  }
  console.log(`  ✅ ${totalFiles} file(s) saved for ${bucketName}`);
}

runBackup();
