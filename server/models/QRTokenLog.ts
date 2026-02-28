import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IQRTokenLog extends Document {
  tokenHash: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  usedAt?: Date;
  consumed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const QRTokenLogSchema = new Schema<IQRTokenLog>(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    usedAt: {
      type: Date,
    },
    consumed: {
      type: Boolean,
      default: false,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

QRTokenLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.QRTokenLog || mongoose.model<IQRTokenLog>('QRTokenLog', QRTokenLogSchema);
