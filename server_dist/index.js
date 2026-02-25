"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server/models/User.ts
var User_exports = {};
__export(User_exports, {
  default: () => User_default
});
var import_mongoose2, UserSchema, User_default;
var init_User = __esm({
  "server/models/User.ts"() {
    "use strict";
    import_mongoose2 = __toESM(require("mongoose"));
    UserSchema = new import_mongoose2.Schema({
      name: { type: String, required: true },
      registerId: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      role: {
        type: String,
        enum: ["student", "admin"],
        required: true
      },
      hostelBlock: {
        type: String,
        required: true
        // 🔥 VERY IMPORTANT
      },
      roomNumber: { type: String },
      phone: { type: String },
      profileImage: { type: String },
      faceEmbedding: {
        type: [Number],
        default: void 0
      }
    }, {
      toJSON: { virtuals: true },
      toObject: { virtuals: true }
    });
    User_default = import_mongoose2.default.models.User || import_mongoose2.default.model("User", UserSchema);
  }
});

// server/polyfill.ts
var util = require("util");
if (!global.TextEncoder) {
  global.TextEncoder = util.TextEncoder;
}
if (!global.TextDecoder) {
  global.TextDecoder = util.TextDecoder;
}
if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = util.TextEncoder;
}
if (!globalThis.TextDecoder) {
  globalThis.TextDecoder = util.TextDecoder;
}
console.log("\u2705 TextEncoder Polyfill Applied");

// server/index.ts
var import_express15 = __toESM(require("express"));

// server/routes.ts
var import_node_http = require("node:http");

// server/db.ts
var import_mongoose = __toESM(require("mongoose"));

// server/config/env.ts
var import_dotenv = __toESM(require("dotenv"));
var import_path = __toESM(require("path"));
var isProduction = process.env.NODE_ENV === "production";
if (!isProduction) {
  import_dotenv.default.config({ path: import_path.default.resolve(process.cwd(), ".env") });
}
function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
var APP_ORIGIN = process.env.APP_ORIGIN || "https://hostel-management-4el0.onrender.com";
var MONGODB_URI = getRequiredEnv("MONGODB_URI");
var JWT_SECRET = getRequiredEnv("JWT_SECRET");

// server/db.ts
if (!MONGODB_URI) {
  throw new Error("Missing required environment variable: MONGODB_URI");
}
var cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}
async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }
  if (!cached.promise) {
    const opts = {
      bufferCommands: false
    };
    cached.promise = import_mongoose.default.connect(MONGODB_URI, opts).then((mongoose14) => {
      return mongoose14;
    });
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  return cached.conn;
}
var db_default = connectToDatabase;

// server/services/faceRecognition.ts
var faceapi = require("face-api.js");
var canvas = require("canvas");
var path2 = require("path");
var fs = require("fs");
var sharp = require("sharp");
var { TextEncoder, TextDecoder } = require("util");
var { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({
  Canvas,
  Image,
  ImageData,
  TextEncoder,
  TextDecoder
});
var modelPath = path2.resolve(process.cwd(), "weights");
var fallbackModelPath = path2.resolve(process.cwd(), "server", "weights");
function resolveModelPath() {
  if (fs.existsSync(modelPath)) {
    return modelPath;
  }
  if (fs.existsSync(fallbackModelPath)) {
    return fallbackModelPath;
  }
  return null;
}
var modelsLoaded = false;
var modelsAvailable = false;
var loadModels = async () => {
  if (modelsLoaded) {
    console.log("\u2705 Models already loaded");
    return;
  }
  const activeModelPath = resolveModelPath();
  if (!activeModelPath) {
    modelsLoaded = false;
    modelsAvailable = false;
    console.warn("\u26A0\uFE0F FaceAPI weights folder not found. Checked:", modelPath, fallbackModelPath);
    return;
  }
  try {
    console.log("\u{1F4E6} Loading FaceAPI models from:", activeModelPath);
    console.log("  \u2192 Loading SSD MobileNet v1...");
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(activeModelPath);
    console.log("    \u2713 SSD MobileNet v1 loaded");
    console.log("  \u2192 Loading Face Landmark 68...");
    await faceapi.nets.faceLandmark68Net.loadFromDisk(activeModelPath);
    console.log("    \u2713 Face Landmark 68 loaded");
    console.log("  \u2192 Loading Face Recognition...");
    await faceapi.nets.faceRecognitionNet.loadFromDisk(activeModelPath);
    console.log("    \u2713 Face Recognition loaded");
    modelsLoaded = true;
    modelsAvailable = true;
    console.log("\u2705 All FaceAPI models loaded successfully!");
  } catch (error) {
    console.error("\u274C Error loading FaceAPI models:", error);
    modelsLoaded = false;
    modelsAvailable = false;
  }
};
async function optimizeBase64Image(base64) {
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const optimized = await sharp(buffer).rotate().resize(640, 640, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
  return optimized;
}
function basicAntiSpoofCheck(detection) {
  if (!detection) {
    throw new Error("No face detected");
  }
  const score = detection.detection?.score || 0;
  console.log(`\u{1F50D} Face detection score: ${(score * 100).toFixed(1)}%`);
  const MIN_CONFIDENCE = 0.4;
  if (score < MIN_CONFIDENCE) {
    throw new Error(`Face too unclear (${(score * 100).toFixed(0)}%). Ensure good lighting, look at camera directly, and avoid blur.`);
  }
  const box = detection.detection?.box;
  if (box) {
    const faceSize = Math.min(box.width, box.height);
    const MIN_SIZE = 40;
    if (faceSize < MIN_SIZE) {
      throw new Error(`Face too small in frame (${faceSize.toFixed(0)}px). Move closer to camera.`);
    }
    console.log(`\u2713 Face detected: ${faceSize.toFixed(0)}px, confidence: ${(score * 100).toFixed(1)}%`);
  }
}
var getFaceEmbedding = async (imageBuffer, timeoutMs = 8e3) => {
  await loadModels();
  if (!modelsAvailable) {
    throw new Error("Face verification service is currently unavailable");
  }
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Face detection timeout - taking too long")), timeoutMs);
  });
  const detectionPromise = (async () => {
    let buffer;
    if (typeof imageBuffer === "string") {
      buffer = await optimizeBase64Image(imageBuffer);
    } else {
      buffer = await sharp(imageBuffer).rotate().resize(640, 640, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
    }
    console.log(`\u{1F4F8} Processing image buffer (${(buffer.length / 1024).toFixed(1)}KB)`);
    const img = await canvas.loadImage(buffer);
    const detection = await faceapi.detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 })).withFaceLandmarks().withFaceDescriptor();
    if (!detection) {
      throw new Error("No face detected in the capture. Please ensure your face is clearly visible, well-lit, and look directly at the camera.");
    }
    basicAntiSpoofCheck(detection);
    return detection.descriptor;
  })();
  try {
    return await Promise.race([detectionPromise, timeoutPromise]);
  } catch (error) {
    console.error("\u274C Error while generating face embedding:", error);
    throw error;
  }
};
var calculateSimilarity = (embedding1, embedding2) => {
  if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    normA += embedding1[i] * embedding1[i];
    normB += embedding2[i] * embedding2[i];
  }
  if (normA === 0 || normB === 0) return 0;
  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, similarity * 100);
};
console.log("\u2705 FaceRecognition module finished initialization");

// server/routes/auth.ts
var import_express = __toESM(require("express"));
var import_bcryptjs = __toESM(require("bcryptjs"));
var import_jsonwebtoken2 = __toESM(require("jsonwebtoken"));
init_User();

// server/models/Room.ts
var import_mongoose3 = __toESM(require("mongoose"));
var RoomSchema = new import_mongoose3.Schema({
  roomNumber: { type: String, required: true },
  hostelBlock: { type: String, required: true },
  block: { type: String },
  // Sub-block (A, B, C, D...)
  capacity: { type: Number, default: 4 },
  currentOccupancy: { type: Number, default: 0 }
});
var Room_default = import_mongoose3.default.models.Room || import_mongoose3.default.model("Room", RoomSchema);

// server/middleware/auth.ts
var import_jsonwebtoken = __toESM(require("jsonwebtoken"));
var authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error(`\u{1F534} authMiddleware: No auth header for ${req.method} ${req.path}`);
    return res.status(401).json({ message: "No token provided" });
  }
  try {
    console.log(`\u{1F7E2} authMiddleware: Auth header found: ${authHeader.substring(0, 30)}...`);
    const token = authHeader.split(" ")[1];
    const decoded = import_jsonwebtoken.default.verify(token, JWT_SECRET);
    console.log(`\u2705 authMiddleware: Token verified for user ${decoded.id}, role: ${decoded.role}`);
    req.user = decoded;
    next();
  } catch (err) {
    console.error(`\u{1F534} authMiddleware: Token verification failed:`, err instanceof Error ? err.message : err);
    return res.status(401).json({ message: "Invalid token" });
  }
};

