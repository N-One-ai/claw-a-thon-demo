import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    BACKEND_URL: process.env.BACKEND_URL ?? "NOT_SET",
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL ?? "NOT_SET",
  });
}
