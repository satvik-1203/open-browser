import "express";

// The authenticated identity resolved by the `authenticate` middleware. Every
// route can read `req.userId` regardless of how the caller authenticated;
// `req.auth` carries the richer, credential-specific detail.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      auth?:
        | { type: "api_token"; userId: string; tokenId: string }
        | { type: "session"; userId: string };
    }
  }
}