// server/routes/auth.ts
var escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var buildRegisterIdRegex = (value) => new RegExp(`^\\s*${escapeRegex(value)}\\s*$`, "i");
var signToken = (user) => {
  return import_jsonwebtoken2.default.sign(
    {
      id: user._id,
      role: user.role,
      hostelBlock: user.hostelBlock
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
};
var router = import_express.default.Router();
router.post("/register", async (req, res) => {
  try {
    const {
      registerId,
      password,
      name,
      phone,
      role,
      roomNumber,
      hostelBlock
    } = req.body;
    console.log("Register Attempt:", req.body);
    if (!registerId || !password || !name || !role || !hostelBlock) {
      console.log("Missing fields:", { registerId, password, name, role, hostelBlock });
      return res.status(400).json({ error: "Missing required fields" });
    }
    const existingUser = await User_default.findOne({ registerId: buildRegisterIdRegex(registerId.trim()) });
    if (existingUser) {
      console.log("User already exists:", registerId);
      return res.status(400).json({ error: "User already exists" });
    }
    if (role === "student" && roomNumber && hostelBlock) {
      const room = await Room_default.findOne({
        roomNumber: { $regex: new RegExp(`^${roomNumber.trim()}$`, "i") },
        hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, "i") }
      });
      if (!room) {
        return res.status(400).json({ error: "Invalid Room: The room number entered does not exist in the selected hostel." });
      }
      const currentOccupants = await User_default.countDocuments({ roomNumber: room.roomNumber, hostelBlock: room.hostelBlock });
      if (currentOccupants >= room.capacity) {
        return res.status(400).json({ error: `Room ${roomNumber} is full (Capacity: ${room.capacity})` });
      }
      req.body.roomNumber = room.roomNumber;
    }
    const hashedPassword = await import_bcryptjs.default.hash(password, 10);
    const user = await User_default.create({
      registerId,
      password: hashedPassword,
      name,
      phone,
      role,
      roomNumber: role === "student" ? roomNumber : void 0,
      hostelBlock
    });
    console.log("User created successfully:", user.registerId);
    if (role === "student" && user.roomNumber && user.hostelBlock) {
      await Room_default.findOneAndUpdate(
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
        roomNumber: user.roomNumber,
        hostelBlock: user.hostelBlock,
        profileImage: user.profileImage
      },
      token
    });
  } catch (err) {
    console.error("Registration Error Detail:", err);
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: "Validation Error", details: err.errors });
    }
    res.status(500).json({ error: "Registration failed", message: err.message });
  }
});
router.post("/login", async (req, res) => {
  try {
    const { registerId, password, role, hostelBlock } = req.body;
    const normalizedRegisterId = typeof registerId === "string" ? registerId.trim() : "";
    console.log(`Login Attempt: ${normalizedRegisterId}, Role: ${role}, Hostel: ${hostelBlock}`);
    if (!normalizedRegisterId || !password) {
      return res.status(400).json({ error: "Missing credentials" });
    }
    const user = await User_default.findOne({ registerId: buildRegisterIdRegex(normalizedRegisterId) });
    if (!user) {
      console.log(`User not found: ${normalizedRegisterId}`);
      return res.status(400).json({ error: "Invalid Register Number / Staff ID" });
    }
    if (role && user.role !== role) {
      console.log(`Role mismatch for ${normalizedRegisterId}: expected ${role}, found ${user.role}`);
      return res.status(403).json({ error: "Role mismatch" });
    }
    if (hostelBlock && user.hostelBlock) {
      const dbHostel = user.hostelBlock.trim().toLowerCase();
      const inputHostel = hostelBlock.trim().toLowerCase();
      if (dbHostel !== inputHostel) {
        console.log(`Hostel mismatch for ${normalizedRegisterId}: Selected: ${hostelBlock}, Registered in: ${user.hostelBlock}`);
        return res.status(403).json({ error: `You are not registered in ${hostelBlock}. You are registered in ${user.hostelBlock}` });
      }
    }
    const isMatch = await import_bcryptjs.default.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid Password" });
    }
    const token = import_jsonwebtoken2.default.sign(
      {
        id: user._id,
        role: user.role,
        hostelBlock: user.hostelBlock
        // ✅ IMPORTANT
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    console.log(`\u2705 Login successful for ${normalizedRegisterId}, token: ${token.substring(0, 30)}...`);
    res.json({
      success: true,
      user: {
        id: user._id,
        registerId: user.registerId,
        name: user.name,
        phone: user.phone,
        role: user.role,
        roomNumber: user.roomNumber,
        hostelBlock: user.hostelBlock,
        profileImage: user.profileImage
      },
      token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
router.post("/forgot-password/verify", async (req, res) => {
  try {
    const { role, registerId, studentHostelCode } = req.body;
    let { hostelBlock } = req.body;
    if (!role) {
      return res.status(400).json({ error: "Role is required" });
    }
    let user;
    if (role === "admin") {
      if (!registerId) {
        return res.status(400).json({ error: "Register Number is required for admin" });
      }
      user = await User_default.findOne({
        registerId,
        role: "admin"
      });
      if (!user) {
        return res.status(404).json({ error: "Admin not found with this ID" });
      }
      hostelBlock = user.hostelBlock;
    } else if (role === "student") {
      if (!registerId || !studentHostelCode) {
        return res.status(400).json({ error: "Register ID and Unique Hostel Code are required" });
      }
      const HOSTEL_CODES = {
        "Kaveri Ladies Hostel": "girls 2547",
        "Amaravathi Ladies Hostel": "ladies 9021",
        "Bhavani Ladies Hostel": "ladies 3341",
        "Dheeran Mens Hostel": "mens 4452",
        "Valluvar Mens Hostel": "mens 1123",
        "Ilango Mens Hostel": "mens 7789",
        "Bharathi Mens Hostel": "mens 5564",
        "Kamban Mens Hostel": "mens 8891",
        "Ponnar Mens Hostel": "mens 1002",
        "Sankar Mens Hostel": "mens 9987"
      };
      const derivedBlock = Object.keys(HOSTEL_CODES).find(
        (block) => HOSTEL_CODES[block].toLowerCase() === studentHostelCode.trim().toLowerCase()
      );
      if (!derivedBlock) {
        return res.status(401).json({ error: "Invalid Unique Hostel Code" });
      }
      hostelBlock = derivedBlock;
      user = await User_default.findOne({
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
    const resetToken = import_jsonwebtoken2.default.sign(
      { id: user._id, registerId: user.registerId || user.hostelBlock },
      JWT_SECRET,
      { expiresIn: "15m" }
    );
    res.json({
      success: true,
      message: `${role === "admin" ? "Admin" : "Student"} verified successfully`,
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
router.post("/forgot-password/reset", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: "Reset token and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    let decoded;
    try {
      decoded = import_jsonwebtoken2.default.verify(resetToken, JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ error: "Reset token expired or invalid" });
    }
    const admin = await User_default.findById(decoded.id);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }
    const hashedPassword = await import_bcryptjs.default.hash(newPassword, 10);
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
router.put("/password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    if (!newPassword) {
      return res.status(400).json({ error: "Missing new password" });
    }
    const user = await User_default.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (currentPassword) {
      const isMatch = await import_bcryptjs.default.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: "Incorrect current password" });
      }
    }
    const hashedPassword = await import_bcryptjs.default.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
var auth_default = router;

// server/routes/users.ts
var import_express2 = __toESM(require("express"));
init_User();
var router2 = import_express2.default.Router();
function escapeRegex2(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildCaseInsensitiveRegex(value) {
  return new RegExp(`^${escapeRegex2(value.trim())}$`, "i");
}
router2.get("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const hostelBlock = req.query.hostelBlock || req.user.hostelBlock;
    const users = await User_default.find({
      hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, "i") }
    }).select("-password");
    res.json(users);
  } catch (error) {
    console.error("Error fetching all users:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router2.get("/roommates/:roomNumber/:hostelBlock", authMiddleware, async (req, res) => {
  try {
    const { roomNumber, hostelBlock } = req.params;
    if (req.user.hostelBlock?.trim().toLowerCase() !== hostelBlock?.trim().toLowerCase() && req.user.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized access to this block" });
    }
    const roommates = await User_default.find({
      roomNumber: buildCaseInsensitiveRegex(roomNumber),
      hostelBlock: buildCaseInsensitiveRegex(hostelBlock)
    }).select("name registerId phone profileImage");
    console.log(`Fetching roommates: roomNumber=${roomNumber}, hostelBlock=${hostelBlock}, found: ${roommates.length}`);
    res.json(roommates);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router2.get("/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User_default.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const isSelf = req.user.id === user.id;
    const isAdminOfBlock = req.user.role === "admin" && req.user.hostelBlock === user.hostelBlock;
    if (!isSelf && !isAdminOfBlock) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router2.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { name, phone, roomNumber, hostelBlock, profileImage } = req.body;
    const userToUpdate = await User_default.findById(req.params.id);
    if (!userToUpdate) return res.status(404).json({ error: "User not found" });
    const isSelf = req.user.id.toString() === userToUpdate._id.toString();
    const isAdminOfBlock = req.user.role === "admin" && req.user.hostelBlock === userToUpdate.hostelBlock;
    console.log(`Update Attempt for ${userToUpdate.name}: isSelf=${isSelf}, isAdmin=${isAdminOfBlock}`);
    if (!isSelf && !isAdminOfBlock) {
      console.log(`Unauthorized update by ${req.user.id} on ${userToUpdate._id}`);
      return res.status(403).json({ error: "Unauthorized" });
    }
    const updateFields = {};
    if (name !== void 0) updateFields.name = name;
    if (phone !== void 0) updateFields.phone = phone;
    if (roomNumber !== void 0) updateFields.roomNumber = roomNumber;
    if (hostelBlock !== void 0 && (req.user.role !== "admin" || hostelBlock === userToUpdate.hostelBlock)) {
      updateFields.hostelBlock = hostelBlock;
    }
    if (profileImage !== void 0) {
      updateFields.profileImage = profileImage;
      console.log(`\u{1F4E4} Processing profile image: ${(profileImage.length / 1024).toFixed(1)}KB`);
      try {
        console.log("\u{1F50D} Starting face detection and embedding extraction...");
        const startTime = Date.now();
        const embedding = await getFaceEmbedding(profileImage);
        const elapsed = Date.now() - startTime;
        updateFields.faceEmbedding = Array.from(embedding);
        console.log(`\u2705 Face embedding extracted successfully (${elapsed}ms): 128 dimensions`);
      } catch (error) {
        console.error("\u274C Face extraction error:", error);
        const message = error?.message || "Face processing error";
        const statusCode = message.includes("currently unavailable") ? 503 : 400;
        return res.status(statusCode).json({ error: message });
      }
    }
    const user = await User_default.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    ).select("-password");
    if (user) {
      console.log(`\u2705 Update successful for ${user.name} (ID: ${user._id})`);
      console.log(`   - Profile Image: ${user.profileImage ? "Present" : "Missing"}`);
      console.log(`   - Face Embedding: ${user.faceEmbedding ? "Present (" + user.faceEmbedding.length + " dims)" : "Missing"}`);
    }
    res.json(user);
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router2.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const userToDelete = await User_default.findById(req.params.id);
    if (!userToDelete) return res.status(404).json({ error: "User not found" });
    if (userToDelete.hostelBlock !== req.user.hostelBlock) {
      return res.status(403).json({ error: "Unauthorized to delete user from another block" });
    }
    await User_default.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
var users_default = router2;

// server/routes/attendances.ts
var import_express3 = __toESM(require("express"));

// server/models/Attendance.ts
var import_mongoose4 = __toESM(require("mongoose"));
var AttendanceSchema = new import_mongoose4.Schema({
  userId: { type: import_mongoose4.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: Date, required: true },
  isPresent: { type: Boolean, default: true },
  photoUrl: { type: String },
  latitude: { type: String },
  longitude: { type: String },
  markedAt: { type: Date, default: Date.now },
  reason: { type: String },
  status: {
    type: String,
    enum: ["present", "absent", "leave", "holiday"],
    default: "present"
  },
  session: {
    type: String,
    enum: ["morning", "afternoon"],
    required: true
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});
var Attendance_default = import_mongoose4.default.models.Attendance || import_mongoose4.default.model("Attendance", AttendanceSchema);

// server/routes/attendances.ts
init_User();

// server/models/HostelSettings.ts
var import_mongoose5 = __toESM(require("mongoose"));
var HostelSettingsSchema = new import_mongoose5.Schema({
  hostelBlock: { type: String, required: true, unique: true },
  leaveWindowFrom: { type: Date, default: null },
  leaveWindowTo: { type: Date, default: null },
  leaveWindowLabel: { type: String, default: "" },
  updatedBy: { type: import_mongoose5.Schema.Types.ObjectId, ref: "User" }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});
var HostelSettings_default = import_mongoose5.default.models.HostelSettings || import_mongoose5.default.model("HostelSettings", HostelSettingsSchema);

// server/models/LeaveRequest.ts
var import_mongoose6 = __toESM(require("mongoose"));
var LeaveRequestSchema = new import_mongoose6.Schema({
  userId: { type: import_mongoose6.Schema.Types.ObjectId, ref: "User", required: true },
  hostelBlock: { type: String, required: true },
  // ✅ IMPORTANT
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  reason: { type: String, required: true },
  imageUrl: { type: String },
  isEmergency: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },
  adminRemarks: { type: String },
  createdAt: { type: Date, default: Date.now }
});
var LeaveRequest_default = import_mongoose6.default.models.LeaveRequest || import_mongoose6.default.model("LeaveRequest", LeaveRequestSchema);

// server/routes/attendances.ts
var import_exceljs = __toESM(require("exceljs"));

// server/config/hostels.ts
var VALLUVAR_CONFIG = {
  points: [
    { latitude: 11.273458896122523, longitude: 77.60649425525024 },
    { latitude: 11.27341680881379, longitude: 77.60733915107322 },
    { latitude: 11.273764028926491, longitude: 77.60702801483365 },
    { latitude: 11.27316691529131, longitude: 77.60702265041573 },
    { latitude: 11.273461526579116, longitude: 77.60701460378884 }
  ],
  center: { latitude: 11.273453635146646, longitude: 77.60697973507233 },
  radius: 1e3
  // 1000 meters radius for geofencing
};
var HOSTEL_LOCATIONS = {
  "Kaveri Ladies Hostel": { ...VALLUVAR_CONFIG },
  "Amaravathi Ladies Hostel": { ...VALLUVAR_CONFIG },
  "Bhavani Ladies Hostel": { ...VALLUVAR_CONFIG },
  "Dheeran Mens Hostel": { ...VALLUVAR_CONFIG },
  "Valluvar Mens Hostel": { ...VALLUVAR_CONFIG },
  "Ilango Mens Hostel": { ...VALLUVAR_CONFIG },
  "Bharathi Mens Hostel": { ...VALLUVAR_CONFIG },
  "Kamban Mens Hostel": { ...VALLUVAR_CONFIG },
  "Ponnar Mens Hostel": { ...VALLUVAR_CONFIG },
  "Sankar Mens Hostel": { ...VALLUVAR_CONFIG },
  "TEST - My Location": { ...VALLUVAR_CONFIG }
};

// server/routes/attendances.ts
var router3 = import_express3.default.Router();
router3.get("/", authMiddleware, async (req, res) => {
  try {
    const User = (await Promise.resolve().then(() => (init_User(), User_exports))).default;
    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const studentsInBlock = await (await Promise.resolve().then(() => (init_User(), User_exports))).default.find({ hostelBlock: admin.hostelBlock }).select("_id");
    const studentIds = studentsInBlock.map((s) => s._id);
    const attendances = await Attendance_default.find({ userId: { $in: studentIds } }).populate("userId", "name registerId hostelBlock").sort({ markedAt: -1 }).lean();
    res.json(attendances);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router3.get("/user/:userId", authMiddleware, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      if (req.user.role !== "admin") return res.status(403).json({ error: "Unauthorized" });
      const targetUser = await User_default.findById(req.params.userId);
      if (!targetUser || targetUser.hostelBlock !== req.user.hostelBlock) {
        return res.status(403).json({ error: "Unauthorized block access" });
      }
    }
    const attendances = await Attendance_default.find({ userId: req.params.userId });
    res.json(attendances);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router3.get("/check/:userId/:date", authMiddleware, async (req, res) => {
  try {
    const { userId, date } = req.params;
    if (userId !== req.user.id) {
      if (req.user.role !== "admin") return res.status(403).json({ error: "Unauthorized" });
      const targetUser = await User_default.findById(userId);
      if (!targetUser || targetUser.hostelBlock !== req.user.hostelBlock) {
        return res.status(403).json({ error: "Unauthorized block access" });
      }
    }
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const attendances = await Attendance_default.find({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });
    const morning = attendances.find((a) => a.session === "morning");
    const afternoon = attendances.find((a) => a.session === "afternoon");
    res.json({
      morningMarked: !!morning,
      afternoonMarked: !!afternoon,
      morning,
      afternoon
    });
  } catch (error) {
    console.error("CHECK ERROR:", error);
    res.status(500).json({ error: "Server error CHECK" });
  }
});
router3.get("/date/:date", authMiddleware, async (req, res) => {
  try {
    const admin = await User_default.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const { date } = req.params;
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const isHoliday = false;
    const students = await User_default.find({ role: "student", hostelBlock: admin.hostelBlock }).select("name registerId hostelBlock");
    const attendances = await Attendance_default.find({
      date: { $gte: startOfDay, $lte: endOfDay },
      userId: { $in: students.map((s) => s._id) }
    }).lean();
    const hSettings = await HostelSettings_default.findOne({ hostelBlock: admin.hostelBlock }).lean();
    const isHostelLeave = hSettings && hSettings.leaveWindowLabel && hSettings.leaveWindowFrom && hSettings.leaveWindowTo && endOfDay >= new Date(new Date(hSettings.leaveWindowFrom).setHours(0, 0, 0, 0)) && startOfDay <= new Date(new Date(hSettings.leaveWindowTo).setHours(23, 59, 59, 999));
    const approvedLeaves = await LeaveRequest_default.find({
      status: "approved",
      hostelBlock: admin.hostelBlock,
      // Added for strict isolation & efficiency
      fromDate: { $lte: endOfDay },
      toDate: { $gte: startOfDay }
    }).select("userId").lean();
    const result = students.reduce((acc, student) => {
      const studentAttendances = attendances.filter((a) => a.userId.toString() === student._id.toString());
      const isOnApprovedLeave = approvedLeaves.some((l) => l.userId.toString() === student._id.toString());
      const studentIsOnLeave = isOnApprovedLeave || isHostelLeave;
      ["morning", "afternoon"].forEach((session) => {
        const existing = studentAttendances.find((a) => a.session === session);
        const calculatedStatus = existing?.isPresent ? "present" : isOnApprovedLeave ? "leave" : isHostelLeave ? "holiday" : isHoliday ? "holiday" : "absent";
        if (existing) {
          acc.push({
            ...existing,
            userId: student,
            status: calculatedStatus,
            isLeave: !existing.isPresent && isOnApprovedLeave,
            isHoliday: isHostelLeave || isHoliday
          });
        } else {
          acc.push({
            userId: student,
            isPresent: false,
            isLeave: isOnApprovedLeave,
            isHoliday: isHostelLeave || isHoliday,
            session,
            markedAt: startOfDay,
            status: calculatedStatus
          });
        }
      });
      return acc;
    }, []);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json(result);
  } catch (error) {
    console.error("DATE ERROR:", error);
    res.status(500).json({ error: "Server error DATE" });
  }
});
router3.get("/today", authMiddleware, async (req, res) => {
  try {
    const User = (await Promise.resolve().then(() => (init_User(), User_exports))).default;
    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const today = /* @__PURE__ */ new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const studentIdsInBlock = await User.distinct("_id", { role: "student", hostelBlock: admin.hostelBlock });
    const attendances = await Attendance_default.find({
      date: { $gte: startOfDay, $lte: endOfDay },
      userId: { $in: studentIdsInBlock }
    }).populate("userId", "name registerId hostelBlock");
    res.json(attendances);
  } catch (error) {
    res.status(500).json({ error: "Server error TODAY" });
  }
});
router3.get("/stats/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const mongoose14 = (await import("mongoose")).default;
    const user = await User_default.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const [attendances, leaves, hostelSettings] = await Promise.all([
      Attendance_default.find({ userId: new mongoose14.Types.ObjectId(userId) }).lean(),
      LeaveRequest_default.find({ userId: new mongoose14.Types.ObjectId(userId), status: "approved" }).lean(),
      HostelSettings_default.findOne({ hostelBlock: user.hostelBlock }).lean()
    ]);
    const allAttendances = await Attendance_default.find().lean();
    const uniqueDates = Array.from(new Set(allAttendances.map((a) => {
      const d = new Date(a.date);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }))).sort();
    let present = 0;
    let absent = 0;
    let leave = 0;
    uniqueDates.forEach((dateTime) => {
      const date = new Date(dateTime);
      const attendance = attendances.find((a) => {
        const ad = new Date(a.date);
        return ad.getFullYear() === date.getFullYear() && ad.getMonth() === date.getMonth() && ad.getDate() === date.getDate();
      });
      if (attendance && attendance.isPresent) {
        present++;
      } else {
        const isOnApprovedLeave = leaves.some((l) => {
          const from = new Date(l.fromDate);
          const to = new Date(l.toDate);
          return date >= from && date <= to;
        });
        const isHostelLeave = hostelSettings && hostelSettings.leaveWindowLabel && hostelSettings.leaveWindowFrom && hostelSettings.leaveWindowTo && new Date(date.getTime() + 86399999) >= new Date(new Date(hostelSettings.leaveWindowFrom).setHours(0, 0, 0, 0)) && date <= new Date(new Date(hostelSettings.leaveWindowTo).setHours(23, 59, 59, 999));
        if (isOnApprovedLeave) {
          leave++;
        } else if (isHostelLeave) {
        } else {
          absent++;
        }
      }
    });
    const total = present + absent;
    const percentage = total > 0 ? Math.round(present / total * 100) : 0;
    res.json({
      present,
      absent,
      leave,
      percentage
    });
  } catch (error) {
    console.error("STATS ERROR:", error);
    res.status(500).json({ error: "Server error STATS" });
  }
});
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const \u03C61 = lat1 * Math.PI / 180;
  const \u03C62 = lat2 * Math.PI / 180;
  const \u0394\u03C6 = (lat2 - lat1) * Math.PI / 180;
  const \u0394\u03BB = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(\u0394\u03C6 / 2) * Math.sin(\u0394\u03C6 / 2) + Math.cos(\u03C61) * Math.cos(\u03C62) * Math.sin(\u0394\u03BB / 2) * Math.sin(\u0394\u03BB / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function isPointInPolygon(lat, lon, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].latitude;
    const yi = polygon[i].longitude;
    const xj = polygon[j].latitude;
    const yj = polygon[j].longitude;
    const intersect = yi > lon !== yj > lon && lat < (xj - xi) * (lon - yi) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
router3.post("/", authMiddleware, async (req, res) => {
  try {
    const { userId, date, isPresent, photoUrl, latitude, longitude, reason, selectedHostel } = req.body;
    let sanitizedPhotoUrl = photoUrl;
    if (photoUrl && typeof photoUrl === "string") {
      const parts = photoUrl.split("base64,");
      if (parts.length > 2) {
        sanitizedPhotoUrl = `data:image/jpeg;base64,${parts[parts.length - 1]}`;
      }
    }
    const User = (await Promise.resolve().then(() => (init_User(), User_exports))).default;
    const user = await User.findById(userId);
    if (user) {
      console.log(`\u{1F50D} Checking attendance for ${user.name} (ID: ${user._id})`);
      console.log(`   - Face ID present: ${!!user.faceEmbedding}, Length: ${user.faceEmbedding?.length}`);
    }
    if (!user) {
      console.log(`\u274C User not found for ID: ${userId}`);
      return res.status(404).json({ error: "User not found" });
    }
    console.log(`\u{1F464} User fetched: ${user.name} (${user._id})`);
    console.log(`\u{1F464} Face Embedding Status: ${user.faceEmbedding ? "Present" : "Missing"}, Length: ${user.faceEmbedding?.length}`);
    const now = /* @__PURE__ */ new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 100 + minutes;
    let session = null;
    if (currentTime >= 700 && currentTime <= 1230) session = "morning";
    else if (currentTime >= 1230 && currentTime <= 1800) session = "afternoon";
    if (!session && isPresent) {
      return res.status(400).json({ error: "Attendance can only be marked between 07:00-12:30 PM and 12:30-06:00 PM." });
    }
    const attendanceDate = new Date(date);
    const startOfDay = new Date(attendanceDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(attendanceDate);
    endOfDay.setHours(23, 59, 59, 999);
    const query = {
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    };
    if (session) query.session = session;
    const existingAttendance = await Attendance_default.findOne(query);
    if (existingAttendance && isPresent) {
      return res.status(400).json({ error: `Attendance already marked for ${session} session today.` });
    }
    const hostelToValidate = user.hostelBlock;
    const hostelConfig = HOSTEL_LOCATIONS[hostelToValidate];
    console.log(`\u{1F4CD} Geofencing check for ${hostelToValidate}`);
    console.log(`   User location: ${latitude}, ${longitude}`);
    console.log(`   Hostel center: ${hostelConfig?.center?.latitude}, ${hostelConfig?.center?.longitude}`);
    console.log(`   Hostel radius: ${hostelConfig?.radius}m`);
    const isWebTest = latitude === "web" || latitude === void 0 || longitude === void 0;
    if (hostelConfig && latitude && longitude && !isWebTest) {
      let isInside = false;
      if (hostelConfig.radius && hostelConfig.center) {
        const distance = getDistance(
          parseFloat(latitude),
          parseFloat(longitude),
          hostelConfig.center.latitude,
          hostelConfig.center.longitude
        );
        console.log(`\u{1F4CD} Distance from center: ${distance.toFixed(2)}m (Max: ${hostelConfig.radius}m)`);
        console.log(`   ${distance <= hostelConfig.radius ? "\u2705 INSIDE" : "\u274C OUTSIDE"} geofence`);
        isInside = distance <= hostelConfig.radius;
      } else {
        isInside = isPointInPolygon(
          parseFloat(latitude),
          parseFloat(longitude),
          hostelConfig.points
        );
        console.log(`   Polygon check: ${isInside ? "\u2705 INSIDE" : "\u274C OUTSIDE"}`);
      }
      if (!isInside) {
        return res.status(400).json({
          error: `Location validation failed. You are outside ${hostelToValidate} boundaries.`
        });
      }
    } else if (!isWebTest) {
      console.log(`\u23ED\uFE0F Skipping geofencing check for web/test environment`);
    } else if (!hostelConfig && isPresent) {
      console.warn(`No coordinates configured for hostel: ${hostelToValidate}`);
    }
    if (isPresent && photoUrl) {
      if (!user.faceEmbedding || user.faceEmbedding.length === 0) {
        console.log(`\u274C No face embedding registered for ${user.name}`);
        return res.status(400).json({ error: "Face ID not registered. Please tap your profile picture to register your Face ID." });
      }
      try {
        console.log(`
\u{1F50D} === FACE VERIFICATION START for ${user.name} ===`);
        const faceStartTime = Date.now();
        let currentEmbedding;
        try {
          currentEmbedding = await getFaceEmbedding(sanitizedPhotoUrl);
        } catch (faceError) {
          console.log(`\u274C Face detection/verification error: ${faceError.message}`);
          const message = faceError?.message || "Face verification failed";
          const statusCode = message.includes("currently unavailable") ? 503 : 400;
          return res.status(statusCode).json({ error: message });
        }
        const faceElapsed = Date.now() - faceStartTime;
        const similarity = calculateSimilarity(user.faceEmbedding, Array.from(currentEmbedding));
        console.log(`\u{1F4CA} Face matching result: ${similarity.toFixed(2)}% similarity (checked in ${faceElapsed}ms)`);
        const MATCH_THRESHOLD = 50;
        if (similarity < MATCH_THRESHOLD) {
          return res.status(400).json({
            error: `Face mismatch! Similarity: ${similarity.toFixed(1)}%. Please ensure it's you.`
          });
        }
        console.log(`\u2705 Face ID verified for ${user.name}`);
      } catch (err) {
        console.error("Face verification error:", err);
        return res.status(500).json({ error: "Face verification service error. Please try again." });
      }
    }
    const attendance = new Attendance_default({
      userId,
      date,
      isPresent,
      photoUrl: sanitizedPhotoUrl,
      // Use sanitized URL
      latitude,
      longitude,
      reason,
      status: isPresent ? "present" : "absent",
      session: session || "morning"
      // Fallback for manual admin entries if needed
    });
    await attendance.save();
    res.status(201).json(attendance);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});
router3.put("/:id", authMiddleware, async (req, res) => {
  try {
    const User = (await Promise.resolve().then(() => (init_User(), User_exports))).default;
    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const attendance = await Attendance_default.findById(req.params.id).populate("userId", "hostelBlock");
    if (!attendance) {
      return res.status(404).json({ error: "Attendance not found" });
    }
    if (attendance.userId.hostelBlock !== admin.hostelBlock) {
      return res.status(403).json({ error: "Unauthorized to update attendance from another block" });
    }
    const updated = await Attendance_default.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router3.delete("/today/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const today = /* @__PURE__ */ new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const targetUser = await User_default.findById(userId);
    if (!targetUser) return res.status(404).json({ error: "User not found" });
    if (userId !== req.user.id) {
      if (req.user.role !== "admin" || req.user.hostelBlock !== targetUser.hostelBlock) {
        return res.status(403).json({ error: "Unauthorized to delete attendance" });
      }
    }
    const result = await Attendance_default.deleteMany({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });
    res.json({
      message: "Attendance deleted",
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error("Error deleting attendance:", error);
    res.status(500).json({ error: "Server error DELETE TODAY" });
  }
});
router3.delete("/user/:userId/date/:date", authMiddleware, async (req, res) => {
  try {
    const { userId, date } = req.params;
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    startOfDay.setDate(startOfDay.getDate() - 1);
    endOfDay.setDate(endOfDay.getDate() + 1);
    console.log(`--- DELETE REQUEST (WIDENED) ---`);
    console.log(`User: ${userId}, Date param: ${date}`);
    console.log(`Start of Day (Widened): ${startOfDay.toISOString()}`);
    console.log(`End of Day (Widened): ${endOfDay.toISOString()}`);
    const allUserRecords = await Attendance_default.find({ userId });
    const existing = await Attendance_default.find({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });
    const result = await Attendance_default.deleteMany({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });
    console.log(`Deleted count: ${result.deletedCount}`);
    console.log(`----------------------`);
    res.json({
      message: "Attendance deleted",
      deletedCount: result.deletedCount,
      debug: {
        userId,
        dateParam: date,
        serverQueryStart: startOfDay.toISOString(),
        serverQueryEnd: endOfDay.toISOString(),
        foundRecordsInRange: existing.map((e) => ({ id: e._id, date: e.date.toISOString() })),
        ALL_USER_RECORDS: allUserRecords.map((e) => ({ id: e._id, date: e.date.toISOString() }))
      }
    });
  } catch (error) {
    console.error("Error deleting attendance:", error);
    res.status(500).json({ error: "Server error DELETE DATE" });
  }
});
router3.get("/export-excel", authMiddleware, async (req, res) => {
  try {
    const User = (await Promise.resolve().then(() => (init_User(), User_exports))).default;
    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const workbook = new import_exceljs.default.Workbook();
    workbook.creator = "Hostel Hub";
    workbook.lastModifiedBy = "Hostel Hub Admin";
    workbook.created = /* @__PURE__ */ new Date();
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const students = await User.find({ role: "student", hostelBlock: admin.hostelBlock }).sort({ name: 1 });
    const studentIds = students.map((s) => s._id);
    const attendances = await Attendance_default.find({
      userId: { $in: studentIds }
    }).lean();
    const allApprovedLeaves = await LeaveRequest_default.find({
      userId: { $in: studentIds },
      status: "approved"
    }).lean();
    const hostelSettings = await HostelSettings_default.findOne({
      hostelBlock: admin.hostelBlock
    }).lean();
    const dateRange = [];
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dateRange.push(d);
    }
    dateRange.reverse();
    const sheet = workbook.addWorksheet(`Attendance Summary`);
    sheet.columns = [
      { header: "Register ID", key: "id", width: 15 },
      { header: "Name", key: "name", width: 25 },
      { header: "Room", key: "room", width: 12 },
      { header: "Morning Present", key: "mPresent", width: 18 },
      { header: "Morning Absent", key: "mAbsent", width: 18 },
      { header: "Afternoon Present", key: "nPresent", width: 18 },
      { header: "Afternoon Absent", key: "nAbsent", width: 18 },
      { header: "Total Leave", key: "leave", width: 15 },
      { header: "Attendance %", key: "percentage", width: 15 }
    ];
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    students.forEach((student, studentIndex) => {
      const studentAttendances = attendances.filter((a) => a.userId.toString() === student._id.toString());
      const studentLeaves = allApprovedLeaves.filter((l) => l.userId.toString() === student._id.toString());
      let mPresent = 0, mAbsent = 0, nPresent = 0, nAbsent = 0, leaveCount = 0;
      dateRange.forEach((date) => {
        const isOnApprovedLeave = studentLeaves.some(
          (l) => new Date(date.getTime() + 86399999) >= new Date(new Date(l.fromDate).setHours(0, 0, 0, 0)) && date <= new Date(new Date(l.toDate).setHours(23, 59, 59, 999))
        );
        const isHostelLeave = hostelSettings && hostelSettings.leaveWindowLabel && hostelSettings.leaveWindowFrom && hostelSettings.leaveWindowTo && new Date(date.getTime() + 86399999) >= new Date(new Date(hostelSettings.leaveWindowFrom).setHours(0, 0, 0, 0)) && date <= new Date(new Date(hostelSettings.leaveWindowTo).setHours(23, 59, 59, 999));
        const isLeaveDay = isOnApprovedLeave || isHostelLeave;
        const morningRec = studentAttendances.find((a) => new Date(a.date).toDateString() === date.toDateString() && a.session === "morning");
        const isHoliday = false;
        if (morningRec && morningRec.isPresent) mPresent++;
        else if (isLeaveDay) leaveCount++;
        else if (!isHoliday) mAbsent++;
        const afternoonRec = studentAttendances.find((a) => new Date(a.date).toDateString() === date.toDateString() && a.session === "afternoon");
        if (afternoonRec && afternoonRec.isPresent) nPresent++;
        else if (isLeaveDay) leaveCount++;
        else if (!isHoliday) nAbsent++;
      });
      const totalPresent = mPresent + nPresent;
      const totalPossible = totalPresent + mAbsent + nAbsent;
      const percentage = totalPossible > 0 ? (totalPresent / totalPossible * 100).toFixed(1) + "%" : "0.0%";
      const row = sheet.addRow({
        id: student.registerId,
        name: student.name,
        room: student.roomNumber || "N/A",
        mPresent,
        mAbsent,
        nPresent,
        nAbsent,
        leave: leaveCount,
        percentage
      });
      if (studentIndex % 2 === 0) {
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
      }
      row.eachCell((cell) => {
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
    });
    const matrixSheet = workbook.addWorksheet("Monthly Matrix");
    const columns = [
      { header: "Register ID", key: "id", width: 15 },
      { header: "Name", key: "name", width: 25 }
    ];
    dateRange.forEach((date) => {
      const dateStr = date.getDate().toString().padStart(2, "0") + "/" + (date.getMonth() + 1).toString().padStart(2, "0");
      columns.push({ header: `${dateStr} M`, key: `${date.getTime()}_m`, width: 10 });
      columns.push({ header: `${dateStr} A`, key: `${date.getTime()}_a`, width: 10 });
    });
    matrixSheet.columns = columns;
    const matrixHeader = matrixSheet.getRow(1);
    matrixHeader.height = 25;
    matrixHeader.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
    matrixHeader.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: "middle", horizontal: "center" };
      if (colNumber <= 2) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
      } else {
        const isMorning = (colNumber - 2) % 2 !== 0;
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isMorning ? "FF1E40AF" : "FF475569" }
          // Deep Blue for Morning, Slate for Afternoon
        };
      }
    });
    matrixSheet.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
    students.forEach((student) => {
      const studentAttendances = attendances.filter((a) => a.userId.toString() === student._id.toString());
      const studentLeaves = allApprovedLeaves.filter((l) => l.userId.toString() === student._id.toString());
      const rowData = {
        id: student.registerId,
        name: student.name
      };
      dateRange.forEach((date) => {
        const isHoliday = false;
        const isOnApprovedLeave = studentLeaves.some(
          (l) => new Date(date.getTime() + 86399999) >= new Date(new Date(l.fromDate).setHours(0, 0, 0, 0)) && date <= new Date(new Date(l.toDate).setHours(23, 59, 59, 999))
        );
        const isHostelLeave = hostelSettings && hostelSettings.leaveWindowLabel && hostelSettings.leaveWindowFrom && hostelSettings.leaveWindowTo && new Date(date.getTime() + 86399999) >= new Date(new Date(hostelSettings.leaveWindowFrom).setHours(0, 0, 0, 0)) && date <= new Date(new Date(hostelSettings.leaveWindowTo).setHours(23, 59, 59, 999));
        const isLeaveDay = isOnApprovedLeave || isHostelLeave;
        ["morning", "afternoon"].forEach((session) => {
          const key = `${date.getTime()}_${session === "morning" ? "m" : "a"}`;
          const rec = studentAttendances.find((a) => new Date(a.date).toDateString() === date.toDateString() && a.session === session);
          if (rec && rec.isPresent) rowData[key] = "P";
          else if (isOnApprovedLeave) rowData[key] = "L";
          else if (isHostelLeave || isHoliday) rowData[key] = "H";
          else rowData[key] = "A";
        });
      });
      const row = matrixSheet.addRow(rowData);
      row.eachCell((cell, colNumber) => {
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        if (colNumber > 2) {
          const val = cell.value;
          if (val === "P") cell.font = { color: { argb: "FF059669" }, bold: true };
          if (val === "A") cell.font = { color: { argb: "FFDC2626" }, bold: true };
          if (val === "L") cell.font = { color: { argb: "FFD97706" }, bold: true };
          if (val === "H") cell.font = { color: { argb: "FF7C3AED" }, bold: true };
        }
      });
    });
    const todayStatusSheet = workbook.addWorksheet("Today Live Status");
    todayStatusSheet.columns = [
      { header: "Register ID", key: "id", width: 15 },
      { header: "Name", key: "name", width: 25 },
      { header: "Room", key: "room", width: 10 },
      { header: "Morning (07:00-12:30)", key: "morning", width: 15 },
      { header: "Afternoon (12:30)", key: "afternoon", width: 15 }
    ];
    const todayHeader = todayStatusSheet.getRow(1);
    todayHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
    todayHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
    todayHeader.alignment = { vertical: "middle", horizontal: "center" };
    const startOfToday = /* @__PURE__ */ new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = /* @__PURE__ */ new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const isHolidayToday = false;
    students.forEach((student) => {
      const studentAttendances = attendances.filter((a) => a.userId.toString() === student._id.toString());
      const isOnLeaveToday = allApprovedLeaves.some((l) => l.userId.toString() === student._id.toString() && startOfToday >= new Date(l.fromDate) && startOfToday <= new Date(l.toDate)) || hostelSettings && hostelSettings.leaveWindowLabel && hostelSettings.leaveWindowFrom && hostelSettings.leaveWindowTo && endOfToday >= new Date(new Date(hostelSettings.leaveWindowFrom).setHours(0, 0, 0, 0)) && startOfToday <= new Date(new Date(hostelSettings.leaveWindowTo).setHours(23, 59, 59, 999));
      const mornToday = studentAttendances.find((a) => new Date(a.date).toDateString() === startOfToday.toDateString() && a.session === "morning");
      const afternoonToday = studentAttendances.find((a) => new Date(a.date).toDateString() === startOfToday.toDateString() && a.session === "afternoon");
      const leaveLabel = hostelSettings?.leaveWindowLabel || "LEAVE";
      const getLabel = (rec) => rec ? "PRESENT" : isOnLeaveToday ? leaveLabel.toUpperCase() : "ABSENT";
      const row = todayStatusSheet.addRow({
        id: student.registerId,
        name: student.name,
        room: student.roomNumber || "N/A",
        morning: getLabel(mornToday),
        afternoon: getLabel(afternoonToday)
      });
      row.eachCell((cell, colNumber) => {
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        if (colNumber > 3) {
          const val = cell.value;
          if (val === "PRESENT") cell.font = { color: { argb: "FF059669" }, bold: true };
          if (val === "ABSENT") cell.font = { color: { argb: "FFDC2626" }, bold: true };
          if (val === "HOLIDAY" || val === "WEEKEND") cell.font = { color: { argb: "FF4F46E5" }, bold: true };
          if (val !== "PRESENT" && val !== "ABSENT" && val !== "HOLIDAY" && val !== "WEEKEND") cell.font = { color: { argb: "FFD97706" }, bold: true };
        }
      });
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=Attendance_Report.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("EXPORT EXCEL ERROR:", error);
    res.status(500).json({ error: "Server error while exporting Excel" });
  }
});
var attendances_default = router3;

// server/routes/leaveRequests.ts
var import_express4 = __toESM(require("express"));
init_User();
var router4 = import_express4.default.Router();
router4.post("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Students only" });
    }
    const { fromDate, toDate, reason, imageUrl, isEmergency } = req.body;
    const user = await User_default.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const request = await LeaveRequest_default.create({
      userId: user._id,
      hostelBlock: user.hostelBlock,
      fromDate,
      toDate,
      reason,
      imageUrl,
      isEmergency: isEmergency || false
    });
    res.status(201).json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create request" });
  }
});
router4.get("/user", authMiddleware, async (req, res) => {
  try {
    const requests = await LeaveRequest_default.find({
      userId: req.user.id
    }).sort({ createdAt: -1 });
    res.json(requests);
  } catch {
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});
router4.get("/user/:userId", authMiddleware, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Unauthorized" });
      }
      const targetUser = await User_default.findById(req.params.userId);
      if (!targetUser || targetUser.hostelBlock !== req.user.hostelBlock) {
        return res.status(403).json({ message: "Unauthorized to view requests from another block" });
      }
    }
    const requests = await LeaveRequest_default.find({
      userId: req.params.userId
    }).sort({ createdAt: -1 });
    res.json(requests);
  } catch {
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});
router4.get("/", authMiddleware, async (req, res) => {
  try {
    const admin = await User_default.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const requests = await LeaveRequest_default.find({
      hostelBlock: admin.hostelBlock
    }).populate("userId", "name registerId").sort({ createdAt: -1 });
    res.json(requests);
  } catch {
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});
router4.patch("/:id/status", authMiddleware, async (req, res) => {
  try {
    const admin = await User_default.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const { status, adminRemarks } = req.body;
    const request = await LeaveRequest_default.findOneAndUpdate(
      {
        _id: req.params.id,
        hostelBlock: admin.hostelBlock
        // Use fresh DB value
      },
      { status, adminRemarks },
      { new: true }
    );
    if (!request) {
      return res.status(404).json({ message: "Request not found or unauthorized" });
    }
    res.json(request);
  } catch (err) {
    console.error("Update Request Error:", err);
    res.status(500).json({ message: "Failed to update request" });
  }
});
var leaveRequests_default = router4;

// server/routes/complaints.ts
var import_express5 = __toESM(require("express"));

// server/models/Complaint.ts
var import_mongoose7 = __toESM(require("mongoose"));
var ComplaintSchema = new import_mongoose7.Schema({
  userId: { type: import_mongoose7.Schema.Types.ObjectId, ref: "User", required: true },
  hostelBlock: { type: String, required: true },
  category: { type: String, enum: ["water", "electricity", "cleaning", "food", "others"], required: true },
  description: { type: String, required: true },
  photoUrl: { type: String },
  isAnonymous: { type: Boolean, default: false },
  status: { type: String, enum: ["submitted", "in_progress", "resolved"], default: "submitted" },
  adminRemarks: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
var Complaint_default = import_mongoose7.default.models.Complaint || import_mongoose7.default.model("Complaint", ComplaintSchema);

// server/routes/complaints.ts
init_User();
var router5 = import_express5.default.Router();
router5.get("/", authMiddleware, async (req, res) => {
  try {
    const admin = await User_default.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const complaints = await Complaint_default.find({
      hostelBlock: admin.hostelBlock
    }).populate("userId", "name registerId phone roomNumber hostelBlock").sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    console.error("Error fetching complaints:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router5.get("/user/:userId", authMiddleware, async (req, res) => {
  try {
    if (req.params.userId !== req.user.id) {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const targetUser = await User_default.findById(req.params.userId);
      if (!targetUser || targetUser.hostelBlock !== req.user.hostelBlock) {
        return res.status(403).json({ error: "Unauthorized to view complaints from another block" });
      }
    }
    const complaints = await Complaint_default.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    console.error("Error fetching user complaints:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router5.post("/", authMiddleware, async (req, res) => {
  try {
    const { category, description, isAnonymous, photoUrl } = req.body;
    if (!category || !description) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const user = await User_default.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const complaint = new Complaint_default({
      userId: user._id,
      hostelBlock: user.hostelBlock,
      // Trusted from DB
      category,
      description,
      isAnonymous: isAnonymous || false,
      photoUrl
    });
    await complaint.save();
    res.status(201).json(complaint);
  } catch (error) {
    console.error("Error creating complaint:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router5.patch("/:id/status", authMiddleware, async (req, res) => {
  try {
    const { status, adminRemarks } = req.body;
    const admin = await User_default.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const complaint = await Complaint_default.findOne({
      _id: req.params.id,
      hostelBlock: admin.hostelBlock
    });
    if (!complaint) {
      return res.status(404).json({ error: "Complaint not found or unauthorized" });
    }
    complaint.status = status;
    complaint.adminRemarks = adminRemarks;
    complaint.updatedAt = /* @__PURE__ */ new Date();
    await complaint.save();
    res.json(complaint);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
var complaints_default = router5;

// server/routes/messMenus.ts
var import_express6 = __toESM(require("express"));

// server/models/MessMenu.ts
var import_mongoose8 = __toESM(require("mongoose"));
var MessMenuSchema = new import_mongoose8.Schema({
  date: { type: Date, required: false },
  // Made optional for default menus
  mealType: { type: String, enum: ["breakfast", "lunch", "dinner"], required: true },
  items: { type: String },
  // Make optional, kept for backward compatibility
  menuItems: [{
    name: { type: String, required: true }
  }],
  hostelBlock: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  dayOfWeek: { type: Number, min: 0, max: 6 },
  // 0=Sun, 6=Sat
  isSpecial: { type: Boolean, default: false },
  specialNote: { type: String },
  createdAt: { type: Date, default: Date.now }
});
var MessMenu_default = import_mongoose8.default.models.MessMenu || import_mongoose8.default.model("MessMenu", MessMenuSchema);

// server/routes/messMenus.ts
var router6 = import_express6.default.Router();
router6.get("/", authMiddleware, async (req, res) => {
  try {
    const { hostelBlock } = req.user;
    const menus = await MessMenu_default.find({ hostelBlock }).sort({ date: 1 });
    res.json(menus);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router6.get("/:date", authMiddleware, async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const { hostelBlock } = req.user;
    const specificMenus = await MessMenu_default.find({
      date: {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lte: new Date(date.setHours(23, 59, 59, 999))
      },
      hostelBlock
    });
    const foundMealTypes = specificMenus.map((m) => m.mealType);
    const allMealTypes = ["breakfast", "lunch", "dinner"];
    const missingMealTypes = allMealTypes.filter((type) => !foundMealTypes.includes(type));
    let finalMenus = [...specificMenus];
    if (missingMealTypes.length > 0) {
      const dayOfWeek = new Date(req.params.date).getDay();
      const defaultMenus = await MessMenu_default.find({
        isDefault: true,
        dayOfWeek,
        hostelBlock,
        mealType: { $in: missingMealTypes }
      });
      finalMenus = [...finalMenus, ...defaultMenus];
    }
    finalMenus.sort((a, b) => {
      const order = { breakfast: 0, lunch: 1, dinner: 2 };
      return (order[a.mealType] ?? 0) - (order[b.mealType] ?? 0);
    });
    res.json(finalMenus);
  } catch (error) {
    console.error("Fetch menu error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router6.post("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const { hostelBlock } = req.user;
    const menuData = {
      ...req.body,
      hostelBlock
      // Ensure it's the admin's block
    };
    const menu = new MessMenu_default(menuData);
    await menu.save();
    res.status(201).json(menu);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router6.put("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const menu = await MessMenu_default.findOneAndUpdate(
      { _id: req.params.id, hostelBlock: req.user.hostelBlock },
      req.body,
      { new: true }
    );
    if (!menu) {
      return res.status(404).json({ error: "Menu not found or unauthorized" });
    }
    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router6.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const menu = await MessMenu_default.findOneAndDelete({
      _id: req.params.id,
      hostelBlock: req.user.hostelBlock
    });
    if (!menu) {
      return res.status(404).json({ error: "Menu not found or unauthorized" });
    }
    res.json({ message: "Menu deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
var messMenus_default = router6;

// server/routes/menuSuggestions.ts
var import_express7 = __toESM(require("express"));

// server/models/MenuSuggestion.ts
var import_mongoose9 = __toESM(require("mongoose"));
var MenuSuggestionSchema = new import_mongoose9.Schema({
  hostelBlock: { type: String, required: true },
  dishName: { type: String, required: true },
  normalizedName: { type: String, required: true },
  // Store lowercase, trimmed version for strict duplicate checking
  category: { type: String, enum: ["breakfast", "lunch", "dinner", "snacks"], required: true },
  type: { type: String, enum: ["veg", "non-veg"], required: true },
  frequency: { type: String, enum: ["weekly", "monthly", "special", "trial"], default: "trial" },
  description: { type: String },
  allergens: [{ type: String }],
  // Track all users who suggested this same dish
  suggestedBy: [{
    userId: { type: import_mongoose9.Schema.Types.ObjectId, ref: "User" },
    name: String,
    roomNumber: { type: String }
  }],
  // Track all votes
  votes: [{ type: import_mongoose9.Schema.Types.ObjectId, ref: "User" }],
  voteCount: { type: Number, default: 0 },
  status: { type: String, enum: ["pending", "approved", "rejected", "scheduled"], default: "pending" },
  adminRemarks: { type: String },
  scheduledDate: { type: Date },
  // Time Cycle Tracking
  weekNumber: { type: Number, required: true },
  year: { type: Number, required: true },
  dayOfWeek: { type: String, enum: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] }
}, {
  timestamps: true
});
MenuSuggestionSchema.index({ hostelBlock: 1, normalizedName: 1, weekNumber: 1, year: 1, dayOfWeek: 1 });
MenuSuggestionSchema.index({ hostelBlock: 1, voteCount: -1 });
MenuSuggestionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 1209600 });
var MenuSuggestion_default = import_mongoose9.default.models.MenuSuggestion || import_mongoose9.default.model("MenuSuggestion", MenuSuggestionSchema);

// server/routes/menuSuggestions.ts
init_User();

// server/models/Announcement.ts
var import_mongoose10 = __toESM(require("mongoose"));
var AnnouncementSchema = new import_mongoose10.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  isEmergency: { type: Boolean, default: false },
  isHoliday: { type: Boolean, default: false },
  pollId: { type: String },
  // Reference to food poll
  hostelBlock: { type: String },
  // If null/undefined, it's for everyone
  createdAt: { type: Date, default: Date.now }
});
var Announcement_default = import_mongoose10.default.models.Announcement || import_mongoose10.default.model("Announcement", AnnouncementSchema);

// server/routes/menuSuggestions.ts
var import_exceljs2 = __toESM(require("exceljs"));
var router7 = import_express7.default.Router();
var getWeekNumber = (d) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
  return { week: weekNo, year: d.getUTCFullYear() };
};
router7.use(authMiddleware);
router7.get("/", async (req, res) => {
  try {
    const { week, forDate, mealType, hostelBlock: requestedBlock } = req.query;
    const uBlock = req.user?.role === "admin" && requestedBlock ? requestedBlock : req.user?.hostelBlock;
    const query = {};
    if (uBlock) query.hostelBlock = uBlock;
    if (forDate) {
      const d = new Date(forDate);
      if (!isNaN(d.getTime())) {
        const { week: w, year: y } = getWeekNumber(d);
        query.weekNumber = w;
        query.year = y;
      }
    } else {
      const { week: currentWeek, year } = getWeekNumber(/* @__PURE__ */ new Date());
      if (week === "current") {
        query.weekNumber = currentWeek;
        query.year = year;
      }
    }
    if (mealType) {
      query.category = mealType;
    }
    const suggestions = await MenuSuggestion_default.find(query).sort({ voteCount: -1, createdAt: -1 }).lean();
    const userId = req.user?.id;
    const weekdayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const weekdayFullNames = {
      "sun": "Sunday",
      "mon": "Monday",
      "tue": "Tuesday",
      "wed": "Wednesday",
      "thu": "Thursday",
      "fri": "Friday",
      "sat": "Saturday"
    };
    const enhancedSuggestions = suggestions.map((s) => {
      let inferredDay = s.dayOfWeek;
      if (!inferredDay && s.scheduledDate) {
        const d = new Date(s.scheduledDate);
        if (!isNaN(d.getTime())) inferredDay = weekdayNames[d.getDay()];
      }
      return {
        ...s,
        dayOfWeek: inferredDay,
        dayName: inferredDay ? weekdayFullNames[inferredDay.toLowerCase()] : "Unscheduled",
        hasVoted: userId ? (s.votes || []).map((id) => id.toString()).includes(userId) : false
      };
    });
    res.json(enhancedSuggestions);
  } catch (error) {
    console.error("Fetch suggestions error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router7.post("/suggest", async (req, res) => {
  try {
    const { dishName, category, type, description, frequency, dayOfWeek } = req.body;
    const userId = req.user.id;
    const uBlock = req.user.hostelBlock;
    if (!dishName || !category || !type) {
      return res.status(400).json({ error: "Missing required fields: dishName, category, and type are required" });
    }
    const user = await User_default.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const roomNumber = user.roomNumber;
    if (!roomNumber) return res.status(400).json({ error: "You must have a room number assigned to make suggestions" });
    const { week, year } = getWeekNumber(/* @__PURE__ */ new Date());
    const roomSuggestionQuery = {
      hostelBlock: uBlock,
      weekNumber: week,
      year,
      "suggestedBy.roomNumber": roomNumber
    };
    if (dayOfWeek) roomSuggestionQuery.dayOfWeek = dayOfWeek;
    const existingRoomSuggestion = await MenuSuggestion_default.findOne(roomSuggestionQuery);
    if (existingRoomSuggestion) {
      const roommate = existingRoomSuggestion.suggestedBy.find((s) => s.roomNumber === roomNumber);
      return res.status(400).json({
        error: `A suggestion has already been submitted for your room by ${roommate?.name || "a roommate"} for this period.`
      });
    }
    const normalizedName = dishName.trim().toLowerCase();
    const duplicateQuery = {
      hostelBlock: uBlock,
      weekNumber: week,
      year,
      normalizedName
    };
    if (dayOfWeek) duplicateQuery.dayOfWeek = dayOfWeek;
    let suggestion = await MenuSuggestion_default.findOne(duplicateQuery);
    if (suggestion) {
      const isAlreadySuggestor = suggestion.suggestedBy.some((s) => s.userId?.toString() === userId);
      if (!isAlreadySuggestor) {
        suggestion.suggestedBy.push({ userId, name: user.name, roomNumber });
      }
      const hasVoted = suggestion.votes?.some((v) => v.toString() === userId);
      if (!hasVoted) {
        suggestion.votes.push(userId);
        suggestion.voteCount = (suggestion.voteCount || 0) + 1;
      }
      await suggestion.save();
      return res.json(suggestion);
    }
    const newSuggestion = new MenuSuggestion_default({
      hostelBlock: uBlock,
      dishName: dishName.trim(),
      normalizedName,
      category,
      type: type || "veg",
      frequency: frequency || "trial",
      description,
      dayOfWeek,
      suggestedBy: [{ userId, name: user.name, roomNumber }],
      votes: [userId],
      voteCount: 1,
      weekNumber: week,
      year,
      status: "pending"
    });
    await newSuggestion.save();
    try {
      const newNotif = new Announcement_default({
        title: "New Menu Suggestion!",
        content: `${user.name} (Room ${roomNumber}) just suggested '${dishName.trim()}' for ${dayOfWeek?.toUpperCase() || "this week"}'s ${category.toUpperCase()}. Go upvote it!`,
        hostelBlock: uBlock,
        isEmergency: false
      });
      await newNotif.save();
    } catch (annError) {
      console.error("Announcement Error:", annError);
    }
    res.status(201).json(newSuggestion);
  } catch (error) {
    console.error("Suggestion Error Details:", error);
    res.status(500).json({ error: error.message || "Server error processing suggestion" });
  }
});
router7.post("/:id/vote", async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const uBlock = req.user.hostelBlock;
    const suggestion = await MenuSuggestion_default.findOne({ _id: id, hostelBlock: uBlock });
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found or from another block" });
    const voteIndex = suggestion.votes.findIndex((v) => v.toString() === userId);
    if (voteIndex === -1) {
      suggestion.votes.push(userId);
      suggestion.voteCount += 1;
    } else {
      suggestion.votes.splice(voteIndex, 1);
      suggestion.voteCount = Math.max(0, suggestion.voteCount - 1);
    }
    await suggestion.save();
    res.json({ id: suggestion._id, voteCount: suggestion.voteCount, hasVoted: voteIndex === -1 });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router7.patch("/:id/status", async (req, res) => {
  try {
    const uBlock = req.user.hostelBlock;
    const { status, adminRemarks, scheduledDate } = req.body;
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
    const suggestion = await MenuSuggestion_default.findOne({ _id: req.params.id, hostelBlock: uBlock });
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found or unauthorized" });
    suggestion.status = status;
    if (adminRemarks) suggestion.adminRemarks = adminRemarks;
    if (scheduledDate) suggestion.scheduledDate = scheduledDate;
    if (status === "scheduled" && scheduledDate) {
      const sDate = new Date(scheduledDate);
      sDate.setHours(0, 0, 0, 0);
      const existingMenu = await MessMenu_default.findOne({
        hostelBlock: uBlock,
        date: {
          $gte: new Date(sDate.setHours(0, 0, 0, 0)),
          $lte: new Date(sDate.setHours(23, 59, 59, 999))
        },
        mealType: suggestion.category === "snacks" ? "dinner" : suggestion.category
        // Map snacks to evening/dinner for now or keep as is
      });
      if (!existingMenu) {
        const newMenu = new MessMenu_default({
          hostelBlock: uBlock,
          mealType: suggestion.category === "snacks" ? "dinner" : suggestion.category,
          items: [suggestion.dishName],
          date: sDate,
          isDefault: false
        });
        await newMenu.save();
      } else {
        if (!existingMenu.items.includes(suggestion.dishName)) {
          existingMenu.items.push(suggestion.dishName);
          await existingMenu.save();
        }
      }
    }
    await suggestion.save();
    res.json(suggestion);
  } catch (error) {
    console.error("Update Status Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router7.get("/export/kitchen", async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
    const uBlock = req.user.hostelBlock;
    const { week, year } = getWeekNumber(/* @__PURE__ */ new Date());
    const suggestions = await MenuSuggestion_default.find({
      hostelBlock: uBlock,
      status: { $in: ["approved", "scheduled"] }
    }).sort({ category: 1, voteCount: -1 });
    const workbook = new import_exceljs2.default.Workbook();
    const worksheet = workbook.addWorksheet("Kitchen Menu Suggestions");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    worksheet.columns = [
      { header: "Day", key: "day", width: 15 },
      { header: "Dish Name", key: "dishName", width: 25 },
      { header: "Category", key: "category", width: 15 },
      { header: "Type", key: "type", width: 15 },
      { header: "Votes", key: "voteCount", width: 10 },
      { header: "Frequency", key: "frequency", width: 15 },
      { header: "Status", key: "status", width: 15 },
      { header: "Allergens", key: "allergens", width: 20 },
      { header: "Notes", key: "description", width: 30 }
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" }
    };
    const weekdayFullNames = {
      "sun": "Sunday",
      "mon": "Monday",
      "tue": "Tuesday",
      "wed": "Wednesday",
      "thu": "Thursday",
      "fri": "Friday",
      "sat": "Saturday"
    };
    suggestions.forEach((s) => {
      let dayVal = s.dayOfWeek ? weekdayFullNames[s.dayOfWeek.toLowerCase()] : "";
      if (!dayVal && s.scheduledDate) {
        dayVal = new Date(s.scheduledDate).toLocaleDateString("en-US", { weekday: "long" });
      }
      worksheet.addRow({
        day: dayVal,
        dishName: s.dishName,
        category: s.category.toUpperCase(),
        type: s.type.toUpperCase(),
        voteCount: s.voteCount,
        frequency: s.frequency,
        status: s.status,
        allergens: (s.allergens || []).join(", "),
        description: s.description || ""
      });
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Kitchen_Menu_${uBlock}_W${week}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Export Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router7.get("/export/excel", async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
    const uBlock = req.user.hostelBlock;
    const { week, year } = getWeekNumber(/* @__PURE__ */ new Date());
    const suggestions = await MenuSuggestion_default.find({
      hostelBlock: uBlock,
      weekNumber: week,
      year
    }).sort({ voteCount: -1 });
    const workbook = new import_exceljs2.default.Workbook();
    const worksheet = workbook.addWorksheet("Top Menu Suggestions");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    worksheet.columns = [
      { header: "Day", key: "day", width: 15 },
      { header: "Meal Session", key: "category", width: 15 },
      { header: "Dish Name", key: "dishName", width: 25 },
      { header: "Likes (Votes)", key: "voteCount", width: 10 },
      { header: "Suggestions Count", key: "sugCount", width: 15 }
    ];
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const categories = ["breakfast", "lunch", "dinner", "snacks"];
    const weekdayFullNames = {
      "sun": "Sunday",
      "mon": "Monday",
      "tue": "Tuesday",
      "wed": "Wednesday",
      "thu": "Thursday",
      "fri": "Friday",
      "sat": "Saturday"
    };
    days.forEach((day) => {
      categories.forEach((cat) => {
        const topDishes = suggestions.filter((s) => s.dayOfWeek === day && s.category === cat).slice(0, 4);
        topDishes.forEach((dish) => {
          worksheet.addRow({
            day: weekdayFullNames[day],
            category: cat.toUpperCase(),
            dishName: dish.dishName,
            voteCount: dish.voteCount,
            sugCount: (dish.suggestedBy || []).length
          });
        });
        if (topDishes.length > 0) {
          worksheet.addRow({});
        }
      });
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Top_Suggestions_${uBlock}_W${week}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Advanced Export Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
var menuSuggestions_default = router7;

// server/routes/announcements.ts
var import_express8 = __toESM(require("express"));
var router8 = import_express8.default.Router();
router8.get("/", authMiddleware, async (req, res) => {
  try {
    const { hostelBlock } = req.user;
    const oneWeekAgo = /* @__PURE__ */ new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const announcements = await Announcement_default.find({
      hostelBlock,
      createdAt: { $gte: oneWeekAgo }
      // Only announcements from the last 7 days
    }).sort({ createdAt: -1 });
    res.json(announcements);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router8.post("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const { title, content, isEmergency, isHoliday, isGlobal } = req.body;
    const announcement = new Announcement_default({
      title,
      content,
      isEmergency,
      isHoliday,
      hostelBlock: isGlobal ? void 0 : req.user.hostelBlock
      // Auto-assign Admin's block
    });
    await announcement.save();
    res.status(201).json(announcement);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router8.put("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const announcement = await Announcement_default.findOne({ _id: req.params.id });
    if (!announcement) return res.status(404).json({ error: "Not found" });
    if (announcement.hostelBlock && announcement.hostelBlock !== req.user.hostelBlock) {
      return res.status(403).json({ error: "Unauthorized to edit this block announcement" });
    }
    const updated = await Announcement_default.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router8.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const announcement = await Announcement_default.findOne({ _id: req.params.id });
    if (!announcement) return res.status(404).json({ error: "Not found" });
    if (announcement.hostelBlock && announcement.hostelBlock !== req.user.hostelBlock) {
      return res.status(403).json({ error: "Unauthorized to delete this block announcement" });
    }
    await Announcement_default.findByIdAndDelete(req.params.id);
    res.json({ message: "Announcement deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
var announcements_default = router8;

// server/routes/rooms.ts
var import_express9 = __toESM(require("express"));
init_User();
var router9 = import_express9.default.Router();
router9.get("/", authMiddleware, async (req, res) => {
  try {
    const hostelBlock = req.query.hostelBlock || req.user.hostelBlock;
    if (!hostelBlock) {
      return res.status(400).json({ error: "Hostel block is required" });
    }
    const rooms = await Room_default.find({
      hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, "i") }
    }).lean();
    const roomOccupancy = await User_default.aggregate([
      { $match: { hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, "i") } } },
      { $project: { roomNumber: { $toLower: { $trim: { input: "$roomNumber" } } } } },
      { $group: { _id: "$roomNumber", count: { $sum: 1 } } }
    ]);
    const occupancyMap = new Map(roomOccupancy.map((r) => [r._id, r.count]));
    const roomsWithOccupancy = rooms.map((room) => ({
      ...room,
      currentOccupancy: occupancyMap.get(room.roomNumber.toLowerCase()) || 0
    }));
    res.json(roomsWithOccupancy);
  } catch (error) {
    console.error("Error fetching all rooms:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router9.get("/block/:block", authMiddleware, async (req, res) => {
  try {
    const { block } = req.params;
    const hostelBlock = req.query.hostelBlock || req.user.hostelBlock;
    if (!hostelBlock) {
      return res.status(400).json({ error: "Hostel block is required" });
    }
    const query = {
      hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, "i") }
    };
    if (block) {
      const blockStr = block.toString().toUpperCase();
      query.$or = [
        { block: blockStr },
        { roomNumber: { $regex: new RegExp(`^${blockStr}`, "i") } }
      ];
    }
    const rooms = await Room_default.find(query).lean();
    for (const room of rooms) {
      if (!room.block && room.roomNumber) {
        const derived = room.roomNumber.charAt(0).toUpperCase();
        if (derived >= "A" && derived <= "Z") {
          await Room_default.findByIdAndUpdate(room._id, { block: derived });
        }
      }
    }
    const roomOccupancy = await User_default.aggregate([
      { $match: { hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, "i") } } },
      { $project: { roomNumber: { $toLower: { $trim: { input: "$roomNumber" } } } } },
      { $group: { _id: "$roomNumber", count: { $sum: 1 } } }
    ]);
    const occupancyMap = new Map(roomOccupancy.map((r) => [r._id, r.count]));
    const roomsWithOccupancy = rooms.map((room) => ({
      ...room,
      currentOccupancy: occupancyMap.get(room.roomNumber.toLowerCase()) || 0
    }));
    res.json(roomsWithOccupancy);
  } catch (error) {
    console.error("Error fetching rooms by block:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router9.get("/:roomNumber/:hostelBlock", authMiddleware, async (req, res) => {
  try {
    const { roomNumber, hostelBlock } = req.params;
    if (req.user.hostelBlock?.trim().toLowerCase() !== hostelBlock?.trim().toLowerCase() && req.user.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized access to this block" });
    }
    let room = await Room_default.findOne({ roomNumber, hostelBlock }).lean();
    const realTimeOccupancy = await User_default.countDocuments({ roomNumber, hostelBlock });
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    res.json({
      ...room,
      currentOccupancy: realTimeOccupancy
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router9.post("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const { roomNumber, capacity, block, hostelBlock: bodyHostelBlock } = req.body;
    const hostelBlock = (bodyHostelBlock || req.user.hostelBlock)?.trim();
    if (!hostelBlock) {
      return res.status(400).json({ error: "Hostel block is required" });
    }
    const existingRoom = await Room_default.findOne({
      roomNumber,
      hostelBlock: { $regex: new RegExp(`^${hostelBlock}$`, "i") }
    });
    if (existingRoom) {
      return res.status(400).json({ error: "Room already exists in this block" });
    }
    const room = new Room_default({
      roomNumber,
      hostelBlock: hostelBlock.trim(),
      block: block || (roomNumber ? roomNumber.charAt(0).toUpperCase() : void 0),
      capacity,
      currentOccupancy: 0
    });
    await room.save();
    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router9.put("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const room = await Room_default.findOneAndUpdate(
      {
        _id: req.params.id,
        hostelBlock: req.user.hostelBlock
      },
      req.body,
      { new: true }
    );
    if (!room) {
      return res.status(404).json({ error: "Room not found or unauthorized" });
    }
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router9.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const room = await Room_default.findOneAndDelete({
      _id: req.params.id,
      hostelBlock: req.user.hostelBlock
    });
    if (!room) {
      return res.status(404).json({ error: "Room not found or unauthorized" });
    }
    res.json({ message: "Room deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router9.get("/suggest/:hostelBlock", authMiddleware, async (req, res) => {
  try {
    const { hostelBlock } = req.params;
    const rooms = await Room_default.find({
      hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, "i") }
    }).lean();
    const roomOccupancy = await User_default.aggregate([
      { $match: { hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, "i") } } },
      { $group: { _id: "$roomNumber", count: { $sum: 1 } } }
    ]);
    const occupancyMap = new Map(roomOccupancy.map((r) => [r._id, r.count]));
    const availableRooms = rooms.filter((room) => {
      const current = occupancyMap.get(room.roomNumber) || 0;
      return current < room.capacity;
    });
    if (availableRooms.length === 0) {
      return res.status(404).json({ error: "No available rooms found" });
    }
    availableRooms.sort((a, b) => {
      const occA = occupancyMap.get(a.roomNumber) || 0;
      const occB = occupancyMap.get(b.roomNumber) || 0;
      return occA - occB;
    });
    res.json({
      ...availableRooms[0],
      currentOccupancy: occupancyMap.get(availableRooms[0].roomNumber) || 0
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router9.post("/swap", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const { studentAId, studentBId } = req.body;
    if (!studentAId || !studentBId) {
      return res.status(400).json({ error: "Both student IDs are required" });
    }
    const [studentA, studentB] = await Promise.all([
      User_default.findById(studentAId),
      User_default.findById(studentBId)
    ]);
    if (!studentA || !studentB) {
      return res.status(404).json({ error: "One or both students not found" });
    }
    if (studentA.hostelBlock !== req.user.hostelBlock || studentB.hostelBlock !== req.user.hostelBlock) {
      return res.status(403).json({ error: "Unauthorized to swap students from another block" });
    }
    const roomA = studentA.roomNumber;
    const roomB = studentB.roomNumber;
    studentA.roomNumber = roomB;
    studentB.roomNumber = roomA;
    await Promise.all([studentA.save(), studentB.save()]);
    res.json({ message: "Rooms swapped successfully", studentA, studentB });
  } catch (error) {
    console.error("Swap error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
var rooms_default = router9;

// server/routes/stats.ts
var import_express10 = __toESM(require("express"));
init_User();

// server/models/RoomChangeRequest.ts
var import_mongoose11 = __toESM(require("mongoose"));
var RoomChangeRequestSchema = new import_mongoose11.Schema({
  userId: { type: import_mongoose11.Schema.Types.ObjectId, ref: "User", required: true },
  currentRoom: { type: String, required: true },
  requestedRoom: { type: String },
  reason: { type: String, required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  adminRemarks: { type: String },
  hostelBlock: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
var RoomChangeRequest_default = import_mongoose11.default.models.RoomChangeRequest || import_mongoose11.default.model("RoomChangeRequest", RoomChangeRequestSchema);

// server/routes/stats.ts
var router10 = import_express10.default.Router();
router10.get("/admin", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admins only" });
    }
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const adminBlock = req.user.hostelBlock;
    const now = /* @__PURE__ */ new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const students = await User_default.find({ role: "student", hostelBlock: adminBlock }).select("_id name registerId roomNumber phone");
    const studentIds = students.map((s) => s._id);
    const [attendancesToday, approvedLeavesToday, hostelSettings, pendingLeaveCount, openComplaintCount, recentSuggestions, pendingRoomChanges, rooms] = await Promise.all([
      Attendance_default.find({ userId: { $in: studentIds }, date: { $gte: todayStart, $lte: todayEnd }, isPresent: true }),
      LeaveRequest_default.find({
        status: "approved",
        hostelBlock: adminBlock,
        fromDate: { $lte: todayEnd },
        toDate: { $gte: todayStart }
      }),
      HostelSettings_default.findOne({ hostelBlock: adminBlock }),
      LeaveRequest_default.countDocuments({ status: "pending", hostelBlock: adminBlock }),
      Complaint_default.countDocuments({ status: { $ne: "resolved" }, hostelBlock: adminBlock }),
      MenuSuggestion_default.find({ hostelBlock: adminBlock }).sort({ createdAt: -1 }).limit(3),
      RoomChangeRequest_default.countDocuments({ status: "pending", hostelBlock: adminBlock }),
      Room_default.find({ hostelBlock: adminBlock }).lean()
    ]);
    const presentIds = new Set(attendancesToday.map((a) => a.userId.toString()));
    const isHostelLeaveToday = hostelSettings && hostelSettings.leaveWindowLabel && hostelSettings.leaveWindowFrom && hostelSettings.leaveWindowTo && todayEnd >= new Date(new Date(hostelSettings.leaveWindowFrom).setHours(0, 0, 0, 0)) && todayStart <= new Date(new Date(hostelSettings.leaveWindowTo).setHours(23, 59, 59, 999));
    const isHolidayToday = !!isHostelLeaveToday;
    const absentStudents = [];
    const leaveStudents = [];
    students.forEach((student) => {
      if (!presentIds.has(student._id.toString())) {
        const isOnApprovedLeave = approvedLeavesToday.some((l) => l.userId.toString() === student._id.toString());
        if (isOnApprovedLeave || isHolidayToday) {
          leaveStudents.push(student);
        } else {
          absentStudents.push(student);
        }
      }
    });
    const roomOccupancyMap = /* @__PURE__ */ new Map();
    students.forEach((student) => {
      if (student.roomNumber) {
        roomOccupancyMap.set(student.roomNumber, (roomOccupancyMap.get(student.roomNumber) || 0) + 1);
      }
    });
    const totalRoomsCount = rooms.length;
    const vacantRoomsCount = rooms.filter((room) => (roomOccupancyMap.get(room.roomNumber) || 0) === 0).length;
    res.json({
      studentCount: students.length,
      attendanceCount: presentIds.size,
      leaveCount: leaveStudents.length,
      absentCount: absentStudents.length,
      pendingLeaveCount,
      openComplaintCount,
      pendingRoomChanges,
      absentStudents,
      leaveStudents,
      recentSuggestions,
      totalRoomsCount,
      vacantRoomsCount,
      isHoliday: isHolidayToday,
      holidayLabel: isHostelLeaveToday ? hostelSettings?.leaveWindowLabel || "LEAVE" : ""
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    res.status(500).json({ error: "Server error" });
  }
});
var stats_default = router10;

// server/routes/roomChangeRequests.ts
var import_express11 = __toESM(require("express"));
init_User();
var router11 = import_express11.default.Router();
router11.get("/user/:userId", authMiddleware, async (req, res) => {
  try {
    if (req.user.id !== req.params.userId) {
      if (req.user.role !== "admin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const targetUser = await User_default.findById(req.params.userId);
      if (!targetUser || targetUser.hostelBlock !== req.user.hostelBlock) {
        return res.status(403).json({ error: "Unauthorized to view requests from another block" });
      }
    }
    const requests = await RoomChangeRequest_default.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router11.post("/", authMiddleware, async (req, res) => {
  try {
    const { userId, currentRoom, requestedRoom, reason } = req.body;
    if (userId !== req.user.id) {
      return res.status(403).json({ error: "Cannot create request for another user" });
    }
    const user = await User_default.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const hostelBlock = user.hostelBlock;
    const existing = await RoomChangeRequest_default.findOne({ userId, status: "pending" });
    if (existing) {
      return res.status(400).json({ error: "You already have a pending room change request" });
    }
    if (requestedRoom) {
      const roomExists = await Room_default.findOne({
        roomNumber: { $regex: new RegExp(`^${requestedRoom.trim()}$`, "i") },
        hostelBlock: { $regex: new RegExp(`^${hostelBlock.trim()}$`, "i") }
      });
      if (!roomExists) {
        return res.status(400).json({ error: "Invalid Room: The requested room does not exist in your hostel." });
      }
    }
    const request = new RoomChangeRequest_default({
      userId,
      currentRoom,
      requestedRoom: requestedRoom?.trim(),
      reason,
      hostelBlock
      // Strictly from User DB
    });
    await request.save();
    res.status(201).json(request);
  } catch (error) {
    console.error("Room change request error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router11.get("/hostel/:hostelBlock", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    if (req.user.hostelBlock !== req.params.hostelBlock) {
      return res.status(403).json({ error: "Unauthorized to view other hostel blocks" });
    }
    const requests = await RoomChangeRequest_default.find({ hostelBlock: req.params.hostelBlock }).populate("userId", "name registerId").sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router11.put("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const { status, adminRemarks } = req.body;
    const requestId = req.params.id;
    const request = await RoomChangeRequest_default.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }
    if (request.hostelBlock !== req.user.hostelBlock) {
      return res.status(403).json({ error: "Unauthorized to manage requests from another block" });
    }
    if (status === "approved" && request.status !== "approved") {
      if (!request.requestedRoom) {
        return res.status(400).json({ error: "No requested room specified in request" });
      }
      let newRoom = await Room_default.findOne({
        roomNumber: { $regex: new RegExp(`^${request.requestedRoom.trim()}$`, "i") },
        hostelBlock: { $regex: new RegExp(`^${request.hostelBlock.trim()}$`, "i") }
      });
      if (!newRoom) {
        return res.status(404).json({ error: "Requested room no longer exists in database" });
      }
      if (newRoom.currentOccupancy >= newRoom.capacity) {
        return res.status(400).json({ error: "Requested room is already full" });
      }
      await User_default.findByIdAndUpdate(request.userId, {
        roomNumber: request.requestedRoom
      });
      newRoom.currentOccupancy += 1;
      await newRoom.save();
      const oldRoom = await Room_default.findOne({
        roomNumber: request.currentRoom,
        hostelBlock: request.hostelBlock
      });
      if (oldRoom) {
        if (oldRoom.currentOccupancy > 0) {
          oldRoom.currentOccupancy -= 1;
          await oldRoom.save();
        }
      } else {
      }
    }
    request.status = status;
    request.adminRemarks = adminRemarks;
    request.updatedAt = /* @__PURE__ */ new Date();
    await request.save();
    res.json(request);
  } catch (error) {
    console.error("Update room change error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
var roomChangeRequests_default = router11;

// server/routes/hostelSettings.ts
var import_express12 = __toESM(require("express"));
var router12 = import_express12.default.Router();
router12.get("/:hostelBlock", authMiddleware, async (req, res) => {
  try {
    if (req.user.hostelBlock !== req.params.hostelBlock) {
      return res.status(403).json({ error: "Unauthorized access to block settings" });
    }
    let settings = await HostelSettings_default.findOne({ hostelBlock: req.params.hostelBlock });
    if (!settings) {
      settings = await HostelSettings_default.create({
        hostelBlock: req.params.hostelBlock,
        leaveWindowFrom: null,
        leaveWindowTo: null,
        leaveWindowLabel: ""
      });
    }
    res.json(settings);
  } catch (error) {
    console.error("Fetch settings error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router12.put("/:hostelBlock", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    if (req.user.hostelBlock !== req.params.hostelBlock) {
      return res.status(403).json({ error: "Unauthorized to update another hostel's settings" });
    }
    const { leaveWindowFrom, leaveWindowTo, leaveWindowLabel } = req.body;
    const settings = await HostelSettings_default.findOneAndUpdate(
      { hostelBlock: req.params.hostelBlock },
      {
        leaveWindowFrom,
        leaveWindowTo,
        leaveWindowLabel,
        updatedBy: req.user.id
      },
      { new: true, upsert: true }
    );
    res.json(settings);
  } catch (error) {
    console.error("Update settings error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
var hostelSettings_default = router12;

// server/routes/mealRatings.ts
var import_express13 = __toESM(require("express"));

// server/models/MealRating.ts
var import_mongoose12 = __toESM(require("mongoose"));
var MealRatingSchema = new import_mongoose12.Schema({
  menuItemId: { type: import_mongoose12.Schema.Types.ObjectId, ref: "MessMenu", required: true },
  userId: { type: import_mongoose12.Schema.Types.ObjectId, ref: "User", required: true },
  hostelBlock: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  feedback: { type: String },
  mealType: { type: String, enum: ["breakfast", "lunch", "dinner"], required: true },
  date: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});
MealRatingSchema.index({ userId: 1, menuItemId: 1 }, { unique: true });
MealRatingSchema.index({ hostelBlock: 1, date: 1 });
var MealRating_default = import_mongoose12.default.models.MealRating || import_mongoose12.default.model("MealRating", MealRatingSchema);

// server/routes/mealRatings.ts
var import_mongoose13 = __toESM(require("mongoose"));
var router13 = import_express13.default.Router();
router13.post("/", authMiddleware, async (req, res) => {
  try {
    const { menuItemId, rating, feedback } = req.body;
    const userId = req.user.id;
    const hostelBlock = req.user.hostelBlock;
    const menuItem = await MessMenu_default.findOne({ _id: menuItemId, hostelBlock });
    if (!menuItem) {
      return res.status(404).json({ error: "Menu item not found or unauthorized" });
    }
    const existingRating = await MealRating_default.findOne({ userId, menuItemId });
    if (existingRating) {
      return res.status(400).json({ error: "You have already rated this meal" });
    }
    const mealRating = new MealRating_default({
      menuItemId,
      userId,
      hostelBlock,
      rating,
      feedback,
      mealType: menuItem.mealType,
      date: menuItem.date || /* @__PURE__ */ new Date()
      // Fallback to current date if missing
    });
    await mealRating.save();
    res.status(201).json(mealRating);
  } catch (error) {
    console.error("Meal Rating Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router13.get("/item/:menuItemId", authMiddleware, async (req, res) => {
  try {
    const { menuItemId } = req.params;
    const ratings = await MealRating_default.find({ menuItemId }).populate("userId", "name");
    const stats = await MealRating_default.aggregate([
      { $match: { menuItemId: new import_mongoose13.default.Types.ObjectId(menuItemId) } },
      {
        $group: {
          _id: "$menuItemId",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 }
        }
      }
    ]);
    res.json({
      ratings,
      stats: stats[0] || { avgRating: 0, count: 0 }
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
router13.get("/admin/stats", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const { hostelBlock } = req.user;
    const stats = await MealRating_default.aggregate([
      { $match: { hostelBlock } },
      {
        $group: {
          _id: "$mealType",
          avgRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 }
        }
      }
    ]);
    const topRated = await MealRating_default.aggregate([
      { $match: { hostelBlock } },
      {
        $group: {
          _id: "$menuItemId",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 }
        }
      },
      { $sort: { avgRating: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "messmenus",
          localField: "_id",
          foreignField: "_id",
          as: "menuInfo"
        }
      },
      { $unwind: "$menuInfo" }
    ]);
    res.json({
      overview: stats,
      topRated
    });
  } catch (error) {
    console.error("Rating Stats Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
var mealRatings_default = router13;

// server/routes/foodPoll.ts
var import_express14 = __toESM(require("express"));
var import_exceljs3 = __toESM(require("exceljs"));
var router14 = import_express14.default.Router();
var polls = /* @__PURE__ */ new Map();
var generateId = () => Math.random().toString(36).substr(2, 9);
var initializeSamplePolls = () => {
};
initializeSamplePolls();
router14.get("/", authMiddleware, async (req, res) => {
  try {
    const hostelBlock = req.user?.hostelBlock;
    if (!hostelBlock) {
      return res.status(400).json({ error: "User not assigned to a hostel block" });
    }
    const samplePollId = `sample-poll-${hostelBlock}`;
    if (!polls.has(samplePollId)) {
      const samplePoll = {
        _id: samplePollId,
        hostelBlock,
        title: "Vote",
        description: "6 options \u2022 1 votes",
        foods: [
          { _id: generateId(), name: "Dosa", votes: [] },
          { _id: generateId(), name: "Idli", votes: [] },
          { _id: generateId(), name: "Vada", votes: [] }
        ],
        createdBy: "admin",
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date(),
        isActive: true
      };
      polls.set(samplePollId, samplePoll);
    }
    const blockPolls = Array.from(polls.values()).filter((p) => p.hostelBlock === hostelBlock).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((p) => ({
      ...p,
      foods: p.foods.map((f) => ({
        ...f,
        voteCount: f.votes.length,
        hasVoted: f.votes.includes(req.user.id)
      }))
    }));
    res.json(blockPolls);
  } catch (error) {
    console.error("Error fetching polls:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router14.get("/:pollId", authMiddleware, async (req, res) => {
  try {
    const poll = polls.get(req.params.pollId);
    if (!poll) {
      return res.status(404).json({ error: "Poll not found" });
    }
    if (poll.hostelBlock !== req.user?.hostelBlock) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const enhancedPoll = {
      ...poll,
      foods: poll.foods.map((f) => ({
        ...f,
        voteCount: f.votes.length,
        hasVoted: f.votes.includes(req.user.id),
        votes: []
        // Don't expose vote user IDs to client
      }))
    };
    res.json(enhancedPoll);
  } catch (error) {
    console.error("Error fetching poll:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router14.post("/", authMiddleware, async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Only admins can create polls" });
    }
    const { title, description, foods } = req.body;
    const hostelBlock = req.user?.hostelBlock;
    if (!title || !foods || !Array.isArray(foods) || foods.length === 0) {
      return res.status(400).json({ error: "Title and at least one food item required" });
    }
    const pollId = generateId();
    const newPoll = {
      _id: pollId,
      hostelBlock,
      title,
      description: description || "",
      foods: foods.map((name) => ({
        _id: generateId(),
        name: name.trim(),
        votes: []
      })),
      createdBy: req.user.id,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date(),
      isActive: true
    };
    polls.set(pollId, newPoll);
    try {
      const announcement = new Announcement_default({
        title: `\u{1F4CA} New Food Poll: ${title}`,
        content: `Vote for your favorite dishes! ${foods.length} options available.`,
        isEmergency: false,
        isHoliday: false,
        pollId,
        hostelBlock
      });
      await announcement.save();
    } catch (announcementError) {
      console.error("Failed to create poll announcement:", announcementError);
    }
    res.json({
      ...newPoll,
      foods: newPoll.foods.map((f) => ({
        ...f,
        voteCount: 0,
        hasVoted: false,
        votes: []
      }))
    });
  } catch (error) {
    console.error("Error creating poll:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router14.post("/:pollId/vote", authMiddleware, async (req, res) => {
  try {
    const { foodId } = req.body;
    const pollId = req.params.pollId;
    const userId = req.user.id;
    console.log(`Vote attempt - PollID: ${pollId}, FoodID: ${foodId}, UserID: ${userId}`);
    console.log(`Available polls in memory: ${Array.from(polls.keys()).join(", ")}`);
    if (!foodId) {
      return res.status(400).json({ error: "Food ID required" });
    }
    const poll = polls.get(pollId);
    if (!poll) {
      console.log(`Poll ${pollId} not found`);
      return res.status(404).json({ error: "Poll not found" });
    }
    if (poll.hostelBlock !== req.user?.hostelBlock) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const foodItem = poll.foods.find((f) => f._id === foodId);
    if (!foodItem) {
      return res.status(404).json({ error: "Food item not found" });
    }
    const alreadyVoted = foodItem.votes.includes(userId);
    if (alreadyVoted) {
      foodItem.votes = foodItem.votes.filter((id) => id !== userId);
    } else {
      poll.foods.forEach((f) => {
        f.votes = f.votes.filter((id) => id !== userId);
      });
      foodItem.votes.push(userId);
    }
    poll.updatedAt = /* @__PURE__ */ new Date();
    polls.set(pollId, poll);
    const enhancedPoll = {
      ...poll,
      foods: poll.foods.map((f) => ({
        ...f,
        voteCount: f.votes.length,
        hasVoted: f.votes.includes(userId),
        votes: []
      }))
    };
    res.json(enhancedPoll);
  } catch (error) {
    console.error("Error voting:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router14.get("/:pollId/export", authMiddleware, async (req, res) => {
  try {
    const pollId = req.params.pollId;
    const poll = polls.get(pollId);
    if (!poll) {
      return res.status(404).json({ error: "Poll not found" });
    }
    if (poll.hostelBlock !== req.user?.hostelBlock) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const sortedFoods = [...poll.foods].sort((a, b) => b.votes.length - a.votes.length);
    const totalVotes = sortedFoods.reduce((sum, f) => sum + f.votes.length, 0);
    const workbook = new import_exceljs3.default.Workbook();
    const worksheet = workbook.addWorksheet("Food Poll Results");
    worksheet.columns = [
      { header: "Rank", key: "rank", width: 8 },
      { header: "Food Item", key: "food", width: 30 },
      { header: "Votes", key: "votes", width: 12 },
      { header: "Percentage", key: "percentage", width: 15 }
    ];
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4CAF50" }
    };
    sortedFoods.forEach((food, index) => {
      const percentage = totalVotes > 0 ? (food.votes.length / totalVotes * 100).toFixed(2) : "0.00";
      worksheet.addRow({
        rank: index + 1,
        food: food.name,
        votes: food.votes.length,
        percentage: `${percentage}%`
      });
    });
    worksheet.addRow({});
    worksheet.addRow({
      food: "Total Votes",
      votes: totalVotes
    });
    const dateStr = poll.createdAt.toLocaleDateString("en-IN").replace(/\//g, "-");
    const filename = `${poll.title}-${dateStr}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error("Error exporting poll:", error);
    res.status(500).json({ error: "Server error" });
  }
});
router14.delete("/:pollId", authMiddleware, async (req, res) => {
  try {
    console.log(`\u{1F534} DELETE request received for pollId: ${req.params.pollId}`);
    console.log(`\u{1F534} User role: ${req.user?.role}, hostelBlock: ${req.user?.hostelBlock}`);
    if (req.user?.role !== "admin") {
      console.log(`\u{1F534} User is not admin, rejecting`);
      return res.status(403).json({ error: "Only admins can close polls" });
    }
    const pollId = req.params.pollId;
    console.log(`\u{1F534} Attempting to close poll: ${pollId}`);
    console.log(`\u{1F534} Available polls in map: ${Array.from(polls.keys()).join(", ")}`);
    const poll = polls.get(pollId);
    if (!poll) {
      console.log(`\u{1F534} Poll ${pollId} not found in map`);
      return res.status(404).json({ error: "Poll not found" });
    }
    console.log(`\u{1F534} Poll found. Current hostelBlock: ${poll.hostelBlock}, User hostelBlock: ${req.user?.hostelBlock}`);
    if (poll.hostelBlock !== req.user?.hostelBlock) {
      console.log(`\u{1F534} Hostel block mismatch`);
      return res.status(403).json({ error: "Unauthorized" });
    }
    poll.isActive = false;
    poll.updatedAt = /* @__PURE__ */ new Date();
    polls.set(pollId, poll);
    console.log(`\u{1F534} Poll ${pollId} closed successfully. isActive is now: ${poll.isActive}`);
    try {
      await Announcement_default.deleteOne({ pollId });
      console.log(`\u{1F534} Associated announcement deleted for poll: ${pollId}`);
    } catch (err) {
      console.error(`\u{1F534} Error deleting announcement for poll ${pollId}:`, err);
    }
    res.json({
      ...poll,
      foods: poll.foods.map((f) => ({
        ...f,
        voteCount: f.votes.length,
        hasVoted: f.votes.includes(req.user.id),
        votes: []
      }))
    });
  } catch (error) {
    console.error("\u{1F534} Error closing poll:", error);
    res.status(500).json({ error: "Server error" });
  }
});
var foodPoll_default = router14;

// server/routes.ts
async function registerRoutes(app2) {
  await db_default();
  try {
    console.log("\u{1F680} Initializing face recognition models...");
    await loadModels();
    console.log("\u2705 Face recognition models ready!");
  } catch (error) {
    console.error("\u26A0\uFE0F Face recognition models failed to load, face verification will not work:", error);
  }
  app2.use("/api/auth", auth_default);
  app2.use("/api/users", users_default);
  app2.use("/api/attendances", attendances_default);
  app2.use("/api/attendance", attendances_default);
  app2.use("/api/leave-requests", leaveRequests_default);
  app2.use("/api/complaints", complaints_default);
  app2.use("/api/room-change-requests", roomChangeRequests_default);
  app2.use("/api/mess-menus", messMenus_default);
  app2.use("/api/menu-suggestions", menuSuggestions_default);
  app2.use("/api/announcements", announcements_default);
  app2.use("/api/rooms", rooms_default);
  app2.use("/api/hostel-settings", hostelSettings_default);
  app2.use("/api/meal-ratings", mealRatings_default);
  app2.use("/api/food-polls", foodPoll_default);
  app2.use("/api/stats", stats_default);
  const server = (0, import_node_http.createServer)(app2);
  return server;
}

// server/index.ts
var fs2 = __toESM(require("fs"));
var path3 = __toESM(require("path"));
var app = (0, import_express15.default)();
var log = console.log;
function setupCors(app2) {
  const allowedOrigins = /* @__PURE__ */ new Set([APP_ORIGIN]);
  if (!isProduction) {
    allowedOrigins.add("http://localhost:8081");
    allowedOrigins.add("http://localhost:19006");
    allowedOrigins.add("http://127.0.0.1:8081");
  }
  app2.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.has(origin) || !isProduction)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
    }
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    import_express15.default.json({
      limit: "50mb",
      // Support large base64 photos
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(import_express15.default.urlencoded({ limit: "50mb", extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const reqPath = req.path;
    let capturedJsonResponse;
    const originalResJson = res.json.bind(res);
    res.json = (body) => {
      capturedJsonResponse = body;
      return originalResJson(body);
    };
    res.on("finish", () => {
      if (!reqPath.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 100) {
        logLine = logLine.slice(0, 99) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path3.resolve(process.cwd(), "app.json");
    const appJson = JSON.parse(fs2.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path3.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs2.existsSync(manifestPath)) {
    return res.status(404).json({
      error: `Manifest not found for platform: ${platform}`
    });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  res.send(fs2.readFileSync(manifestPath, "utf-8"));
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const protocol = req.header("x-forwarded-proto") || req.protocol || "https";
  const host = req.header("x-forwarded-host") || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, host || "").replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path3.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs2.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (req.path !== "/" && req.path !== "/manifest") return next();
    const platform = req.header("expo-platform");
    if (platform === "ios" || platform === "android") {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", import_express15.default.static(path3.resolve(process.cwd(), "assets")));
  app2.use(import_express15.default.static(path3.resolve(process.cwd(), "static-build")));
  app2.use("/images", import_express15.default.static(path3.join(__dirname, "public", "menu")));
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = Number(process.env.PORT) || 5e3;
  server.listen(port, "0.0.0.0", () => {
    log(`\u2705 Server running on port ${port}`);
  });
})();
