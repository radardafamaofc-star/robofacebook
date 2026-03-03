import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Current latest version of the extension
  const latestVersion = "1.0.9";
  const downloadUrl = "https://hovvwniyxnzskocsmgcr.supabase.co/storage/v1/object/public/extension/facebook-auto-poster.zip";
  const changelog = "Nova versão disponível para teste do banner de atualização.";

  return new Response(
    JSON.stringify({
      version: latestVersion,
      download_url: downloadUrl,
      changelog,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
