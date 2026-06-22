import mongoose, { Document, Schema } from 'mongoose';

export interface ICurfewConfig extends Document {
  enabled: boolean;
  campusCutoffHour: number;
  campusCutoffMinute: number;
  createdAt: Date;
  updatedAt: Date;
}

const CurfewConfigSchema = new Schema<ICurfewConfig>(
  {
    enabled: { type: Boolean, default: true, required: true },
    campusCutoffHour: { type: Number, default: 19, min: 0, max: 23, required: true },
    campusCutoffMinute: { type: Number, default: 30, min: 0, max: 59, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.CurfewConfig ||
  mongoose.model<ICurfewConfig>('CurfewConfig', CurfewConfigSchema);
