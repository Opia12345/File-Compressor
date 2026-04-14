// compress.ts  —  run with: npx ts-node compress.ts
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import * as fs from "fs";

const supabase = createClient("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");

const BUCKET = "post-images";
const TARGET_PATH = "posts/bceed2dc-58e2-4e1f-b76b-e8996773de21";

async function compressOne(fullPath: string) {
  const { data: blob, error } = await supabase.storage
    .from(BUCKET)
    .download(fullPath);

  if (error) throw error;

  const buffer = Buffer.from(await blob.arrayBuffer());

  const compressed = await sharp(buffer)
    .resize({ width: 2000, withoutEnlargement: true })
    .jpeg({ quality: 40 })
    .toBuffer();

  const { error: upError } = await supabase.storage
    .from(BUCKET)
    .upload(fullPath, compressed, { contentType: "image/jpeg", upsert: true });

  if (upError) throw upError;
}

async function run() {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: files, error } = await supabase.storage
      .from(BUCKET)
      .list(TARGET_PATH, { limit: 20, offset });

    if (error) throw error;

    for (const file of files.filter((f) => f.id)) {
      const fullPath = `${TARGET_PATH}/${file.name}`;
      try {
        await compressOne(fullPath);
        console.log(`✓ ${fullPath}`);
      } catch (e: any) {
        console.error(`✗ ${fullPath}:`, e.message);
      }
    }

    offset += files.length;
    hasMore = files.length === 20;
  }

  console.log("Done.");
}

run();
