import mongoose, { Document, Schema, Types } from 'mongoose';

export type GateLogType = 'EXIT' | 'CAMPUS_ENTRY' | 'HOSTEL_ENTRY' | 'SYSTEM_ACTION';

export interface IGateLog extends Document {
  userId: Types.ObjectId;
  gatePassId: string;
  type: GateLogType;
  timestamp: Date;
  markedBy?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const GateLogSchema = new Schema<IGateLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    gatePassId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['EXIT', 'CAMPUS_ENTRY', 'HOSTEL_ENTRY', 'SYSTEM_ACTION'],
      required: true,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    markedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.GateLog || mongoose.model<IGateLog>('GateLog', GateLogSchema);
