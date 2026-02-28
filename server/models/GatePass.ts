import mongoose, { Document, Schema, Types } from 'mongoose';

export type GatePassStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'LATE';
export type GatePassCategory = 'HOME' | 'PERSONAL' | 'MEDICAL' | 'ACADEMIC' | 'OTHER';

export interface IGatePass extends Document {
  gatePassId: string;
  userId: Types.ObjectId;
  category: GatePassCategory;
  reason: string;
  destination: string;
  emergencyContact?: string;
  requestedExitTime?: Date;
  expectedReturnTime: Date;
  approvedReturnTime?: Date;
  status: GatePassStatus;
  approvedBy?: Types.ObjectId;
  approvalTimestamp?: Date;
  rejectionReason?: string;
  exitMarkedAt?: Date;
  enteredCampusAt?: Date;
  enteredHostelAt?: Date;
  actualReturnTime?: Date;
  finalStatus?: 'COMPLETED' | 'LATE';
  createdAt: Date;
  updatedAt: Date;
}

function generateGatePassId(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `GP-${Date.now()}-${random}`;
}

const GatePassSchema = new Schema<IGatePass>(
  {
    gatePassId: {
      type: String,
      unique: true,
      default: generateGatePassId,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ['HOME', 'PERSONAL', 'MEDICAL', 'ACADEMIC', 'OTHER'],
      default: 'OTHER',
      required: true,
    },
    reason: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    emergencyContact: {
      type: String,
      trim: true,
      required(this: IGatePass) {
        return this.category === 'HOME';
      },
    },
    requestedExitTime: { type: Date },
    expectedReturnTime: { type: Date, required: true },
    approvedReturnTime: { type: Date },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'LATE'],
      default: 'PENDING',
      index: true,
      required: true,
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvalTimestamp: { type: Date },
    rejectionReason: { type: String, trim: true },
    exitMarkedAt: { type: Date },
    enteredCampusAt: { type: Date },
    enteredHostelAt: { type: Date },
    actualReturnTime: { type: Date },
    finalStatus: {
      type: String,
      enum: ['COMPLETED', 'LATE'],
    },
  },
  {
    timestamps: true,
  }
);

GatePassSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['PENDING', 'APPROVED'] },
    },
  }
);

export default mongoose.models.GatePass || mongoose.model<IGatePass>('GatePass', GatePassSchema);
