import express from "express";
import UserFeedback from "../models/UserFeedback";
import User from "../models/User";
import { authMiddleware } from "../middleware/auth";
import { requireRoles } from "../middleware/roleGuard";

const router = express.Router();

router.post("/", authMiddleware, requireRoles(["student", "admin", "gatekeeper"]), async (req: any, res) => {
  try {
    const { title, message, category } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "title is required" });
    }

    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const user = await User.findById(req.user.id).select("hostelBlock").lean<{ hostelBlock?: string }>();
    if (!user?.hostelBlock) {
      return res.status(404).json({ error: "User hostel block not found" });
    }

    const normalizedCategory = String(category || "OTHER").toUpperCase();
    const feedback = await UserFeedback.create({
      userId: req.user.id,
      hostelBlock: user.hostelBlock,
      title: String(title).trim(),
      message: String(message).trim(),
      category: ["APP", "FOOD", "HOSTEL", "GATE", "OTHER"].includes(normalizedCategory)
        ? normalizedCategory
        : "OTHER",
    });

    return res.status(201).json({ success: true, feedback });
  } catch (error) {
    console.error("Failed to create feedback:", error);
    return res.status(500).json({ error: "Failed to save feedback" });
  }
});

router.get("/my", authMiddleware, requireRoles(["student", "admin", "gatekeeper"]), async (req: any, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "50"), 10), 1), 200);
    const items = await UserFeedback.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ success: true, feedback: items });
  } catch (error) {
    console.error("Failed to fetch own feedback:", error);
    return res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

router.get("/", authMiddleware, requireRoles(["admin"]), async (req: any, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || "100"), 10), 1), 300);
    const query: any = {};

    if (req.query.status) {
      const status = String(req.query.status).toUpperCase();
      if (["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"].includes(status)) {
        query.status = status;
      }
    }

    if (req.query.category) {
      const category = String(req.query.category).toUpperCase();
      if (["APP", "FOOD", "HOSTEL", "GATE", "OTHER"].includes(category)) {
        query.category = category;
      }
    }

    if (req.query.hostelBlock) {
      query.hostelBlock = String(req.query.hostelBlock).trim();
    }

    const items = await UserFeedback.find(query)
      .populate("userId", "name registerId role hostelBlock roomNumber gateNumber")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ success: true, feedback: items });
  } catch (error) {
    console.error("Failed to fetch feedback list:", error);
    return res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

router.patch("/:id/status", authMiddleware, requireRoles(["admin"]), async (req: any, res) => {
  try {
    const { status, adminRemarks } = req.body || {};
    const normalizedStatus = String(status || "").toUpperCase();

    if (!["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"].includes(normalizedStatus)) {
      return res.status(400).json({ error: "Valid status is required" });
    }

    const updated = await UserFeedback.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: normalizedStatus,
          adminRemarks: typeof adminRemarks === "string" ? adminRemarks.trim() : undefined,
        },
      },
      { new: true }
    ).populate("userId", "name registerId role hostelBlock roomNumber gateNumber");

    if (!updated) {
      return res.status(404).json({ error: "Feedback not found" });
    }

    return res.json({ success: true, feedback: updated });
  } catch (error) {
    console.error("Failed to update feedback status:", error);
    return res.status(500).json({ error: "Failed to update feedback status" });
  }
});

export default router;
