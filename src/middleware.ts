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
      (path.startsWith("/upload") ||
        path.startsWith("/studio") ||
        path.startsWith("/pipeline") ||
        path.startsWith("/review")) &&
      role === "BUYER"
    ) {
      return NextResponse.redirect(new URL("/buyer", req.url));
    }
    if (
      path.startsWith("/pipeline") &&
      role !== "ADMIN" &&
      role !== "OPS"
    ) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    if (
      path.startsWith("/review") &&
      role !== "ADMIN" &&
      role !== "REVIEWER"
    ) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
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
    "/pipeline/:path*",
    "/review/:path*",
    "/api/projects/:path*",
    "/api/workers/:path*",
    "/api/sessions/:path*",
    "/api/upload/:path*",
    "/api/clips/:path*",
    "/api/s3/:path*",
    "/api/pipeline/:path*",
    "/api/reviews/:path*",
    "/api/dataset-requests/:path*",
  ],
};
