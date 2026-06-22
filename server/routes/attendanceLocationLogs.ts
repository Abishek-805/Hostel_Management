import express from "express";
import AttendanceLocationLog from "../models/AttendanceLocationLog";
import User from "../models/User";
import { authMiddleware } from "../middleware/auth";
import { requireRoles } from "../middleware/roleGuard";

const router = express.Router();

router.post("/", authMiddleware, requireRoles(["student", "admin", "gatekeeper"]), async (req: any, res) => {
  try {
    const { latitude, longitude, isInside, distance, message, source } = req.body || {};

    if (typeof latitude !== "number" || typeof longitude !== "number" || typeof isInside !== "boolean") {
      return res.status(400).json({ error: "latitude, longitude and isInside are required" });
    }

    const user = await User.findById(req.user.id).select("hostelBlock").lean<{ hostelBlock?: string }>();
    if (!user?.hostelBlock) {
      return res.status(404).json({ error: "User hostel block not found" });
    }

    const log = await AttendanceLocationLog.create({
      userId: req.user.id,
      hostelBlock: user.hostelBlock,
      latitude,
      longitude,
      isInside,
      distance,
      message,
      source,
    });

    return res.status(201).json({ success: true, log });
  } catch (error) {
    console.error("Failed to create attendance location log:", error);
    return res.status(500).json({ error: "Failed to save attendance location log" });
  }
});

router.get("/my", authMiddleware, requireRoles(["student", "admin", "gatekeeper"]), async (req: any, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "50"), 10), 1), 200);
    const logs = await AttendanceLocationLog.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ success: true, logs });
  } catch (error) {
    console.error("Failed to fetch own attendance location logs:", error);
    return res.status(500).json({ error: "Failed to fetch location logs" });
  }
});

router.get("/", authMiddleware, requireRoles(["admin", "gatekeeper"]), async (req: any, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "100"), 10), 1), 300);
    const query: any = {};

    if (req.query.hostelBlock) {
      query.hostelBlock = String(req.query.hostelBlock).trim();
    }
    if (req.query.userId) {
      query.userId = String(req.query.userId).trim();
    }
    if (req.query.isInside === "true") {
      query.isInside = true;
    } else if (req.query.isInside === "false") {
      query.isInside = false;
    }

    const logs = await AttendanceLocationLog.find(query)
      .populate("userId", "name registerId role hostelBlock roomNumber")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ success: true, logs });
  } catch (error) {
    console.error("Failed to fetch attendance location logs:", error);
    return res.status(500).json({ error: "Failed to fetch location logs" });
  }
});

export default router;
