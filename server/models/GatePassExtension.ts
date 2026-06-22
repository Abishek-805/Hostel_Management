import mongoose, { Document, Schema, Types } from 'mongoose';

export type GatePassExtensionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface IGatePassExtension extends Document {
  extensionId: string;
  gatePassId: string;
  gatePassRef: Types.ObjectId;
  userId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  currentExpectedReturnTime: Date;
  requestedReturnTime: Date;
  reason: string;
  status: GatePassExtensionStatus;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

function generateExtensionId(): string {
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `GPEXT-${Date.now()}-${random}`;
}

const GatePassExtensionSchema = new Schema<IGatePassExtension>(
  {
    extensionId: {
      type: String,
      unique: true,
      default: generateExtensionId,
      index: true,
    },
    gatePassId: {
      type: String,
      required: true,
      index: true,
    },
    gatePassRef: {
      type: Schema.Types.ObjectId,
      ref: 'GatePass',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    currentExpectedReturnTime: {
      type: Date,
      required: true,
    },
    requestedReturnTime: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      required: true,
      default: 'PENDING',
      index: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

GatePassExtensionSchema.index(
  { gatePassRef: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'PENDING' },
  }
);

export default mongoose.models.GatePassExtension ||
  mongoose.model<IGatePassExtension>('GatePassExtension', GatePassExtensionSchema);
