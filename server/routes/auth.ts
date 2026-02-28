import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";
import Room from "../models/Room";
import GateConfig from "../models/GateConfig";
import { authMiddleware } from "../middleware/auth";
import { JWT_SECRET } from "../config/env";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const buildRegisterIdRegex = (value: string) => new RegExp(`^\\s*${escapeRegex(value)}\\s*$`, "i");

// Helper to sign token
const signToken = (user: any) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      hostelBlock: user.hostelBlock,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const router = express.Router();

/* =========================
   REGISTER
========================= */
router.post("/register", async (req, res) => {
  try {
    const {
      registerId,
      password,
      name,
      phone,
      role,
      roomNumber,
      hostelBlock,
      gateNumber,
      gateCode,
    } = req.body;

    console.log("Register Attempt:", req.body); // DEBUG LOG

    const requiresHostelBlock = role === 'student' || role === 'admin';
    if (!registerId || !password || !name || !role || (requiresHostelBlock && !hostelBlock)) {
      console.log("Missing fields:", { registerId, password, name, role, hostelBlock, gateNumber });
      return res.status(400).json({ error: "Missing required fields" });
    }
    let normalizedGateNumber: number | undefined;
    if (role === 'gatekeeper') {
      normalizedGateNumber = Number(gateNumber);
      if (!Number.isInteger(normalizedGateNumber) || normalizedGateNumber < 1 || normalizedGateNumber > 11) {
        return res.status(400).json({ error: 'Gate Number must be between 1 and 11' });
      }
      if (!gateCode || typeof gateCode !== 'string') {
        return res.status(400).json({ error: 'Gate Code is required for gatekeeper registration' });
      }

      const gateConfig = await GateConfig.findOne({ gateNumber: normalizedGateNumber });
      if (!gateConfig) {
        return res.status(400).json({ error: 'Invalid gate number configuration' });
      }

      if (gateConfig.gateCode.trim().toLowerCase() !== gateCode.trim().toLowerCase()) {
        return res.status(403).json({ error: 'Invalid gate code for selected gate number' });
      }

      if (gateConfig.assigned) {
        return res.status(409).json({ error: `Gate ${normalizedGateNumber} is already assigned` });
      }

      const existingGatekeeper = await User.findOne({ role: 'gatekeeper', gateNumber: normalizedGateNumber });
      if (existingGatekeeper) {
        return res.status(409).json({ error: `Gatekeeper already registered for Gate ${normalizedGateNumber}` });
      }
    }


    const existingUser = await User.findOne({ registerId: buildRegisterIdRegex(registerId.trim()) });
    if (existingUser) {
      console.log("User already exists:", registerId);
      return res.status(400).json({ error: "User already exists" });
    }

    // Check Room Existence and Capacity for Students
    if (role === 'student' && roomNumber && hostelBlock) {
      const room = await Room.findOne({
        roomNumber: { $regex: new RegExp(`^${roomNumber.trim()}$`, 'i') },
        hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, 'i') }
      });

      if (!room) {
        return res.status(400).json({ error: 'Invalid Room: The room number entered does not exist in the selected hostel.' });
      }

      const currentOccupants = await User.countDocuments({ roomNumber: room.roomNumber, hostelBlock: room.hostelBlock });

      if (currentOccupants >= room.capacity) {
        return res.status(400).json({ error: `Room ${roomNumber} is full (Capacity: ${room.capacity})` });
      }

      // Update roomNumber to the formatted version from DB if found (e.g. A1 instead of a1)
      req.body.roomNumber = room.roomNumber;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      registerId,
      password: hashedPassword,
      name,
      phone,
      role,
      gateNumber: role === 'gatekeeper' ? normalizedGateNumber : undefined,
      roomNumber: role === 'student' ? roomNumber : undefined,
      hostelBlock: role === 'gatekeeper' ? `Gate ${normalizedGateNumber}` : hostelBlock,
    });
    if (role === 'gatekeeper' && normalizedGateNumber) {
      await GateConfig.updateOne({ gateNumber: normalizedGateNumber }, { $set: { assigned: true } });
    }


    console.log("User created successfully:", user.registerId);

    // Update Room Occupancy
    if (role === 'student' && user.roomNumber && user.hostelBlock) {
      await Room.findOneAndUpdate(
        { roomNumber: user.roomNumber, hostelBlock: user.hostelBlock },
        { $inc: { currentOccupancy: 1 } },
        { new: true }
      );
    }

    const token = signToken(user);

    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        registerId: user.registerId,
        name: user.name,
        phone: user.phone,
        role: user.role,
        gateNumber: user.gateNumber,
        roomNumber: user.roomNumber,
        hostelBlock: user.hostelBlock,
        profileImage: user.profileImage,
      },
      token,
    });
  } catch (err: any) {
    console.error("Registration Error Detail:", err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: "Validation Error", details: err.errors });
    }
    res.status(500).json({ error: "Registration failed", message: err.message });
  }
});

