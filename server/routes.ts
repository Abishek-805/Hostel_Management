import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import connectToDatabase from "./db";
import { loadModels } from "./services/faceRecognition";

// Import routes
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import attendanceRoutes from "./routes/attendances";
import leaveRequestRoutes from "./routes/leaveRequests";
import complaintRoutes from "./routes/complaints";
import messMenuRoutes from "./routes/messMenus";
import menuSuggestionRoutes from "./routes/menuSuggestions";
import announcementRoutes from "./routes/announcements";
import roomRoutes from "./routes/rooms";
import statsRoutes from "./routes/stats";
import roomChangeRequestRoutes from "./routes/roomChangeRequests";
import hostelSettingsRoutes from "./routes/hostelSettings";
import mealRatingRoutes from "./routes/mealRatings";
import foodPollRoutes from "./routes/foodPoll";

export async function registerRoutes(app: Express): Promise<Server> {
  // Connect to MongoDB
  await connectToDatabase();

  // Load face recognition models (required for attendance face verification)
  try {
    console.log("🚀 Initializing face recognition models...");
    await loadModels();
    console.log("✅ Face recognition models ready!");
  } catch (error) {
    console.error("⚠️ Face recognition models failed to load, face verification will not work:", error);
  }

  // API routes
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/attendances", attendanceRoutes);
  app.use("/api/attendance", attendanceRoutes); // Support singular form used by some mobile screens

  app.use("/api/leave-requests", leaveRequestRoutes);
  app.use("/api/complaints", complaintRoutes);
  app.use("/api/room-change-requests", roomChangeRequestRoutes);
  app.use("/api/mess-menus", messMenuRoutes);
  app.use("/api/menu-suggestions", menuSuggestionRoutes);
  app.use("/api/announcements", announcementRoutes);
  app.use("/api/rooms", roomRoutes);
  app.use("/api/hostel-settings", hostelSettingsRoutes);
  app.use("/api/meal-ratings", mealRatingRoutes);
  app.use("/api/food-polls", foodPollRoutes);
  app.use("/api/stats", statsRoutes);

  app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "API is running 🚀"
  });
});

  const server = createServer(app);
  return server;

}
