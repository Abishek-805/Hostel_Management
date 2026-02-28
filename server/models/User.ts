import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  registerId: string;
  password: string;
  role: "student" | "admin" | "gatekeeper";
  hostelBlock: string;
  gateNumber?: number;
  roomNumber?: string;
  phone?: string;
  profileImage?: string;
  faceEmbedding?: number[];
}

const UserSchema = new Schema({
  name: { type: String, required: true },
  registerId: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["student", "admin", "gatekeeper"],
    required: true,
  },
  hostelBlock: {
    type: String,
    required: true, // 🔥 VERY IMPORTANT
  },
  gateNumber: {
    type: Number,
    min: 1,
    max: 11,
  },
  roomNumber: { type: String },
  phone: { type: String },
  profileImage: { type: String },
  faceEmbedding: {
    type: [Number],
    default: undefined,
  },
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance optimization
UserSchema.index({ registerId: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ hostelBlock: 1 });
UserSchema.index({ role: 1, hostelBlock: 1 });

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
