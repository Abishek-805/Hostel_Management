import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["student", "admin", "gatekeeper"]);
export const leaveStatusEnum = pgEnum("leave_status", ["pending", "approved", "rejected"]);
export const complaintStatusEnum = pgEnum("complaint_status", ["submitted", "in_progress", "resolved"]);
export const complaintCategoryEnum = pgEnum("complaint_category", ["water", "electricity", "cleaning", "food", "others"]);
export const mealTypeEnum = pgEnum("meal_type", ["breakfast", "lunch", "dinner"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  registerId: text("register_id").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  role: userRoleEnum("role").notNull().default("student"),
  roomNumber: text("room_number"),
  hostelBlock: text("hostel_block"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  attendances: many(attendances),
  leaveRequests: many(leaveRequests),
  complaints: many(complaints),
  menuSuggestions: many(menuSuggestions),
}));

export const attendances = pgTable("attendances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: date("date").notNull(),
  isPresent: boolean("is_present").notNull().default(true),
  photoUrl: text("photo_url"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  markedAt: timestamp("marked_at").defaultNow(),
  reason: text("reason"),
});

export const attendancesRelations = relations(attendances, ({ one }) => ({
  user: one(users, {
    fields: [attendances.userId],
    references: [users.id],
  }),
}));

export const leaveRequests = pgTable("leave_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date").notNull(),
  reason: text("reason").notNull(),
  documentUrl: text("document_url"),
  status: leaveStatusEnum("status").notNull().default("pending"),
  isEmergency: boolean("is_emergency").notNull().default(false),
  adminRemarks: text("admin_remarks"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  user: one(users, {
    fields: [leaveRequests.userId],
    references: [users.id],
  }),
}));

export const complaints = pgTable("complaints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  category: complaintCategoryEnum("category").notNull(),
  description: text("description").notNull(),
  photoUrl: text("photo_url"),
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  status: complaintStatusEnum("status").notNull().default("submitted"),
  adminRemarks: text("admin_remarks"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const complaintsRelations = relations(complaints, ({ one }) => ({
  user: one(users, {
    fields: [complaints.userId],
    references: [users.id],
  }),
}));

export const messMenus = pgTable("mess_menus", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date").notNull(),
  mealType: mealTypeEnum("meal_type").notNull(),
  items: text("items").notNull(),
  isSpecial: boolean("is_special").notNull().default(false),
  specialNote: text("special_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const menuSuggestions = pgTable("menu_suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  dishName: text("dish_name").notNull(),
  description: text("description"),
  votes: integer("votes").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const menuSuggestionsRelations = relations(menuSuggestions, ({ one }) => ({
  user: one(users, {
    fields: [menuSuggestions.userId],
    references: [users.id],
  }),
}));

export const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isEmergency: boolean("is_emergency").notNull().default(false),
  isHoliday: boolean("is_holiday").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const rooms = pgTable("rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roomNumber: text("room_number").notNull(),
  hostelBlock: text("hostel_block").notNull(),
  capacity: integer("capacity").notNull().default(4),
  currentOccupancy: integer("current_occupancy").notNull().default(0),
});

export const insertUserSchema = createInsertSchema(users).pick({
  registerId: true,
  password: true,
  name: true,
  phone: true,
  role: true,
  roomNumber: true,
  hostelBlock: true,
});

export const loginSchema = z.object({
  registerId: z.string().min(1),
  password: z.string().min(1),
});

export const insertAttendanceSchema = createInsertSchema(attendances).omit({
  id: true,
  markedAt: true,
});

export const insertLeaveRequestSchema = createInsertSchema(leaveRequests).omit({
  id: true,
  status: true,
  adminRemarks: true,
  createdAt: true,
  updatedAt: true,
});

export const insertComplaintSchema = createInsertSchema(complaints).omit({
  id: true,
  status: true,
  adminRemarks: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessMenuSchema = createInsertSchema(messMenus).omit({
  id: true,
  createdAt: true,
});

export const insertMenuSuggestionSchema = createInsertSchema(menuSuggestions).omit({
  id: true,
  votes: true,
  createdAt: true,
});

export const insertAnnouncementSchema = createInsertSchema(announcements).omit({
  id: true,
  createdAt: true,
});

export const insertRoomSchema = createInsertSchema(rooms).omit({
  id: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Attendance = typeof attendances.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type Complaint = typeof complaints.$inferSelect;
export type MessMenu = typeof messMenus.$inferSelect;
export type MenuSuggestion = typeof menuSuggestions.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type Room = typeof rooms.$inferSelect;
