import mongoose, { Schema, Document } from "mongoose";

export interface ILeaveRequest extends Document {
  userId: mongoose.Types.ObjectId;
  hostelBlock: string;
  fromDate: Date;
  toDate: Date;
  reason: string;
  imageUrl?: string;
  isEmergency: boolean;
  status: "pending" | "approved" | "rejected";
  adminRemarks?: string;
  createdAt: Date;
}

const LeaveRequestSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  hostelBlock: { type: String, required: true }, // ✅ IMPORTANT
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  reason: { type: String, required: true },
  imageUrl: { type: String },
  isEmergency: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  adminRemarks: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// Indexes for performance optimization
LeaveRequestSchema.index({ userId: 1 });
LeaveRequestSchema.index({ hostelBlock: 1 });
LeaveRequestSchema.index({ status: 1 });
LeaveRequestSchema.index({ createdAt: -1 });

export default mongoose.models.LeaveRequest ||
  mongoose.model<ILeaveRequest>("LeaveRequest", LeaveRequestSchema);
