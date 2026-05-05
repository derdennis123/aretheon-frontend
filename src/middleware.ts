import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role as string | undefined;
    const path = req.nextUrl.pathname;

    if (path.startsWith("/buyer") && role !== "BUYER" && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    if (
      (path.startsWith("/upload") || path.startsWith("/studio")) &&
      role === "BUYER"
    ) {
      return NextResponse.redirect(new URL("/buyer", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: "/login" },
  },
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/upload/:path*",
    "/studio/:path*",
    "/buyer/:path*",
    "/api/projects/:path*",
    "/api/workers/:path*",
    "/api/sessions/:path*",
    "/api/upload/:path*",
    "/api/clips/:path*",
    "/api/s3/:path*",
  ],
};
