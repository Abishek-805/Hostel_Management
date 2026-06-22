import mongoose, { Schema, Document } from "mongoose";

export type FeedbackCategory = "APP" | "FOOD" | "HOSTEL" | "GATE" | "OTHER";
export type FeedbackStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED";

export interface IUserFeedback extends Document {
  userId: mongoose.Types.ObjectId;
  hostelBlock: string;
  title: string;
  message: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  adminRemarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserFeedbackSchema = new Schema<IUserFeedback>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    hostelBlock: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    category: {
      type: String,
      enum: ["APP", "FOOD", "HOSTEL", "GATE", "OTHER"],
      default: "OTHER",
      index: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"],
      default: "OPEN",
      index: true,
    },
    adminRemarks: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

UserFeedbackSchema.index({ createdAt: -1 });

export default mongoose.models.UserFeedback || mongoose.model<IUserFeedback>("UserFeedback", UserFeedbackSchema);