/* =========================
   LOGIN
========================= */
router.post("/login", async (req, res) => {
  try {
    const { registerId, password, role, hostelBlock } = req.body;
    const normalizedRegisterId = typeof registerId === "string" ? registerId.trim() : "";
    console.log(`Login Attempt: ${normalizedRegisterId}, Role: ${role}, Hostel: ${hostelBlock}`);

    if (!normalizedRegisterId || !password) {
      return res.status(400).json({ error: "Missing credentials" });
    }

    const user = await User.findOne({ registerId: buildRegisterIdRegex(normalizedRegisterId) });
    if (!user) {
      console.log(`User not found: ${normalizedRegisterId}`);
      return res.status(400).json({ error: "Invalid Register Number / Staff ID" });
    }

    if (role && user.role !== role) {
      console.log(`Role mismatch for ${normalizedRegisterId}: expected ${role}, found ${user.role}`);
      return res.status(403).json({ error: "Role mismatch" });
    }

    // New: Check if the user belongs to the selected hostel block
    if (hostelBlock && user.hostelBlock) {
      const dbHostel = user.hostelBlock.trim().toLowerCase();
      const inputHostel = hostelBlock.trim().toLowerCase();

      if (dbHostel !== inputHostel) {
        console.log(`Hostel mismatch for ${normalizedRegisterId}: Selected: ${hostelBlock}, Registered in: ${user.hostelBlock}`);
        return res.status(403).json({ error: `You are not registered in ${hostelBlock}. You are registered in ${user.hostelBlock}` });
      }
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid Password" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        hostelBlock: user.hostelBlock, // ✅ IMPORTANT
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log(`✅ Login successful for ${normalizedRegisterId}, token: ${token.substring(0, 30)}...`);

    res.json({
      success: true,
      user: {
        id: user._id,
        registerId: user.registerId,
        name: user.name,
        phone: user.phone,
        role: user.role,
        gateNumber: user.gateNumber,
        roomNumber: user.roomNumber,
        hostelBlock: user.hostelBlock,
        profileImage: user.profileImage,
      },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   FORGOT PASSWORD - VERIFY ADMIN
========================= */
router.post("/forgot-password/verify", async (req, res) => {
  try {
    const { role, registerId, studentHostelCode } = req.body;
    let { hostelBlock } = req.body;

    if (!role) {
      return res.status(400).json({ error: "Role is required" });
    }

    let user;

    if (role === "admin") {
      // Admin verification: registerId (derived hostelBlock from user record)
      if (!registerId) {
        return res.status(400).json({ error: "Register Number is required for admin" });
      }

      user = await User.findOne({
        registerId,
        role: "admin"
      });

      if (!user) {
        return res.status(404).json({ error: "Admin not found with this ID" });
      }

      hostelBlock = user.hostelBlock; // Derive it for the token generation later if needed
    } else if (role === "student") {
      // Student verification: registerId + studentHostelCode
      if (!registerId || !studentHostelCode) {
        return res.status(400).json({ error: "Register ID and Unique Hostel Code are required" });
      }

      const HOSTEL_CODES: Record<string, string> = {
        "Kaveri Ladies Hostel": "girls 2547",
        "Amaravathi Ladies Hostel": "ladies 9021",
        "Bhavani Ladies Hostel": "ladies 3341",
        "Dheeran Mens Hostel": "mens 4452",
        "Valluvar Mens Hostel": "mens 1123",
        "Ilango Mens Hostel": "mens 7789",
        "Bharathi Mens Hostel": "mens 5564",
        "Kamban Mens Hostel": "mens 8891",
        "Ponnar Mens Hostel": "mens 1002",
        "Sankar Mens Hostel": "mens 9987",
      };

      // Derive hostelBlock from studentHostelCode
      const derivedBlock = Object.keys(HOSTEL_CODES).find(
        block => HOSTEL_CODES[block].toLowerCase() === studentHostelCode.trim().toLowerCase()
      );

      if (!derivedBlock) {
        return res.status(401).json({ error: "Invalid Unique Hostel Code" });
      }

      hostelBlock = derivedBlock;

      // Find student by registerId and derived hostelBlock
      user = await User.findOne({
        registerId,
        hostelBlock,
        role: "student"
      });

      if (!user) {
        return res.status(404).json({ error: `Student with ID ${registerId} not found in ${hostelBlock}` });
      }
    } else {
      return res.status(400).json({ error: "Invalid role. Must be 'admin' or 'student'" });
    }

    // Generate a temporary reset token (valid for 15 minutes)
    const resetToken = jwt.sign(
      { id: user._id, registerId: user.registerId || user.hostelBlock },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.json({
      success: true,
      message: `${role === 'admin' ? 'Admin' : 'Student'} verified successfully`,
      resetToken,
      user: {
        id: user._id,
        name: user.name,
        hostelBlock: user.hostelBlock,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   FORGOT PASSWORD - RESET PASSWORD
========================= */
router.post("/forgot-password/reset", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: "Reset token and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Verify the reset token
    let decoded: any;
    try {
      decoded = jwt.verify(resetToken, JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ error: "Reset token expired or invalid" });
    }

    // Find the admin and update password
    const admin = await User.findById(decoded.id);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    await admin.save();

    res.json({
      success: true,
      message: "Password reset successfully. Please login with your new password."
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   CHANGE PASSWORD
========================= */
router.put("/password", authMiddleware, async (req: any, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id; // From authMiddleware

    if (!newPassword) {
      return res.status(400).json({ error: "Missing new password" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify current password ONLY if provided
    if (currentPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: "Incorrect current password" });
      }
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
