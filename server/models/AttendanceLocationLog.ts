import mongoose, { Schema, Document } from "mongoose";

export interface IAttendanceLocationLog extends Document {
  userId: mongoose.Types.ObjectId;
  hostelBlock: string;
  latitude: number;
  longitude: number;
  isInside: boolean;
  distance?: number;
  message?: string;
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceLocationLogSchema = new Schema<IAttendanceLocationLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    hostelBlock: { type: String, required: true, trim: true, index: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    isInside: { type: Boolean, required: true, index: true },
    distance: { type: Number },
    message: { type: String, trim: true, maxlength: 500 },
    source: { type: String, trim: true, default: "mobile" },
  },
  { timestamps: true }
);

AttendanceLocationLogSchema.index({ createdAt: -1 });

export default mongoose.models.AttendanceLocationLog ||
  mongoose.model<IAttendanceLocationLog>("AttendanceLocationLog", AttendanceLocationLogSchema);
