// compress.ts  —  run with: npx ts-node compress.ts
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import * as fs from "fs";

const supabase = createClient(
  "supabase_url", // supabase url
  "service_key", //service role key
);

const BUCKET = "app-bucket"; //main bucket name
const TARGET_PATH = "removal_requests"; //route path

//function to access the path from supabase
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

//entry point
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
