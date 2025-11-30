// src/lib/supabaseUpload.ts
import { createClient } from "@supabase/supabase-js";

export function getSupabaseClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Uploads a single file to the "listing-photos" bucket
 * Returns the public photo URL ready for DB storage
 */
export async function uploadListingPhoto(
  file: File,
  listingId: string
): Promise<string> {
  const supabase = getSupabaseClient();

  const fileExt = file.name.split(".").pop();
  const fileName = `${listingId}/${Date.now()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from("listing-photos")
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Supabase upload error:", error);
    throw new Error("Failed to upload photo.");
  }

  const { data: publicUrl } = supabase.storage
    .from("listing-photos")
    .getPublicUrl(fileName);

  return publicUrl.publicUrl;
}