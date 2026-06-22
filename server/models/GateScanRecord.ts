import mongoose, { Document, Schema, Types } from 'mongoose';

export type GateScanStage = 'EXIT' | 'CAMPUS_ENTRY' | 'HOSTEL_ENTRY';
export type GateScanOutcome = 'SUCCESS' | 'REJECTED';

export interface IGateScanRecord extends Document {
  gatePassId?: string;
  userId?: Types.ObjectId;
  scannedBy?: Types.ObjectId;
  stage: GateScanStage;
  outcome: GateScanOutcome;
  reason?: string;
  latitude?: number;
  longitude?: number;
  createdAt: Date;
  updatedAt: Date;
}

const GateScanRecordSchema = new Schema<IGateScanRecord>(
  {
    gatePassId: { type: String, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    scannedBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    stage: {
      type: String,
      enum: ['EXIT', 'CAMPUS_ENTRY', 'HOSTEL_ENTRY'],
      required: true,
      index: true,
    },
    outcome: {
      type: String,
      enum: ['SUCCESS', 'REJECTED'],
      required: true,
      index: true,
    },
    reason: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number },
  },
  { timestamps: true }
);

export default mongoose.models.GateScanRecord ||
  mongoose.model<IGateScanRecord>('GateScanRecord', GateScanRecordSchema);
