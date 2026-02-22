import jwt from "jsonwebtoken";

export const authMiddleware = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    console.error(`🔴 authMiddleware: No auth header for ${req.method} ${req.path}`);
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    console.log(`🟢 authMiddleware: Auth header found: ${authHeader.substring(0, 30)}...`);
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    console.log(`✅ authMiddleware: Token verified for user ${decoded.id}, role: ${decoded.role}`);
    req.user = decoded;
    next();
  } catch (err) {
    console.error(`🔴 authMiddleware: Token verification failed:`, err instanceof Error ? err.message : err);
    return res.status(401).json({ message: "Invalid token" });
  }
};
