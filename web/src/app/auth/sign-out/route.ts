import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${request.nextUrl.origin}/sign-in`, {
    status: 303,
  });
}
