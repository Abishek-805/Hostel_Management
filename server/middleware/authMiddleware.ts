import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { JWT_SECRET } from "../config/env";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: "student" | "admin" | "gatekeeper";
    hostelBlock: string;
  };
}

const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Authorization token missing" });
    }

    const token = authHeader.split(" ")[1];

    const decoded: any = jwt.verify(
      token,
      JWT_SECRET
    );

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
      hostelBlock: user.hostelBlock,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

export default authMiddleware;
